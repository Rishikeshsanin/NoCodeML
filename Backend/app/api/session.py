"""Anonymous temporary-session endpoints for guest-first NoCodeML."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Form, Header, HTTPException, Response, status

from app.core.config import settings
from app.services.session_manager import (
    InvalidSessionToken,
    SessionExpired,
    SessionNotFound,
    session_manager,
)


router = APIRouter()
SESSION_HEADER = "X-NoCodeML-Session"


def _session_token(
    token: Annotated[str | None, Header(alias=SESSION_HEADER)] = None,
) -> str:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail={
                "code": "SESSION_REQUIRED",
                "message": "Start a temporary NoCodeML session before using this endpoint.",
            },
        )
    return token


SessionToken = Annotated[str, Depends(_session_token)]


def _session_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, InvalidSessionToken):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SESSION_INVALID", "message": "The temporary session token is invalid."},
        )
    if isinstance(exc, (SessionExpired, SessionNotFound)):
        return HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "SESSION_EXPIRED",
                "message": "This temporary session has ended. Start a new session to continue.",
            },
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={"code": "SESSION_ERROR", "message": "The temporary workspace is unavailable."},
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_session():
    token, metadata = session_manager.create()
    return {
        "session_token": token,
        "expires_at": metadata["expires_at"],
        "ttl_seconds": settings.SESSION_TTL_MINUTES * 60,
        "close_grace_seconds": settings.SESSION_CLOSE_GRACE_SECONDS,
        "temporary": True,
        "privacy": "Workspace files are temporary and are automatically removed after the session ends or expires.",
    }


@router.get("")
def get_session(token: SessionToken):
    try:
        metadata = session_manager.touch(token)
    except (InvalidSessionToken, SessionExpired, SessionNotFound) as exc:
        raise _session_http_error(exc) from exc

    return {
        "status": "active",
        "expires_at": metadata["expires_at"],
        "ttl_seconds": settings.SESSION_TTL_MINUTES * 60,
        "temporary": True,
    }


@router.post("/heartbeat")
def heartbeat_session(token: SessionToken):
    try:
        metadata = session_manager.touch(token)
    except (InvalidSessionToken, SessionExpired, SessionNotFound) as exc:
        raise _session_http_error(exc) from exc
    return {"status": "active", "expires_at": metadata["expires_at"]}


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_session(token: SessionToken):
    try:
        session_manager.delete(token)
    except InvalidSessionToken as exc:
        raise _session_http_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/end", status_code=status.HTTP_202_ACCEPTED)
def mark_session_closing(session_token: Annotated[str, Form(min_length=32, max_length=128)]):
    """Best-effort browser close signal using a CORS-safe form beacon.

    Deletion is delayed by a short grace period so normal page reloads can
    heartbeat and keep the workspace alive.
    """
    try:
        session_manager.mark_closing(session_token)
    except InvalidSessionToken as exc:
        raise _session_http_error(exc) from exc
    return {
        "status": "cleanup_scheduled",
        "delete_after_seconds": settings.SESSION_CLOSE_GRACE_SECONDS,
    }
