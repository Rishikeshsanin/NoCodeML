"""Main FastAPI application entry point."""
import asyncio
import tempfile
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import api_router
from app.core.config import settings
from app.core.model_cache import initialize_model_cache
from app.db.session import async_engine
from app.models import Base
from app.services.session_manager import session_manager


async def _session_cleanup_loop() -> None:
    """Periodically remove expired/closed anonymous workspaces."""
    while True:
        await asyncio.sleep(settings.SESSION_CLEANUP_INTERVAL_SECONDS)
        try:
            removed = await asyncio.to_thread(session_manager.cleanup_expired)
            if removed:
                print(f"Temporary session cleanup removed {removed} workspace(s)")
        except Exception as exc:  # cleanup must never terminate the API process
            print(f"Temporary session cleanup warning: {type(exc).__name__}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown events."""
    if settings.DATABASE_URL.startswith("sqlite+"):
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    initialize_model_cache()
    session_manager.ensure_root()
    # In-process ML jobs cannot survive an API restart. Clear any leases left by
    # the previous process before applying normal close/TTL cleanup.
    reset_leases = await asyncio.to_thread(session_manager.reset_stale_job_leases)
    if reset_leases:
        print(f"Recovered {reset_leases} interrupted temporary training session(s)")
    await asyncio.to_thread(session_manager.cleanup_expired)
    cleanup_task = asyncio.create_task(_session_cleanup_loop(), name="nocodeml-session-cleanup")

    print(f"NoCodeML {settings.APP_VERSION} started")
    try:
        yield
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task
        await async_engine.dispose()
        print("NoCodeML shutdown complete")


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    description="NoCodeML V3 API - visual machine learning with temporary guest workspaces",
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
        root = session_manager.ensure_root()
        with tempfile.NamedTemporaryFile(prefix=".ready-", dir=root):
            pass
        checks["temporary_workspace"] = {"status": "ready"}
    except Exception:
        checks["temporary_workspace"] = {"status": "unavailable"}

    # Database remains a transitional dependency until dataset/experiment/run
    # persistence is fully removed from the guest-first release.
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

    ready = all(check["status"] != "unavailable" for check in checks.values())
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
