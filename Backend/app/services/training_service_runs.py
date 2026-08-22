"""Training service layer for run-based ML training."""
from datetime import datetime, timezone
from typing import Any, Dict
import uuid

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.experiment import Experiment
from app.models.training import TrainingRun
from app.services.task_manager import TaskManager


def _results_summary(run: TrainingRun):
    if not run.results:
        return None
    return {
        **run.results.get("summary", {}),
        "best_model": run.results.get("best_model"),
    }


def _progress_payload(run: TrainingRun) -> Dict[str, Any]:
    if run.status == "completed":
        return {"percent": 100, "message": "Training completed"}
    if run.status == "failed":
        return {"percent": 0, "message": run.error_message or "Training failed"}
    if run.status == "cancelled":
        return {"percent": 0, "message": "Training cancelled"}
    if run.status == "running":
        progress = 50
        message = "Training models..."
        if isinstance(run.results, dict):
            progress_data = run.results.get("progress")
            if isinstance(progress_data, dict):
                current = progress_data.get("current", 0)
                total = progress_data.get("total", 0)
                current_model = progress_data.get("current_model")
                if isinstance(current, (int, float)) and isinstance(total, (int, float)) and total > 0:
                    progress = max(0, min(99, int((current / total) * 100)))
                if current_model:
                    message = f"Training {current_model}..."
        return {"percent": progress, "message": message}
    return {"percent": 0, "message": "Waiting for worker..."}


async def start_training_run(
    db: AsyncSession,
    experiment_id: uuid.UUID,
    user_id: int,
) -> Dict[str, Any]:
    experiment_query = select(Experiment).where(
        and_(Experiment.id == experiment_id, Experiment.user_id == user_id)
    )
    result = await db.execute(experiment_query)
    experiment = result.scalar_one_or_none()

    if not experiment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")

    config = experiment.config
    if not config or not config.get("taskType") or not config.get("targetColumn"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Experiment config is incomplete. Please configure task type and target column.",
        )

    if not config.get("selectedFeatures"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No features selected for training")

    if not config.get("models"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No models selected for training")

    dataset_query = select(Dataset).where(
        and_(Dataset.id == experiment.dataset_id, Dataset.user_id == user_id)
    )
    dataset_result = await db.execute(dataset_query)
    dataset = dataset_result.scalar_one_or_none()

    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    # Lock the experiment row so two concurrent requests cannot allocate the same run number.
    lock_query = select(Experiment).where(Experiment.id == experiment_id).with_for_update()
    await db.execute(lock_query)

    max_run_query = select(func.coalesce(func.max(TrainingRun.run_number), 0)).where(
        TrainingRun.experiment_id == experiment_id
    )
    max_run_result = await db.execute(max_run_query)
    run_number = (max_run_result.scalar() or 0) + 1

    training_run = TrainingRun(
        experiment_id=experiment_id,
        run_number=run_number,
        status="pending",
        config_snapshot=config,
    )
    db.add(training_run)
    await db.commit()
    await db.refresh(training_run)

    task_manager = TaskManager()
    try:
        job_id = task_manager.start_training_run_task(
            run_id=str(training_run.id),
            experiment_id=str(experiment_id),
            dataset_id=str(dataset.id),
        )
        training_run.job_id = job_id
        await db.commit()
    except Exception as exc:
        training_run.status = "failed"
        training_run.error_message = f"Failed to dispatch training task: {exc}"
        training_run.completed_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Training service is temporarily unavailable",
        ) from exc

    return {
        "run_id": str(training_run.id),
        "run_number": run_number,
        "job_id": job_id,
        "status": "pending",
        "created_at": training_run.created_at.isoformat(),
    }


async def get_experiment_runs(
    db: AsyncSession,
    experiment_id: uuid.UUID,
    user_id: int,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    experiment_query = select(Experiment).where(
        and_(Experiment.id == experiment_id, Experiment.user_id == user_id)
    )
    result = await db.execute(experiment_query)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")

    count_query = select(func.count(TrainingRun.id)).where(TrainingRun.experiment_id == experiment_id)
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    runs_query = (
        select(TrainingRun)
        .where(TrainingRun.experiment_id == experiment_id)
        .order_by(TrainingRun.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    runs_result = await db.execute(runs_query)
    runs = runs_result.scalars().all()

    return {
        "runs": [
            {
                "id": str(run.id),
                "run_number": run.run_number,
                "status": run.status,
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "completed_at": run.completed_at.isoformat() if run.completed_at else None,
                "duration_seconds": run.duration_seconds,
                "progress": _progress_payload(run),
                "results_summary": _results_summary(run),
                "error_message": run.error_message,
                "created_at": run.created_at.isoformat(),
            }
            for run in runs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total else 0,
    }


async def get_run_details(
    db: AsyncSession,
    run_id: uuid.UUID,
    user_id: int,
) -> Dict[str, Any]:
    run_query = (
        select(TrainingRun)
        .join(Experiment, TrainingRun.experiment_id == Experiment.id)
        .where(and_(TrainingRun.id == run_id, Experiment.user_id == user_id))
    )
    result = await db.execute(run_query)
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training run not found")

    return {
        "id": str(run.id),
        "experiment_id": str(run.experiment_id),
        "run_number": run.run_number,
        "status": run.status,
        "progress": _progress_payload(run),
        "config_snapshot": run.config_snapshot,
        "results": run.results or {},
        "results_summary": _results_summary(run),
        "artifacts": run.artifacts or {},
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "duration_seconds": run.duration_seconds,
        "error_message": run.error_message,
        "created_at": run.created_at.isoformat(),
    }


async def get_run_status(
    db: AsyncSession,
    run_id: uuid.UUID,
    user_id: int,
) -> Dict[str, Any]:
    run_query = (
        select(TrainingRun)
        .join(Experiment, TrainingRun.experiment_id == Experiment.id)
        .where(and_(TrainingRun.id == run_id, Experiment.user_id == user_id))
    )
    result = await db.execute(run_query)
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training run not found")

    return {
        "run_id": str(run.id),
        "run_number": run.run_number,
        "status": run.status,
        "progress": _progress_payload(run),
        "results_summary": _results_summary(run),
        "error_message": run.error_message,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }
