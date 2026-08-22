"""Prediction service using persisted V3 training pipelines."""
from __future__ import annotations

import asyncio
import io
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import and_, desc, select

from app.core.config import settings
from app.db.sync_session import SyncSessionLocal
from app.models.prediction import PredictionBatch
from app.models.training import TrainingRun
from app.services.artifact_store import artifact_store


MAX_BATCH_FILE_SIZE = 100 * 1024 * 1024


class PredictionService:
    def __init__(self):
        self.predictions_dir = Path(settings.PREDICTIONS_DIR).expanduser()
        self.predictions_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _required_features(model_data: Dict[str, Any], training_config: Dict[str, Any]) -> List[str]:
        features = model_data.get("feature_columns") or training_config.get("selectedFeatures") or []
        return [str(feature) for feature in features]

    @staticmethod
    def _decode_predictions(predictions: Any, label_encoder: Optional[Any]) -> np.ndarray:
        values = np.asarray(predictions)
        if label_encoder is None:
            return values
        return np.asarray(label_encoder.inverse_transform(values.astype(int)))

    @staticmethod
    def _probability_labels(model: Any, label_encoder: Optional[Any]) -> List[str]:
        estimator = model.named_steps.get("model") if hasattr(model, "named_steps") else model
        classes = np.asarray(getattr(estimator, "classes_", []))
        if classes.size == 0:
            return []
        if label_encoder is not None:
            try:
                return [str(value) for value in label_encoder.inverse_transform(classes.astype(int))]
            except Exception:
                pass
        return [str(value) for value in classes]

    async def predict_single(self, experiment_id: uuid.UUID, features: Dict[str, Any]) -> Dict[str, Any]:
        model_data = await asyncio.to_thread(self._load_best_model, experiment_id)
        model = model_data["model"]
        label_encoder = model_data.get("label_encoder")
        training_config = model_data.get("config", {})
        feature_columns = self._required_features(model_data, training_config)

        if not feature_columns:
            feature_columns = list(features.keys())
        missing = [column for column in feature_columns if column not in features]
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing required features: {missing}")

        frame = pd.DataFrame([{column: features[column] for column in feature_columns}])
        try:
            raw_prediction = model.predict(frame)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The supplied feature values are incompatible with the trained model.",
            ) from exc

        decoded = self._decode_predictions(raw_prediction, label_encoder)
        probabilities = None
        confidence = None
        if hasattr(model, "predict_proba"):
            try:
                values = np.asarray(model.predict_proba(frame)[0], dtype=float)
                labels = self._probability_labels(model, label_encoder)
                probabilities = {
                    (labels[index] if index < len(labels) else str(index)): float(probability)
                    for index, probability in enumerate(values)
                }
                confidence = float(values.max()) if values.size else None
            except Exception:
                probabilities = None
                confidence = None

        prediction = decoded[0]
        if isinstance(prediction, np.generic):
            prediction = prediction.item()
        return {
            "prediction": str(prediction),
            "probabilities": probabilities,
            "confidence": confidence,
        }

    async def predict_batch(
        self,
        experiment_id: uuid.UUID,
        file: UploadFile,
        user_id: int,
    ) -> Dict[str, Any]:
        try:
            content = await file.read(MAX_BATCH_FILE_SIZE + 1)
        finally:
            await file.close()

        if len(content) > MAX_BATCH_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Batch prediction CSV exceeds the 100 MB limit.",
            )

        try:
            original = pd.read_csv(io.BytesIO(content))
        except Exception as exc:
            raise HTTPException(status_code=400, detail="The batch prediction CSV could not be parsed.") from exc
        if original.empty:
            raise HTTPException(status_code=400, detail="The batch prediction CSV contains no rows.")

        model_data = await asyncio.to_thread(self._load_best_model, experiment_id)
        model = model_data["model"]
        label_encoder = model_data.get("label_encoder")
        training_config = model_data.get("config", {})
        feature_columns = self._required_features(model_data, training_config)
        if not feature_columns:
            feature_columns = [str(column) for column in original.columns]

        missing = [column for column in feature_columns if column not in original.columns]
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing required feature columns: {missing}")

        features = original[feature_columns].copy()
        try:
            raw_predictions = model.predict(features)
            decoded = self._decode_predictions(raw_predictions, label_encoder)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail="The batch feature values are incompatible with the trained model.",
            ) from exc

        result_frame = original.copy()
        result_frame["prediction"] = decoded
        if hasattr(model, "predict_proba"):
            try:
                result_frame["confidence"] = np.asarray(model.predict_proba(features), dtype=float).max(axis=1)
            except Exception:
                pass

        prediction_id = uuid.uuid4()
        local_output = self.predictions_dir / f"{prediction_id}.csv"
        result_frame.to_csv(local_output, index=False)

        artifact_uri: Optional[str] = None
        try:
            artifact_uri = await asyncio.to_thread(
                artifact_store.put_file,
                local_output,
                f"predictions/{user_id}/{prediction_id}.csv",
                "text/csv",
            )
            if artifact_store.is_remote:
                local_output.unlink(missing_ok=True)

            db = SyncSessionLocal()
            try:
                prediction_batch = PredictionBatch(
                    id=prediction_id,
                    user_id=user_id,
                    experiment_id=experiment_id,
                    file_path=artifact_uri,
                    total_predictions=len(result_frame),
                )
                db.add(prediction_batch)
                db.commit()
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()
        except Exception as exc:
            local_output.unlink(missing_ok=True)
            if artifact_uri:
                try:
                    await asyncio.to_thread(artifact_store.delete, artifact_uri)
                except Exception:
                    pass
            raise HTTPException(
                status_code=500,
                detail="Prediction results could not be persisted.",
            ) from exc

        return {
            "prediction_id": str(prediction_id),
            "total_predictions": len(result_frame),
            "download_url": f"/api/v1/predictions/download/{prediction_id}",
        }

    def _load_best_model(self, experiment_id: uuid.UUID) -> Dict[str, Any]:
        db = SyncSessionLocal()
        try:
            query = (
                select(TrainingRun)
                .filter(
                    and_(
                        TrainingRun.experiment_id == experiment_id,
                        TrainingRun.status == "completed",
                    )
                )
                .order_by(desc(TrainingRun.created_at))
            )
            training_run = db.execute(query).scalars().first()
            if not training_run:
                raise HTTPException(status_code=404, detail="No trained models found for this experiment.")

            results = training_run.results or {}
            best_model_info = results.get("best_model")
            if not best_model_info:
                raise HTTPException(status_code=409, detail="The latest completed run has no successful best model.")

            best_model_data = next(
                (
                    model
                    for model in results.get("models", [])
                    if model.get("model_type") == best_model_info.get("model_type") and model.get("model_path")
                ),
                None,
            )
            if not best_model_data:
                raise HTTPException(status_code=500, detail="Best-model artifact metadata is missing.")

            try:
                with artifact_store.materialize(best_model_data["model_path"]) as local_path:
                    model_data = joblib.load(local_path)
            except FileNotFoundError as exc:
                raise HTTPException(status_code=404, detail="The trained model artifact is no longer available.") from exc
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(status_code=500, detail="The trained model artifact could not be loaded.") from exc

            if not isinstance(model_data, dict) or "model" not in model_data:
                raise HTTPException(status_code=500, detail="The trained model artifact is invalid.")

            model_data["config"] = training_run.config_snapshot or {}
            return model_data
        finally:
            db.close()
