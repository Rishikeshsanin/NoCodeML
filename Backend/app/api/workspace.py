"""Guest-first temporary workspace endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from pydantic import BaseModel, Field

from app.api.session import SessionToken
from app.schemas.eda import EDAResponse, PlotRequest, PlotResponse
from app.services.workspace_dataset_service import (
    create_workspace_dataset,
    delete_workspace_dataset,
    get_workspace_dataset,
    list_workspace_datasets,
    preview_workspace_dataset,
    update_workspace_dataset,
)
from app.services.workspace_eda_service import (
    generate_workspace_plot_data,
    get_workspace_eda_summary,
)


router = APIRouter()


class WorkspaceDatasetUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


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


@router.put("/datasets/{dataset_id}")
def update_dataset(dataset_id: str, payload: WorkspaceDatasetUpdate, token: SessionToken):
    return {
        "dataset": update_workspace_dataset(
            token,
            dataset_id,
            payload.name,
            payload.description,
        )
    }


@router.get("/datasets/{dataset_id}/preview")
def preview_dataset(
    dataset_id: str,
    token: SessionToken,
    rows: Annotated[int, Query(ge=1, le=50)] = 10,
):
    return preview_workspace_dataset(token, dataset_id, rows)


@router.get("/datasets/{dataset_id}/eda", response_model=EDAResponse)
async def dataset_eda(dataset_id: str, token: SessionToken):
    return await get_workspace_eda_summary(token, dataset_id)


@router.post("/datasets/{dataset_id}/plot", response_model=PlotResponse)
async def dataset_plot(dataset_id: str, request: PlotRequest, token: SessionToken):
    return await generate_workspace_plot_data(
        token=token,
        dataset_id=dataset_id,
        plot_type=request.plot_type,
        x_column=request.x_column,
        y_column=request.y_column,
        group_by=request.group_by,
    )


@router.delete("/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: str, token: SessionToken):
    delete_workspace_dataset(token, dataset_id)
    return None
