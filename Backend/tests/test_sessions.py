from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.session_manager import SessionError, SessionManager


SESSION_HEADER = "X-NoCodeML-Session"


def test_guest_session_api_round_trip():
    with TestClient(app) as client:
        created = client.post("/api/v1/session")
        assert created.status_code == 201, created.text
        payload = created.json()
        token = payload["session_token"]
        assert payload["temporary"] is True
        assert len(token) >= 32

        missing = client.get("/api/v1/session")
        assert missing.status_code == 428
        assert missing.json()["detail"]["code"] == "SESSION_REQUIRED"

        active = client.get("/api/v1/session", headers={SESSION_HEADER: token})
        assert active.status_code == 200, active.text
        assert active.json()["status"] == "active"

        cleared = client.delete("/api/v1/session", headers={SESSION_HEADER: token})
        assert cleared.status_code == 204

        expired = client.get("/api/v1/session", headers={SESSION_HEADER: token})
        assert expired.status_code == 410
        assert expired.json()["detail"]["code"] == "SESSION_EXPIRED"


def test_session_workspace_is_hashed_and_isolated(tmp_path: Path):
    manager = SessionManager(root=tmp_path, ttl_seconds=3600, close_grace_seconds=30)
    token_a, _ = manager.create()
    token_b, _ = manager.create()

    workspace_a, _ = manager.resolve(token_a, touch=False)
    workspace_b, _ = manager.resolve(token_b, touch=False)

    assert workspace_a != workspace_b
    assert workspace_a.name == manager.token_digest(token_a)
    assert workspace_b.name == manager.token_digest(token_b)
    assert token_a not in str(workspace_a)
    assert token_b not in str(workspace_b)
    assert set(manager.WORKSPACE_DIRS).issubset({path.name for path in workspace_a.iterdir() if path.is_dir()})

    dataset_a = manager.safe_path(token_a, "datasets", "sample.csv")
    dataset_b = manager.safe_path(token_b, "datasets", "sample.csv")
    assert dataset_a != dataset_b


def test_session_path_traversal_is_rejected(tmp_path: Path):
    manager = SessionManager(root=tmp_path, ttl_seconds=3600, close_grace_seconds=30)
    token, _ = manager.create()

    with pytest.raises(SessionError):
        manager.safe_path(token, "..", "outside.txt")


def test_close_signal_has_grace_and_heartbeat_rescues_session(tmp_path: Path):
    manager = SessionManager(root=tmp_path, ttl_seconds=3600, close_grace_seconds=30)
    token, _ = manager.create()

    manager.mark_closing(token)
    _, closing = manager.resolve(token, touch=False)
    assert closing["delete_after"] is not None

    rescued = manager.touch(token)
    assert rescued["delete_after"] is None
    assert manager.resolve(token, touch=False)[0].exists()


def test_cleanup_removes_expired_workspace(tmp_path: Path):
    manager = SessionManager(root=tmp_path, ttl_seconds=3600, close_grace_seconds=30)
    token, _ = manager.create()
    workspace, metadata = manager.resolve(token, touch=False)
    metadata["expires_at"] = 0
    manager._write_metadata(workspace, metadata)

    assert manager.cleanup_expired() == 1
    assert not workspace.exists()


def test_active_job_lease_blocks_cleanup_until_released(tmp_path: Path):
    manager = SessionManager(root=tmp_path, ttl_seconds=3600, close_grace_seconds=30)
    token, _ = manager.create()
    workspace, metadata = manager.resolve(token, touch=False)

    manager.acquire_job(token)
    metadata = manager._read_metadata(workspace)
    metadata["expires_at"] = 0
    metadata["delete_after"] = 0
    manager._write_metadata(workspace, metadata)

    assert manager.cleanup_expired() == 0
    assert workspace.exists()

    manager.release_job(token)
    assert manager.cleanup_expired() == 1
    assert not workspace.exists()


def test_restart_recovery_clears_stale_job_leases(tmp_path: Path):
    manager = SessionManager(root=tmp_path, ttl_seconds=3600, close_grace_seconds=30)
    token, _ = manager.create()
    workspace, _ = manager.resolve(token, touch=False)
    manager.acquire_job(token)

    assert manager._read_metadata(workspace)["active_jobs"] == 1
    assert manager.reset_stale_job_leases() == 1
    assert manager._read_metadata(workspace)["active_jobs"] == 0
