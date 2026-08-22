import re
from pathlib import Path
from typing import List

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "NoCodeML API"
    APP_VERSION: str = "3.0.0-rc.1"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./nocodeml.db"
    DB_SCHEMA: str = "nocodeml"

    # Local artifact staging/storage. In production these paths are private to
    # the NoCodeML service and are never pointed at another application's data.
    DATASETS_DIR: str = "./datasets"
    MODELS_DIR: str = "./models"
    PREDICTIONS_DIR: str = "./predictions"
    ARTIFACT_CACHE_DIR: str = "/tmp/nocodeml-artifacts"

    # Artifact backend: local for development, S3-compatible object storage for
    # deployments with separate API/worker services.
    ARTIFACT_STORAGE_BACKEND: str = "local"
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_NAME: str = ""
    S3_REGION: str = "auto"
    S3_ADDRESSING_STYLE: str = "path"

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

    @property
    def uses_object_storage(self) -> bool:
        return self.ARTIFACT_STORAGE_BACKEND.lower() == "s3"

    @model_validator(mode="after")
    def validate_runtime_safety(self):
        if not re.fullmatch(r"[a-z_][a-z0-9_]*", self.DB_SCHEMA):
            raise ValueError("DB_SCHEMA must be a safe lowercase PostgreSQL identifier")

        for field_name in ("DATASETS_DIR", "MODELS_DIR", "PREDICTIONS_DIR", "ARTIFACT_CACHE_DIR"):
            value = getattr(self, field_name).strip()
            if not value:
                raise ValueError(f"{field_name} cannot be empty")
            setattr(self, field_name, value)

        backend = self.ARTIFACT_STORAGE_BACKEND.strip().lower()
        if backend not in {"local", "s3"}:
            raise ValueError("ARTIFACT_STORAGE_BACKEND must be 'local' or 's3'")
        self.ARTIFACT_STORAGE_BACKEND = backend

        style = self.S3_ADDRESSING_STYLE.strip().lower()
        if style not in {"path", "virtual", "auto"}:
            raise ValueError("S3_ADDRESSING_STYLE must be path, virtual, or auto")
        self.S3_ADDRESSING_STYLE = style

        if backend == "s3":
            required = {
                "S3_ENDPOINT_URL": self.S3_ENDPOINT_URL,
                "S3_ACCESS_KEY_ID": self.S3_ACCESS_KEY_ID,
                "S3_SECRET_ACCESS_KEY": self.S3_SECRET_ACCESS_KEY,
                "S3_BUCKET_NAME": self.S3_BUCKET_NAME,
            }
            missing = [name for name, value in required.items() if not value.strip()]
            if missing:
                raise ValueError(f"Missing S3 artifact settings: {', '.join(missing)}")

        if self.ENVIRONMENT.lower() == "production":
            if self.SECRET_KEY == "local-development-key-change-before-deployment" or len(self.SECRET_KEY) < 32:
                raise ValueError("A strong SECRET_KEY is required in production")
            if not self.is_postgres:
                raise ValueError("Production NoCodeML requires PostgreSQL")
            if self.DB_SCHEMA != "nocodeml":
                raise ValueError("Production NoCodeML must use the isolated 'nocodeml' schema")
        return self


settings = Settings()
