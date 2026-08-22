from fastapi.testclient import TestClient

from app.main import app


SESSION_HEADER = "X-NoCodeML-Session"


def create_session(client: TestClient) -> str:
    response = client.post("/api/v1/session")
    assert response.status_code == 201, response.text
    return response.json()["session_token"]


def test_health_endpoint_reports_guest_v3_mode():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "healthy"
        assert payload["version"].startswith("3.")
        assert payload["mode"] == "temporary-guest"


def test_readiness_is_database_free_and_checks_workspace_and_training():
    with TestClient(app) as client:
        response = client.get("/ready")
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["status"] == "ready"
        assert payload["mode"] == "temporary-guest"
        assert payload["checks"]["temporary_workspace"]["status"] == "ready"
        assert payload["checks"]["training"]["status"] == "ready"
        assert payload["checks"]["training"]["backend"] == "bounded-in-process"
        assert "database" not in payload["checks"]
        assert "queue" not in payload["checks"]
        assert "DATABASE_URL" not in response.text
        assert "SECRET_KEY" not in response.text


def test_model_catalog_is_available():
    with TestClient(app) as client:
        response = client.get("/api/v1/models")
        assert response.status_code == 200, response.text
        payload = response.json()
        assert len(payload["classification"]) == 4
        assert len(payload["regression"]) == 4


def test_persistent_account_and_project_routes_are_not_public():
    with TestClient(app) as client:
        assert client.post("/api/v1/auth/register", json={"email": "nobody@example.com", "password": "irrelevant"}).status_code == 404
        assert client.get("/api/v1/datasets").status_code == 404
        assert client.get("/api/v1/experiments").status_code == 404
        assert client.get("/api/v1/training/runs").status_code == 404
        assert client.get("/api/v1/predictions").status_code == 404


def test_ai_assistant_requires_temporary_session_and_fails_safely_without_key():
    payload = {
        "system_prompt": "Help interpret derived ML metrics. Never request raw dataset rows.",
        "messages": [{"role": "user", "content": "What should I do next?"}],
    }
    with TestClient(app) as client:
        anonymous = client.post("/api/v1/assistant/chat", json=payload)
        assert anonymous.status_code == 428

        token = create_session(client)
        configured_guest = client.post(
            "/api/v1/assistant/chat",
            headers={SESSION_HEADER: token},
            json=payload,
        )
        assert configured_guest.status_code == 503
        assert "not configured" in configured_guest.json()["detail"].lower()
