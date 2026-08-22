from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint():
    with TestClient(app) as client:
        response = client.get('/health')
        assert response.status_code == 200
        assert response.json()['status'] == 'healthy'


def test_register_login_and_me_round_trip():
    email = f"ci-{uuid4().hex[:10]}@example.com"
    password = 'NoCodeML-Test-123!'

    with TestClient(app) as client:
        register = client.post('/api/v1/auth/register', json={'email': email, 'password': password})
        assert register.status_code == 201, register.text
        assert register.json()['email'] == email

        login = client.post(
            '/api/v1/auth/login',
            data={'username': email, 'password': password},
        )
        assert login.status_code == 200, login.text
        token = login.json()['access_token']

        me = client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {token}'})
        assert me.status_code == 200, me.text
        assert me.json()['email'] == email
