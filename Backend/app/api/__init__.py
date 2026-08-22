"""API routes package."""
from fastapi import APIRouter

from app.api import assistant, auth, datasets, eda, experiments, models, predictions, session, training


api_router = APIRouter()

api_router.include_router(session.router, prefix="/session", tags=["Temporary Session"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(datasets.router, prefix="/datasets", tags=["Datasets"])
api_router.include_router(experiments.router, prefix="/experiments", tags=["Experiments"])
api_router.include_router(eda.router, tags=["EDA"])
api_router.include_router(models.router, tags=["ML Models"])
api_router.include_router(training.router, prefix="/training", tags=["Training"])
api_router.include_router(predictions.router, prefix="/predictions", tags=["Predictions"])
api_router.include_router(assistant.router, prefix="/assistant", tags=["AI Assistant"])
