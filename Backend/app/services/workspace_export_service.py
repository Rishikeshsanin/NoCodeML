"""Downloadable exports for a temporary NoCodeML guest workspace."""
from __future__ import annotations

import json
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException, status

from app.services.download_naming import artifact_filename, slugify
from app.services.session_manager import session_manager
from app.services.workspace_dataset_service import get_workspace_dataset, list_workspace_datasets
from app.services.workspace_eda_service import get_workspace_eda_summary
from app.services.workspace_prediction_service import list_predictions, prediction_download
from app.services.workspace_training_service import workspace_training_runner


JSON_MEDIA = "application/json"
CSV_MEDIA = "text/csv"
ZIP_MEDIA = "application/zip"
MODEL_MEDIA = "application/octet-stream"


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str), encoding="utf-8")


def _export_path(token: str, filename: str) -> Path:
    return session_manager.safe_path(token, "exports", filename)


async def export_eda(token: str, dataset_id: str, kind: str) -> tuple[Path, str, str]:
    dataset = get_workspace_dataset(token, dataset_id)
    summary = await get_workspace_eda_summary(token, dataset_id)
    kind = kind.strip().lower()

    if kind == "summary":
        filename = artifact_filename(dataset["name"], "eda-summary", "json")
        path = _export_path(token, filename)
        _write_json(path, summary)
        return path, filename, JSON_MEDIA

    if kind == "statistics":
        filename = artifact_filename(dataset["name"], "statistics", "csv")
        path = _export_path(token, filename)
        statistics = summary.get("statistics") or {}
        if statistics:
            frame = pd.DataFrame.from_dict(statistics, orient="index")
            frame.index.name = "column"
            frame.reset_index().to_csv(path, index=False)
        else:
            pd.DataFrame(columns=["column"]).to_csv(path, index=False)
        return path, filename, CSV_MEDIA

    if kind == "missing-values":
        filename = artifact_filename(dataset["name"], "missing-values", "csv")
        path = _export_path(token, filename)
        rows = (summary.get("missing_data_summary") or {}).get("columns_with_missing") or []
        pd.DataFrame(rows, columns=["column", "missing_count", "missing_percent"]).to_csv(path, index=False)
        return path, filename, CSV_MEDIA

    if kind == "correlations":
        filename = artifact_filename(dataset["name"], "correlation-matrix", "csv")
        path = _export_path(token, filename)
        correlations = summary.get("correlations")
        if correlations and correlations.get("columns") and correlations.get("matrix"):
            columns = correlations["columns"]
            frame = pd.DataFrame(correlations["matrix"], index=columns, columns=columns)
            frame.index.name = "column"
            frame.reset_index().to_csv(path, index=False)
        else:
            pd.DataFrame(columns=["column"]).to_csv(path, index=False)
        return path, filename, CSV_MEDIA

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "code": "EDA_EXPORT_INVALID",
            "message": "Choose summary, statistics, missing-values or correlations.",
        },
    )


def export_training(token: str, run_id: str, kind: str) -> tuple[Path, str, str]:
    run = workspace_training_runner.get(token, run_id)
    if run.get("status") not in {"completed", "failed"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "TRAINING_NOT_FINISHED", "message": "Wait for the training run to finish before exporting it."},
        )
    dataset_name = str(run.get("dataset_name") or "dataset")
    kind = kind.strip().lower()

    if kind == "summary":
        filename = artifact_filename(dataset_name, "training-summary", "json")
        path = _export_path(token, filename)
        _write_json(path, run)
        return path, filename, JSON_MEDIA

    if kind == "model-comparison":
        filename = artifact_filename(dataset_name, "model-comparison", "csv")
        path = _export_path(token, filename)
        rows: list[dict[str, Any]] = []
        for result in run.get("results") or []:
            row: dict[str, Any] = {
                "model": result.get("model_type"),
                "success": result.get("success"),
                "training_time_seconds": result.get("training_time_seconds"),
                "error": result.get("error"),
            }
            for metric, value in ((result.get("metrics") or {}).get("test") or {}).items():
                if isinstance(value, (str, int, float, bool)) or value is None:
                    row[f"test_{metric}"] = value
            for metric, value in ((result.get("metrics") or {}).get("train") or {}).items():
                if isinstance(value, (str, int, float, bool)) or value is None:
                    row[f"train_{metric}"] = value
            rows.append(row)
        pd.DataFrame(rows).to_csv(path, index=False)
        return path, filename, CSV_MEDIA

    if kind == "feature-importance":
        filename = artifact_filename(dataset_name, "feature-importance", "csv")
        path = _export_path(token, filename)
        importance = (run.get("best_model") or {}).get("feature_importance") or {}
        features = importance.get("features") or []
        values = importance.get("importance") or []
        pd.DataFrame({"feature": features, "importance": values}).to_csv(path, index=False)
        return path, filename, CSV_MEDIA

    if kind == "best-model":
        best = run.get("best_model") or {}
        model_file = best.get("model_file")
        if not model_file:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "BEST_MODEL_MISSING", "message": "This run does not have a successful best-model artifact."},
            )
        source = session_manager.safe_path(token, "models", run_id, str(model_file))
        if not source.is_file():
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail={"code": "MODEL_EXPIRED", "message": "The temporary best-model file is no longer available."},
            )
        model_type = slugify(str(best.get("model_type") or "model"), fallback="model")
        filename = artifact_filename(dataset_name, f"best-model-{model_type}", "joblib")
        return source, filename, MODEL_MEDIA

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "code": "TRAINING_EXPORT_INVALID",
            "message": "Choose summary, model-comparison, feature-importance or best-model.",
        },
    )


async def build_session_bundle(token: str) -> tuple[Path, str]:
    datasets = list_workspace_datasets(token)
    runs = workspace_training_runner.list(token)
    predictions = list_predictions(token)
    primary_name = datasets[0]["name"] if len(datasets) == 1 else "workspace"
    now = datetime.now(timezone.utc)
    filename = artifact_filename(primary_name, "session", "zip", timestamp=now)
    bundle_path = _export_path(token, filename)

    with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        readme = (
            "NoCodeML temporary session export\n"
            "================================\n\n"
            "This bundle was generated from a temporary guest session.\n"
            "NoCodeML does not require this workspace to remain on the server after you leave.\n\n"
            f"Datasets: {len(datasets)}\nTraining runs: {len(runs)}\nBatch prediction files: {len(predictions)}\n"
        )
        archive.writestr("README.txt", readme)

        manifest = {
            "exported_at": now.isoformat(),
            "temporary_session": True,
            "datasets": [
                {key: value for key, value in dataset.items() if key != "stored_filename"}
                for dataset in datasets
            ],
            "training_runs": runs,
            "predictions": predictions,
        }
        archive.writestr("session-summary.json", json.dumps(manifest, indent=2, ensure_ascii=False, default=str))

        for dataset in datasets:
            source = session_manager.safe_path(token, "datasets", dataset["stored_filename"])
            if source.is_file():
                original_ext = source.suffix.lower() or ".dat"
                friendly = f"nocodeml_{slugify(dataset['name'])}_source{original_ext}"
                archive.write(source, f"datasets/{friendly}")

            summary = await get_workspace_eda_summary(token, dataset["id"])
            ds_slug = slugify(dataset["name"])
            archive.writestr(
                f"analysis/{ds_slug}/eda-summary.json",
                json.dumps(summary, indent=2, ensure_ascii=False, default=str),
            )
            stats = summary.get("statistics") or {}
            if stats:
                frame = pd.DataFrame.from_dict(stats, orient="index")
                frame.index.name = "column"
                archive.writestr(f"analysis/{ds_slug}/statistics.csv", frame.reset_index().to_csv(index=False))
            missing = (summary.get("missing_data_summary") or {}).get("columns_with_missing") or []
            archive.writestr(
                f"analysis/{ds_slug}/missing-values.csv",
                pd.DataFrame(missing, columns=["column", "missing_count", "missing_percent"]).to_csv(index=False),
            )

        for run in runs:
            dataset_slug = slugify(str(run.get("dataset_name") or "dataset"))
            model_slug = slugify(str((run.get("best_model") or {}).get("model_type") or "training"), fallback="training")
            archive.writestr(
                f"training/{dataset_slug}_{model_slug}_summary.json",
                json.dumps(run, indent=2, ensure_ascii=False, default=str),
            )
            if run.get("status") == "completed":
                best = run.get("best_model") or {}
                model_file = best.get("model_file")
                if model_file:
                    model_path = session_manager.safe_path(token, "models", run["id"], str(model_file))
                    if model_path.is_file():
                        archive.write(model_path, f"models/{dataset_slug}_best-model_{model_slug}.joblib")

        for prediction in predictions:
            try:
                source, friendly = prediction_download(token, prediction["id"])
            except HTTPException:
                continue
            archive.write(source, f"predictions/{friendly}")

    return bundle_path, filename
