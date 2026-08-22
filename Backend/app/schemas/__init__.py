"""Pydantic schemas for request/response validation."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator


class UserCreate(BaseModel):
    """Schema for user registration request."""

    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long")
        # bcrypt operates on at most 72 bytes. Reject oversized inputs instead of
        # silently hashing a truncated password.
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes")
        return value


class UserResponse(BaseModel):
    """Schema for user data in responses."""

    id: int
    email: str
    is_active: bool
    is_superuser: bool
    is_verified: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    """Schema for login request."""

    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class Token(BaseModel):
    """Schema for token response."""

    access_token: str
    token_type: str = "bearer"


from app.schemas.dataset import (
    ColumnInfo,
    DatasetCreate,
    DatasetListResponse,
    DatasetPreviewResponse,
    DatasetResponse,
    DatasetUpdate,
)
from app.schemas.experiment import (
    ExperimentConfig,
    ExperimentCreate,
    ExperimentListResponse,
    ExperimentResponse,
    ExperimentUpdate,
)
from app.schemas.model_config import (
    ModelConfigRequest,
    ModelConfigResponse,
    ModelSelectionRequest,
    ModelSelectionResponse,
    PreprocessingConfig,
    TrainingConfig,
)
from app.schemas.training import (
    ConfusionMatrix,
    ExperimentTrainingStatus,
    FeatureImportance,
    JobStatusResponse,
    StartTrainingRequest,
    StartTrainingResponse,
    TrainingJobCreate,
    TrainingJobResponse,
    TrainingLogResponse,
    TrainingMetrics,
    TrainingProgress,
    TrainingResultResponse,
)

__all__ = [
    "UserCreate",
    "UserResponse",
    "LoginRequest",
    "Token",
    "DatasetCreate",
    "DatasetUpdate",
    "DatasetResponse",
    "DatasetListResponse",
    "DatasetPreviewResponse",
    "ColumnInfo",
    "ExperimentConfig",
    "ExperimentCreate",
    "ExperimentUpdate",
    "ExperimentResponse",
    "ExperimentListResponse",
    "PreprocessingConfig",
    "TrainingConfig",
    "ModelConfigRequest",
    "ModelConfigResponse",
    "ModelSelectionRequest",
    "ModelSelectionResponse",
    "TrainingJobCreate",
    "TrainingJobResponse",
    "TrainingProgress",
    "TrainingMetrics",
    "FeatureImportance",
    "ConfusionMatrix",
    "TrainingResultResponse",
    "TrainingLogResponse",
    "StartTrainingRequest",
    "StartTrainingResponse",
    "JobStatusResponse",
    "ExperimentTrainingStatus",
]
