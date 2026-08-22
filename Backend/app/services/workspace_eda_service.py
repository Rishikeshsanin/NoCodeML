"""EDA and visualization for temporary guest-session datasets."""
from __future__ import annotations

import asyncio
from typing import Any

import pandas as pd
from fastapi import HTTPException, status

from app.services.dataset_service import read_dataframe
from app.services.eda_service import (
    _bar,
    _box,
    _correlation,
    _histogram,
    _require_column,
    _scatter,
    categorize_columns,
    compute_correlations,
    compute_missing_data_summary,
    compute_statistics,
    detect_id_columns,
    get_column_info,
    get_preview_data,
    sample_dataframe,
)
from app.services.session_manager import session_manager
from app.services.workspace_dataset_service import get_workspace_dataset


async def load_workspace_dataset(token: str, dataset_id: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    dataset = get_workspace_dataset(token, dataset_id)
    path = session_manager.safe_path(token, "datasets", dataset["stored_filename"])
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "DATASET_EXPIRED", "message": "The temporary dataset file is no longer available."},
        )

    try:
        df = await asyncio.to_thread(read_dataframe, path)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "DATASET_READ_ERROR", "message": "NoCodeML could not read this temporary dataset."},
        ) from exc
    return df, dataset


async def get_workspace_eda_summary(token: str, dataset_id: str) -> dict[str, Any]:
    df, dataset = await load_workspace_dataset(token, dataset_id)
    id_columns = detect_id_columns(df)
    numeric_columns, categorical_columns = categorize_columns(df)

    return {
        "dataset_info": {
            "id": dataset["id"],
            "name": dataset["name"],
            "row_count": len(df),
            "column_count": len(df.columns),
            "file_size_bytes": dataset["file_size_bytes"],
            "file_name": dataset["original_filename"],
            "memory_usage_bytes": int(df.memory_usage(deep=True).sum()),
            "temporary": True,
        },
        "columns": get_column_info(df, id_columns),
        "numeric_columns": numeric_columns,
        "categorical_columns": categorical_columns,
        "id_columns": id_columns,
        "statistics": compute_statistics(df, numeric_columns),
        "correlations": compute_correlations(df, numeric_columns),
        "missing_data_summary": compute_missing_data_summary(df),
        "preview_data": get_preview_data(df, 100),
    }


async def generate_workspace_plot_data(
    token: str,
    dataset_id: str,
    plot_type: str,
    x_column: str,
    y_column: str | None,
    group_by: str | None,
) -> dict[str, Any]:
    df, _dataset = await load_workspace_dataset(token, dataset_id)
    sampled, is_sampled, total_rows, displayed_rows = sample_dataframe(df)
    kind = plot_type.strip().lower()

    if kind == "histogram":
        x = _require_column(sampled, x_column, numeric=True)
        data, layout = _histogram(sampled, x)
    elif kind == "scatter":
        x = _require_column(sampled, x_column, numeric=True)
        y = _require_column(sampled, y_column, numeric=True)
        group = _require_column(sampled, group_by) if group_by else None
        data, layout = _scatter(sampled, x, y, group)
    elif kind == "box":
        x = _require_column(sampled, x_column, numeric=True)
        group = _require_column(sampled, group_by) if group_by else None
        data, layout = _box(sampled, x, group)
    elif kind == "correlation":
        data, layout = _correlation(sampled)
    elif kind == "bar":
        x = _require_column(sampled, x_column)
        data, layout = _bar(sampled, x)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "PLOT_TYPE_INVALID",
                "message": "Choose histogram, scatter, box, correlation or bar.",
            },
        )

    return {
        "data": data,
        "layout": layout,
        "is_sampled": is_sampled,
        "total_rows": total_rows,
        "displayed_rows": displayed_rows,
        "plot_type": kind,
    }
