"""Guest-first temporary workspace endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, Query, UploadFile, status

from app.api.session import SessionToken
from app.services.workspace_dataset_service import (
    create_workspace_dataset,
    delete_workspace_dataset,
    get_workspace_dataset,
    list_workspace_datasets,
    preview_workspace_dataset,
)


router = APIRouter()


@router.post("/datasets", status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    token: SessionToken,
    file: Annotated[UploadFile, File(...)],
    name: Annotated[str | None, Form()] = None,
    description: Annotated[str | None, Form()] = None,
):
    dataset = await create_workspace_dataset(token, file, name, description)
    return {"dataset": dataset}


@router.get("/datasets")
def list_datasets(token: SessionToken):
    datasets = list_workspace_datasets(token)
    return {"datasets": datasets, "total": len(datasets), "temporary": True}


@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str, token: SessionToken):
    return {"dataset": get_workspace_dataset(token, dataset_id)}


@router.get("/datasets/{dataset_id}/preview")
def preview_dataset(
    dataset_id: str,
    token: SessionToken,
    rows: Annotated[int, Query(ge=1, le=50)] = 10,
):
    return preview_workspace_dataset(token, dataset_id, rows)


@router.delete("/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: str, token: SessionToken):
    delete_workspace_dataset(token, dataset_id)
    return None
