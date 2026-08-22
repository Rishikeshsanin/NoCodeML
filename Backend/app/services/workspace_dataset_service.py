"""Database-free dataset operations scoped to a temporary guest session."""
from __future__ import annotations

import asyncio
import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException, UploadFile, status

from app.services.dataset_service import (
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE,
    MAX_PREVIEW_ROWS,
    extract_file_metadata,
    read_dataframe,
    save_upload_file,
)
from app.services.session_manager import SessionExpired, SessionNotFound, session_manager


MANIFEST_FILE = "workspace.json"
_MANIFEST_LOCK = threading.RLock()


def _manifest_path(token: str) -> Path:
    return session_manager.safe_path(token, MANIFEST_FILE)


def _empty_manifest() -> dict[str, Any]:
    return {
        "version": 1,
        "updated_at": int(time.time()),
        "datasets": {},
        "active_dataset_id": None,
    }


def _load_manifest(token: str) -> dict[str, Any]:
    path = _manifest_path(token)
    if not path.exists():
        return _empty_manifest()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "WORKSPACE_MANIFEST_ERROR",
                "message": "The temporary workspace metadata could not be read.",
            },
        ) from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("datasets"), dict):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "WORKSPACE_MANIFEST_ERROR",
                "message": "The temporary workspace metadata is invalid.",
            },
        )
    return payload


def _save_manifest(token: str, manifest: dict[str, Any]) -> None:
    path = _manifest_path(token)
    manifest["updated_at"] = int(time.time())
    temp_path = path.with_suffix(".tmp")
    temp_path.write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    temp_path.replace(path)


def _dataset_from_manifest(token: str, dataset_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest = _load_manifest(token)
    dataset = manifest["datasets"].get(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DATASET_NOT_FOUND", "message": "This dataset is not part of the current session."},
        )
    return manifest, dataset


def _dataset_path(token: str, dataset: dict[str, Any]) -> Path:
    return session_manager.safe_path(token, "datasets", dataset["stored_filename"])


async def create_workspace_dataset(
    token: str,
    file: UploadFile,
    name: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    original_filename = Path(file.filename or "dataset").name
    file_ext = Path(original_filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "UNSUPPORTED_FILE_TYPE",
                "message": f"Unsupported file type. Use one of: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
            },
        )

    clean_name = (name or Path(original_filename).stem or "Dataset").strip()
    if not clean_name:
        clean_name = "Dataset"

    dataset_id = str(uuid.uuid4())
    stored_filename = f"{dataset_id}{file_ext}"

    try:
        destination = session_manager.safe_path(token, "datasets", stored_filename)
    except (SessionExpired, SessionNotFound) as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "SESSION_EXPIRED", "message": "This temporary session has ended."},
        ) from exc

    try:
        file_size = await save_upload_file(file, destination, MAX_FILE_SIZE)
        metadata = await asyncio.to_thread(extract_file_metadata, str(destination))
        if metadata["row_count"] <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "EMPTY_DATASET", "message": "The uploaded dataset contains no data rows."},
            )
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    except (ValueError, pd.errors.ParserError, UnicodeDecodeError) as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "DATASET_PARSE_ERROR",
                "message": "The dataset could not be parsed. Check that the file is valid and not corrupted.",
            },
        ) from exc
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "DATASET_PROCESSING_ERROR", "message": "The dataset could not be processed."},
        ) from exc
    finally:
        await file.close()

    dataset = {
        "id": dataset_id,
        "name": clean_name,
        "description": description.strip() if description else None,
        "original_filename": original_filename,
        "stored_filename": stored_filename,
        "file_size_bytes": file_size,
        "row_count": metadata["row_count"],
        "column_count": metadata["column_count"],
        "column_info": metadata["column_info"],
        "created_at": int(time.time()),
        "temporary": True,
    }

    try:
        with _MANIFEST_LOCK:
            manifest = _load_manifest(token)
            manifest["datasets"][dataset_id] = dataset
            manifest["active_dataset_id"] = dataset_id
            _save_manifest(token, manifest)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    return dataset.copy()


def list_workspace_datasets(token: str) -> list[dict[str, Any]]:
    with _MANIFEST_LOCK:
        manifest = _load_manifest(token)
        datasets = list(manifest["datasets"].values())
    return sorted(datasets, key=lambda item: item.get("created_at", 0), reverse=True)


def get_workspace_dataset(token: str, dataset_id: str) -> dict[str, Any]:
    with _MANIFEST_LOCK:
        _, dataset = _dataset_from_manifest(token, dataset_id)
        return dataset.copy()


def update_workspace_dataset(
    token: str,
    dataset_id: str,
    name: str,
    description: str | None = None,
) -> dict[str, Any]:
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "DATASET_NAME_REQUIRED", "message": "Dataset name cannot be empty."},
        )

    with _MANIFEST_LOCK:
        manifest, dataset = _dataset_from_manifest(token, dataset_id)
        dataset["name"] = clean_name
        if description is not None:
            dataset["description"] = description.strip() or None
        manifest["datasets"][dataset_id] = dataset
        _save_manifest(token, manifest)
        return dataset.copy()


def preview_workspace_dataset(token: str, dataset_id: str, rows: int = 10) -> dict[str, Any]:
    with _MANIFEST_LOCK:
        _, dataset = _dataset_from_manifest(token, dataset_id)
        dataset = dataset.copy()
    rows = max(1, min(rows, MAX_PREVIEW_ROWS))
    path = _dataset_path(token, dataset)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "DATASET_EXPIRED", "message": "The temporary dataset file is no longer available."},
        )

    try:
        df = read_dataframe(path, nrows=rows)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "DATASET_PREVIEW_ERROR", "message": "The dataset preview could not be generated."},
        ) from exc

    safe_df = df.astype(object).where(pd.notna(df), None)
    return {
        "columns": [str(column) for column in df.columns],
        "data": safe_df.values.tolist(),
        "row_count": dataset["row_count"],
        "preview_rows": len(df),
    }


def delete_workspace_dataset(token: str, dataset_id: str) -> bool:
    with _MANIFEST_LOCK:
        manifest, dataset = _dataset_from_manifest(token, dataset_id)
        path = _dataset_path(token, dataset)
        path.unlink(missing_ok=True)
        del manifest["datasets"][dataset_id]
        if manifest.get("active_dataset_id") == dataset_id:
            manifest["active_dataset_id"] = next(iter(manifest["datasets"]), None)
        _save_manifest(token, manifest)
    return True
