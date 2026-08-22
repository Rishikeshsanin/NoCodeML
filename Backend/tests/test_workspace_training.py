import time
from io import BytesIO

from fastapi.testclient import TestClient

from app.main import app


SESSION_HEADER = "X-NoCodeML-Session"


def create_session(client: TestClient) -> str:
    response = client.post("/api/v1/session")
    assert response.status_code == 201, response.text
    return response.json()["session_token"]


def upload(client: TestClient, token: str, filename: str, content: bytes) -> str:
    response = client.post(
        "/api/v1/workspace/datasets",
        headers={SESSION_HEADER: token},
        files={"file": (filename, BytesIO(content), "text/csv")},
    )
    assert response.status_code == 201, response.text
    return response.json()["dataset"]["id"]


def wait_for_run(client: TestClient, token: str, run_id: str, timeout: float = 20.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        response = client.get(
            f"/api/v1/workspace/training/runs/{run_id}",
            headers={SESSION_HEADER: token},
        )
        assert response.status_code == 200, response.text
        run = response.json()
        if run["status"] in {"completed", "failed"}:
            return run
        time.sleep(0.1)
    raise AssertionError("Temporary training run did not finish before timeout")


def test_guest_classification_training_flow():
    rows = ["age,income,city,churn"]
    cities = ["Bengaluru", "Hyderabad", "Chennai"]
    for index in range(30):
        rows.append(f"{20 + index},{35000 + index * 2500},{cities[index % 3]},{index % 2}")
    csv_data = ("\n".join(rows) + "\n").encode()

    with TestClient(app) as client:
        token = create_session(client)
        dataset_id = upload(client, token, "classification.csv", csv_data)
        started = client.post(
            "/api/v1/workspace/training/runs",
            headers={SESSION_HEADER: token},
            json={
                "dataset_id": dataset_id,
                "target_column": "churn",
                "task_type": "classification",
                "selected_features": ["age", "income", "city"],
                "models": [{"model_type": "LogisticRegression"}],
                "test_size": 0.2,
                "random_state": 42,
                "cv_folds": 3,
            },
        )
        assert started.status_code == 202, started.text
        run = wait_for_run(client, token, started.json()["id"])
        assert run["status"] == "completed", run
        assert run["best_model"]["model_type"] == "LogisticRegression"
        assert run["best_model"]["model_file"].endswith(".joblib")
        assert run["progress"]["percent"] == 100
        assert run["results"][0]["metrics"]["test"]["accuracy"] >= 0


def test_guest_regression_training_flow():
    rows = ["area,bedrooms,city,price"]
    cities = ["Bengaluru", "Mysuru"]
    for index in range(30):
        area = 500 + index * 35
        bedrooms = 1 + (index % 4)
        price = 1500000 + area * 4000 + bedrooms * 200000
        rows.append(f"{area},{bedrooms},{cities[index % 2]},{price}")
    csv_data = ("\n".join(rows) + "\n").encode()

    with TestClient(app) as client:
        token = create_session(client)
        dataset_id = upload(client, token, "regression.csv", csv_data)
        started = client.post(
            "/api/v1/workspace/training/runs",
            headers={SESSION_HEADER: token},
            json={
                "dataset_id": dataset_id,
                "target_column": "price",
                "task_type": "regression",
                "selected_features": ["area", "bedrooms", "city"],
                "models": [{"model_type": "LinearRegression"}],
                "test_size": 0.2,
                "random_state": 42,
                "cv_folds": 3,
            },
        )
        assert started.status_code == 202, started.text
        run = wait_for_run(client, token, started.json()["id"])
        assert run["status"] == "completed", run
        assert run["best_model"]["model_type"] == "LinearRegression"
        assert run["best_model"]["metric"] == "r2_score"
        assert run["results"][0]["metrics"]["test"]["r2_score"] > 0.5
