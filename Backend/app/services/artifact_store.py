"""Artifact storage abstraction for NoCodeML-owned files.

Development uses the local filesystem. Production may use a private S3-compatible
bucket so the FastAPI and Celery services can share datasets, trained models and
prediction exports without sharing a filesystem or another application's storage.
"""
from __future__ import annotations

import shutil
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional
from urllib.parse import urlparse

from app.core.config import settings


class ArtifactStore:
    def __init__(self) -> None:
        self.backend = settings.ARTIFACT_STORAGE_BACKEND
        self.bucket = settings.S3_BUCKET_NAME
        self.cache_dir = Path(settings.ARTIFACT_CACHE_DIR).expanduser()
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._client = None

    @property
    def is_remote(self) -> bool:
        return self.backend == "s3"

    def _s3_client(self):
        if not self.is_remote:
            raise RuntimeError("S3 client requested while local artifact storage is active")
        if self._client is None:
            import boto3
            from botocore.config import Config

            region = settings.S3_REGION.strip()
            self._client = boto3.client(
                "s3",
                endpoint_url=settings.S3_ENDPOINT_URL.rstrip("/"),
                aws_access_key_id=settings.S3_ACCESS_KEY_ID,
                aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
                region_name=None if region in {"", "auto"} else region,
                config=Config(
                    signature_version="s3v4",
                    s3={"addressing_style": settings.S3_ADDRESSING_STYLE},
                    retries={"max_attempts": 3, "mode": "standard"},
                ),
            )
        return self._client

    @staticmethod
    def _clean_key(key: str) -> str:
        normalized = key.replace("\\", "/").lstrip("/")
        parts = [part for part in normalized.split("/") if part not in {"", "."}]
        if not parts or any(part == ".." for part in parts):
            raise ValueError("Invalid artifact key")
        return "/".join(parts)

    def _parse_s3_uri(self, uri: str) -> tuple[str, str]:
        parsed = urlparse(uri)
        if parsed.scheme != "s3" or not parsed.netloc or not parsed.path:
            raise ValueError("Invalid S3 artifact URI")
        return parsed.netloc, self._clean_key(parsed.path)

    def put_file(self, local_path: str | Path, key: str, content_type: Optional[str] = None) -> str:
        """Persist a local file and return the canonical artifact URI/path."""
        source = Path(local_path)
        if not source.is_file():
            raise FileNotFoundError(f"Artifact source not found: {source}")

        if not self.is_remote:
            return str(source)

        object_key = self._clean_key(key)
        extra_args = {"ContentType": content_type} if content_type else None
        kwargs = {"ExtraArgs": extra_args} if extra_args else {}
        self._s3_client().upload_file(str(source), self.bucket, object_key, **kwargs)
        return f"s3://{self.bucket}/{object_key}"

    def delete(self, uri: str) -> bool:
        """Delete a NoCodeML artifact. Missing artifacts are treated idempotently."""
        if uri.startswith("s3://"):
            bucket, key = self._parse_s3_uri(uri)
            if bucket != self.bucket:
                raise ValueError("Refusing to delete an artifact outside the configured NoCodeML bucket")
            self._s3_client().delete_object(Bucket=bucket, Key=key)
            return True

        path = Path(uri)
        if path.exists() and path.is_file():
            path.unlink()
            return True
        return False

    def exists(self, uri: str) -> bool:
        if uri.startswith("s3://"):
            bucket, key = self._parse_s3_uri(uri)
            if bucket != self.bucket:
                return False
            try:
                self._s3_client().head_object(Bucket=bucket, Key=key)
                return True
            except Exception:
                return False
        return Path(uri).is_file()

    @contextmanager
    def materialize(self, uri: str) -> Iterator[Path]:
        """Yield a readable local path for a local or remote artifact."""
        if not uri.startswith("s3://"):
            path = Path(uri)
            if not path.is_file():
                raise FileNotFoundError(f"Artifact not found: {path}")
            yield path
            return

        bucket, key = self._parse_s3_uri(uri)
        if bucket != self.bucket:
            raise ValueError("Refusing to read an artifact outside the configured NoCodeML bucket")

        suffix = Path(key).suffix
        with tempfile.NamedTemporaryFile(
            dir=self.cache_dir,
            suffix=suffix,
            prefix="artifact-",
            delete=False,
        ) as handle:
            temp_path = Path(handle.name)

        try:
            self._s3_client().download_file(bucket, key, str(temp_path))
            yield temp_path
        finally:
            temp_path.unlink(missing_ok=True)

    def presign_get(self, uri: str, expires_seconds: int = 300) -> str:
        if not uri.startswith("s3://"):
            raise ValueError("Presigned URLs are only available for S3 artifacts")
        bucket, key = self._parse_s3_uri(uri)
        if bucket != self.bucket:
            raise ValueError("Refusing to sign an artifact outside the configured NoCodeML bucket")
        return self._s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=max(60, min(expires_seconds, 900)),
        )

    def copy_local(self, source: str | Path, destination: str | Path) -> str:
        """Copy a local artifact when callers need an explicit local destination."""
        src = Path(source)
        dst = Path(destination)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return str(dst)


artifact_store = ArtifactStore()
