from pathlib import Path
from typing import List

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """NoCodeML runtime settings.

    V3 visitor workflows are intentionally database-free. Legacy database and
    Celery settings remain optional only so archived modules can still be read
    or exercised in development without becoming production dependencies.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "NoCodeML API"
    APP_VERSION: str = "3.0.0-rc.2"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # Optional legacy compatibility. The public V3 runtime does not connect to
    # or write visitor data into this database.
    DATABASE_URL: str = "sqlite+aiosqlite:////tmp/nocodeml-legacy.db"
    DB_SCHEMA: str = "nocodeml"

    # Temporary guest workspaces. Raw session tokens are never folder names.
    SESSION_ROOT_DIR: str = "/tmp/nocodeml-sessions"
    SESSION_TTL_MINUTES: int = 60
    SESSION_CLEANUP_INTERVAL_SECONDS: int = 300
    SESSION_CLOSE_GRACE_SECONDS: int = 30

    # Bounded in-process ML capacity for the single-instance guest backend.
    WORKSPACE_TRAINING_WORKERS: int = 1
    WORKSPACE_MAX_MODELS_PER_RUN: int = 8

    # Legacy/local artifact settings retained for archived services only.
    DATASETS_DIR: str = "/tmp/nocodeml-legacy/datasets"
    MODELS_DIR: str = "/tmp/nocodeml-legacy/models"
    PREDICTIONS_DIR: str = "/tmp/nocodeml-legacy/predictions"
    ARTIFACT_CACHE_DIR: str = "/tmp/nocodeml-artifacts"
    ARTIFACT_STORAGE_BACKEND: str = "local"
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_NAME: str = ""
    S3_REGION: str = "auto"
    S3_ADDRESSING_STYLE: str = "path"

    CELERY_BROKER_URL: str = "memory://"
    CELERY_RESULT_BACKEND: str = "cache+memory://"

    # Legacy auth modules are not mounted in the V3 public API.
    SECRET_KEY: str = "legacy-auth-disabled-in-v3-guest-runtime"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Data Science Assistant. Key remains server-side only.
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.7-flash"

    BACKEND_CORS_ORIGINS: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://localhost:5174,"
        "http://127.0.0.1:5174"
    )

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip().rstrip("/") for origin in self.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]

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
    def session_root(self) -> Path:
        return Path(self.SESSION_ROOT_DIR).expanduser()

    @property
    def uses_object_storage(self) -> bool:
        return self.ARTIFACT_STORAGE_BACKEND.lower() == "s3"

    @model_validator(mode="after")
    def validate_runtime_safety(self):
        for field_name in ("SESSION_ROOT_DIR", "DATASETS_DIR", "MODELS_DIR", "PREDICTIONS_DIR", "ARTIFACT_CACHE_DIR"):
            value = getattr(self, field_name).strip()
            if not value:
                raise ValueError(f"{field_name} cannot be empty")
            setattr(self, field_name, value)

        if not 5 <= self.SESSION_TTL_MINUTES <= 24 * 60:
            raise ValueError("SESSION_TTL_MINUTES must be between 5 and 1440")
        if not 10 <= self.SESSION_CLEANUP_INTERVAL_SECONDS <= 3600:
            raise ValueError("SESSION_CLEANUP_INTERVAL_SECONDS must be between 10 and 3600")
        if not 5 <= self.SESSION_CLOSE_GRACE_SECONDS <= 300:
            raise ValueError("SESSION_CLOSE_GRACE_SECONDS must be between 5 and 300")
        if not 1 <= self.WORKSPACE_TRAINING_WORKERS <= 4:
            raise ValueError("WORKSPACE_TRAINING_WORKERS must be between 1 and 4")
        if not 1 <= self.WORKSPACE_MAX_MODELS_PER_RUN <= 8:
            raise ValueError("WORKSPACE_MAX_MODELS_PER_RUN must be between 1 and 8")

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

        return self


settings = Settings()
