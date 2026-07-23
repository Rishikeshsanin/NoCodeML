from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    PROJECT_NAME: str = "NoCodeML API"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./nocodeml.db"
    
    # Redis (for Celery)
    CELERY_BROKER_URL: str = "memory://"
    CELERY_RESULT_BACKEND: str = "cache+memory://"
    
    # JWT Authentication
    SECRET_KEY: str = "local-development-key-change-before-deployment"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # CORS - comma-separated list of allowed origins
    BACKEND_CORS_ORIGINS: str = (
        "https://www.nocodeml.cloud,"
        "https://nocodeml.cloud,"
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://localhost:5174,"
        "http://127.0.0.1:5174,"
        "http://localhost:3000,"
        "http://localhost:8080"
    )

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
