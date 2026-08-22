"""Safe, descriptive filenames for downloadable NoCodeML session artifacts."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path


def slugify(value: str, *, fallback: str = "dataset", max_length: int = 64) -> str:
    text = Path(value or "").stem.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return (text[:max_length].rstrip("-") or fallback)


def artifact_filename(
    dataset_name: str,
    artifact: str,
    extension: str,
    *,
    timestamp: datetime | None = None,
) -> str:
    moment = timestamp or datetime.now(timezone.utc)
    stamp = moment.strftime("%Y%m%d-%H%M%S")
    dataset_slug = slugify(dataset_name)
    artifact_slug = slugify(artifact, fallback="export")
    clean_extension = extension.lower().lstrip(".")
    if not re.fullmatch(r"[a-z0-9]{1,12}", clean_extension):
        raise ValueError("Invalid export file extension")
    return f"nocodeml_{dataset_slug}_{artifact_slug}_{stamp}.{clean_extension}"
