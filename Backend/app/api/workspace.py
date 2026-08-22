"""Guest-first temporary workspace endpoints."""
from __future__ import annotations

from typing import Annotated, Any, Literal

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
from app.services.workspace_training_service import workspace_training_runner


router = APIRouter()


class WorkspaceDatasetUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class WorkspaceTrainingModel(BaseModel):
    model_type: str = Field(min_length=1, max_length=100)
    hyperparameters: dict[str, Any] = Field(default_factory=dict)
    enable_optimization: bool = False


class WorkspaceTrainingRequest(BaseModel):
    dataset_id: str = Field(min_length=1, max_length=100)
    target_column: str = Field(min_length=1, max_length=300)
    task_type: Literal["classification", "regression"]
    selected_features: list[str] | None = None
    models: list[WorkspaceTrainingModel] = Field(min_length=1, max_length=8)
    test_size: float = Field(default=0.2, ge=0.1, le=0.4)
    random_state: int = Field(default=42, ge=0, le=2_147_483_647)
    cv_folds: int = Field(default=3, ge=2, le=5)
    scaling: bool = True


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


@router.post("/training/runs", status_code=status.HTTP_202_ACCEPTED)
def start_training(payload: WorkspaceTrainingRequest, token: SessionToken):
    return workspace_training_runner.submit(token, payload.model_dump())


@router.get("/training/runs")
def list_training_runs(token: SessionToken):
    runs = workspace_training_runner.list(token)
    return {"runs": runs, "total": len(runs), "temporary": True}


@router.get("/training/runs/{run_id}")
def get_training_run(run_id: str, token: SessionToken):
    return workspace_training_runner.get(token, run_id)
