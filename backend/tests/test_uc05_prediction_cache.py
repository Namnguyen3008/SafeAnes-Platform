from __future__ import annotations

from pathlib import Path

from backend.app.core.config import Settings
from backend.app.ml.preprocessing.uc05 import UC05_PREPROCESSING_VERSION
from backend.app.ml.registry.contracts import UC05_CONTRACT
from backend.app.services.inference.uc05_batch import UC05PredictionCache


def _settings(tmp_path: Path) -> Settings:
    return Settings(data_root=tmp_path / "data", model_root=tmp_path / "model")


def _prediction(case_id: str, time: float, horizon: int | None, raw: float) -> dict:
    calibrated = horizon is not None
    return {
        "case_id": case_id,
        "model_id": UC05_CONTRACT.model_id,
        "model_version": UC05_CONTRACT.model_version,
        "prediction_time": time,
        "input_window_start": time - 600,
        "input_window_end": time,
        "task": UC05_CONTRACT.task,
        "raw_output": raw,
        "interpreted_output": {
            "kind": "temperature_scaled_probability" if calibrated else "raw_logit",
            "value": 0.2 if calibrated else raw,
            "calibrated": calibrated,
        },
        "horizon_minutes_or_null": horizon,
        "data_coverage": 0.8,
        "quality": "DEGRADED",
        "calibrated_or_not": calibrated,
        "threshold_if_verified": None,
        "artifact_sha256": UC05_CONTRACT.artifact_sha256,
        "preprocessing_version": UC05_PREPROCESSING_VERSION,
        "input_contract_mode": "STRICT_SIGNAL_SCHEMA",
    }


def _record(case_id: str) -> dict:
    rows = [_prediction(case_id, 600, horizon, float(horizon or -1)) for horizon in (1, 3, 5, None)]
    rows.extend(_prediction(case_id, 630, horizon, float(horizon or -1)) for horizon in (1, 3, 5, None))
    return {
        "schema_version": 1,
        "case_id": case_id,
        "case_duration_seconds": 900,
        "raw_sha256": "source-sha",
        "dataset_version": "1.0.1",
        "model_id": UC05_CONTRACT.model_id,
        "model_version": UC05_CONTRACT.model_version,
        "artifact_sha256": UC05_CONTRACT.artifact_sha256,
        "preprocessing_version": UC05_PREPROCESSING_VERSION,
        "input_contract_mode": "STRICT_SIGNAL_SCHEMA",
        "available_horizons_minutes": [1, 3, 5],
        "candidate_window_count": 2,
        "inference_window_count": 2,
        "abstained_windows": [],
        "predictions": rows,
    }


def test_uc05_prediction_cache_filters_future_rows_and_keeps_only_contract_horizons(tmp_path):
    cache = UC05PredictionCache(_settings(tmp_path))
    cache.write_case("1", _record("1"))

    result = cache.read_predictions("1", as_of_s=600)

    assert result["as_of_s"] == 600
    assert {row["prediction_time"] for row in result["predictions"]} == {600}
    assert sorted({row["horizon_minutes_or_null"] for row in result["predictions"] if row["horizon_minutes_or_null"] is not None}) == [1, 3, 5]
    assert all(row["input_window_end"] == row["prediction_time"] for row in result["predictions"])
    assert all(row["input_contract_mode"] == "STRICT_SIGNAL_SCHEMA" for row in result["predictions"])
    assert result["prediction_count"] == 4
    assert result["inference_window_count"] == 1
    assert result["abstained_window_count"] == 0


def test_uc05_prediction_cache_reuses_validated_file_until_atomic_replacement(tmp_path, monkeypatch):
    cache = UC05PredictionCache(_settings(tmp_path))
    cache.write_case("1", _record("1"))
    calls = 0
    validate = cache._validate_rows

    def counted(case_id, rows):
        nonlocal calls
        calls += 1
        validate(case_id, rows)

    monkeypatch.setattr(cache, "_validate_rows", counted)

    cache.status("1")
    cache.read_predictions("1", as_of_s=600)
    cache.read_predictions("1", as_of_s=630)
    assert calls == 1

    cache.write_case("1", _record("1"))
    cache.read_predictions("1", as_of_s=630)
    assert calls == 2


def test_uc05_prediction_cache_keeps_auxiliary_raw_logit_out_of_horizon_set(tmp_path):
    cache = UC05PredictionCache(_settings(tmp_path))
    cache.write_case("1", _record("1"))

    rows = cache.read_predictions("1", as_of_s=600)["predictions"]
    auxiliary = [row for row in rows if row["horizon_minutes_or_null"] is None]

    assert len(auxiliary) == 1
    assert auxiliary[0]["interpreted_output"]["kind"] == "raw_logit"
    assert auxiliary[0]["calibrated_or_not"] is False


def test_uc05_window_evidence_does_not_infer_abstention_from_missing_rows(tmp_path):
    cache = UC05PredictionCache(_settings(tmp_path))
    cache.write_case("1", _record("1"))

    evidence = cache.window_evidence("1", as_of_s=630)

    assert evidence["window_eligibility"] == "ELIGIBLE"
    assert evidence["window_prediction_time_s"] == 630.0
    assert evidence["window_reason"] is None


def test_uc05_latest_explicit_abstention_wins_over_earlier_prediction(tmp_path):
    cache = UC05PredictionCache(_settings(tmp_path))
    record = _record("1")
    record["predictions"] = [row for row in record["predictions"] if row["prediction_time"] < 630]
    record["inference_window_count"] = 2
    record["abstained_windows"] = [{
        "prediction_time": 630.0,
        "window_start_s": 30.0,
        "window_end_s": 630.0,
        "code": "INPUT_NOT_ELIGIBLE",
        "message": "fixture abstention",
    }]
    cache.write_case("1", record)

    evidence = cache.window_evidence("1", as_of_s=630)

    assert evidence["window_eligibility"] == "ABSTAINED"
    assert evidence["window_prediction_time_s"] == 630.0
    assert evidence["window_reason"] == "INPUT_NOT_ELIGIBLE: fixture abstention"
