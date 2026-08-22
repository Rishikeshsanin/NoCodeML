"""Deterministic NoCodeML training pipeline.

V3 persists preprocessing and the estimator together as one sklearn Pipeline. That
ensures predictions reuse the exact imputers, categorical encoders and scaling
fitted during training instead of reconstructing them with new category mappings.
"""
from __future__ import annotations

import time
import uuid
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, OneHotEncoder, StandardScaler

from app.core.config import settings
from app.core.model_defaults import get_preprocessing_config, get_training_config
from app.services.artifact_store import artifact_store
from app.services.hyperparameter_optimizer import hyperparameter_optimizer

try:
    from xgboost import XGBClassifier, XGBRegressor
except ImportError:  # pragma: no cover - dependency is installed in production
    XGBClassifier = XGBRegressor = None

try:
    from lightgbm import LGBMClassifier, LGBMRegressor
except ImportError:  # pragma: no cover - dependency is installed in production
    LGBMClassifier = LGBMRegressor = None


class ModelTrainer:
    """Train and persist classification/regression pipelines."""

    def __init__(self, models_dir: Optional[str] = None):
        self.models_dir = Path(models_dir or settings.MODELS_DIR).expanduser()
        self.models_dir.mkdir(parents=True, exist_ok=True)

        self.model_registry = {
            "classification": {
                "LogisticRegression": LogisticRegression,
                "RandomForestClassifier": RandomForestClassifier,
            },
            "regression": {
                "LinearRegression": LinearRegression,
                "RandomForestRegressor": RandomForestRegressor,
            },
        }
        if XGBClassifier is not None:
            self.model_registry["classification"]["XGBClassifier"] = XGBClassifier
            self.model_registry["regression"]["XGBRegressor"] = XGBRegressor
        if LGBMClassifier is not None:
            self.model_registry["classification"]["LGBMClassifier"] = LGBMClassifier
            self.model_registry["regression"]["LGBMRegressor"] = LGBMRegressor

    @staticmethod
    def _read_dataframe(path: Path) -> pd.DataFrame:
        extension = path.suffix.lower()
        if extension == ".csv":
            return pd.read_csv(path)
        if extension in {".xlsx", ".xls"}:
            return pd.read_excel(path)
        if extension == ".parquet":
            return pd.read_parquet(path)
        raise ValueError(f"Unsupported file format: {extension}")

    def load_dataset(self, dataset_uri: str) -> pd.DataFrame:
        with artifact_store.materialize(dataset_uri) as local_path:
            return self._read_dataframe(local_path)

    @staticmethod
    def _select_features(
        df: pd.DataFrame,
        target_column: str,
        selected_features: Optional[List[str]],
    ) -> Tuple[pd.DataFrame, pd.Series]:
        if target_column not in df.columns:
            raise ValueError(f"Target column '{target_column}' not found in dataset")

        if selected_features:
            features = [feature for feature in selected_features if feature != target_column]
            missing = [feature for feature in features if feature not in df.columns]
            if missing:
                raise ValueError(f"Selected features not found: {', '.join(missing[:10])}")
        else:
            features = [str(column) for column in df.columns if str(column) != target_column]

        if not features:
            raise ValueError("At least one feature is required for training")

        X = df[features].copy()
        y = df[target_column].copy()

        valid_target = y.notna()
        X = X.loc[valid_target].reset_index(drop=True)
        y = y.loc[valid_target].reset_index(drop=True)
        if len(X) < 4:
            raise ValueError("Not enough rows with a target value to train a model")
        return X, y

    @staticmethod
    def _prepare_target(y: pd.Series, task_type: str) -> Tuple[pd.Series, Optional[LabelEncoder]]:
        if task_type == "classification":
            encoder = LabelEncoder()
            encoded = encoder.fit_transform(y.astype(str))
            if len(encoder.classes_) < 2:
                raise ValueError("Classification requires at least two target classes")
            return pd.Series(encoded, index=y.index), encoder

        if task_type == "regression":
            numeric = pd.to_numeric(y, errors="coerce")
            if numeric.isna().any():
                raise ValueError("Regression target must contain numeric values")
            return numeric.astype(float), None

        raise ValueError("Task type must be classification or regression")

    @staticmethod
    def _build_preprocessor(X: pd.DataFrame, scaling: bool = True) -> ColumnTransformer:
        numeric_columns = [str(column) for column in X.columns if pd.api.types.is_numeric_dtype(X[column])]
        categorical_columns = [str(column) for column in X.columns if str(column) not in numeric_columns]

        transformers = []
        if numeric_columns:
            numeric_steps: List[Tuple[str, Any]] = [("imputer", SimpleImputer(strategy="median"))]
            if scaling:
                numeric_steps.append(("scaler", StandardScaler()))
            transformers.append(("numeric", Pipeline(numeric_steps), numeric_columns))

        if categorical_columns:
            categorical_pipeline = Pipeline(
                [
                    ("imputer", SimpleImputer(strategy="most_frequent")),
                    ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=True)),
                ]
            )
            transformers.append(("categorical", categorical_pipeline, categorical_columns))

        if not transformers:
            raise ValueError("No usable feature columns were found")

        return ColumnTransformer(transformers=transformers, remainder="drop", sparse_threshold=0.3)

    def _build_estimator(self, model_type: str, task_type: str, hyperparameters: Dict[str, Any]):
        if task_type not in self.model_registry or model_type not in self.model_registry[task_type]:
            raise ValueError(f"Model '{model_type}' is not available for {task_type}")
        return self.model_registry[task_type][model_type](**hyperparameters)

    @staticmethod
    def _safe_split(
        X: pd.DataFrame,
        y: pd.Series,
        task_type: str,
        test_size: float,
        random_state: int,
    ):
        test_size = min(0.4, max(0.1, float(test_size)))
        stratify = None
        if task_type == "classification":
            counts = Counter(y.tolist())
            if counts and min(counts.values()) >= 2:
                stratify = y
        try:
            return train_test_split(
                X,
                y,
                test_size=test_size,
                random_state=random_state,
                stratify=stratify,
            )
        except ValueError:
            return train_test_split(
                X,
                y,
                test_size=test_size,
                random_state=random_state,
                stratify=None,
            )

    @staticmethod
    def _cv_folds(y_train: pd.Series, task_type: str, requested: int) -> int:
        requested = max(2, min(int(requested), 5))
        if task_type == "classification":
            counts = Counter(y_train.tolist())
            return max(0, min(requested, min(counts.values()) if counts else 0))
        return min(requested, len(y_train)) if len(y_train) >= 2 else 0

    @staticmethod
    def evaluate_model(
        pipeline: Pipeline,
        X_train: pd.DataFrame,
        X_test: pd.DataFrame,
        y_train: pd.Series,
        y_test: pd.Series,
        task_type: str,
        cv_folds: int,
        label_encoder: Optional[LabelEncoder],
    ) -> Dict[str, Any]:
        train_prediction = pipeline.predict(X_train)
        test_prediction = pipeline.predict(X_test)
        metrics: Dict[str, Any] = {"train": {}, "test": {}}

        if task_type == "classification":
            for name, truth, prediction in (
                ("train", y_train, train_prediction),
                ("test", y_test, test_prediction),
            ):
                metrics[name] = {
                    "accuracy": float(accuracy_score(truth, prediction)),
                    "precision": float(precision_score(truth, prediction, average="weighted", zero_division=0)),
                    "recall": float(recall_score(truth, prediction, average="weighted", zero_division=0)),
                    "f1_score": float(f1_score(truth, prediction, average="weighted", zero_division=0)),
                }

            estimator = pipeline.named_steps["model"]
            if hasattr(estimator, "predict_proba") and len(np.unique(y_test)) == 2:
                try:
                    probabilities = pipeline.predict_proba(X_test)[:, 1]
                    metrics["test"]["roc_auc"] = float(roc_auc_score(y_test, probabilities))
                except Exception:
                    pass

            labels = sorted(np.unique(np.concatenate([np.asarray(y_test), np.asarray(test_prediction)])).tolist())
            if label_encoder is not None:
                display_labels = [str(value) for value in label_encoder.inverse_transform(np.asarray(labels, dtype=int))]
            else:
                display_labels = [str(value) for value in labels]
            metrics["confusion_matrix"] = {
                "matrix": confusion_matrix(y_test, test_prediction, labels=labels).tolist(),
                "labels": display_labels,
            }
        else:
            for name, truth, prediction in (
                ("train", y_train, train_prediction),
                ("test", y_test, test_prediction),
            ):
                mse = float(mean_squared_error(truth, prediction))
                metrics[name] = {
                    "mse": mse,
                    "rmse": float(np.sqrt(mse)),
                    "mae": float(mean_absolute_error(truth, prediction)),
                    "r2_score": float(r2_score(truth, prediction)),
                }

        folds = ModelTrainer._cv_folds(y_train, task_type, cv_folds)
        if folds >= 2:
            try:
                scores = cross_val_score(pipeline, X_train, y_train, cv=folds, n_jobs=1)
                metrics["cv_scores"] = [float(value) for value in scores]
                metrics["mean_cv_score"] = float(scores.mean())
                metrics["std_cv_score"] = float(scores.std())
            except Exception as exc:
                metrics["cv_warning"] = f"Cross-validation unavailable: {type(exc).__name__}"

        return metrics

    @staticmethod
    def get_feature_importance(pipeline: Pipeline) -> Optional[Dict[str, List[Any]]]:
        try:
            preprocessor: ColumnTransformer = pipeline.named_steps["preprocessor"]
            estimator = pipeline.named_steps["model"]
            feature_names = [
                str(name).replace("numeric__", "").replace("categorical__", "")
                for name in preprocessor.get_feature_names_out()
            ]

            if hasattr(estimator, "feature_importances_"):
                values = np.asarray(estimator.feature_importances_, dtype=float)
            elif hasattr(estimator, "coef_"):
                coefficients = np.asarray(estimator.coef_, dtype=float)
                values = np.abs(coefficients).mean(axis=0) if coefficients.ndim > 1 else np.abs(coefficients)
            else:
                return None

            length = min(len(feature_names), len(values))
            pairs = sorted(
                zip(feature_names[:length], values[:length]),
                key=lambda item: float(item[1]),
                reverse=True,
            )
            return {
                "features": [name for name, _value in pairs],
                "importance": [float(value) for _name, value in pairs],
            }
        except Exception:
            return None

    def save_model(
        self,
        pipeline: Pipeline,
        model_id: str,
        label_encoder: Optional[LabelEncoder],
        feature_columns: List[str],
    ) -> str:
        safe_id = "".join(character for character in model_id if character.isalnum() or character in {"-", "_"})
        safe_id = safe_id or str(uuid.uuid4())
        local_path = self.models_dir / f"{safe_id}.joblib"
        artifact = {
            "model": pipeline,
            "label_encoder": label_encoder,
            "feature_columns": feature_columns,
            "saved_at": time.time(),
            "artifact_version": 3,
        }
        joblib.dump(artifact, local_path)

        uri = artifact_store.put_file(
            local_path,
            f"models/{safe_id}.joblib",
            "application/octet-stream",
        )
        if artifact_store.is_remote:
            local_path.unlink(missing_ok=True)
        return uri

    def train_complete_pipeline(
        self,
        dataset_path: str,
        target_column: str,
        model_type: str,
        task_type: str,
        hyperparameters: Dict[str, Any],
        preprocessing_config: Optional[Dict[str, Any]] = None,
        training_config: Optional[Dict[str, Any]] = None,
        selected_features: Optional[List[str]] = None,
        feature_types: Optional[Dict[str, str]] = None,
        job_id: Optional[str] = None,
        enable_optimization: bool = False,
    ) -> Dict[str, Any]:
        """Run the complete, reusable training pipeline."""
        del feature_types  # Dtypes are derived from the actual selected dataframe.
        preprocessing_config = preprocessing_config or get_preprocessing_config()
        training_config = training_config or get_training_config()
        started = time.time()

        try:
            df = self.load_dataset(dataset_path)
            X, raw_target = self._select_features(df, target_column, selected_features)
            y, label_encoder = self._prepare_target(raw_target, task_type)

            test_size = training_config.get("test_size", 0.2)
            random_state = int(training_config.get("random_state", 42))
            X_train, X_test, y_train, y_test = self._safe_split(
                X, y, task_type, test_size, random_state
            )

            final_hyperparameters = dict(hyperparameters or {})
            tuning_metadata = None
            if enable_optimization:
                imbalance = None
                if task_type == "classification":
                    counts = Counter(y_train.tolist())
                    if len(counts) == 2 and min(counts.values()) > 0:
                        imbalance = max(counts.values()) / min(counts.values())

                optimized = hyperparameter_optimizer.optimize(
                    model_type=model_type,
                    task_type=task_type,
                    n_samples=len(X_train),
                    n_features=X_train.shape[1],
                    class_imbalance_ratio=imbalance,
                    user_params=final_hyperparameters,
                )
                final_hyperparameters = optimized["params"]
                tuning_metadata = optimized.get("metadata")

            preprocessor = self._build_preprocessor(
                X_train,
                scaling=bool(training_config.get("scaling", True)),
            )
            estimator = self._build_estimator(model_type, task_type, final_hyperparameters)
            pipeline = Pipeline(
                [
                    ("preprocessor", preprocessor),
                    ("model", estimator),
                ]
            )

            training_started = time.time()
            pipeline.fit(X_train, y_train)
            training_time = time.time() - training_started

            metrics = self.evaluate_model(
                pipeline,
                X_train,
                X_test,
                y_train,
                y_test,
                task_type,
                int(training_config.get("cv_folds", 3)),
                label_encoder,
            )
            feature_importance = self.get_feature_importance(pipeline)

            model_id = job_id or str(uuid.uuid4())
            model_uri = self.save_model(
                pipeline,
                model_id,
                label_encoder,
                [str(column) for column in X.columns],
            )

            return {
                "success": True,
                "model_path": model_uri,
                "metrics": metrics,
                "feature_importance": feature_importance,
                "confusion_matrix": metrics.get("confusion_matrix"),
                "training_time_seconds": training_time,
                "training_time": training_time,
                "total_time_seconds": time.time() - started,
                "dataset_info": {
                    "total_samples": len(X),
                    "train_samples": len(X_train),
                    "test_samples": len(X_test),
                    "n_features": X.shape[1],
                    "feature_names": [str(column) for column in X.columns],
                },
                "preprocessing_config": {
                    **preprocessing_config,
                    "implementation": "fitted_sklearn_pipeline",
                },
                "training_config": training_config,
                "hyperparameters": final_hyperparameters,
                "hyperparameter_tuning": tuning_metadata,
            }
        except Exception as exc:
            return {
                "success": False,
                "error": str(exc)[:500],
                "training_time_seconds": time.time() - started,
            }
