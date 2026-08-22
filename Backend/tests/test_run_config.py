from app.worker.run_tasks import resolve_model_hyperparameters, training_config_from_snapshot


def test_v3_hyperparameters_use_top_level_values_and_custom_overrides():
    config = {
        "model_type": "RandomForestClassifier",
        "hyperparameters": {"n_estimators": 111, "max_depth": 9},
        "custom_hyperparameters": {"max_depth": 4},
    }

    resolved = resolve_model_hyperparameters(config, "classification", "RandomForestClassifier")

    assert resolved["n_estimators"] == 111
    assert resolved["max_depth"] == 4


def test_legacy_nested_hyperparameters_remain_compatible():
    config = {
        "config": {
            "hyperparameters": {"n_estimators": 77},
        }
    }

    resolved = resolve_model_hyperparameters(config, "classification", "RandomForestClassifier")
    assert resolved["n_estimators"] == 77


def test_ui_train_ratio_is_converted_to_trainer_test_size():
    resolved = training_config_from_snapshot({"trainTestSplit": 0.85, "randomSeed": 123})

    assert resolved["test_size"] == 0.15
    assert resolved["random_state"] == 123
    assert resolved["cv_folds"] == 3
