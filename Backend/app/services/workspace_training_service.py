"""Bounded, database-free ML training for temporary guest workspaces."""
from __future__ import annotations

import json
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import joblib
from fastapi import HTTPException, status

from app.core.config import settings
from app.services.model_trainer import ModelTrainer
from app.services.session_manager import SessionExpired, SessionNotFound, session_manager
from app.services.workspace_dataset_service import get_workspace_dataset


class WorkspaceModelTrainer(ModelTrainer):
    """ModelTrainer variant that never writes to persistent artifact storage."""

    def load_dataset(self, dataset_uri: str):
        return self._read_dataframe(Path(dataset_uri))

    def save_model(self, pipeline, model_id, label_encoder, feature_columns):
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
        return local_path.name


class WorkspaceTrainingRunner:
    def __init__(self) -> None:
        self._executor = ThreadPoolExecutor(
            max_workers=settings.WORKSPACE_TRAINING_WORKERS,
            thread_name_prefix="nocodeml-guest-training",
        )
        self._lock = threading.RLock()
        self._active_sessions: set[str] = set()

    @staticmethod
    def _now() -> int:
        return int(time.time())

    def _run_path(self, token: str, run_id: str) -> Path:
        return session_manager.safe_path(token, "training", f"{run_id}.json", touch=False)

    def _write_run(self, token: str, run_id: str, payload: dict[str, Any]) -> None:
        path = self._run_path(token, run_id)
        payload["updated_at"] = self._now()
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, separators=(",", ":"), default=str), encoding="utf-8")
        temp.replace(path)

    def _read_run(self, token: str, run_id: str) -> dict[str, Any]:
        path = self._run_path(token, run_id)
        if not path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TRAINING_RUN_NOT_FOUND", "message": "This training run is not part of the current session."},
            )
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "TRAINING_STATUS_ERROR", "message": "Training status could not be read."},
            ) from exc
        return payload

    def submit(self, token: str, config: dict[str, Any]) -> dict[str, Any]:
        models = config.get("models") or []
        if not models:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "NO_MODELS_SELECTED", "message": "Choose at least one model to train."},
            )
        if len(models) > settings.WORKSPACE_MAX_MODELS_PER_RUN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "TOO_MANY_MODELS",
                    "message": f"A run can train at most {settings.WORKSPACE_MAX_MODELS_PER_RUN} models.",
                },
            )

        dataset = get_workspace_dataset(token, config["dataset_id"])
        digest = session_manager.token_digest(token)

        with self._lock:
            if digest in self._active_sessions:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "TRAINING_ALREADY_RUNNING",
                        "message": "This session already has an active training run. Wait for it to finish before starting another.",
                    },
                )
            self._active_sessions.add(digest)

        run_id = str(uuid.uuid4())
        initial = {
            "id": run_id,
            "dataset_id": dataset["id"],
            "dataset_name": dataset["name"],
            "status": "queued",
            "created_at": self._now(),
            "progress": {
                "current": 0,
                "total": len(models),
                "percent": 0,
                "current_model": None,
                "message": "Training is queued.",
            },
            "config": {
                "target_column": config["target_column"],
                "task_type": config["task_type"],
                "selected_features": config.get("selected_features"),
                "models": [
                    {
                        "model_type": model.get("model_type"),
                        "enable_optimization": bool(model.get("enable_optimization", False)),
                        "hyperparameters": model.get("hyperparameters") or {},
                    }
                    for model in models
                ],
                "test_size": config.get("test_size", 0.2),
                "random_state": config.get("random_state", 42),
                "cv_folds": config.get("cv_folds", 3),
                "scaling": config.get("scaling", True),
            },
            "results": [],
            "best_model": None,
            "error": None,
            "temporary": True,
        }

        lease_acquired = False
        try:
            # Hold the session from the moment it enters the global queue. This
            # prevents close/TTL cleanup from deleting a queued dataset before
            # the worker thread starts executing the model fit.
            session_manager.acquire_job(token)
            lease_acquired = True
            self._write_run(token, run_id, initial)
            self._executor.submit(self._execute, token, run_id, config, digest)
        except Exception:
            if lease_acquired:
                session_manager.release_job(token)
            with self._lock:
                self._active_sessions.discard(digest)
            raise

        return initial.copy()

    def _execute(self, token: str, run_id: str, config: dict[str, Any], digest: str) -> None:
        try:
            dataset = get_workspace_dataset(token, config["dataset_id"])
            dataset_path = session_manager.safe_path(token, "datasets", dataset["stored_filename"], touch=False)
            models_dir = session_manager.safe_path(token, "models", run_id, touch=False)
            models_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
            trainer = WorkspaceModelTrainer(models_dir=str(models_dir))

            run = self._read_run(token, run_id)
            run["status"] = "running"
            run["started_at"] = self._now()
            self._write_run(token, run_id, run)

            model_specs = config["models"]
            successful: list[dict[str, Any]] = []
            for index, model_spec in enumerate(model_specs, start=1):
                session_manager.touch(token)
                model_type = str(model_spec["model_type"])
                run = self._read_run(token, run_id)
                run["progress"] = {
                    "current": index - 1,
                    "total": len(model_specs),
                    "percent": round(((index - 1) / len(model_specs)) * 100),
                    "current_model": model_type,
                    "message": f"Training {model_type}…",
                }
                self._write_run(token, run_id, run)

                result = trainer.train_complete_pipeline(
                    dataset_path=str(dataset_path),
                    target_column=config["target_column"],
                    model_type=model_type,
                    task_type=config["task_type"],
                    hyperparameters=model_spec.get("hyperparameters") or {},
                    preprocessing_config={},
                    training_config={
                        "test_size": config.get("test_size", 0.2),
                        "random_state": config.get("random_state", 42),
                        "cv_folds": config.get("cv_folds", 3),
                        "scaling": config.get("scaling", True),
                    },
                    selected_features=config.get("selected_features"),
                    job_id=f"{run_id}-{model_type}",
                    enable_optimization=bool(model_spec.get("enable_optimization", False)),
                )

                public_result = {
                    "model_type": model_type,
                    "success": bool(result.get("success")),
                    "metrics": result.get("metrics"),
                    "feature_importance": result.get("feature_importance"),
                    "confusion_matrix": result.get("confusion_matrix"),
                    "training_time_seconds": result.get("training_time_seconds"),
                    "dataset_info": result.get("dataset_info"),
                    "hyperparameters": result.get("hyperparameters"),
                    "model_file": result.get("model_path") if result.get("success") else None,
                    "error": result.get("error") if not result.get("success") else None,
                }
                run = self._read_run(token, run_id)
                run["results"].append(public_result)
                if public_result["success"]:
                    successful.append(public_result)
                run["progress"] = {
                    "current": index,
                    "total": len(model_specs),
                    "percent": round((index / len(model_specs)) * 100),
                    "current_model": model_type,
                    "message": f"Finished {model_type}.",
                }
                self._write_run(token, run_id, run)

            run = self._read_run(token, run_id)
            if successful:
                run["best_model"] = self._choose_best(successful, config["task_type"])
                run["status"] = "completed"
                run["progress"] = {
                    "current": len(model_specs),
                    "total": len(model_specs),
                    "percent": 100,
                    "current_model": None,
                    "message": "Training complete.",
                }
            else:
                run["status"] = "failed"
                run["error"] = {
                    "code": "ALL_MODELS_FAILED",
                    "message": "None of the selected models could be trained with this dataset and configuration.",
                }
            run["completed_at"] = self._now()
            self._write_run(token, run_id, run)
        except (SessionExpired, SessionNotFound):
            return
        except Exception as exc:
            try:
                run = self._read_run(token, run_id)
                run["status"] = "failed"
                run["error"] = {
                    "code": "TRAINING_RUN_FAILED",
                    "message": str(exc)[:500] or "Training failed unexpectedly.",
                }
                run["completed_at"] = self._now()
                self._write_run(token, run_id, run)
            except Exception:
                pass
        finally:
            session_manager.release_job(token)
            with self._lock:
                self._active_sessions.discard(digest)

    @staticmethod
    def _choose_best(results: list[dict[str, Any]], task_type: str) -> dict[str, Any]:
        metric_name = "f1_score" if task_type == "classification" else "r2_score"

        def score(result: dict[str, Any]) -> float:
            return float((result.get("metrics") or {}).get("test", {}).get(metric_name, float("-inf")))

        best = max(results, key=score)
        return {
            "model_type": best["model_type"],
            "model_file": best["model_file"],
            "metric": metric_name,
            "score": score(best),
            "metrics": best.get("metrics"),
            "feature_importance": best.get("feature_importance"),
            "confusion_matrix": best.get("confusion_matrix"),
        }

    def get(self, token: str, run_id: str) -> dict[str, Any]:
        run = self._read_run(token, run_id)
        digest = session_manager.token_digest(token)
        if run.get("status") in {"queued", "running"}:
            with self._lock:
                active = digest in self._active_sessions
            if not active:
                run["status"] = "failed"
                run["error"] = {
                    "code": "TRAINING_INTERRUPTED",
                    "message": "The training process restarted before this temporary run completed. Start the run again.",
                }
                run["completed_at"] = self._now()
                self._write_run(token, run_id, run)
        return run

    def list(self, token: str) -> list[dict[str, Any]]:
        training_dir = session_manager.safe_path(token, "training")
        runs: list[dict[str, Any]] = []
        for path in training_dir.glob("*.json"):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(payload, dict) and payload.get("id"):
                    runs.append(payload)
            except (OSError, json.JSONDecodeError):
                continue
        return sorted(runs, key=lambda item: item.get("created_at", 0), reverse=True)


workspace_training_runner = WorkspaceTrainingRunner()
