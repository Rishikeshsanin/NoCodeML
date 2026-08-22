"""Celery task management for NoCodeML.

V3 uses the run-based worker for the primary experiment flow. The legacy single-job
methods remain available for backward-compatible API endpoints.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from celery.result import AsyncResult

from app.db.sync_session import get_sync_db
from app.models.training import TrainingJob, TrainingJobStatus, TrainingLog, TrainingResult
from app.worker.celery_app import celery_app
from app.worker.tasks import cancel_training_task, test_task


class TaskManager:
    """Dispatch and inspect NoCodeML Celery tasks."""

    def __init__(self):
        self.celery_app = celery_app

    def start_training_task(
        self,
        job_id: str,
        experiment_id: str,
        dataset_id: str,
        model_type: str,
        task_type: str,
    ) -> str:
        """Dispatch one legacy job-based training task."""
        result = self.celery_app.send_task(
            "app.worker.training_tasks.train_models",
            kwargs={
                "job_id": job_id,
                "experiment_id": experiment_id,
                "dataset_id": dataset_id,
                "model_types": [model_type],
                "task_type": task_type,
            },
        )
        return result.id

    def start_training_run_task(self, run_id: str, experiment_id: str, dataset_id: str) -> str:
        """Dispatch the active V3 run worker."""
        result = self.celery_app.send_task(
            "app.worker.run_tasks.train_config_run_v3",
            kwargs={
                "run_id": run_id,
                "experiment_id": experiment_id,
                "dataset_id": dataset_id,
            },
        )
        return result.id

    def get_task_status(self, task_id: str) -> Dict[str, Any]:
        try:
            result = AsyncResult(task_id, app=self.celery_app)
            payload: Dict[str, Any] = {
                "task_id": task_id,
                "status": result.status,
                "ready": result.ready(),
                "successful": result.successful() if result.ready() else None,
                "failed": result.failed() if result.ready() else None,
            }
            if result.ready():
                if result.successful():
                    payload["result"] = result.result
                else:
                    payload["error"] = str(result.result) if result.result else "Unknown error"
            elif result.status == "PROGRESS":
                payload["progress"] = result.info
            else:
                payload["info"] = result.info
            return payload
        except Exception as exc:
            return {
                "task_id": task_id,
                "status": "ERROR",
                "error": f"Failed to get task status: {exc}",
                "ready": False,
            }

    def cancel_task(self, task_id: str) -> Dict[str, Any]:
        try:
            self.celery_app.control.revoke(task_id, terminate=True)
            cleanup = cancel_training_task.delay(task_id)
            return {
                "success": True,
                "message": f"Task {task_id} cancellation initiated",
                "task_id": task_id,
                "cancel_task_id": cleanup.id,
            }
        except Exception as exc:
            return {"success": False, "error": f"Failed to cancel task: {exc}", "task_id": task_id}

    def test_celery_connection(self) -> Dict[str, Any]:
        try:
            result = test_task.delay("Celery connection test")
            return {
                "success": True,
                "message": "Test task sent successfully",
                "task_id": result.id,
                "status": result.status,
            }
        except Exception as exc:
            return {"success": False, "error": f"Celery connection test failed: {exc}"}

    def get_active_tasks(self) -> List[Dict[str, Any]]:
        try:
            active = self.celery_app.control.inspect().active()
            if not active:
                return []
            return [
                {
                    "worker": worker,
                    "task_id": task.get("id"),
                    "name": task.get("name"),
                    "args": task.get("args", []),
                    "kwargs": task.get("kwargs", {}),
                    "time_start": task.get("time_start"),
                }
                for worker, tasks in active.items()
                for task in tasks
            ]
        except Exception as exc:
            return [{"error": f"Failed to get active tasks: {exc}"}]


def update_training_job_status_sync(
    job_id: str,
    status: TrainingJobStatus,
    celery_task_id: Optional[str] = None,
    error_message: Optional[str] = None,
) -> bool:
    """Backward-compatible synchronous status helper for legacy workers."""
    try:
        db_gen = get_sync_db()
        db = next(db_gen)
        try:
            job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
            if not job:
                return False
            job.status = status
            if celery_task_id:
                job.celery_task_id = celery_task_id
            if error_message:
                job.error_message = error_message
            if status == TrainingJobStatus.RUNNING:
                job.started_at = datetime.now(timezone.utc)
            elif status in {
                TrainingJobStatus.COMPLETED,
                TrainingJobStatus.FAILED,
                TrainingJobStatus.CANCELLED,
            }:
                job.completed_at = datetime.now(timezone.utc)
            db.commit()
            return True
        finally:
            db.close()
    except Exception:
        return False


def save_training_result_sync(job_id: str, result_data: Dict[str, Any]) -> bool:
    """Backward-compatible result helper for legacy workers."""
    try:
        db_gen = get_sync_db()
        db = next(db_gen)
        try:
            metrics = result_data.get("metrics", {})
            db.add(
                TrainingResult(
                    job_id=job_id,
                    model_path=result_data["model_path"],
                    metrics_json=metrics,
                    feature_importance_json=result_data.get("feature_importance"),
                    confusion_matrix_json=result_data.get("confusion_matrix") or metrics.get("confusion_matrix"),
                    training_time_seconds=result_data.get("training_time_seconds", 0),
                    cross_val_scores=metrics.get("cv_scores"),
                )
            )
            db.commit()
            return True
        finally:
            db.close()
    except Exception:
        return False


def log_training_progress_sync(
    job_id: str,
    progress_percent: Optional[float] = None,
    epoch: Optional[int] = None,
    metrics: Optional[Dict[str, Any]] = None,
    message: Optional[str] = None,
) -> bool:
    """Backward-compatible log helper for legacy workers."""
    try:
        db_gen = get_sync_db()
        db = next(db_gen)
        try:
            db.add(
                TrainingLog(
                    job_id=job_id,
                    progress_percent=progress_percent,
                    epoch=epoch,
                    metrics_json=metrics or {},
                    message=message,
                )
            )
            db.commit()
            return True
        finally:
            db.close()
    except Exception:
        return False
