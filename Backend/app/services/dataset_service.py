"""Dataset service layer for business logic."""
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.dataset import Dataset


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

    # Path.name removes any client-supplied directory components. The storage file
    # itself uses only our UUID + validated extension, so user input never controls
    # a server filesystem path.
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

    storage_path = user_dir / f"{dataset_id}{file_ext}"

    try:
        file_size = await save_upload_file(file, storage_path, MAX_FILE_SIZE)
        metadata = await extract_file_metadata(str(storage_path))
    except HTTPException:
        storage_path.unlink(missing_ok=True)
        raise
    except (ValueError, pd.errors.ParserError, UnicodeDecodeError) as exc:
        storage_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded dataset could not be parsed. Check that the file is valid and not corrupted.",
        ) from exc
    except Exception as exc:
        storage_path.unlink(missing_ok=True)
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
        storage_path=str(storage_path),
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
        storage_path.unlink(missing_ok=True)
        raise

    return dataset


async def get_user_datasets(
    db: AsyncSession,
    user_id: int,
    skip: int = 0,
    limit: int = 100,
) -> tuple[List[Dataset], int]:
    """Fetch all datasets for a user with bounded pagination."""
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
    """Fetch a single dataset and verify ownership."""
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
    """Update dataset name and description."""
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
    """Reject deletion while user-owned experiments still reference the dataset."""
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
            detail=f"Cannot delete dataset while {len(experiments)} experiment(s) still use it.",
        )


async def delete_dataset(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    user_id: int,
) -> bool:
    """Delete a user's dataset record and its NoCodeML-owned artifact."""
    dataset = await get_dataset_by_id(db, dataset_id, user_id)
    if not dataset:
        return False

    await check_dataset_dependencies(db, dataset_id, user_id)

    # Commit database deletion first; the file is removed only after the record can
    # no longer be referenced. A missing artifact is harmless and treated idempotently.
    storage_path = dataset.storage_path
    await db.delete(dataset)
    await db.commit()
    delete_file(storage_path)
    return True


async def get_dataset_preview(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    user_id: int,
    rows: int = 10,
) -> Optional[Dict[str, Any]]:
    """Get a bounded preview of dataset contents."""
    dataset = await get_dataset_by_id(db, dataset_id, user_id)
    if not dataset:
        return None

    rows = max(1, min(rows, MAX_PREVIEW_ROWS))

    try:
        file_ext = Path(dataset.storage_path).suffix.lower()
        if file_ext == ".csv":
            df = pd.read_csv(dataset.storage_path, nrows=rows)
        elif file_ext in {".xlsx", ".xls"}:
            df = pd.read_excel(dataset.storage_path, nrows=rows)
        elif file_ext == ".parquet":
            df = pd.read_parquet(dataset.storage_path).head(rows)
        else:
            raise ValueError("Unsupported stored file type")

        df_filled = df.astype(object).where(pd.notna(df), None)
        return {
            "columns": [str(column) for column in df.columns],
            "data": df_filled.values.tolist(),
            "row_count": dataset.row_count,
            "preview_rows": len(df),
        }
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


async def extract_file_metadata(file_path: str) -> Dict[str, Any]:
    """Extract basic metadata from a validated dataset file."""
    file_ext = Path(file_path).suffix.lower()

    if file_ext == ".csv":
        df = pd.read_csv(file_path)
    elif file_ext in {".xlsx", ".xls"}:
        df = pd.read_excel(file_path)
    elif file_ext == ".parquet":
        df = pd.read_parquet(file_path)
    else:
        raise ValueError("Unsupported file type")

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


def delete_file(storage_path: str) -> bool:
    """Delete a file artifact if it exists."""
    path = Path(storage_path)
    if path.exists() and path.is_file():
        path.unlink()
        return True
    return False
