from __future__ import annotations

import joblib
import pandas as pd

from app.services.artifact_store import artifact_store
from app.services.model_trainer import ModelTrainer


def _classification_frame(rows: int = 80) -> pd.DataFrame:
    records = []
    cities = ["Bengaluru", "Hyderabad", "Chennai"]
    for index in range(rows):
        age = 18 + (index % 35)
        income = 25000 + (index * 1375) % 90000
        city = cities[index % len(cities)]
        target = int((age >= 32) or city == "Bengaluru")
        records.append({"age": age, "income": income, "city": city, "target": target})
    return pd.DataFrame(records)


def _regression_frame(rows: int = 90) -> pd.DataFrame:
    records = []
    zones = ["north", "south", "central"]
    for index in range(rows):
        area = 500 + index * 13
        rooms = 1 + index % 5
        zone = zones[index % len(zones)]
        zone_bonus = {"north": 12000, "south": 7000, "central": 18000}[zone]
        price = 150000 + area * 210 + rooms * 9500 + zone_bonus
        records.append({"area": area, "rooms": rooms, "zone": zone, "price": price})
    return pd.DataFrame(records)


def test_classification_pipeline_persists_preprocessing_and_accepts_numeric_labels(tmp_path):
    dataset_path = tmp_path / "classification.csv"
    _classification_frame().to_csv(dataset_path, index=False)

    trainer = ModelTrainer(models_dir=str(tmp_path / "models"))
    result = trainer.train_complete_pipeline(
        dataset_path=str(dataset_path),
        target_column="target",
        model_type="LogisticRegression",
        task_type="classification",
        hyperparameters={"max_iter": 500},
        training_config={"test_size": 0.2, "random_state": 42, "cv_folds": 3, "scaling": True},
        selected_features=["age", "income", "city"],
        job_id="classification-smoke",
    )

    assert result["success"] is True, result
    assert 0 <= result["metrics"]["test"]["accuracy"] <= 1

    with artifact_store.materialize(result["model_path"]) as model_path:
        artifact = joblib.load(model_path)

    assert artifact["artifact_version"] == 3
    assert artifact["feature_columns"] == ["age", "income", "city"]
    assert artifact["label_encoder"] is not None

    pipeline = artifact["model"]
    # "Mysuru" was not present during training. OneHotEncoder(handle_unknown="ignore")
    # must still allow inference without rebuilding category mappings.
    prediction = pipeline.predict(pd.DataFrame([{"age": 27, "income": 64000, "city": "Mysuru"}]))
    assert len(prediction) == 1
    decoded = artifact["label_encoder"].inverse_transform(prediction.astype(int))
    assert decoded[0] in {"0", "1"}


def test_regression_pipeline_trains_and_reloads_with_mixed_features(tmp_path):
    dataset_path = tmp_path / "regression.csv"
    _regression_frame().to_csv(dataset_path, index=False)

    trainer = ModelTrainer(models_dir=str(tmp_path / "models"))
    result = trainer.train_complete_pipeline(
        dataset_path=str(dataset_path),
        target_column="price",
        model_type="LinearRegression",
        task_type="regression",
        hyperparameters={},
        training_config={"test_size": 0.2, "random_state": 42, "cv_folds": 3, "scaling": True},
        selected_features=["area", "rooms", "zone"],
        job_id="regression-smoke",
    )

    assert result["success"] is True, result
    assert "r2_score" in result["metrics"]["test"]

    with artifact_store.materialize(result["model_path"]) as model_path:
        artifact = joblib.load(model_path)

    pipeline = artifact["model"]
    prediction = pipeline.predict(pd.DataFrame([{"area": 1050, "rooms": 3, "zone": "east"}]))
    assert len(prediction) == 1
    assert float(prediction[0]) > 0
