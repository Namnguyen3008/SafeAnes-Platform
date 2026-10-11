from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError
from backend.app.ml.registry.contracts import UC04_CONTRACT
from backend.app.services.inference.uc04_batch import UC04OfflineBatchService, UC04PredictionCache


def _settings(tmp_path: Path) -> Settings:
    return Settings(data_root=tmp_path / "data", model_root=tmp_path / "model")


def _fixture_case(tmp_path: Path) -> tuple[Settings, dict, dict]:
    settings = _settings(tmp_path)
    manifest = {
        "case_id": "1",
        "source_dataset_version": "1.0.1",
        "recording": {"duration_seconds": 390.0},
        "raw_file": {"sha256": "raw-case-sha256"},
        "eligibility": {"uc04": True},
        "valid_windows": {
            "uc04": [
                {"prediction_time_seconds": 300.0},
                {"prediction_time_seconds": 330.0},
                {"prediction_time_seconds": 360.0},
            ]
        },
    }
    catalog = {
        "dataset": "VitalDB",
        "dataset_version": "1.0.1",
        "cases": [{"case_id": "1", "duration_seconds": 390.0, "uc04_eligible": True}],
    }
    settings.catalog_path.parent.mkdir(parents=True, exist_ok=True)
    settings.catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
    manifest_dir = settings.vitaldb_root / "manifests"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    (manifest_dir / "1.json").write_text(json.dumps(manifest), encoding="utf-8")
    raw_dir = settings.vitaldb_root / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / "1.vital").write_bytes(b"immutable-test-fixture")
    return settings, catalog, manifest


class _FakeCases:
    def __init__(self, settings: Settings, manifest: dict):
        self.settings = settings
        self.manifest = manifest

    def list_cases(self):
        return {"dataset": "VitalDB", "dataset_version": "1.0.1", "cases": [
            {"case_id": "1", "duration_seconds": 390.0, "uc04_eligible": True,
             "cache_status": "READY"}
        ]}

    def get_case(self, case_id: str):
        return {"case_id": str(case_id), "duration_seconds": 390.0,
                "raw_file": {"sha256": "raw-case-sha256"}, "dataset_version": "1.0.1"}

    def get_manifest(self, case_id: str):
        return self.manifest


class _FakeModels:
    def __init__(self, *, failing_times: set[float] | None = None):
        self.failing_times = failing_times or set()
        self.calls: list[float] = []

    def status(self, model_id: str):
        return {"inference_ready": True, "model_version": UC04_CONTRACT.model_version,
                "artifact_hash": UC04_CONTRACT.artifact_sha256}

    def predict(self, case_id: str, model_id: str, prediction_time_s: float):
        self.calls.append(prediction_time_s)
        if prediction_time_s in self.failing_times:
            raise ApiServiceError("INPUT_NOT_ELIGIBLE", "fixture abstention", status_code=422)
        return [
            {
                "case_id": case_id,
                "model_id": UC04_CONTRACT.model_id,
                "model_version": UC04_CONTRACT.model_version,
                "prediction_time": prediction_time_s,
                "task": UC04_CONTRACT.task,
                "horizon_if_applicable": horizon,
                "output": {"raw": float(horizon) / 10, "interpreted": {
                    "kind": "uncalibrated_sigmoid_score", "value": 0.6,
                    "calibrated": False, "threshold": 0.5 if horizon == 5 else None}},
                "output_semantics": "uncalibrated_sigmoid_score",
                "calibration_status": "NOT_CALIBRATED",
                "data_coverage": 0.9,
                "quality": "GOOD",
                "missing_features": [],
                "input_window": {"start_time_s": prediction_time_s - 300,
                                 "end_time_s": prediction_time_s},
                "artifact_hash": UC04_CONTRACT.artifact_sha256,
                "preprocessing_version": "v1",
            }
            for horizon in UC04_CONTRACT.prediction_horizons
        ]


def test_offline_batch_uses_verified_windows_and_caches_only_real_model_contract_outputs(tmp_path):
    settings, _, manifest = _fixture_case(tmp_path)
    models = _FakeModels(failing_times={330.0})
    batch = UC04OfflineBatchService(settings, _FakeCases(settings, manifest), models)

    result = batch.generate_case("1")

    assert result["status"] == "READY"
    assert result["candidate_window_count"] == 3
    assert result["inference_window_count"] == 2
    assert result["prediction_count"] == 6
    assert result["abstained_windows"] == [
        {
            "prediction_time": 330.0,
            "window_start_s": 30.0,
            "window_end_s": 330.0,
            "code": "INPUT_NOT_ELIGIBLE",
            "message": "fixture abstention",
        }
    ]
    assert [row["horizon_minutes_or_null"] for row in result["predictions"][:3]] == [5, 10, 15]
    assert all(row["calibrated_or_not"] is False for row in result["predictions"])
    assert all(row["artifact_sha256"] == UC04_CONTRACT.artifact_sha256 for row in result["predictions"])
    assert all(row["task"] == UC04_CONTRACT.task for row in result["predictions"])
    assert "hpi" not in json.dumps(result).casefold()


def test_prediction_cache_as_of_filter_never_exposes_future_windows(tmp_path):
    settings, _, manifest = _fixture_case(tmp_path)
    models = _FakeModels()
    batch = UC04OfflineBatchService(settings, _FakeCases(settings, manifest), models)
    batch.generate_case("1")
    store = UC04PredictionCache(settings)

    visible = store.read_predictions("1", as_of_s=330.0)

    assert visible["as_of_s"] == 330.0
    assert {row["prediction_time"] for row in visible["predictions"]} == {300.0, 330.0}
    assert all(row["prediction_time"] <= 330.0 for row in visible["predictions"])
    assert all(row["input_window_end"] == row["prediction_time"] for row in visible["predictions"])
    assert visible["prediction_count"] == 6
    assert visible["inference_window_count"] == 2
    assert visible["abstained_window_count"] == 0


def test_prediction_cache_reuses_validated_file_until_atomic_replacement(tmp_path, monkeypatch):
    settings, _, manifest = _fixture_case(tmp_path)
    batch = UC04OfflineBatchService(settings, _FakeCases(settings, manifest), _FakeModels())
    batch.generate_case("1")
    cache = UC04PredictionCache(settings)
    calls = 0
    validate = cache._validate_prediction_rows

    def counted(case_id, rows):
        nonlocal calls
        calls += 1
        validate(case_id, rows)

    monkeypatch.setattr(cache, "_validate_prediction_rows", counted)

    cache.status("1")
    cache.read_predictions("1", as_of_s=330)
    cache.read_predictions("1", as_of_s=360)
    assert calls == 1

    record = cache.read_case("1")
    cache.write_case("1", record)
    cache.read_predictions("1", as_of_s=360)
    assert calls == 2


def test_batch_cache_is_reused_and_stale_artifacts_are_rejected(tmp_path):
    settings, _, manifest = _fixture_case(tmp_path)
    models = _FakeModels()
    batch = UC04OfflineBatchService(settings, _FakeCases(settings, manifest), models)
    first = batch.generate_case("1")
    call_count = len(models.calls)

    second = batch.generate_case("1")
    assert second["cache_reused"] is True
    assert len(models.calls) == call_count

    cache = UC04PredictionCache(settings)
    record = cache.read_case("1")
    record["artifact_sha256"] = "wrong-artifact"
    cache.write_case("1", record)
    with pytest.raises(ApiServiceError, match="artifact"):
        cache.read_predictions("1", as_of_s=390.0)


def test_window_evidence_requires_explicit_persisted_abstention(tmp_path):
    settings, _, manifest = _fixture_case(tmp_path)
    models = _FakeModels()
    batch = UC04OfflineBatchService(settings, _FakeCases(settings, manifest), models)
    batch.generate_case("1")
    cache = UC04PredictionCache(settings)
    record = cache.read_case("1")
    record["abstained_windows"] = [{
        "prediction_time": 360.0,
        "window_start_s": 60.0,
        "window_end_s": 360.0,
        "code": "INPUT_NOT_ELIGIBLE",
        "message": "fixture abstention",
    }]
    record["predictions"] = [row for row in record["predictions"] if row["prediction_time"] < 360.0]
    cache.write_case("1", record)

    before = cache.window_evidence("1", as_of_s=330.0)
    abstained = cache.window_evidence("1", as_of_s=360.0)

    assert before["window_eligibility"] == "ELIGIBLE"
    assert abstained["window_eligibility"] == "ABSTAINED"
    assert abstained["window_prediction_time_s"] == 360.0
    assert abstained["window_reason"] == "INPUT_NOT_ELIGIBLE: fixture abstention"
