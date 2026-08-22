"""Exploratory data analysis for NoCodeML datasets."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.services.artifact_store import artifact_store


SAMPLE_THRESHOLD = 10_000
RANDOM_SEED = 42
MAX_SAMPLE_VALUES = 5
MAX_CATEGORY_TRACES = 20


def _read_dataframe(path: Path) -> pd.DataFrame:
    extension = path.suffix.lower()
    if extension == ".csv":
        return pd.read_csv(path)
    if extension in {".xlsx", ".xls"}:
        return pd.read_excel(path)
    if extension == ".parquet":
        return pd.read_parquet(path)
    raise ValueError(f"Unsupported dataset format: {extension}")


def _read_artifact_dataframe(uri: str) -> pd.DataFrame:
    with artifact_store.materialize(uri) as local_path:
        return _read_dataframe(local_path)


async def load_dataset(
    dataset_id: UUID,
    user_id: int,
    db: AsyncSession,
) -> Tuple[pd.DataFrame, Dataset]:
    """Load a user-owned dataset from local or private object storage."""
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user_id)
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found or access denied")

    try:
        df = await asyncio.to_thread(_read_artifact_dataframe, dataset.storage_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dataset artifact is missing from NoCodeML storage.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dataset could not be read from NoCodeML storage.",
        ) from exc

    return df, dataset


def _is_row_sequence(series: pd.Series) -> bool:
    """Detect a simple 0..N-1 or 1..N row-number column without flagging arbitrary unique numerics."""
    if len(series) < 2 or series.isna().any() or not pd.api.types.is_integer_dtype(series):
        return False
    values = series.to_numpy(dtype=np.int64, copy=True)
    if len(np.unique(values)) != len(values):
        return False
    sorted_values = np.sort(values)
    start = int(sorted_values[0])
    if start not in {0, 1}:
        return False
    expected = np.arange(start, start + len(sorted_values), dtype=np.int64)
    return bool(np.array_equal(sorted_values, expected))


def detect_id_columns(df: pd.DataFrame) -> List[str]:
    """Conservatively identify identifier columns.

    V2 treated every fully-unique numeric/string column as an ID. That can discard
    valid continuous features and targets. V3 only trusts explicit identifier-style
    names or true row-number sequences.
    """
    detected: List[str] = []
    explicit_names = {"id", "index", "key", "uuid", "guid", "rowid", "row_id"}

    for column in df.columns:
        name = str(column)
        lowered = name.strip().lower()
        name_match = (
            lowered in explicit_names
            or lowered.endswith("_id")
            or lowered.startswith("id_")
            or lowered.endswith("_key")
        )
        sequence_match = _is_row_sequence(df[column])
        if name_match or sequence_match:
            detected.append(name)
    return detected


def _native_sample_values(series: pd.Series) -> List[Any]:
    values: List[Any] = []
    for value in series.dropna().head(MAX_SAMPLE_VALUES).tolist():
        if isinstance(value, (np.integer,)):
            values.append(int(value))
        elif isinstance(value, (np.floating,)):
            values.append(float(value))
        elif isinstance(value, (np.bool_,)):
            values.append(bool(value))
        else:
            values.append(str(value))
    return values


def get_column_info(df: pd.DataFrame, id_columns: List[str]) -> List[Dict[str, Any]]:
    row_count = len(df)
    info: List[Dict[str, Any]] = []
    for column in df.columns:
        missing = int(df[column].isna().sum())
        info.append(
            {
                "name": str(column),
                "dtype": str(df[column].dtype),
                "missing_count": missing,
                "missing_percent": round((missing / row_count) * 100, 2) if row_count else 0.0,
                "unique_count": int(df[column].nunique(dropna=True)),
                "is_id_column": str(column) in id_columns,
                "sample_values": _native_sample_values(df[column]),
            }
        )
    return info


def categorize_columns(df: pd.DataFrame) -> Tuple[List[str], List[str]]:
    numeric = [str(column) for column in df.columns if pd.api.types.is_numeric_dtype(df[column])]
    categorical = [str(column) for column in df.columns if str(column) not in numeric]
    return numeric, categorical


def compute_statistics(df: pd.DataFrame, numeric_columns: List[str]) -> Dict[str, Any]:
    if not numeric_columns:
        return {}
    described = df[numeric_columns].describe(percentiles=[0.25, 0.5, 0.75])
    statistics: Dict[str, Any] = {}
    for column in numeric_columns:
        statistics[column] = {
            key: (float(value) if pd.notna(value) else None)
            for key, value in described[column].items()
        }
    return statistics


def compute_correlations(df: pd.DataFrame, numeric_columns: List[str]) -> Optional[Dict[str, Any]]:
    if len(numeric_columns) < 2:
        return None
    matrix = df[numeric_columns].corr()
    matrix_values = [
        [float(value) if pd.notna(value) else None for value in row]
        for row in matrix.to_numpy()
    ]
    pairs: List[Dict[str, Any]] = []
    for index, first in enumerate(numeric_columns):
        for second_index in range(index + 1, len(numeric_columns)):
            value = matrix.iloc[index, second_index]
            if pd.notna(value) and abs(float(value)) >= 0.7:
                pairs.append(
                    {
                        "col1": first,
                        "col2": numeric_columns[second_index],
                        "correlation": round(float(value), 3),
                    }
                )
    return {"columns": numeric_columns, "matrix": matrix_values, "pairs": pairs}


def compute_missing_data_summary(df: pd.DataFrame) -> Dict[str, Any]:
    total_cells = int(df.shape[0] * df.shape[1])
    total_missing = int(df.isna().sum().sum())
    columns = []
    for column in df.columns:
        missing = int(df[column].isna().sum())
        if missing:
            columns.append(
                {
                    "column": str(column),
                    "missing_count": missing,
                    "missing_percent": round((missing / len(df)) * 100, 2) if len(df) else 0.0,
                }
            )
    columns.sort(key=lambda item: item["missing_count"], reverse=True)
    return {
        "total_missing": total_missing,
        "total_cells": total_cells,
        "missing_percent": round((total_missing / total_cells) * 100, 2) if total_cells else 0.0,
        "columns_with_missing": columns,
    }


def get_preview_data(df: pd.DataFrame, max_rows: int = 100) -> Dict[str, Any]:
    preview = df.head(max_rows).astype(object).where(pd.notna(df.head(max_rows)), None)
    rows: List[Dict[str, Any]] = []
    for record in preview.to_dict(orient="records"):
        converted = {}
        for key, value in record.items():
            if isinstance(value, np.integer):
                converted[str(key)] = int(value)
            elif isinstance(value, np.floating):
                converted[str(key)] = float(value)
            elif isinstance(value, np.bool_):
                converted[str(key)] = bool(value)
            else:
                converted[str(key)] = value
        rows.append(converted)
    return {
        "columns": [str(column) for column in df.columns],
        "rows": rows,
        "total_rows": len(df),
        "page_size": len(rows),
    }


async def get_eda_summary(dataset_id: UUID, user_id: int, db: AsyncSession) -> Dict[str, Any]:
    df, dataset = await load_dataset(dataset_id, user_id, db)
    id_columns = detect_id_columns(df)
    numeric_columns, categorical_columns = categorize_columns(df)

    return {
        "dataset_info": {
            "id": str(dataset.id),
            "name": dataset.name,
            "row_count": len(df),
            "column_count": len(df.columns),
            "file_size_bytes": dataset.file_size_bytes,
            "file_name": dataset.file_name,
            "memory_usage_bytes": int(df.memory_usage(deep=True).sum()),
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


def sample_dataframe(df: pd.DataFrame) -> Tuple[pd.DataFrame, bool, int, int]:
    total = len(df)
    if total > SAMPLE_THRESHOLD:
        sampled = df.sample(n=SAMPLE_THRESHOLD, random_state=RANDOM_SEED)
        return sampled, True, total, len(sampled)
    return df, False, total, total


def _require_column(df: pd.DataFrame, column: Optional[str], *, numeric: bool = False) -> str:
    if not column or column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{column}' was not found in the dataset")
    if numeric and not pd.api.types.is_numeric_dtype(df[column]):
        raise HTTPException(status_code=400, detail=f"Column '{column}' must be numeric for this plot")
    return column


def _histogram(df: pd.DataFrame, column: str) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    values = df[column].dropna().astype(float).tolist()
    return (
        [{"x": values, "type": "histogram", "name": column, "opacity": 0.85}],
        {"title": f"Distribution of {column}", "xaxis": {"title": column}, "yaxis": {"title": "Count"}},
    )


def _scatter(df: pd.DataFrame, x_column: str, y_column: str, group_by: Optional[str]) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    columns = [x_column, y_column] + ([group_by] if group_by else [])
    clean = df[columns].dropna()
    traces: List[Dict[str, Any]] = []
    if group_by:
        categories = clean[group_by].astype(str).value_counts().head(MAX_CATEGORY_TRACES).index
        for category in categories:
            mask = clean[group_by].astype(str) == category
            traces.append(
                {
                    "x": clean.loc[mask, x_column].astype(float).tolist(),
                    "y": clean.loc[mask, y_column].astype(float).tolist(),
                    "type": "scatter",
                    "mode": "markers",
                    "name": str(category),
                }
            )
    else:
        traces.append(
            {
                "x": clean[x_column].astype(float).tolist(),
                "y": clean[y_column].astype(float).tolist(),
                "type": "scatter",
                "mode": "markers",
                "name": f"{x_column} vs {y_column}",
            }
        )
    return traces, {"title": f"{x_column} vs {y_column}", "xaxis": {"title": x_column}, "yaxis": {"title": y_column}}


def _box(df: pd.DataFrame, column: str, group_by: Optional[str]) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    traces: List[Dict[str, Any]] = []
    if group_by:
        clean = df[[column, group_by]].dropna()
        categories = clean[group_by].astype(str).value_counts().head(MAX_CATEGORY_TRACES).index
        for category in categories:
            values = clean.loc[clean[group_by].astype(str) == category, column].astype(float).tolist()
            traces.append({"y": values, "type": "box", "name": str(category), "boxpoints": "outliers"})
    else:
        traces.append({"y": df[column].dropna().astype(float).tolist(), "type": "box", "name": column, "boxpoints": "outliers"})
    return traces, {"title": f"Box plot of {column}", "yaxis": {"title": column}}


def _correlation(df: pd.DataFrame) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    numeric = [str(column) for column in df.columns if pd.api.types.is_numeric_dtype(df[column])]
    if len(numeric) < 2:
        raise HTTPException(status_code=400, detail="At least two numeric columns are required for correlation")
    matrix = df[numeric].corr()
    z = [[float(value) if pd.notna(value) else None for value in row] for row in matrix.to_numpy()]
    return (
        [{"z": z, "x": numeric, "y": numeric, "type": "heatmap", "zmin": -1, "zmax": 1}],
        {"title": "Correlation matrix"},
    )


def _bar(df: pd.DataFrame, column: str) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    counts = df[column].fillna("(missing)").astype(str).value_counts().head(50)
    return (
        [{"x": counts.index.tolist(), "y": counts.astype(int).tolist(), "type": "bar", "name": column}],
        {"title": f"Top values in {column}", "xaxis": {"title": column}, "yaxis": {"title": "Count"}},
    )


async def generate_plot_data(
    dataset_id: UUID,
    plot_type: str,
    x_column: str,
    y_column: Optional[str],
    group_by: Optional[str],
    user_id: int,
    db: AsyncSession,
) -> Dict[str, Any]:
    df, _dataset = await load_dataset(dataset_id, user_id, db)
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
        raise HTTPException(status_code=400, detail="Plot type must be histogram, scatter, box, correlation, or bar")

    return {
        "data": data,
        "layout": layout,
        "is_sampled": is_sampled,
        "total_rows": total_rows,
        "displayed_rows": displayed_rows,
        "plot_type": kind,
    }
