"""Dataset service layer for business logic."""
from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.dataset import Dataset
from app.services.artifact_store import artifact_store


UPLOAD_DIR = Path(settings.DATASETS_DIR).expanduser()
MAX_FILE_SIZE = 100 * 1024 * 1024
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".parquet"}
MAX_PREVIEW_ROWS = 50
UPLOAD_CHUNK_SIZE = 1024 * 1024


async def create_dataset(
    db: AsyncSession,
    file: UploadFile,
    name: str,
    description: Optional[str],
    user_id: int,
) -> Dataset:
    """Create a new dataset from a validated uploaded file."""
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dataset name cannot be empty")

    original_filename = Path(file.filename or "dataset").name
    file_ext = Path(original_filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Allowed types: {allowed}",
        )

    dataset_id = uuid.uuid4()
    user_dir = UPLOAD_DIR / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    if artifact_store.is_remote:
        staging_dir = UPLOAD_DIR / ".staging" / str(user_id)
        staging_dir.mkdir(parents=True, exist_ok=True)
        local_path = staging_dir / f"{dataset_id}{file_ext}"
    else:
        local_path = user_dir / f"{dataset_id}{file_ext}"

    artifact_uri: Optional[str] = None

    try:
        file_size = await save_upload_file(file, local_path, MAX_FILE_SIZE)
        metadata = await asyncio.to_thread(extract_file_metadata, str(local_path))

        if artifact_store.is_remote:
            artifact_uri = await asyncio.to_thread(
                artifact_store.put_file,
                local_path,
                f"datasets/{user_id}/{dataset_id}{file_ext}",
                file.content_type,
            )
            local_path.unlink(missing_ok=True)
        else:
            artifact_uri = str(local_path)
    except HTTPException:
        local_path.unlink(missing_ok=True)
        if artifact_uri:
            await _delete_artifact_quietly(artifact_uri)
        raise
    except (ValueError, pd.errors.ParserError, UnicodeDecodeError) as exc:
        local_path.unlink(missing_ok=True)
        if artifact_uri:
            await _delete_artifact_quietly(artifact_uri)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded dataset could not be parsed. Check that the file is valid and not corrupted.",
        ) from exc
    except Exception as exc:
        local_path.unlink(missing_ok=True)
        if artifact_uri:
            await _delete_artifact_quietly(artifact_uri)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The dataset could not be processed.",
        ) from exc
    finally:
        await file.close()

    dataset = Dataset(
        id=dataset_id,
        user_id=user_id,
        name=clean_name,
        description=description.strip() if description else None,
        storage_path=artifact_uri,
        file_name=original_filename,
        file_size_bytes=file_size,
        row_count=metadata["row_count"],
        column_count=metadata["column_count"],
        column_info=metadata["column_info"],
    )

    db.add(dataset)
    try:
        await db.commit()
        await db.refresh(dataset)
    except Exception:
        await db.rollback()
        if artifact_uri:
            await _delete_artifact_quietly(artifact_uri)
        raise

    return dataset


async def get_user_datasets(
    db: AsyncSession,
    user_id: int,
    skip: int = 0,
    limit: int = 100,
) -> tuple[List[Dataset], int]:
    skip = max(0, skip)
    limit = max(1, min(limit, 100))

    count_query = select(func.count()).select_from(Dataset).where(Dataset.user_id == user_id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(Dataset)
        .where(Dataset.user_id == user_id)
        .order_by(Dataset.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def get_dataset_by_id(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    user_id: int,
) -> Optional[Dataset]:
    query = select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def update_dataset(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    user_id: int,
    name: str,
    description: Optional[str],
) -> Optional[Dataset]:
    dataset = await get_dataset_by_id(db, dataset_id, user_id)
    if not dataset:
        return None

    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dataset name cannot be empty")

    dataset.name = clean_name
    dataset.description = description.strip() if description else None
    await db.commit()
    await db.refresh(dataset)
    return dataset


async def check_dataset_dependencies(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    user_id: int,
) -> None:
    from app.models.experiment import Experiment

    query = select(Experiment).where(
        Experiment.dataset_id == dataset_id,
        Experiment.user_id == user_id,
    )
    result = await db.execute(query)
    experiments = result.scalars().all()

    if experiments:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"Cannot delete dataset while {len(experiments)} experiment(s) still use it.",
                "dependencies": [
                    {"id": str(experiment.id), "name": experiment.name}
                    for experiment in experiments
                ],
            },
        )


async def delete_dataset(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    user_id: int,
) -> bool:
    dataset = await get_dataset_by_id(db, dataset_id, user_id)
    if not dataset:
        return False

    await check_dataset_dependencies(db, dataset_id, user_id)

    artifact_uri = dataset.storage_path
    await db.delete(dataset)
    await db.commit()
    await _delete_artifact_quietly(artifact_uri)
    return True


async def get_dataset_preview(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    user_id: int,
    rows: int = 10,
) -> Optional[Dict[str, Any]]:
    dataset = await get_dataset_by_id(db, dataset_id, user_id)
    if not dataset:
        return None

    rows = max(1, min(rows, MAX_PREVIEW_ROWS))

    try:
        return await asyncio.to_thread(read_dataset_preview, dataset.storage_path, dataset.row_count, rows)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The dataset preview could not be generated.",
        ) from exc


async def save_upload_file(file: UploadFile, destination: Path, max_size: int) -> int:
    """Stream an upload to disk and stop as soon as it exceeds the allowed size."""
    file_size = 0
    with destination.open("wb") as buffer:
        while True:
            chunk = await file.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            file_size += len(chunk)
            if file_size > max_size:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File too large. Maximum size is {max_size // (1024 * 1024)} MB.",
                )
            buffer.write(chunk)
    return file_size


def read_dataframe(path: str | Path, *, nrows: Optional[int] = None) -> pd.DataFrame:
    file_path = Path(path)
    file_ext = file_path.suffix.lower()
    if file_ext == ".csv":
        return pd.read_csv(file_path, nrows=nrows)
    if file_ext in {".xlsx", ".xls"}:
        return pd.read_excel(file_path, nrows=nrows)
    if file_ext == ".parquet":
        df = pd.read_parquet(file_path)
        return df.head(nrows) if nrows is not None else df
    raise ValueError("Unsupported file type")


def extract_file_metadata(file_path: str) -> Dict[str, Any]:
    df = read_dataframe(file_path)
    row_count, column_count = df.shape
    if column_count == 0:
        raise ValueError("Dataset has no columns")

    columns_info = []
    for column in df.columns:
        series = df[column]
        columns_info.append(
            {
                "name": str(column),
                "dtype": str(series.dtype),
                "non_null_count": int(series.count()),
                "null_count": int(series.isna().sum()),
            }
        )

    return {
        "row_count": int(row_count),
        "column_count": int(column_count),
        "column_info": {"columns": columns_info},
    }


def read_dataset_preview(uri: str, total_rows: int, rows: int) -> Dict[str, Any]:
    with artifact_store.materialize(uri) as local_path:
        df = read_dataframe(local_path, nrows=rows)
    df_filled = df.astype(object).where(pd.notna(df), None)
    return {
        "columns": [str(column) for column in df.columns],
        "data": df_filled.values.tolist(),
        "row_count": total_rows,
        "preview_rows": len(df),
    }


async def _delete_artifact_quietly(uri: str) -> None:
    try:
        await asyncio.to_thread(artifact_store.delete, uri)
    except Exception as exc:
        # An orphaned private artifact is preferable to rolling back an already
        # committed database delete. Operators can clean these from provider logs.
        print(f"[NoCodeML] Artifact cleanup warning: {type(exc).__name__}")
