import re
from pathlib import Path
from typing import List

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "NoCodeML API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./nocodeml.db"
    DB_SCHEMA: str = "nocodeml"

    # NoCodeML-only artifact storage. Production should mount these paths on the
    # application's dedicated persistent volume; never point them at another app.
    DATASETS_DIR: str = "./datasets"
    MODELS_DIR: str = "./models"
    PREDICTIONS_DIR: str = "./predictions"

    # Redis (for Celery)
    CELERY_BROKER_URL: str = "memory://"
    CELERY_RESULT_BACKEND: str = "cache+memory://"

    # JWT Authentication
    SECRET_KEY: str = "local-development-key-change-before-deployment"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Data Science Assistant (server-side only)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.7-flash"

    # CORS - comma-separated list of allowed origins
    BACKEND_CORS_ORIGINS: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://localhost:5174,"
        "http://127.0.0.1:5174"
    )

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip().rstrip("/") for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith("postgresql")

    @property
    def database_connect_args(self) -> dict:
        if not self.is_postgres:
            return {}
        return {"options": f"-csearch_path={self.DB_SCHEMA}"}

    @property
    def storage_paths(self) -> tuple[Path, Path, Path]:
        return tuple(Path(path).expanduser() for path in (self.DATASETS_DIR, self.MODELS_DIR, self.PREDICTIONS_DIR))

    @model_validator(mode="after")
    def validate_runtime_safety(self):
        if not re.fullmatch(r"[a-z_][a-z0-9_]*", self.DB_SCHEMA):
            raise ValueError("DB_SCHEMA must be a safe lowercase PostgreSQL identifier")

        for field_name in ("DATASETS_DIR", "MODELS_DIR", "PREDICTIONS_DIR"):
            value = getattr(self, field_name).strip()
            if not value:
                raise ValueError(f"{field_name} cannot be empty")
            setattr(self, field_name, value)

        if self.ENVIRONMENT.lower() == "production":
            if self.SECRET_KEY == "local-development-key-change-before-deployment" or len(self.SECRET_KEY) < 32:
                raise ValueError("A strong SECRET_KEY is required in production")
            if not self.is_postgres:
                raise ValueError("Production NoCodeML requires PostgreSQL")
            if self.DB_SCHEMA != "nocodeml":
                raise ValueError("Production NoCodeML must use the isolated 'nocodeml' schema")
        return self


settings = Settings()
