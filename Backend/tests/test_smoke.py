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


def test_health_endpoint_reports_v3_version():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "healthy"
        assert payload["version"].startswith("3.")


def test_readiness_endpoint_checks_dependencies_without_secrets():
    with TestClient(app) as client:
        response = client.get("/ready")
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["status"] == "ready"
        assert payload["checks"]["database"]["status"] == "ready"
        assert payload["checks"]["database"]["schema"] == "nocodeml"
        assert payload["checks"]["queue"]["status"] == "ready"
        assert "DATABASE_URL" not in response.text
        assert "SECRET_KEY" not in response.text


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


def test_email_identity_is_case_insensitive_and_duplicate_safe():
    with TestClient(app) as client:
        local = f"case-{uuid4().hex[:10]}"
        mixed_case = f"{local}@Example.COM"
        normalized = mixed_case.lower()

        register = client.post(
            "/api/v1/auth/register",
            json={"email": mixed_case, "password": PASSWORD},
        )
        assert register.status_code == 201, register.text
        assert register.json()["email"] == normalized

        login = client.post(
            "/api/v1/auth/login",
            data={"username": mixed_case.upper(), "password": PASSWORD},
        )
        assert login.status_code == 200, login.text

        duplicate = client.post(
            "/api/v1/auth/register",
            json={"email": normalized, "password": PASSWORD},
        )
        assert duplicate.status_code == 409, duplicate.text


def test_rejects_passwords_beyond_bcrypt_limit():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={"email": f"long-{uuid4().hex[:8]}@example.com", "password": "x" * 73},
        )
        assert response.status_code == 422


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
