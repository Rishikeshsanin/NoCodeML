import pandas as pd

from app.services.eda_service import detect_id_columns


def test_identifier_names_are_detected_without_substring_false_positives():
    frame = pd.DataFrame(
        {
            "customer_id": ["a", "b", "c", "d"],
            "paid": [10, 20, 30, 40],
            "humidity": [41.2, 43.8, 40.1, 45.7],
            "price": [101.3, 205.7, 309.1, 412.4],
        }
    )

    detected = detect_id_columns(frame)

    assert "customer_id" in detected
    assert "paid" not in detected
    assert "humidity" not in detected
    assert "price" not in detected


def test_row_number_sequence_is_detected_but_arbitrary_unique_numeric_feature_is_not():
    frame = pd.DataFrame(
        {
            "row_number": [1, 2, 3, 4, 5],
            "measurement": [11, 37, 82, 145, 233],
        }
    )

    detected = detect_id_columns(frame)

    assert "row_number" in detected
    assert "measurement" not in detected


def test_non_sequential_unique_strings_are_not_assumed_to_be_ids():
    frame = pd.DataFrame(
        {
            "city_code": ["BLR", "HYD", "MAA", "DEL"],
            "target": [0, 1, 0, 1],
        }
    )

    detected = detect_id_columns(frame)

    assert "city_code" not in detected
