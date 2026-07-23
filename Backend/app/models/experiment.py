"""Experiment database model and enums."""
import enum
import uuid
from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Uuid, UniqueConstraint, func
from app.models.base import Base


class ExperimentStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TrainingStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    TRAINING = "training"
    COMPLETED = "completed"
    FAILED = "failed"


def enum_values(enum_class):
    return [item.value for item in enum_class]


class Experiment(Base):
    __tablename__ = "experiments"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_experiment_name"),)

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    dataset_id = Column(Uuid(as_uuid=True), ForeignKey("datasets.id", ondelete="RESTRICT"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    status = Column(Enum(ExperimentStatus, values_callable=enum_values), nullable=False, default=ExperimentStatus.IN_PROGRESS)
    training_status = Column(Enum(TrainingStatus, values_callable=enum_values), nullable=False, default=TrainingStatus.NOT_STARTED, index=True)
    config = Column(JSON, nullable=False, default=dict)
    results = Column(JSON)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
