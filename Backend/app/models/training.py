"""Training database models."""
import enum
import uuid
from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text, Uuid, UniqueConstraint, func
from sqlalchemy.orm import synonym
from app.models.base import Base


class TrainingJobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


def enum_values(enum_class):
    return [item.value for item in enum_class]


class TrainingJob(Base):
    __tablename__ = "training_jobs"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(Uuid(as_uuid=True), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, index=True)
    model_type = Column(String(100), nullable=False, index=True)
    status = Column(Enum(TrainingJobStatus, values_callable=enum_values), nullable=False, default=TrainingJobStatus.QUEUED, index=True)
    config_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    error_message = Column(Text)
    celery_task_id = Column(String(255), index=True)


class TrainingResult(Base):
    __tablename__ = "training_results"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(Uuid(as_uuid=True), ForeignKey("training_jobs.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    model_path = Column(String(1024), nullable=False)
    metrics_json = Column(JSON, nullable=False, default=dict)
    feature_importance_json = Column(JSON)
    confusion_matrix_json = Column(JSON)
    training_time_seconds = Column(Float, nullable=False, default=0)
    cross_val_scores = Column(JSON)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class TrainingLog(Base):
    __tablename__ = "training_logs"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(Uuid(as_uuid=True), ForeignKey("training_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    epoch = Column(Integer)
    progress_percent = Column(Float)
    metrics_json = Column(JSON, nullable=False, default=dict)
    message = Column(Text)
    timestamp = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    created_at = synonym("timestamp")


class TrainingRun(Base):
    __tablename__ = "training_runs"
    __table_args__ = (UniqueConstraint("experiment_id", "run_number", name="uq_experiment_run_number"),)
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(Uuid(as_uuid=True), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, index=True)
    run_number = Column(Integer, nullable=False)
    job_id = Column(String(255), unique=True, index=True)
    status = Column(String(20), nullable=False, default="pending", index=True)
    config_snapshot = Column(JSON, nullable=False, default=dict)
    results = Column(JSON)
    artifacts = Column(JSON)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    duration_seconds = Column(Integer)
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
