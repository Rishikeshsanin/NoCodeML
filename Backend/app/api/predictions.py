"""Prediction API endpoints."""
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.models.experiment import Experiment
from app.models.prediction import PredictionBatch
from app.schemas.prediction import BatchPredictionResponse, SinglePredictionRequest, SinglePredictionResponse
from app.services.artifact_store import artifact_store
from app.services.prediction_service import PredictionService


router = APIRouter()
prediction_service = PredictionService()


async def _owned_experiment(experiment_id: UUID, user_id: int, db: AsyncSession) -> Experiment:
    result = await db.execute(
        select(Experiment).where(Experiment.id == experiment_id, Experiment.user_id == user_id)
    )
    experiment = result.scalar_one_or_none()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@router.post("/experiments/{experiment_id}/predict/single", response_model=SinglePredictionResponse)
async def predict_single(
    experiment_id: UUID,
    request: SinglePredictionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _owned_experiment(experiment_id, current_user.id, db)
    return await prediction_service.predict_single(experiment_id=experiment_id, features=request.features)


@router.post("/experiments/{experiment_id}/predict/batch", response_model=BatchPredictionResponse)
async def predict_batch(
    experiment_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _owned_experiment(experiment_id, current_user.id, db)

    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        await file.close()
        raise HTTPException(status_code=400, detail="Only CSV files are supported for batch prediction")

    return await prediction_service.predict_batch(
        experiment_id=experiment_id,
        file=file,
        user_id=current_user.id,
    )


@router.get("/experiments/{experiment_id}/history")
async def get_prediction_history(
    experiment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _owned_experiment(experiment_id, current_user.id, db)

    result = await db.execute(
        select(PredictionBatch)
        .where(
            PredictionBatch.experiment_id == experiment_id,
            PredictionBatch.user_id == current_user.id,
        )
        .order_by(desc(PredictionBatch.created_at))
    )
    predictions = result.scalars().all()
    return {
        "predictions": [
            {
                "id": str(prediction.id),
                "experiment_id": str(prediction.experiment_id),
                "total_predictions": prediction.total_predictions,
                "created_at": prediction.created_at.isoformat(),
                "download_url": f"/api/v1/predictions/download/{prediction.id}",
            }
            for prediction in predictions
        ]
    }


@router.get("/download/{prediction_id}")
async def download_predictions(
    prediction_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        pred_uuid = UUID(prediction_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid prediction ID format") from exc

    result = await db.execute(
        select(PredictionBatch).where(
            PredictionBatch.id == pred_uuid,
            PredictionBatch.user_id == current_user.id,
        )
    )
    prediction_batch = result.scalar_one_or_none()
    if not prediction_batch:
        raise HTTPException(status_code=404, detail="Prediction results not found")

    uri = prediction_batch.file_path
    if uri.startswith("s3://"):
        try:
            signed_url = artifact_store.presign_get(uri, expires_seconds=300)
        except Exception as exc:
            raise HTTPException(status_code=404, detail="Prediction artifact is unavailable") from exc
        return RedirectResponse(url=signed_url, status_code=307)

    if not artifact_store.exists(uri):
        raise HTTPException(status_code=404, detail="Prediction artifact has been deleted or moved")

    return FileResponse(
        path=uri,
        filename=f"predictions_{prediction_id}.csv",
        media_type="text/csv",
    )
