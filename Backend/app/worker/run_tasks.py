"""V3 run-based Celery training tasks.

The V3 worker consumes the exact experiment snapshot stored with a TrainingRun.
It intentionally lives separately from the V2 job worker so the legacy task
contract can remain untouched while the active release uses one consistent path.
"""
from __future__ import annotations

import traceback
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from app.core.model_defaults import DEFAULT_HYPERPARAMETERS
from app.db.sync_session import SyncSessionLocal
from app.models.dataset import Dataset
from app.models.training import TrainingRun
from app.services.model_trainer import ModelTrainer
from app.worker.celery_app import celery_app


def resolve_model_hyperparameters(model_cfg: Dict[str, Any], task_type: str, model_type: str) -> Dict[str, Any]:
    """Resolve V3 parameters while retaining compatibility with old snapshots."""
    base = dict(DEFAULT_HYPERPARAMETERS.get(task_type, {}).get(model_type, {}))

    # Current V3 shape.
    configured = model_cfg.get("hyperparameters")
    custom = model_cfg.get("custom_hyperparameters") or model_cfg.get("customHyperparameters")

    # V2 snapshots sometimes nested the resolved values under config.
    legacy_config = model_cfg.get("config") if isinstance(model_cfg.get("config"), dict) else {}
    if configured is None:
        configured = legacy_config.get("hyperparameters")
    if custom is None:
        custom = legacy_config.get("custom_hyperparameters") or legacy_config.get("customHyperparameters")

    if isinstance(configured, dict):
        base.update(configured)
    if isinstance(custom, dict):
        base.update(custom)
    return base


def training_config_from_snapshot(config: Dict[str, Any]) -> Dict[str, Any]:
    """Convert the UI's train ratio into the trainer's test-size contract."""
    train_ratio = config.get("trainTestSplit", 0.8)
    try:
        train_ratio = float(train_ratio)
    except (TypeError, ValueError):
        train_ratio = 0.8
    train_ratio = max(0.6, min(0.9, train_ratio))

    try:
        random_seed = int(config.get("randomSeed", 42))
    except (TypeError, ValueError):
        random_seed = 42

    return {
        "test_size": round(1.0 - train_ratio, 4),
        "random_state": random_seed,
        "cv_folds": 3,
        "scaling": True,
    }


def _best_model(model_results: list[Dict[str, Any]], task_type: str):
    successful = [item for item in model_results if item.get("metrics", {}).get("test")]
    if not successful:
        return None, successful

    if task_type == "classification":
        for metric in ("accuracy", "f1_score", "precision", "recall"):
            candidates = [item for item in successful if item["metrics"]["test"].get(metric) is not None]
            if candidates:
                winner = max(candidates, key=lambda item: item["metrics"]["test"][metric])
                return {
                    "model_type": winner["model_type"],
                    "display_name": winner["display_name"],
                    "metric": metric,
                    "value": winner["metrics"]["test"][metric],
                }, successful
    else:
        r2_candidates = [item for item in successful if item["metrics"]["test"].get("r2_score") is not None]
        if r2_candidates:
            winner = max(r2_candidates, key=lambda item: item["metrics"]["test"]["r2_score"])
            return {
                "model_type": winner["model_type"],
                "display_name": winner["display_name"],
                "metric": "r2_score",
                "value": winner["metrics"]["test"]["r2_score"],
            }, successful

        mae_candidates = [item for item in successful if item["metrics"]["test"].get("mae") is not None]
        if mae_candidates:
            winner = min(mae_candidates, key=lambda item: item["metrics"]["test"]["mae"])
            return {
                "model_type": winner["model_type"],
                "display_name": winner["display_name"],
                "metric": "mae",
                "value": winner["metrics"]["test"]["mae"],
            }, successful

    return None, successful


@celery_app.task(bind=True, name="app.worker.run_tasks.train_config_run_v3")
def train_config_run_v3(self, run_id: str, experiment_id: str, dataset_id: str):
    """Train all models from an immutable V3 TrainingRun config snapshot."""
    del experiment_id  # The run and dataset records are the source of truth here.

    db = SyncSessionLocal()
    run_uuid = uuid.UUID(run_id)
    training_run = None

    try:
        training_run = db.query(TrainingRun).filter(TrainingRun.id == run_uuid).first()
        if not training_run:
            raise ValueError("Training run not found")

        dataset = db.query(Dataset).filter(Dataset.id == uuid.UUID(dataset_id)).first()
        if not dataset:
            raise ValueError("Dataset not found")

        config = dict(training_run.config_snapshot or {})
        task_type = config.get("taskType")
        target_column = config.get("targetColumn")
        selected_features = list(config.get("selectedFeatures") or [])
        feature_types = config.get("featureTypes") or {}
        model_configs = list(config.get("models") or [])
        optimization_enabled = bool(config.get("enableOptimization", False))

        if task_type not in {"classification", "regression"}:
            raise ValueError("Training task type is missing or invalid")
        if not target_column:
            raise ValueError("Target column is missing")
        if not selected_features:
            raise ValueError("No training features were selected")
        if not model_configs:
            raise ValueError("No models were selected")

        training_run.status = "running"
        training_run.started_at = datetime.now(timezone.utc)
        training_run.error_message = None
        db.commit()

        trainer = ModelTrainer()
        trainer_config = training_config_from_snapshot(config)
        total_models = len(model_configs)
        model_results: list[Dict[str, Any]] = []
        dataset_info = None

        for index, model_cfg in enumerate(model_configs, start=1):
            model_type = model_cfg.get("model_type") or model_cfg.get("modelType")
            if not model_type:
                model_results.append({"model_type": "unknown", "display_name": "Unknown model", "error": "Model type is missing"})
                continue

            display_name = model_cfg.get("display_name") or model_cfg.get("displayName") or model_type
            training_run.results = {
                "progress": {
                    "current": index,
                    "total": total_models,
                    "current_model": display_name,
                }
            }
            db.commit()

            self.update_state(
                state="PROGRESS",
                meta={
                    "current": index,
                    "total": total_models,
                    "status": f"Training {display_name}",
                    "run_id": run_id,
                    "run_number": training_run.run_number,
                },
            )

            try:
                result = trainer.train_complete_pipeline(
                    dataset_path=dataset.storage_path,
                    target_column=target_column,
                    model_type=model_type,
                    task_type=task_type,
                    hyperparameters=resolve_model_hyperparameters(model_cfg, task_type, model_type),
                    training_config=trainer_config,
                    selected_features=selected_features,
                    feature_types=feature_types,
                    job_id=f"{run_id}_{model_type}",
                    enable_optimization=optimization_enabled,
                )

                if not result.get("success"):
                    raise ValueError(result.get("error") or "Training failed")

                dataset_info = dataset_info or result.get("dataset_info")
                model_results.append(
                    {
                        "model_type": model_type,
                        "display_name": display_name,
                        "metrics": result.get("metrics", {}),
                        "feature_importance": result.get("feature_importance"),
                        "confusion_matrix": result.get("confusion_matrix"),
                        "model_path": result.get("model_path"),
                        "training_time": result.get("training_time_seconds", 0),
                        "hyperparameters": result.get("hyperparameters", {}),
                        "hyperparameter_tuning": result.get("hyperparameter_tuning"),
                    }
                )
            except Exception as exc:
                model_results.append(
                    {
                        "model_type": model_type,
                        "display_name": display_name,
                        "error": str(exc)[:500],
                    }
                )

        best_model, successful = _best_model(model_results, task_type)
        summary = {
            "total_models": total_models,
            "successful": len(successful),
            "failed": total_models - len(successful),
        }
        results = {
            "task_type": task_type,
            "dataset_info": dataset_info,
            "models": model_results,
            "best_model": best_model,
            "summary": summary,
            "training_config": {
                "train_ratio": round(1 - trainer_config["test_size"], 4),
                "test_ratio": trainer_config["test_size"],
                "random_seed": trainer_config["random_state"],
            },
        }

        training_run.completed_at = datetime.now(timezone.utc)
        training_run.duration_seconds = int((training_run.completed_at - training_run.started_at).total_seconds())
        training_run.results = results
        training_run.artifacts = {
            "models": {
                item["model_type"]: item["model_path"]
                for item in model_results
                if item.get("model_path")
            }
        }

        if successful:
            training_run.status = "completed"
            training_run.error_message = None
        else:
            training_run.status = "failed"
            training_run.error_message = "All selected models failed to train. Review the model errors in this run."

        db.commit()

        if not successful:
            raise RuntimeError(training_run.error_message)

        return {
            "status": "SUCCESS",
            "run_id": run_id,
            "run_number": training_run.run_number,
            "results": results,
        }

    except Exception as exc:
        traceback.print_exc()
        if training_run is not None:
            try:
                if training_run.status != "completed":
                    training_run.status = "failed"
                    training_run.completed_at = training_run.completed_at or datetime.now(timezone.utc)
                    if training_run.started_at:
                        training_run.duration_seconds = int((training_run.completed_at - training_run.started_at).total_seconds())
                    training_run.error_message = training_run.error_message or str(exc)[:500]
                    db.commit()
            except Exception:
                db.rollback()
        raise
    finally:
        db.close()
