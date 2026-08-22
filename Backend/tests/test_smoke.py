from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


PASSWORD = "NoCodeML-Test-123!"


def create_authenticated_client(client: TestClient) -> tuple[str, str]:
    email = f"ci-{uuid4().hex[:10]}@example.com"

    register = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD},
    )
    assert register.status_code == 201, register.text

    login = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": PASSWORD},
    )
    assert login.status_code == 200, login.text
    return email, login.json()["access_token"]


def test_health_endpoint():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


def test_model_catalog_is_available():
    with TestClient(app) as client:
        response = client.get("/api/v1/models")
        assert response.status_code == 200, response.text
        payload = response.json()
        assert len(payload["classification"]) == 4
        assert len(payload["regression"]) == 4


def test_register_login_and_me_round_trip():
    with TestClient(app) as client:
        email, token = create_authenticated_client(client)

        me = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me.status_code == 200, me.text
        assert me.json()["email"] == email


def test_ai_assistant_is_protected_and_fails_safely_without_provider_key():
    with TestClient(app) as client:
        anonymous = client.post(
            "/api/v1/assistant/chat",
            json={
                "system_prompt": "Help with this experiment.",
                "messages": [{"role": "user", "content": "What should I do next?"}],
            },
        )
        assert anonymous.status_code == 401

        _, token = create_authenticated_client(client)
        configured_user = client.post(
            "/api/v1/assistant/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "system_prompt": "Help with this experiment.",
                "messages": [{"role": "user", "content": "What should I do next?"}],
            },
        )
        assert configured_user.status_code == 503
        assert "not configured" in configured_user.json()["detail"].lower()
