"""Public API surface for the guest-first NoCodeML release."""
from fastapi import APIRouter

from app.api import assistant, models, session, workspace

api_router = APIRouter()

# The V3 public runtime intentionally exposes no account, experiment, dataset,
# training-run or prediction persistence routes. Visitor work exists only in
# the isolated temporary workspace owned by the anonymous session token.
api_router.include_router(session.router, prefix="/session", tags=["Temporary Session"])
api_router.include_router(workspace.router, prefix="/workspace", tags=["Temporary Workspace"])
api_router.include_router(models.router, tags=["ML Models"])
api_router.include_router(assistant.router, prefix="/assistant", tags=["AI Assistant"])
