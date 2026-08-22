from io import BytesIO

from fastapi.testclient import TestClient

from app.main import app


SESSION_HEADER = "X-NoCodeML-Session"


def new_session(client: TestClient) -> str:
    response = client.post("/api/v1/session")
    assert response.status_code == 201, response.text
    return response.json()["session_token"]


def upload_csv(client: TestClient, token: str, filename: str = "sample.csv"):
    csv_bytes = b"age,city,target\n21,Bengaluru,1\n25,Hyderabad,0\n29,Chennai,1\n"
    return client.post(
        "/api/v1/workspace/datasets",
        headers={SESSION_HEADER: token},
        files={"file": (filename, BytesIO(csv_bytes), "text/csv")},
        data={"name": "Sample Dataset"},
    )


def test_temporary_dataset_upload_list_preview_delete():
    with TestClient(app) as client:
        token = new_session(client)

        uploaded = upload_csv(client, token)
        assert uploaded.status_code == 201, uploaded.text
        dataset = uploaded.json()["dataset"]
        assert dataset["temporary"] is True
        assert dataset["row_count"] == 3
        assert dataset["column_count"] == 3
        dataset_id = dataset["id"]

        listed = client.get("/api/v1/workspace/datasets", headers={SESSION_HEADER: token})
        assert listed.status_code == 200, listed.text
        assert listed.json()["total"] == 1
        assert listed.json()["datasets"][0]["id"] == dataset_id

        preview = client.get(
            f"/api/v1/workspace/datasets/{dataset_id}/preview?rows=2",
            headers={SESSION_HEADER: token},
        )
        assert preview.status_code == 200, preview.text
        assert preview.json()["columns"] == ["age", "city", "target"]
        assert preview.json()["preview_rows"] == 2

        deleted = client.delete(
            f"/api/v1/workspace/datasets/{dataset_id}",
            headers={SESSION_HEADER: token},
        )
        assert deleted.status_code == 204

        listed_after = client.get("/api/v1/workspace/datasets", headers={SESSION_HEADER: token})
        assert listed_after.status_code == 200
        assert listed_after.json()["total"] == 0


def test_temporary_dataset_isolation_between_sessions():
    with TestClient(app) as client:
        token_a = new_session(client)
        token_b = new_session(client)

        uploaded = upload_csv(client, token_a, "private.csv")
        assert uploaded.status_code == 201, uploaded.text
        dataset_id = uploaded.json()["dataset"]["id"]

        own = client.get(f"/api/v1/workspace/datasets/{dataset_id}", headers={SESSION_HEADER: token_a})
        assert own.status_code == 200

        other = client.get(f"/api/v1/workspace/datasets/{dataset_id}", headers={SESSION_HEADER: token_b})
        assert other.status_code == 404
        assert other.json()["detail"]["code"] == "DATASET_NOT_FOUND"

        other_list = client.get("/api/v1/workspace/datasets", headers={SESSION_HEADER: token_b})
        assert other_list.status_code == 200
        assert other_list.json()["total"] == 0


def test_workspace_rejects_unsupported_and_empty_files():
    with TestClient(app) as client:
        token = new_session(client)

        unsupported = client.post(
            "/api/v1/workspace/datasets",
            headers={SESSION_HEADER: token},
            files={"file": ("notes.txt", BytesIO(b"hello"), "text/plain")},
        )
        assert unsupported.status_code == 400
        assert unsupported.json()["detail"]["code"] == "UNSUPPORTED_FILE_TYPE"

        empty = client.post(
            "/api/v1/workspace/datasets",
            headers={SESSION_HEADER: token},
            files={"file": ("empty.csv", BytesIO(b"a,b\n"), "text/csv")},
        )
        assert empty.status_code == 400
        assert empty.json()["detail"]["code"] == "EMPTY_DATASET"
