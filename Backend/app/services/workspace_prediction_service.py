"""Predictions from temporary guest-session model artifacts."""
from __future__ import annotations

import io
import json
import time
import uuid
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import HTTPException, UploadFile, status

from app.services.download_naming import artifact_filename
from app.services.session_manager import session_manager
from app.services.workspace_training_service import workspace_training_runner


MAX_BATCH_FILE_SIZE = 100 * 1024 * 1024


def _decode_predictions(predictions: Any, label_encoder: Any | None) -> np.ndarray:
    values = np.asarray(predictions)
    if label_encoder is None:
        return values
    return np.asarray(label_encoder.inverse_transform(values.astype(int)))


def _probability_labels(model: Any, label_encoder: Any | None) -> list[str]:
    estimator = model.named_steps.get("model") if hasattr(model, "named_steps") else model
    classes = np.asarray(getattr(estimator, "classes_", []))
    if classes.size == 0:
        return []
    if label_encoder is not None:
        try:
            return [str(value) for value in label_encoder.inverse_transform(classes.astype(int))]
        except Exception:
            pass
    return [str(value) for value in classes]


def _load_model(token: str, run_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    run = workspace_training_runner.get(token, run_id)
    if run.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "MODEL_NOT_READY", "message": "Finish a successful training run before making predictions."},
        )

    best = run.get("best_model") or {}
    model_file = best.get("model_file")
    if not model_file:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BEST_MODEL_MISSING", "message": "The completed run does not have a usable best model."},
        )

    model_path = session_manager.safe_path(token, "models", run_id, str(model_file))
    if not model_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "MODEL_EXPIRED", "message": "The temporary trained model is no longer available."},
        )

    try:
        model_data = joblib.load(model_path)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "MODEL_LOAD_ERROR", "message": "The temporary trained model could not be loaded."},
        ) from exc
    if not isinstance(model_data, dict) or "model" not in model_data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "MODEL_ARTIFACT_INVALID", "message": "The temporary trained model artifact is invalid."},
        )
    return run, model_data


def predict_single(token: str, run_id: str, features: dict[str, Any]) -> dict[str, Any]:
    run, model_data = _load_model(token, run_id)
    model = model_data["model"]
    label_encoder = model_data.get("label_encoder")
    required = [str(value) for value in (model_data.get("feature_columns") or [])]
    if not required:
        required = list(features.keys())

    missing = [column for column in required if column not in features]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "PREDICTION_FEATURES_MISSING",
                "message": f"Provide the required feature(s): {', '.join(missing[:10])}.",
                "missing_features": missing,
            },
        )

    frame = pd.DataFrame([{column: features[column] for column in required}])
    try:
        raw_prediction = model.predict(frame)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "PREDICTION_VALUES_INVALID",
                "message": "One or more feature values are incompatible with the trained model.",
            },
        ) from exc

    decoded = _decode_predictions(raw_prediction, label_encoder)
    prediction: Any = decoded[0]
    if isinstance(prediction, np.generic):
        prediction = prediction.item()

    probabilities = None
    confidence = None
    if hasattr(model, "predict_proba"):
        try:
            values = np.asarray(model.predict_proba(frame)[0], dtype=float)
            labels = _probability_labels(model, label_encoder)
            probabilities = {
                labels[index] if index < len(labels) else str(index): float(probability)
                for index, probability in enumerate(values)
            }
            confidence = float(values.max()) if values.size else None
        except Exception:
            probabilities = None
            confidence = None

    return {
        "prediction": prediction,
        "probabilities": probabilities,
        "confidence": confidence,
        "model_type": (run.get("best_model") or {}).get("model_type"),
        "run_id": run_id,
        "temporary": True,
    }


async def predict_batch(token: str, run_id: str, file: UploadFile) -> dict[str, Any]:
    filename = Path(file.filename or "predictions.csv").name
    if Path(filename).suffix.lower() != ".csv":
        await file.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BATCH_FILE_TYPE", "message": "Batch prediction input must be a CSV file."},
        )

    try:
        content = await file.read(MAX_BATCH_FILE_SIZE + 1)
    finally:
        await file.close()
    if len(content) > MAX_BATCH_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "BATCH_FILE_TOO_LARGE", "message": "Batch prediction CSV must be 100 MB or smaller."},
        )

    try:
        original = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BATCH_PARSE_ERROR", "message": "The batch prediction CSV could not be parsed."},
        ) from exc
    if original.empty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BATCH_EMPTY", "message": "The batch prediction CSV contains no rows."},
        )

    run, model_data = _load_model(token, run_id)
    model = model_data["model"]
    label_encoder = model_data.get("label_encoder")
    required = [str(value) for value in (model_data.get("feature_columns") or [])]
    if not required:
        required = [str(column) for column in original.columns]

    missing = [column for column in required if column not in original.columns]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "BATCH_FEATURES_MISSING",
                "message": f"The CSV is missing required feature column(s): {', '.join(missing[:10])}.",
                "missing_features": missing,
            },
        )

    features = original[required].copy()
    try:
        decoded = _decode_predictions(model.predict(features), label_encoder)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BATCH_VALUES_INVALID", "message": "Some batch feature values are incompatible with the trained model."},
        ) from exc

    result = original.copy()
    result["prediction"] = decoded
    if hasattr(model, "predict_proba"):
        try:
            result["confidence"] = np.asarray(model.predict_proba(features), dtype=float).max(axis=1)
        except Exception:
            pass

    prediction_id = str(uuid.uuid4())
    dataset_name = str(run.get("dataset_name") or "dataset")
    download_name = artifact_filename(dataset_name, "predictions", "csv")
    stored_name = f"{prediction_id}.csv"
    output_path = session_manager.safe_path(token, "predictions", stored_name)
    result.to_csv(output_path, index=False)

    metadata = {
        "id": prediction_id,
        "run_id": run_id,
        "dataset_id": run.get("dataset_id"),
        "dataset_name": dataset_name,
        "model_type": (run.get("best_model") or {}).get("model_type"),
        "stored_filename": stored_name,
        "download_filename": download_name,
        "total_predictions": len(result),
        "created_at": int(time.time()),
        "temporary": True,
    }
    metadata_path = session_manager.safe_path(token, "predictions", f"{prediction_id}.json")
    metadata_path.write_text(json.dumps(metadata, separators=(",", ":")), encoding="utf-8")

    public = {key: value for key, value in metadata.items() if key != "stored_filename"}
    public["download_url"] = f"/api/v1/workspace/predictions/{prediction_id}/download"
    return public


def list_predictions(token: str) -> list[dict[str, Any]]:
    directory = session_manager.safe_path(token, "predictions")
    results: list[dict[str, Any]] = []
    for path in directory.glob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict) or not payload.get("id"):
                continue
            public = {key: value for key, value in payload.items() if key != "stored_filename"}
            public["download_url"] = f"/api/v1/workspace/predictions/{payload['id']}/download"
            results.append(public)
        except (OSError, json.JSONDecodeError):
            continue
    return sorted(results, key=lambda item: item.get("created_at", 0), reverse=True)


def prediction_download(token: str, prediction_id: str) -> tuple[Path, str]:
    metadata_path = session_manager.safe_path(token, "predictions", f"{prediction_id}.json")
    if not metadata_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PREDICTION_NOT_FOUND", "message": "This prediction file is not part of the current session."},
        )
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "PREDICTION_METADATA_ERROR", "message": "Prediction metadata could not be read."},
        ) from exc

    file_path = session_manager.safe_path(token, "predictions", str(metadata.get("stored_filename") or ""))
    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "PREDICTION_EXPIRED", "message": "The temporary prediction file is no longer available."},
        )
    return file_path, str(metadata.get("download_filename") or "nocodeml_predictions.csv")
