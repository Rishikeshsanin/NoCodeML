"""Main FastAPI application entry point."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import api_router
from app.core.config import settings
from app.core.model_cache import initialize_model_cache
from app.db.session import async_engine
from app.models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown events."""
    if settings.DATABASE_URL.startswith("sqlite+"):
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    initialize_model_cache()
    print(f"NoCodeML {settings.APP_VERSION} started")
    yield
    await async_engine.dispose()
    print("Database connections closed")


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    description="NoCodeML V3 API - visual machine learning with reproducible preprocessing and isolated persistence",
    version=settings.APP_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    """Liveness probe: confirms that the API process is serving requests."""
    return {
        "status": "healthy",
        "service": "NoCodeML API",
        "version": settings.APP_VERSION,
    }


@app.get("/ready")
async def readiness_check(response: Response):
    """Readiness probe for deployment diagnostics without exposing secrets."""
    checks: dict[str, dict[str, str]] = {}

    try:
        async with async_engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        checks["database"] = {"status": "ready", "schema": settings.DB_SCHEMA}
    except Exception:
        checks["database"] = {"status": "unavailable"}

    broker = settings.CELERY_BROKER_URL
    if broker.startswith("redis://") or broker.startswith("rediss://"):
        try:
            from redis.asyncio import Redis

            client = Redis.from_url(broker, socket_connect_timeout=2, socket_timeout=2)
            await client.ping()
            await client.aclose()
            checks["queue"] = {"status": "ready", "backend": "redis"}
        except Exception:
            checks["queue"] = {"status": "unavailable", "backend": "redis"}
    else:
        checks["queue"] = {"status": "ready", "backend": "embedded-dev"}

    checks["artifacts"] = {
        "status": "configured",
        "backend": settings.ARTIFACT_STORAGE_BACKEND,
    }

    ready = all(check["status"] not in {"unavailable"} for check in checks.values())
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if ready else "not_ready",
        "service": "NoCodeML API",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "checks": checks,
    }


app.include_router(api_router, prefix=settings.API_V1_STR)
