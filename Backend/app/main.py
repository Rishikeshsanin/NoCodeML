"""Main FastAPI application entry point for guest-first NoCodeML."""
import asyncio
import shutil
import tempfile
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import settings
from app.core.model_cache import initialize_model_cache
from app.services.session_manager import session_manager


async def _session_cleanup_loop() -> None:
    while True:
        await asyncio.sleep(settings.SESSION_CLEANUP_INTERVAL_SECONDS)
        try:
            removed = await asyncio.to_thread(session_manager.cleanup_expired)
            if removed:
                print(f"Temporary session cleanup removed {removed} workspace(s)")
        except Exception as exc:
            print(f"Temporary session cleanup warning: {type(exc).__name__}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_model_cache()
    session_manager.ensure_root()
    reset_leases = await asyncio.to_thread(session_manager.reset_stale_job_leases)
    if reset_leases:
        print(f"Recovered {reset_leases} interrupted temporary training session(s)")
    await asyncio.to_thread(session_manager.cleanup_expired)
    cleanup_task = asyncio.create_task(_session_cleanup_loop(), name="nocodeml-session-cleanup")
    print(f"NoCodeML {settings.APP_VERSION} started in temporary guest mode")
    try:
        yield
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task
        print("NoCodeML shutdown complete")


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    description="NoCodeML V3 API - temporary, account-free visual machine learning",
    version=settings.APP_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "X-NoCodeML-Session"],
    expose_headers=["Content-Disposition"],
)


@app.get("/")
def read_root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "version": settings.APP_VERSION,
        "mode": "temporary-guest",
        "persistence": "disabled-for-visitor-workspaces",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "NoCodeML API",
        "version": settings.APP_VERSION,
        "mode": "temporary-guest",
    }


@app.get("/ready")
def readiness_check(response: Response):
    checks: dict[str, dict[str, object]] = {}
    try:
        root = session_manager.ensure_root()
        with tempfile.NamedTemporaryFile(prefix=".ready-", dir=root):
            pass
        usage = shutil.disk_usage(root)
        checks["temporary_workspace"] = {
            "status": "ready",
            "free_mb": round(usage.free / 1024 / 1024),
        }
    except Exception:
        checks["temporary_workspace"] = {"status": "unavailable"}

    checks["training"] = {
        "status": "ready",
        "backend": "bounded-in-process",
        "workers": settings.WORKSPACE_TRAINING_WORKERS,
        "max_models_per_run": settings.WORKSPACE_MAX_MODELS_PER_RUN,
    }

    ready = all(check["status"] != "unavailable" for check in checks.values())
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if ready else "not_ready",
        "service": "NoCodeML API",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "mode": "temporary-guest",
        "checks": checks,
    }


app.include_router(api_router, prefix=settings.API_V1_STR)
