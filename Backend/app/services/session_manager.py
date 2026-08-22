"""Temporary anonymous workspace management for NoCodeML guest sessions."""
from __future__ import annotations

import hashlib
import json
import secrets
import shutil
import threading
import time
from pathlib import Path
from typing import Any

from app.core.config import settings


class SessionError(Exception):
    """Base error for temporary session operations."""


class InvalidSessionToken(SessionError):
    pass


class SessionNotFound(SessionError):
    pass


class SessionExpired(SessionError):
    pass


class SessionManager:
    """Owns isolated, short-lived filesystem workspaces for anonymous users.

    Raw session tokens never appear on disk. Each workspace directory uses a
    SHA-256 digest of the token and contains only temporary NoCodeML artifacts.
    """

    WORKSPACE_DIRS = ("datasets", "analysis", "training", "models", "predictions", "exports")
    META_FILE = ".session.json"

    def __init__(
        self,
        root: Path | None = None,
        ttl_seconds: int | None = None,
        close_grace_seconds: int | None = None,
    ) -> None:
        self.root = (root or settings.session_root).resolve()
        self.ttl_seconds = ttl_seconds or settings.SESSION_TTL_MINUTES * 60
        self.close_grace_seconds = close_grace_seconds or settings.SESSION_CLOSE_GRACE_SECONDS
        self._lock = threading.RLock()

    def ensure_root(self) -> Path:
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        return self.root

    @staticmethod
    def _validate_token(token: str) -> str:
        value = (token or "").strip()
        if not 32 <= len(value) <= 128:
            raise InvalidSessionToken("Invalid session token")
        allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
        if any(char not in allowed for char in value):
            raise InvalidSessionToken("Invalid session token")
        return value

    @classmethod
    def token_digest(cls, token: str) -> str:
        value = cls._validate_token(token)
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    def _workspace_for_token(self, token: str) -> Path:
        digest = self.token_digest(token)
        return self.root / digest

    def _metadata_path(self, workspace: Path) -> Path:
        return workspace / self.META_FILE

    @staticmethod
    def _now() -> int:
        return int(time.time())

    def _read_metadata(self, workspace: Path) -> dict[str, Any]:
        metadata_path = self._metadata_path(workspace)
        if not metadata_path.is_file():
            raise SessionNotFound("Session does not exist")
        try:
            payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise SessionNotFound("Session metadata is unavailable") from exc
        if not isinstance(payload, dict):
            raise SessionNotFound("Session metadata is invalid")
        return payload

    def _write_metadata(self, workspace: Path, metadata: dict[str, Any]) -> None:
        metadata_path = self._metadata_path(workspace)
        temp_path = workspace / f"{self.META_FILE}.tmp"
        temp_path.write_text(json.dumps(metadata, separators=(",", ":")), encoding="utf-8")
        temp_path.replace(metadata_path)

    def create(self) -> tuple[str, dict[str, Any]]:
        self.ensure_root()
        with self._lock:
            while True:
                token = secrets.token_urlsafe(32)
                workspace = self._workspace_for_token(token)
                if not workspace.exists():
                    break

            workspace.mkdir(mode=0o700)
            for name in self.WORKSPACE_DIRS:
                (workspace / name).mkdir(mode=0o700)

            now = self._now()
            metadata: dict[str, Any] = {
                "created_at": now,
                "last_seen": now,
                "expires_at": now + self.ttl_seconds,
                "delete_after": None,
            }
            self._write_metadata(workspace, metadata)
            return token, metadata.copy()

    def resolve(self, token: str, *, touch: bool = True) -> tuple[Path, dict[str, Any]]:
        self.ensure_root()
        workspace = self._workspace_for_token(token)

        with self._lock:
            if not workspace.is_dir():
                raise SessionNotFound("Session does not exist")

            metadata = self._read_metadata(workspace)
            now = self._now()
            expires_at = int(metadata.get("expires_at") or 0)
            delete_after = metadata.get("delete_after")

            if expires_at <= now:
                self._delete_workspace(workspace)
                raise SessionExpired("Session has expired")
            if delete_after is not None and int(delete_after) <= now:
                self._delete_workspace(workspace)
                raise SessionExpired("Session has ended")

            if touch:
                metadata["last_seen"] = now
                metadata["expires_at"] = now + self.ttl_seconds
                metadata["delete_after"] = None
                self._write_metadata(workspace, metadata)

            return workspace, metadata.copy()

    def touch(self, token: str) -> dict[str, Any]:
        _, metadata = self.resolve(token, touch=True)
        return metadata

    def mark_closing(self, token: str) -> None:
        """Schedule deletion after a grace period.

        Browsers also fire unload/pagehide during refresh. A returning page can
        therefore rescue the session simply by touching it before delete_after.
        """
        workspace = self._workspace_for_token(token)
        with self._lock:
            if not workspace.is_dir():
                return
            try:
                metadata = self._read_metadata(workspace)
            except SessionNotFound:
                return
            now = self._now()
            metadata["last_seen"] = now
            metadata["delete_after"] = now + self.close_grace_seconds
            self._write_metadata(workspace, metadata)

    def delete(self, token: str) -> bool:
        workspace = self._workspace_for_token(token)
        with self._lock:
            if not workspace.exists():
                return False
            self._delete_workspace(workspace)
            return True

    def _delete_workspace(self, workspace: Path) -> None:
        resolved = workspace.resolve()
        if resolved.parent != self.root:
            raise SessionError("Refusing to delete a path outside the session root")
        shutil.rmtree(resolved, ignore_errors=False)

    def safe_path(self, token: str, *parts: str, touch: bool = True) -> Path:
        workspace, _ = self.resolve(token, touch=touch)
        candidate = workspace.joinpath(*parts).resolve()
        if candidate != workspace and workspace not in candidate.parents:
            raise SessionError("Unsafe session artifact path")
        return candidate

    def cleanup_expired(self) -> int:
        """Delete expired, close-marked, or corrupt orphan workspaces."""
        self.ensure_root()
        now = self._now()
        removed = 0

        with self._lock:
            for workspace in list(self.root.iterdir()):
                if not workspace.is_dir():
                    continue
                should_remove = False
                try:
                    metadata = self._read_metadata(workspace)
                    expires_at = int(metadata.get("expires_at") or 0)
                    delete_after = metadata.get("delete_after")
                    should_remove = expires_at <= now or (
                        delete_after is not None and int(delete_after) <= now
                    )
                except (SessionNotFound, TypeError, ValueError):
                    should_remove = True

                if should_remove:
                    self._delete_workspace(workspace)
                    removed += 1

        return removed


session_manager = SessionManager()
