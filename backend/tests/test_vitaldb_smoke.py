"""Opt-in real inference smoke; never downloads data or changes raw recordings."""
import hashlib
import json
import os
from pathlib import Path

import numpy as np
import pytest

from backend.app.ml.inference.uc04 import UC04InferenceService
from backend.app.ml.inference.uc05 import UC05InferenceService
from backend.app.ml.preprocessing.vitaldb_loader import VitalDBWindowLoader
from backend.app.ml.registry.artifacts import default_model_root
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT


DATA_ROOT = Path(__file__).resolve().parents[1] / "data" / "vitaldb"
MODEL_ROOT = Path(os.environ.get("SAFEANES_MODEL_ROOT", default_model_root()))


def _verified_local_case(case_id, data_root=DATA_ROOT):
    manifest_path = data_root / "manifests" / f"{case_id}.json"
    if not manifest_path.is_file():
        pytest.skip(f"local VitalDB manifest absent for case {case_id}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["case_id"] == str(case_id), "manifest case identity mismatch"
    assert manifest["dataset"] == "VitalDB", "unexpected source dataset"
    raw = (data_root / manifest["raw_file"]["relative_path"]).resolve()
    assert raw.is_relative_to((data_root / "raw").resolve()), "raw file must be inside local raw cache"
    if not raw.is_file():
        pytest.skip(f"local raw VitalDB record absent for case {case_id}")
    digest = hashlib.sha256()
    with raw.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    assert digest.hexdigest() == manifest["raw_file"]["sha256"], "raw VitalDB SHA-256 mismatch"
    assert raw.stat().st_size == manifest["raw_file"]["size_bytes"], "raw VitalDB size mismatch"
    return raw, manifest


@pytest.fixture(scope="module", params=[("UC04", UC04InferenceService, UC04_CONTRACT), ("UC05", UC05InferenceService, UC05_CONTRACT)], ids=["UC04", "UC05"])
def real_service(request):
    model_id, service_type, contract = request.param
    override = os.environ.get(f"{model_id}_MODEL_PATH")
    checkpoint = Path(override) if override else MODEL_ROOT / contract.artifact_path
    required = [checkpoint, *(checkpoint.parent / name for name in contract.supporting_artifacts)]
    missing = [path.name for path in required if not path.is_file()]
    if missing:
        pytest.skip(f"audited {model_id} artifacts absent: " + ", ".join(missing))
    service = service_type(model_root=MODEL_ROOT, model_path=override, model_registry_path=os.environ.get("MODEL_REGISTRY_PATH"), device="cpu")
    service.load_model()
    return model_id, service


@pytest.mark.skipif(os.environ.get("SAFEANES_RUN_VITALDB_SMOKE") != "1", reason="set SAFEANES_RUN_VITALDB_SMOKE=1 for local real checkpoint smoke")
@pytest.mark.parametrize("case_id", ("1", "6388", "3300"))
def test_real_vitaldb_checkpoint_forward_pass_is_repeatable(case_id, real_service, monkeypatch):
    model_id, service = real_service
    raw, manifest = _verified_local_case(case_id)
    windows = manifest["valid_windows"][model_id.lower()]
    assert windows, f"selected case lacks validated {model_id} windows"
    prediction_time = windows[0]["prediction_time_seconds"]
    # Both raw input and deidentified static context come from the checked local
    # manifest; a network attempt is a failure, never an implicit fallback.
    import requests
    def no_network(*args, **kwargs):
        pytest.fail("local smoke attempted a network request")
    monkeypatch.setattr(requests.sessions.Session, "request", no_network)
    loader = VitalDBWindowLoader()
    series = loader.load_case_signals(model_id, case_id, source_path=raw, case_metadata=manifest["patient_context"])
    window = series.window_at(prediction_time)
    service.validate_inputs(window)
    first = service.predict_window(window)
    second = service.predict_window(window)
    assert service.readiness_status == "INTEGRATION_READY"
    assert first
    np.testing.assert_allclose([row.raw_output for row in first], [row.raw_output for row in second], rtol=1e-5, atol=1e-6)
    assert all(row.case_id == case_id and row.prediction_time == prediction_time for row in first)
    assert all(np.isfinite(row.raw_output) and row.confidence is None for row in first)
    print(f"{model_id} case={case_id} prediction_time={prediction_time} raw={[row.raw_output for row in first]} coverage={first[0].data_coverage}")


def _cached_fixture(tmp_path):
    (tmp_path / "raw").mkdir()
    (tmp_path / "manifests").mkdir()
    raw = tmp_path / "raw" / "1.vital"
    raw.write_bytes(b"fixture bytes: never used as model input")
    manifest = {"case_id": "1", "dataset": "VitalDB", "raw_file": {"relative_path": "raw/1.vital", "size_bytes": raw.stat().st_size, "sha256": hashlib.sha256(raw.read_bytes()).hexdigest()}}
    (tmp_path / "manifests" / "1.json").write_text(json.dumps(manifest))
    return raw


def test_local_cache_integrity_checks_before_loading(tmp_path):
    raw = _cached_fixture(tmp_path)
    verified, _ = _verified_local_case("1", tmp_path)
    assert verified == raw.resolve()


def test_local_cache_checksum_mismatch_fails_instead_of_skipping(tmp_path):
    raw = _cached_fixture(tmp_path)
    raw.write_bytes(b"corrupt")
    with pytest.raises(AssertionError, match="SHA-256 mismatch"):
        _verified_local_case("1", tmp_path)
