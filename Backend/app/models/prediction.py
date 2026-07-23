"""Prediction history model."""
import uuid
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Uuid, func
from app.models.base import Base


class PredictionBatch(Base):
    __tablename__ = "prediction_batches"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    experiment_id = Column(Uuid(as_uuid=True), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, index=True)
    file_path = Column(String(1024), nullable=False)
    total_predictions = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
