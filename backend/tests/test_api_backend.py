from __future__ import annotations

import hashlib
import json
import asyncio
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient

from backend.app.core.config import Settings
from backend.app.main import BackendRuntime, create_app
from backend.app.repositories.case_repository import CaseRepository
from backend.app.api.routes.replay import stream_session
from backend.app.ml.preprocessing.uc04 import UC04_PREPROCESSING_VERSION
from backend.app.ml.preprocessing.uc05 import UC05_PREPROCESSING_VERSION, UC05_FEATURE_ORDER
from backend.app.ml.contracts.window import InferenceWindow, SignalWindow
from backend.app.ml.preprocessing.vitaldb_loader import LoadedTrackMetadata, VitalDBCaseSignals
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT


class _FakeTrack:
    def __init__(self, track_type: int, sample_rate: float, unit: str, device: str, recs):
        self.type = track_type
        self.srate = sample_rate
        self.unit = unit
        self.dname = device
        self.recs = recs


class _FakeVitalFile:
    def __init__(self, path, track_names=None, **kwargs):
        self.dtstart = 1000.0
        self.dtend = 1010.0
        tracks = {
            "Solar8000/HR": _FakeTrack(
                2,
                0.0,
                "/min",
                "Solar8000",
                [
                    {"dt": 1001.0, "val": 70.0},
                    {"dt": 1002.0, "val": float("nan")},
                    {"dt": 1004.0, "val": 75.0},
                ],
            ),
            "SNUADC/PLETH": _FakeTrack(
                1,
                2.0,
                "a.u.",
                "SNUADC",
                [{"dt": 1000.25, "val": [0.1, float("nan"), 0.3, 0.4, 0.5, 0.6]}],
            ),
            "EVENT": _FakeTrack(
                5,
                0.0,
                "",
                "VitalDB",
                [{"dt": 1003.5, "val": "Surgery started"}],
            ),
        }
        selected = set(track_names or tracks)
        self.trks = {name: track for name, track in tracks.items() if name in selected}

    def get_track_names(self):
        return list(self.trks)


class _FakeVitalDB:
    VitalFile = _FakeVitalFile


def _backend_fixture(tmp_path: Path):
    root = tmp_path / "data"
    raw_dir = root / "vitaldb" / "raw"
    manifest_dir = root / "vitaldb" / "manifests"
    raw_dir.mkdir(parents=True)
    manifest_dir.mkdir(parents=True)
    raw_bytes = b"local test fixture; not a model input"
    raw_path = raw_dir / "1.vital"
    raw_path.write_bytes(raw_bytes)
    checksum = hashlib.sha256(raw_bytes).hexdigest()
    tracks = [
        {
            "track_name": "Solar8000/HR",
            "source_device": "Solar8000",
            "track_type": "NUMERIC",
            "native_sample_rate_hz": "NOT_RECORDED",
            "observed_update_rate_hz": 1.0,
            "unit": "/min",
            "valid_time_range_seconds": [1.0, 4.0],
        },
        {
            "track_name": "SNUADC/PLETH",
            "source_device": "SNUADC",
            "track_type": "WAVEFORM",
            "native_sample_rate_hz": 2.0,
            "unit": "a.u.",
            "valid_time_range_seconds": [0.25, 3.0],
        },
        {
            "track_name": "EVENT",
            "source_device": "VitalDB",
            "track_type": "EVENT",
            "native_sample_rate_hz": "NOT_RECORDED",
            "unit": "NOT_RECORDED",
            "valid_time_range_seconds": [3.5, 3.5],
        },
    ]
    catalog = {
        "dataset": "VitalDB",
        "dataset_version": "1.0.1",
        "source": "official_dataset",
        "cases": [
            {
                "case_id": "1",
                "duration_seconds": 10.0,
                "available_signals": [item["track_name"] for item in tracks],
                "uc04_eligible": True,
                "uc05_eligible": False,
                "coverage_summary": {"SNUADC/PLETH": 0.9},
                "number_of_valid_windows": {"uc04": 1, "uc05": 0},
                "inference_readiness": {"uc04": "READY", "uc05": "BLOCKED"},
                "raw_file_sha256": checksum,
            }
        ],
    }
    (root / "manifests").mkdir()
    (root / "manifests" / "vitaldb_case_catalog.json").write_text(
        json.dumps(catalog), encoding="utf-8"
    )
    manifest = {
        "case_id": "1",
        "dataset": "VitalDB",
        "source_uri": "https://api.vitaldb.net/1.0.1/1.vital",
        "recording": {"duration_seconds": 10.0},
        "patient_context": {"age": "NOT_RECORDED", "sex": "NOT_RECORDED"},
        "eligibility": {"uc04": True, "uc05": False},
        "raw_file": {
            "relative_path": "raw/1.vital",
            "sha256": checksum,
            "immutable": True,
        },
        "available_tracks": tracks,
    }
    (manifest_dir / "1.json").write_text(json.dumps(manifest), encoding="utf-8")
    settings = Settings(
        data_root=root,
        model_root=tmp_path / "model",
        cors_origins=(),
        model_device="cpu",
        environment="test",
        max_signal_range_seconds=60.0,
        max_waveform_range_seconds=60.0,
        max_samples_per_response=1000,
    )
    return settings


def _client(tmp_path: Path) -> TestClient:
    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(
        settings=settings,
        load_models=False,
        vitaldb_module=_FakeVitalDB,
    )
    return TestClient(create_app(settings=settings, runtime=runtime))


def test_case_manifest_cache_reuses_metadata_and_detects_replacement(tmp_path, monkeypatch):
    settings = _backend_fixture(tmp_path)
    repository = CaseRepository(settings)
    repository._load_catalog()
    manifest_path = settings.vitaldb_root / "manifests" / "1.json"
    original_read_text = Path.read_text
    manifest_read_count = 0

    def counted_read_text(path, *args, **kwargs):
        nonlocal manifest_read_count
        if path == manifest_path:
            manifest_read_count += 1
        return original_read_text(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", counted_read_text)

    repository.get_track("1", "Solar8000/HR")
    repository.list_tracks("1")
    repository.get_case("1")
    assert manifest_read_count == 1

    manifest = json.loads(original_read_text(manifest_path, encoding="utf-8"))
    manifest["patient_context"]["cache_refresh_test"] = "updated"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    assert repository.get_case("1")["patient_context"]["cache_refresh_test"] == "updated"
    assert manifest_read_count == 2


def test_health_and_model_status_report_not_loaded_without_fabricating_readiness(tmp_path):
    with _client(tmp_path) as client:
        live = client.get("/api/v1/health/live")
        ready = client.get("/api/v1/health/ready")
        models = client.get("/api/v1/models")

    assert live.status_code == 200
    assert live.json()["status"] == "alive"
    assert ready.status_code == 503
    assert ready.json()["ready"] is False
    assert ready.json()["components"]["dataset_cache"] == "READY"
    assert ready.json()["components"]["cached_case_count"] == 1
    assert models.status_code == 200
    assert {item["model_id"] for item in models.json()["models"]} == {
        "SafeAnes-UC04-HypoFormer",
        "SafeAnes-UC05-RespFormer",
    }
    assert all(item["loaded"] is False for item in models.json()["models"])


def test_case_catalog_metadata_and_tracks_are_served_from_local_manifests(tmp_path):
    with _client(tmp_path) as client:
        cases = client.get("/api/v1/cases")
        case = client.get("/api/v1/cases/1")
        tracks = client.get("/api/v1/cases/1/tracks")

    assert cases.status_code == 200
    assert cases.json()["cases"][0]["case_id"] == "1"
    assert cases.json()["cases"][0]["uc04_eligible"] is True
    assert case.status_code == 200
    assert case.json()["patient_context"]["age"] == "NOT_RECORDED"
    assert case.json()["time_basis"] == "seconds_since_case_start"
    assert tracks.status_code == 200
    assert {item["track_name"] for item in tracks.json()["tracks"]} == {
        "Solar8000/HR",
        "SNUADC/PLETH",
        "EVENT",
    }


def test_observation_waveform_and_event_endpoints_preserve_raw_time_and_missingness(tmp_path):
    with _client(tmp_path) as client:
        signals = client.get(
            "/api/v1/cases/1/signals",
            params={"track_name": "Solar8000/HR", "start_s": 0, "end_s": 5},
        )
        waveform = client.get(
            "/api/v1/cases/1/waveforms",
            params={"track_name": "SNUADC/PLETH", "start_s": 0, "end_s": 3},
        )
        events = client.get("/api/v1/cases/1/events")

    assert signals.status_code == 200
    observations = signals.json()["observations"]
    assert [item["timestamp"] for item in observations] == [1.0, 2.0, 4.0]
    assert observations[1]["value"] is None
    assert observations[1]["is_missing"] is True
    assert observations[0]["unit"] == "/min"
    assert observations[0]["provenance"]["dataset"] == "VitalDB"
    assert waveform.status_code == 200
    assert waveform.json()["sample_rate_hz"] == 2.0
    assert waveform.json()["timestamps"] == [0.25, 0.75, 1.25, 1.75, 2.25, 2.75]
    assert waveform.json()["values"][1] is None
    assert waveform.json()["is_missing"][1] is True
    assert waveform.json()["missing_intervals"] == [
        {"start_time_s": 0.75, "end_time_s": 1.25}
    ]
    assert events.status_code == 200
    assert events.json()["events"][0]["timestamp"] == 3.5
    assert events.json()["events"][0]["description"] == "Surgery started"


def test_api_returns_structured_case_track_and_time_range_errors(tmp_path):
    with _client(tmp_path) as client:
        missing_case = client.get("/api/v1/cases/404")
        missing_track = client.get(
            "/api/v1/cases/1/signals",
            params={"track_name": "Unknown/HR", "start_s": 0, "end_s": 2},
        )
        invalid_range = client.get(
            "/api/v1/cases/1/signals",
            params={"track_name": "Solar8000/HR", "start_s": 5, "end_s": 2},
        )

    assert missing_case.status_code == 404
    assert missing_case.json()["error"]["code"] == "CASE_NOT_FOUND"
    assert missing_track.status_code == 404
    assert missing_track.json()["error"]["code"] == "TRACK_NOT_AVAILABLE"
    assert invalid_range.status_code == 422
    assert invalid_range.json()["error"]["code"] == "INVALID_TIME_RANGE"


def test_replay_controls_stream_one_way_state_and_validate_seek(tmp_path):
    with _client(tmp_path) as client:
        created = client.post(
            "/api/v1/replay/sessions",
            json={"case_id": "1", "start_time_s": 0, "speed": 1},
        )
        session_id = created.json()["session_id"]
        playing = client.post(f"/api/v1/replay/sessions/{session_id}/play")
        paused = client.post(f"/api/v1/replay/sessions/{session_id}/pause")
        sought = client.post(
            f"/api/v1/replay/sessions/{session_id}/seek", json={"time_s": 5}
        )
        speed = client.post(
            f"/api/v1/replay/sessions/{session_id}/speed", json={"speed": 30}
        )
        session = client.get(f"/api/v1/replay/sessions/{session_id}")
        invalid_seek = client.post(
            f"/api/v1/replay/sessions/{session_id}/seek", json={"time_s": 50}
        )
        class _Request:
            app = client.app
            calls = 0

            async def is_disconnected(self):
                self.calls += 1
                return self.calls > 1

        response = asyncio.run(stream_session(session_id, _Request()))

        async def read_first_event():
            async for chunk in response.body_iterator:
                return chunk
            return b""

        first_event = asyncio.run(read_first_event())
        if isinstance(first_event, bytes):
            first_event = first_event.decode("utf-8")

    assert created.status_code == 201
    assert playing.json()["status"] == "PLAYING"
    assert paused.json()["status"] == "PAUSED"
    assert sought.json()["current_time_s"] == 5
    assert speed.json()["speed"] == 30
    assert session.json()["current_time_s"] == 5
    assert invalid_seek.status_code == 422
    assert invalid_seek.json()["error"]["code"] == "INVALID_TIME_RANGE"
    assert "event: snapshot" in first_event
    assert "data: {" in first_event


def test_replay_session_has_canonical_fields_and_explicit_resume_reset(tmp_path):
    with _client(tmp_path) as client:
        created = client.post(
            "/api/v1/replay/sessions",
            json={"case_id": "1", "start_time_s": 0, "speed": 1},
        )
        session_id = created.json()["session_id"]
        client.post(f"/api/v1/replay/sessions/{session_id}/play")
        paused = client.post(f"/api/v1/replay/sessions/{session_id}/pause")
        resumed = client.post(f"/api/v1/replay/sessions/{session_id}/resume")
        reset = client.post(f"/api/v1/replay/sessions/{session_id}/reset")

    session = created.json()
    assert created.status_code == 201
    assert session["case_id"] == "1"
    assert session["current_time_seconds"] == 0
    assert session["duration_seconds"] == 10
    assert session["status"] == "STOPPED"
    assert session["speed"] == 1
    assert "started_at" in session
    assert "updated_at" in session
    assert "uc04_model_status" in session
    assert "uc05_model_status" in session
    assert paused.json()["status"] == "PAUSED"
    assert resumed.json()["status"] == "PLAYING"
    assert reset.json()["status"] == "STOPPED"
    assert reset.json()["current_time_seconds"] == 0
    assert reset.json()["current_time_s"] == 0


def test_replay_stream_sends_as_of_recorded_data_without_future_leakage(tmp_path):
    with _client(tmp_path) as client:
        created = client.post(
            "/api/v1/replay/sessions",
            json={"case_id": "1", "start_time_s": 0, "speed": 1},
        )
        session_id = created.json()["session_id"]
        client.post(f"/api/v1/replay/sessions/{session_id}/seek", json={"time_s": 3.6})

        class _Request:
            app = client.app

            async def is_disconnected(self):
                return False

        response = asyncio.run(stream_session(session_id, _Request()))

        async def read_initial_events():
            iterator = response.body_iterator
            first = await anext(iterator)
            second = await anext(iterator)
            await iterator.aclose()
            return first, second

        first, second = asyncio.run(read_initial_events())
        text_events = [item.decode("utf-8") if isinstance(item, bytes) else item for item in (first, second)]
        assert any(item.startswith("event: reset") for item in text_events), text_events
        reset_line = next(item for item in text_events if item.startswith("event: reset"))
        reset_json = reset_line.split("data: ", 1)[1].strip()
        reset_payload = json.loads(reset_json)

    assert "event: snapshot" in text_events[0]
    assert reset_payload["case_id"] == "1"
    assert reset_payload["time_basis"] == "seconds_since_case_start"
    assert reset_payload["as_of_s"] == 3.6
    numeric = reset_payload["uc04_view"]["signals"]
    heart_rate = next(series for series in numeric if series["signal"] == "HR")
    assert [sample["timestamp"] for sample in heart_rate["observations"]] == [1.0, 2.0]
    events = reset_payload["uc05_view"]["recorded_events"]
    assert [event["timestamp"] for event in events] == [3.5]
    assert all(sample["timestamp"] <= reset_payload["as_of_s"] for sample in heart_rate["observations"])
    assert all(event["timestamp"] <= reset_payload["as_of_s"] for event in events)


def test_replay_stream_disables_intermediary_transforms(tmp_path):
    with _client(tmp_path) as client:
        created = client.post(
            "/api/v1/replay/sessions",
            json={"case_id": "1", "start_time_s": 0, "speed": 1},
        )

        class _Request:
            app = client.app

            async def is_disconnected(self):
                return True

        response = asyncio.run(stream_session(created.json()["session_id"], _Request()))

    assert "no-transform" in response.headers["cache-control"]


def test_replay_stream_delta_is_bounded_and_uses_original_waveform_samples(tmp_path):
    with _client(tmp_path) as client:
        runtime = client.app.state.runtime
        assert runtime.replay_stream.max_chunk_seconds <= 30.0
        chunk = runtime.replay_stream.delta("1", 1.5, 3.6)

    heart_rate = next(track for track in chunk["numeric_tracks"] if track["track_name"] == "Solar8000/HR")
    assert [sample["timestamp"] for sample in heart_rate["observations"]] == [2.0]
    pleth = chunk["waveforms"]["pleth"]
    assert pleth["sample_rate_hz"] == 2.0
    assert pleth["timestamps"] == [1.75, 2.25, 2.75]
    assert pleth["values"] == [0.4, 0.5, 0.6]
    assert all(1.5 <= sample["timestamp"] < 3.6 for sample in heart_rate["observations"])
    assert [event["timestamp"] for event in chunk["recorded_events"]] == [3.5]
    assert chunk["medication_tracks"] == []


def test_replay_stream_coalesces_large_playback_lag_to_current_snapshot(tmp_path):
    with _client(tmp_path) as client:
        created = client.post(
            "/api/v1/replay/sessions",
            json={"case_id": "1", "start_time_s": 0, "speed": 30},
        )
        session_id = created.json()["session_id"]
        runtime = client.app.state.runtime
        manager = runtime.replay
        original_get = manager.get
        time_values = iter((0.0, 0.0, 300.0, 300.0))

        def get_at_stream_times(requested_session_id):
            session = original_get(requested_session_id)
            current_time = next(time_values)
            return {
                **session,
                "current_time_s": current_time,
                "current_time_seconds": current_time,
                "status": "PLAYING",
            }

        class _ReplayStream:
            max_chunk_seconds = 30.0

            def __init__(self):
                self.delta_windows = []

            def snapshot(self, case_id, as_of_s):
                return {"case_id": case_id, "as_of_s": as_of_s}

            def delta(self, case_id, start_s, end_s):
                self.delta_windows.append((start_s, end_s))
                return {"case_id": case_id, "from_s": start_s, "as_of_s": end_s}

        stream = _ReplayStream()
        manager.get = get_at_stream_times
        runtime.replay_stream = stream

        class _Request:
            app = client.app
            calls = 0

            async def is_disconnected(self):
                self.calls += 1
                return self.calls > 2

        response = asyncio.run(stream_session(session_id, _Request()))

        async def read_events_through_coalesced_snapshot():
            iterator = response.body_iterator
            events = []
            for _ in range(4):
                item = await anext(iterator)
                events.append(item.decode("utf-8") if isinstance(item, bytes) else item)
            await iterator.aclose()
            return events

        events = asyncio.run(read_events_through_coalesced_snapshot())

    assert "event: reset" in events[1]
    assert "event: snapshot" in events[2]
    assert "event: reset" in events[3]
    coalesced = json.loads(events[3].split("data: ", 1)[1].strip())
    assert coalesced["as_of_s"] == 300.0
    assert stream.delta_windows == []


def test_cached_replay_predictions_are_filtered_at_the_frame_time():
    from backend.app.services.replay.stream import ReplayStreamService

    class _PredictionCache:
        def status(self, case_id):
            return {"cache_status": "READY"}

        def read_predictions(self, case_id, *, as_of_s, window_start_s):
            return {
                "predictions": [
                    {"prediction_time": 3.0, "raw_output": 0.2},
                    {"prediction_time": 4.0, "raw_output": 0.8},
                ]
            }

    frame = ReplayStreamService._predictions(_PredictionCache(), "1", 2.0, 3.5)

    assert frame["predictions"] == [{"prediction_time": 3.0, "raw_output": 0.2}]


def test_unloaded_model_returns_model_not_ready_without_zero_prediction(tmp_path):
    with _client(tmp_path) as client:
        response = client.get(
            "/api/v1/cases/1/predictions/uc04",
            params={"prediction_time_s": 5},
        )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "MODEL_NOT_READY"
    assert "predictions" not in response.json()


def test_uc04_on_demand_response_lists_only_horizons_returned_by_model(tmp_path):
    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    runtime.models.predict = lambda *_args, **_kwargs: [
        {
            "case_id": "1",
            "model_id": UC04_CONTRACT.model_id,
            "model_version": UC04_CONTRACT.model_version,
            "prediction_time": 5.0,
            "task": UC04_CONTRACT.task,
            "horizon_if_applicable": horizon,
            "output": {"raw": 0.1},
            "output_semantics": "uncalibrated_sigmoid_score",
            "calibration_status": "NOT_CALIBRATED",
            "data_coverage": 1.0,
            "quality": "GOOD",
            "missing_features": [],
            "input_window": {"start_time_s": 0.0, "end_time_s": 5.0},
            "artifact_hash": UC04_CONTRACT.artifact_sha256,
            "preprocessing_version": UC04_PREPROCESSING_VERSION,
        }
        for horizon in (15, 5, 5)
    ]

    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        response = client.get(
            "/api/v1/cases/1/predictions/uc04",
            params={"prediction_time_s": 5.0},
        )

    assert response.status_code == 200
    assert response.json()["available_horizons_minutes"] == [5, 15]


def test_api_rejects_path_like_case_ids_and_unlisted_models(tmp_path):
    with _client(tmp_path) as client:
        traversal = client.get("/api/v1/cases/%2e%2e%2fmodel")
        unknown_case = client.get("/api/v1/cases/0001")
        model = client.get("/api/v1/models/anything/status")

    assert traversal.status_code == 404
    assert traversal.json()["error"]["code"] == "ROUTE_NOT_FOUND"
    assert unknown_case.status_code == 404
    assert unknown_case.json()["error"]["code"] == "CASE_NOT_FOUND"
    assert model.status_code == 404
    assert model.json()["error"]["code"] == "MODEL_NOT_FOUND"


def test_raw_checksum_mismatch_returns_structured_cache_error(tmp_path):
    settings = _backend_fixture(tmp_path)
    raw_path = settings.vitaldb_root / "raw" / "1.vital"
    raw_path.write_bytes(b"unexpected mutation")
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        response = client.get(
            "/api/v1/cases/1/signals",
            params={"track_name": "Solar8000/HR", "start_s": 0, "end_s": 5},
        )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "CACHE_NOT_READY"


def test_wildcard_cors_is_rejected(tmp_path):
    with pytest.raises(ValueError, match=r"\*' is not allowed"):
        Settings(
            data_root=tmp_path / "data",
            model_root=tmp_path / "model",
            cors_origins=("*",),
        )


def test_openapi_documents_the_structured_error_contract(tmp_path):
    with _client(tmp_path) as client:
        schema = client.get("/openapi.json").json()

    operation = schema["paths"]["/api/v1/cases/{case_id}/signals"]["get"]
    error_response = operation["responses"]["422"]["content"]["application/json"]["schema"]
    assert error_response["$ref"] == "#/components/schemas/ErrorResponse"
    assert "ErrorBody" in schema["components"]["schemas"]


def test_checked_openapi_snapshot_matches_the_live_api_contract(tmp_path):
    snapshot_path = Path(__file__).parents[1] / "openapi.json"
    checked_schema = json.loads(snapshot_path.read_text(encoding="utf-8"))
    with _client(tmp_path) as client:
        live_schema = client.get("/openapi.json").json()

    assert checked_schema == live_schema


def test_uc04_as_of_api_serves_cached_outputs_without_future_leakage(tmp_path):
    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(
        settings=settings, load_models=False, vitaldb_module=_FakeVitalDB
    )
    # This regression exercises a ready cache; runtime readiness is independent.
    service = runtime.models.services[UC04_CONTRACT.model_id]
    service.model = object()
    service.readiness_status = "INTEGRATION_READY"
    service.readiness_blockers = ()
    predictions = []
    for prediction_time in (1.0, 3.0):
        for horizon in UC04_CONTRACT.prediction_horizons:
            interpreted = {
                "kind": "uncalibrated_sigmoid_score",
                "value": 0.4,
                "calibrated": False,
                "threshold": 0.5 if horizon == 5 else None,
                "threshold_decision": False if horizon == 5 else None,
            }
            predictions.append({
                "case_id": "1",
                "model_id": UC04_CONTRACT.model_id,
                "model_version": UC04_CONTRACT.model_version,
                "prediction_time": prediction_time,
                "input_window_start": 0.0,
                "input_window_end": prediction_time,
                "task": UC04_CONTRACT.task,
                "raw_output": -0.4,
                "interpreted_output": interpreted,
                "horizon_minutes_or_null": horizon,
                "data_coverage": 0.9,
                "quality": "GOOD",
                "calibrated_or_not": False,
                "threshold_if_verified": interpreted["threshold"],
                "artifact_sha256": UC04_CONTRACT.artifact_sha256,
                "preprocessing_version": UC04_PREPROCESSING_VERSION,
                "missing_features": [],
                    "horizon_if_applicable": horizon,
                    "output_semantics": "uncalibrated_sigmoid_score",
                    "calibration_status": "NOT_CALIBRATED",
                    "output": {"raw": -0.4, "interpreted": interpreted},
                "input_window": {"start_time_s": 0.0, "end_time_s": prediction_time},
                "artifact_hash": UC04_CONTRACT.artifact_sha256,
            })
    runtime.uc04_batch.cache.write_case("1", {
        "schema_version": runtime.uc04_batch.cache.schema_version,
        "case_id": "1",
        "dataset": "VitalDB",
        "dataset_version": "1.0.1",
        "case_duration_seconds": 10.0,
        "raw_sha256": hashlib.sha256(b"local test fixture; not a model input").hexdigest(),
        "model_id": UC04_CONTRACT.model_id,
        "model_version": UC04_CONTRACT.model_version,
        "artifact_sha256": UC04_CONTRACT.artifact_sha256,
        "task": UC04_CONTRACT.task,
        "output_semantics": UC04_CONTRACT.output_semantics["score"],
        "calibrated_or_not": False,
        "available_horizons_minutes": [5, 10, 15],
        "threshold_if_verified": {"5": 0.5, "10": None, "15": None},
        "preprocessing_version": UC04_PREPROCESSING_VERSION,
        "inference_window_count": 2,
        "candidate_window_count": 2,
        "abstained_windows": [],
        "predictions": predictions,
    })

    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        response = client.get("/api/v1/cases/1/predictions/uc04", params={"as_of_s": 2})
        view = client.get("/api/v1/cases/1/uc04-view", params={"as_of_s": 2, "window_seconds": 2})
        cache_status = client.get("/api/v1/cases/1/predictions/uc04/cache-status")
        delta = runtime.replay_stream.delta("1", 0.0, 2.0)
        snapshot = runtime.replay_stream.snapshot("1", 2.0)

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "OFFLINE_CACHE"
    assert body["as_of_s"] == 2
    assert body["available_horizons_minutes"] == [5, 10, 15]
    assert {item["prediction_time"] for item in body["predictions"]} == {1}
    assert all(item["prediction_time"] <= body["as_of_s"] for item in body["predictions"])
    assert all(item["calibrated_or_not"] is False for item in body["predictions"])

    assert view.status_code == 200
    assert view.json()["prediction_cache_status"] == "READY"
    assert view.json()["predictions"]["predictions"] == body["predictions"]
    assert cache_status.json()["cache_status"] == "READY"
    for frame in (delta["predictions"]["uc04"], snapshot["uc04_view"]["predictions"]):
        assert len(frame["predictions"]) == len(body["predictions"])
        for actual, expected in zip(frame["predictions"], body["predictions"]):
            for field in ("prediction_time", "model_id", "raw_output", "interpreted_output", "artifact_hash"):
                assert actual[field] == expected[field]


def test_uc04_view_returns_only_recorded_values_and_events_available_as_of_time(tmp_path):
    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        response = client.get(
            "/api/v1/cases/1/uc04-view",
            params={"as_of_s": 3.0, "window_seconds": 3.0},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["time_basis"] == "seconds_since_case_start"
    assert body["as_of_s"] == 3.0
    assert all(signal["track_name"] in body["available_tracks"] for signal in body["signals"])
    hr = next(signal for signal in body["signals"] if signal["track_name"] == "Solar8000/HR")
    assert [item["timestamp"] for item in hr["observations"]] == [1.0, 2.0]
    assert all(item["timestamp"] <= body["as_of_s"] for item in hr["observations"])
    assert body["events"] == []
    assert body["abp_waveform"] is None
    assert body["prediction_cache_status"] == "NOT_READY"


def test_uc05_diagnostic_cache_is_not_served_while_model_contract_is_blocked(tmp_path):
    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    interpreted = {"kind": "temperature_scaled_probability", "value": 0.2, "calibrated": True}
    row = {
        "case_id": "1",
        "model_id": UC05_CONTRACT.model_id,
        "model_version": UC05_CONTRACT.model_version,
        "prediction_time": 2.0,
        "input_window_start": 0.0,
        "input_window_end": 2.0,
        "task": UC05_CONTRACT.task,
        "raw_output": -1.0,
        "interpreted_output": interpreted,
        "horizon_minutes_or_null": 1,
        "horizon_if_applicable": 1,
        "output": {"raw": -1.0, "interpreted": interpreted},
        "output_semantics": "temperature_scaled_probability",
        "calibration_status": "CALIBRATED",
        "missing_features": [],
        "input_window": {"start_time_s": 0.0, "end_time_s": 2.0},
        "artifact_hash": UC05_CONTRACT.artifact_sha256,
        "data_coverage": 0.8,
        "quality": "DEGRADED",
        "calibrated_or_not": True,
        "threshold_if_verified": None,
        "artifact_sha256": UC05_CONTRACT.artifact_sha256,
        "preprocessing_version": UC05_PREPROCESSING_VERSION,
        "input_contract_mode": "STRICT_SIGNAL_SCHEMA",
    }
    runtime.uc05_batch.cache.write_case("1", {
        "schema_version": 1,
        "case_id": "1",
        "dataset_version": "1.0.1",
        "case_duration_seconds": 10.0,
        "raw_sha256": hashlib.sha256(b"local test fixture; not a model input").hexdigest(),
        "model_id": UC05_CONTRACT.model_id,
        "model_version": UC05_CONTRACT.model_version,
        "artifact_sha256": UC05_CONTRACT.artifact_sha256,
        "preprocessing_version": UC05_PREPROCESSING_VERSION,
        "input_contract_mode": "STRICT_SIGNAL_SCHEMA",
        "candidate_window_count": 1,
        "inference_window_count": 1,
        "abstained_windows": [],
        "predictions": [row],
    })
    blocked = {
        "model_id": UC05_CONTRACT.model_id,
        "model_version": UC05_CONTRACT.model_version,
        "readiness_status": "BLOCKED_CONTRACT_MISMATCH",
        "inference_ready": False,
        "blockers": ["model input contract is unresolved"],
    }
    runtime.models.status = lambda _model_id: blocked
    runtime.models.predict = lambda *_args, **_kwargs: []

    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        cached = client.get("/api/v1/cases/1/predictions/uc05", params={"as_of_s": 3.0})
        on_demand = client.get("/api/v1/cases/1/predictions/uc05", params={"prediction_time_s": 5.0})
        view = client.get("/api/v1/cases/1/uc05-view", params={"as_of_s": 3.0, "window_seconds": 3.0})
        cache_status = client.get("/api/v1/cases/1/predictions/uc05/cache-status")

    assert cached.status_code == 503
    assert cached.json()["error"]["code"] == "MODEL_NOT_READY"
    assert cached.json()["error"]["details"]["readiness_status"] == "BLOCKED_CONTRACT_MISMATCH"
    assert cached.json()["error"]["details"]["blockers"] == blocked["blockers"]
    assert "predictions" not in cached.json()
    assert on_demand.status_code == 503
    assert on_demand.json()["error"]["code"] == "MODEL_NOT_READY"
    assert view.status_code == 200
    assert view.json()["predictions"] is None
    assert view.json()["prediction_cache_status"] == "NOT_READY"
    assert cache_status.status_code == 200
    assert cache_status.json()["cache_status"] == "NOT_READY"
    assert cache_status.json()["prediction_count"] == 0
    assert runtime.replay_stream.delta("1", 0.0, 3.0)["predictions"]["uc05"] is None


def _eligible_uc05_window() -> InferenceWindow:
    sample_indices = np.arange(30_000, dtype=np.float32)
    numeric = np.tile(
        np.array([98, 35, 14, 450, 6, 18, 5, 15, 10, 45, 50, 0, 45, 450, 18, 12, 75, 1], dtype=np.float32),
        (600, 1),
    )
    return InferenceWindow(
        case_id="1",
        window_start_s=0,
        window_end_s=600,
        prediction_time_s=600,
        numeric_values=numeric,
        numeric_feature_order=UC05_FEATURE_ORDER,
        numeric_sample_rate_hz=1,
        numeric_start_time_s=0,
        static_features={"age": 77, "bmi": 24, "asa": 2, "sex_male": 0, "weight": 65, "height": 165, "emop": 0},
        waveforms={
            "capno": SignalWindow(20 + 5 * np.sin(np.arange(3750, dtype=np.float32) / 30), 62.5, 540, "Primus/CO2", "mmHg"),
            "awp": SignalWindow(10 + 2 * np.sin(np.arange(3750, dtype=np.float32) / 24), 62.5, 540, "Primus/AWP", "hPa"),
            "ppg": SignalWindow(0.4 + 0.1 * np.sin(sample_indices / 60), 500, 540, "SNUADC/PLETH"),
        },
        selected_tracks={
            "SPO2": "Solar8000/PLETH_SPO2",
            "capno": "Primus/CO2",
            "awp": "Primus/AWP",
            "ppg": "SNUADC/PLETH",
        },
        source_available_through_s=600,
    )


def _eligible_uc05_series(window: InferenceWindow) -> VitalDBCaseSignals:
    duration_seconds = 1200
    waveform_values = {}
    waveform_rates_hz = {}
    waveform_track_names = {}
    track_metadata = {
        "Solar8000/PLETH_SPO2": LoadedTrackMetadata(
            "Solar8000/PLETH_SPO2", "Solar8000", "NUMERIC", None, 1.0,
            "%", 1200, 1200, [0.0, float(duration_seconds)],
        ),
    }
    for name, signal in window.waveforms.items():
        rate = signal.sample_rate_hz
        values = np.zeros(int(duration_seconds * rate), dtype=np.float32)
        start = int(signal.start_time_s * rate)
        values[start : start + signal.values.size] = signal.values
        waveform_values[name] = values
        waveform_rates_hz[name] = rate
        waveform_track_names[name] = signal.source_track
        track_metadata[signal.source_track] = LoadedTrackMetadata(
            signal.source_track,
            "VitalDB",
            "WAVEFORM",
            rate,
            None,
            signal.unit,
            int(values.size),
            int(values.size),
            [0.0, float(duration_seconds)],
        )
    numeric_values = np.tile(window.numeric_values[0], (duration_seconds, 1))
    numeric_values[: window.numeric_values.shape[0]] = window.numeric_values
    return VitalDBCaseSignals(
        case_id=window.case_id,
        model_id=UC05_CONTRACT.model_id,
        duration_seconds=float(duration_seconds),
        numeric_values=numeric_values,
        numeric_feature_order=window.numeric_feature_order,
        numeric_track_names={"SPO2": "Solar8000/PLETH_SPO2"},
        waveform_values=waveform_values,
        waveform_rates_hz=waveform_rates_hz,
        waveform_track_names=waveform_track_names,
        static_features=dict(window.static_features),
        selected_tracks=dict(window.selected_tracks),
        track_metadata=track_metadata,
        pre_roll_seconds=0,
        history_seconds=600,
    )


def test_uc05_ready_status_serves_eligible_fixed_window_contract_output(tmp_path):
    settings = _backend_fixture(tmp_path)
    catalog_path = settings.data_root / "manifests" / "vitaldb_case_catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    catalog_case = catalog["cases"][0]
    catalog_case.update(
        duration_seconds=1200.0,
        uc05_eligible=True,
        number_of_valid_windows={"uc04": 1, "uc05": 1},
        inference_readiness={"uc04": "READY", "uc05": "READY"},
    )
    catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
    manifest_path = settings.data_root / "vitaldb" / "manifests" / "1.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["recording"]["duration_seconds"] = 1200.0
    manifest["eligibility"]["uc05"] = True
    manifest["valid_windows"] = {"uc05": [{"prediction_time_seconds": 600.0}]}
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    configured_settings = Settings.from_env()
    runtime_settings = replace(
        settings,
        model_root=configured_settings.model_root,
        uc05_model_path=configured_settings.uc05_model_path,
        model_registry_path=configured_settings.model_registry_path,
        model_device="cpu",
    )
    runtime = BackendRuntime(settings=runtime_settings, load_models=False, vitaldb_module=_FakeVitalDB)
    service = runtime.models.services[UC05_CONTRACT.model_id]
    checkpoint_path = runtime_settings.uc05_model_path or (
        runtime_settings.model_root / UC05_CONTRACT.artifact_path
    )
    required_artifacts = [checkpoint_path, *(
        checkpoint_path.parent / name for name in UC05_CONTRACT.supporting_artifacts
    )]
    missing_artifacts = [path.name for path in required_artifacts if not path.is_file()]
    if missing_artifacts:
        pytest.skip(
            "configured UC05 checkpoint/supporting artifacts are unavailable: "
            + ", ".join(missing_artifacts)
        )
    service.load_model()

    class _TrustedCheckpointForward:
        def __call__(self, *_inputs):
            return torch.tensor([[0.1, 0.2, 0.3]]), torch.tensor([0.4])

    service.model = _TrustedCheckpointForward()
    fixed_window = _eligible_uc05_window()
    series = _eligible_uc05_series(fixed_window)
    runtime.vitaldb.get_model_series = lambda _case_id, _model_id: series
    selected_windows = []
    preprocessing_reports = []
    predict_window = service.predict_window
    prepare = runtime.models.preprocessor.prepare

    def record_preprocessing(model_id, window, *, case_signals=None):
        result = prepare(model_id, window, case_signals=case_signals)
        preprocessing_reports.append(result.report)
        return result

    runtime.models.preprocessor.prepare = record_preprocessing

    def record_selected_window(window, *, prepared_input=None):
        selected_windows.append(window)
        return predict_window(window, prepared_input=prepared_input)

    service.predict_window = record_selected_window
    assert runtime.models.status(UC05_CONTRACT.model_id)["inference_ready"] is True
    assert runtime.case_service.list_cases()["cases"][0]["uc05_eligible"] is True

    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        cases = client.get("/api/v1/cases")
        response = client.get(
            "/api/v1/cases/1/predictions/uc05", params={"prediction_time_s": 600.0}
        )

    assert cases.json()["cases"][0]["uc05_eligible"] is True
    assert response.status_code == 200
    assert len(preprocessing_reports) == 1
    assert preprocessing_reports[0]["input_eligible"] is True
    assert preprocessing_reports[0]["inference_eligible"] is True
    assert len(selected_windows) == 1
    selected = selected_windows[0]
    assert selected.case_id == fixed_window.case_id
    assert selected.window_start_s == fixed_window.window_start_s
    assert selected.window_end_s == fixed_window.window_end_s
    assert selected.prediction_time_s == fixed_window.prediction_time_s
    assert selected.selected_tracks == fixed_window.selected_tracks
    np.testing.assert_array_equal(selected.numeric_values, fixed_window.numeric_values)
    for name in fixed_window.waveforms:
        np.testing.assert_array_equal(
            selected.waveforms[name].values, fixed_window.waveforms[name].values
        )
    body = response.json()
    assert body["model_id"] == UC05_CONTRACT.model_id
    assert body["available_horizons_minutes"] == list(UC05_CONTRACT.prediction_horizons)
    assert UC05_CONTRACT.calibration_method is not None
    assert all(item["task"] == UC05_CONTRACT.task for item in body["predictions"][:3])
    assert all(item["calibration_status"] == "CALIBRATED" for item in body["predictions"][:3])
    assert all(item["artifact_hash"] == UC05_CONTRACT.artifact_sha256 for item in body["predictions"])


@pytest.mark.parametrize(
    ("blocked_model_id", "health_component"),
    [
        (UC04_CONTRACT.model_id, "uc04_model"),
        (UC05_CONTRACT.model_id, "uc05_model"),
    ],
)
def test_readiness_routes_and_uc05_error_share_real_manager_state(
    tmp_path, blocked_model_id, health_component
):
    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    for model_id, service in runtime.models.services.items():
        service.readiness_status = "INTEGRATION_READY"
        service.readiness_blockers = ()
        service.model = object()
    blocked_service = runtime.models.services[blocked_model_id]
    blocked_service.readiness_status = "BLOCKED_CONTRACT_MISMATCH"
    blocked_service.readiness_blockers = ("model input contract is unresolved",)
    expected = runtime.models.status(blocked_model_id)

    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        ready = client.get("/api/v1/health/ready")
        models = client.get("/api/v1/models")
        model_status = client.get(f"/api/v1/models/{blocked_model_id}/status")
        prediction = (
            client.get("/api/v1/cases/1/predictions/uc05", params={"prediction_time_s": 600})
            if blocked_model_id == UC05_CONTRACT.model_id
            else None
        )

    listed_model = next(item for item in models.json()["models"] if item["model_id"] == blocked_model_id)
    individual = model_status.json()
    for rendered in (listed_model, individual):
        assert rendered["inference_ready"] == expected["inference_ready"]
        assert rendered["readiness_status"] == expected["readiness_status"]
        assert rendered["blockers"] == expected["blockers"]
    assert ready.status_code == 503
    assert ready.json()["ready"] is False
    assert ready.json()["components"][health_component] == expected["readiness_status"]
    assert expected["readiness_status"] == "BLOCKED_CONTRACT_MISMATCH"
    assert expected["inference_ready"] is False
    if prediction is not None:
        assert prediction.status_code == 503
        assert prediction.json()["error"]["code"] == "MODEL_NOT_READY"
        assert prediction.json()["error"]["details"]["readiness_status"] == expected["readiness_status"]
        assert prediction.json()["error"]["details"]["blockers"] == expected["blockers"]


def test_eligible_uc05_case_remains_selectable_when_runtime_is_blocked(tmp_path):
    settings = _backend_fixture(tmp_path)
    catalog_path = settings.data_root / "manifests" / "vitaldb_case_catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    catalog["cases"][0].update(
        duration_seconds=1200.0,
        uc05_eligible=True,
        number_of_valid_windows={"uc04": 1, "uc05": 1},
        inference_readiness={"uc04": "READY", "uc05": "READY"},
    )
    catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
    manifest_path = settings.data_root / "vitaldb" / "manifests" / "1.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["recording"]["duration_seconds"] = 1200.0
    manifest["eligibility"]["uc05"] = True
    manifest["valid_windows"] = {"uc05": [{"prediction_time_seconds": 600.0}]}
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    service = runtime.models.services[UC05_CONTRACT.model_id]
    # Eligibility is independently established by the strict input validator.
    service.validate_inputs(_eligible_uc05_window())
    service.model = object()
    service.readiness_status = "BLOCKED_CONTRACT_MISMATCH"
    service.readiness_blockers = ("model input contract is unresolved",)
    expected = runtime.models.status(UC05_CONTRACT.model_id)
    assert expected["inference_ready"] is False

    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        catalog_response = client.get("/api/v1/cases")
        detail = client.get("/api/v1/cases/1")
        session = client.post("/api/v1/replay/sessions", json={"case_id": "1"})
        status = client.get(f"/api/v1/models/{UC05_CONTRACT.model_id}/status")
        prediction = client.get("/api/v1/cases/1/predictions/uc05", params={"prediction_time_s": 600})

    row = catalog_response.json()["cases"][0]
    assert row["uc05_eligible"] is True
    assert row["number_of_valid_windows"]["uc05"] == 1
    # This field describes catalog-time readiness, never the running model.
    assert row["inference_readiness"]["uc05"] == "READY"
    assert detail.json()["eligibility"]["uc05"] is True
    assert session.status_code == 201
    assert session.json()["uc05_model_status"] == expected["readiness_status"]
    assert status.json()["inference_ready"] is False
    assert prediction.status_code == 503
    assert prediction.json()["error"]["code"] == "MODEL_NOT_READY"
    assert prediction.json()["error"]["details"]["blockers"] == expected["blockers"]


def test_uc04_blocked_runtime_does_not_expose_cached_predictions(tmp_path):
    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    service = runtime.models.services[UC04_CONTRACT.model_id]
    service.model = object()
    service.readiness_status = "BLOCKED_CONTRACT_MISMATCH"
    service.readiness_blockers = ("model input contract is unresolved",)
    expected = runtime.models.status(UC04_CONTRACT.model_id)
    cache_reads = []
    runtime.uc04_batch.cache.status = lambda _case_id: {
        "case_id": "1",
        "model_id": UC04_CONTRACT.model_id,
        "model_version": UC04_CONTRACT.model_version,
        "artifact_sha256": UC04_CONTRACT.artifact_sha256,
        "cache_status": "READY",
        "prediction_count": 1,
        "inference_window_count": 1,
    }

    def cached_predictions(case_id, **kwargs):
        cache_reads.append(case_id)
        return {"case_id": case_id, "model_id": UC04_CONTRACT.model_id, "predictions": []}

    runtime.uc04_batch.cache.read_predictions = cached_predictions
    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        cached = client.get("/api/v1/cases/1/predictions/uc04", params={"as_of_s": 3.0})
        view = client.get("/api/v1/cases/1/uc04-view", params={"as_of_s": 3.0, "window_seconds": 3.0})
        cache_status = client.get("/api/v1/cases/1/predictions/uc04/cache-status")
        delta = runtime.replay_stream.delta("1", 0.0, 3.0)
        snapshot = runtime.replay_stream.snapshot("1", 3.0)

    assert cached.status_code == 503
    assert cached.json()["error"]["code"] == "MODEL_NOT_READY"
    assert cached.json()["error"]["details"]["readiness_status"] == expected["readiness_status"]
    assert cached.json()["error"]["details"]["blockers"] == expected["blockers"]
    assert "predictions" not in cached.json()
    assert view.status_code == 200
    assert view.json()["predictions"] is None
    assert view.json()["prediction_cache_status"] == "NOT_READY"
    assert view.json()["signals"]  # Recorded observations remain available.
    assert cache_status.json()["cache_status"] == "NOT_READY"
    assert cache_status.json()["prediction_count"] == 0
    assert delta["predictions"]["uc04"] is None
    assert snapshot["uc04_view"]["predictions"] is None
    assert cache_reads == []


def test_uc04_view_delivers_explicit_current_window_abstention_evidence(tmp_path):
    """The replay view must carry persisted abstention evidence to the UI."""
    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    service = runtime.models.services[UC04_CONTRACT.model_id]
    service.model = object()
    service.readiness_status = "INTEGRATION_READY"
    service.readiness_blockers = ()
    runtime.uc04_batch.cache.write_case("1", {
        "schema_version": 1,
        "case_id": "1",
        "dataset": "VitalDB",
        "dataset_version": "1.0.1",
        "case_duration_seconds": 10.0,
        "raw_sha256": "fixture-source",
        "model_id": UC04_CONTRACT.model_id,
        "model_version": UC04_CONTRACT.model_version,
        "artifact_sha256": UC04_CONTRACT.artifact_sha256,
        "task": UC04_CONTRACT.task,
        "output_semantics": UC04_CONTRACT.output_semantics["score"],
        "calibrated_or_not": False,
        "available_horizons_minutes": list(UC04_CONTRACT.prediction_horizons),
        "threshold_if_verified": {"5": 0.5, "10": None, "15": None},
        "preprocessing_version": UC04_PREPROCESSING_VERSION,
        "candidate_window_count": 1,
        "inference_window_count": 0,
        "abstained_windows": [{
            "prediction_time": 3.0,
            "window_start_s": 0.0,
            "window_end_s": 3.0,
            "code": "INPUT_NOT_ELIGIBLE",
            "message": "fixture abstention",
        }],
        "predictions": [],
    })

    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        response = client.get("/api/v1/cases/1/uc04-view", params={"as_of_s": 3.0, "window_seconds": 3.0})
        cache_status = client.get("/api/v1/cases/1/predictions/uc04/cache-status")

    assert response.status_code == 200
    body = response.json()
    assert body["predictions"]["window_eligibility"] == "ABSTAINED"
    assert body["predictions"]["window_prediction_time_s"] == 3.0
    assert body["predictions"]["abstained_windows"] == [{
        "prediction_time": 3.0,
        "window_start_s": 0.0,
        "window_end_s": 3.0,
        "code": "INPUT_NOT_ELIGIBLE",
        "message": "fixture abstention",
    }]
    assert body["prediction_cache"]["window_status"] == "ABSTAINED"
    assert body["prediction_cache"]["window_reason"] == "INPUT_NOT_ELIGIBLE: fixture abstention"
    assert body["prediction_cache"]["abstained_windows"] == body["predictions"]["abstained_windows"]
    assert body["model"]["task"] == UC04_CONTRACT.task
    assert cache_status.status_code == 200
    assert cache_status.json()["abstained_window_count"] == 1
    assert cache_status.json()["abstained_windows"] == body["predictions"]["abstained_windows"]


def test_uc05_view_delivers_explicit_current_window_abstention_evidence(tmp_path):
    """UC05 nested cache metadata must preserve explicit abstentions too."""
    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    service = runtime.models.services[UC05_CONTRACT.model_id]
    service.model = object()
    service.readiness_status = "INTEGRATION_READY"
    service.readiness_blockers = ()
    abstained = {
        "prediction_time": 3.0,
        "window_start_s": 0.0,
        "window_end_s": 3.0,
        "code": "INPUT_NOT_ELIGIBLE",
        "message": "fixture abstention",
    }
    runtime.uc05_batch.cache.write_case("1", {
        "schema_version": 1,
        "case_id": "1",
        "dataset_version": "1.0.1",
        "case_duration_seconds": 10.0,
        "raw_sha256": "fixture-source",
        "model_id": UC05_CONTRACT.model_id,
        "model_version": UC05_CONTRACT.model_version,
        "artifact_sha256": UC05_CONTRACT.artifact_sha256,
        "preprocessing_version": UC05_PREPROCESSING_VERSION,
        "input_contract_mode": "STRICT_SIGNAL_SCHEMA",
        "candidate_window_count": 1,
        "inference_window_count": 0,
        "abstained_windows": [abstained],
        "predictions": [],
    })

    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        response = client.get("/api/v1/cases/1/uc05-view", params={"as_of_s": 3.0, "window_seconds": 3.0})
        cache_status = client.get("/api/v1/cases/1/predictions/uc05/cache-status")

    assert response.status_code == 200
    body = response.json()
    assert body["predictions"]["window_eligibility"] == "ABSTAINED"
    assert body["predictions"]["abstained_windows"] == [abstained]
    assert body["prediction_cache"]["window_status"] == "ABSTAINED"
    assert body["prediction_cache"]["abstained_windows"] == [abstained]
    assert cache_status.status_code == 200
    assert cache_status.json()["abstained_window_count"] == 1
    assert cache_status.json()["abstained_windows"] == [abstained]


@pytest.mark.parametrize("module", ["uc04", "uc05"])
def test_view_cache_metadata_does_not_leak_future_full_cache_abstentions(tmp_path, module):
    """Standalone cache status is full-cache; replay views remain as-of bounded."""
    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    contract = UC04_CONTRACT if module == "uc04" else UC05_CONTRACT
    service = runtime.models.services[contract.model_id]
    service.model = object()
    service.readiness_status = "INTEGRATION_READY"
    service.readiness_blockers = ()
    future_abstention = {
        "prediction_time": 8.0,
        "window_start_s": 5.0,
        "window_end_s": 8.0,
        "code": "INPUT_NOT_ELIGIBLE",
        "message": "future fixture abstention",
    }
    cache = runtime.uc04_batch.cache if module == "uc04" else runtime.uc05_batch.cache
    common = {
        "schema_version": 1,
        "case_id": "1",
        "dataset_version": "1.0.1",
        "case_duration_seconds": 10.0,
        "raw_sha256": "fixture-source",
        "model_id": contract.model_id,
        "model_version": contract.model_version,
        "artifact_sha256": contract.artifact_sha256,
        "preprocessing_version": UC04_PREPROCESSING_VERSION if module == "uc04" else UC05_PREPROCESSING_VERSION,
        "candidate_window_count": 1,
        "inference_window_count": 0,
        "abstained_windows": [future_abstention],
        "predictions": [],
    }
    if module == "uc04":
        common.update({
            "dataset": "VitalDB",
            "task": UC04_CONTRACT.task,
            "output_semantics": UC04_CONTRACT.output_semantics["score"],
            "calibrated_or_not": False,
            "available_horizons_minutes": list(UC04_CONTRACT.prediction_horizons),
            "threshold_if_verified": {"5": 0.5, "10": None, "15": None},
        })
    else:
        common["input_contract_mode"] = "STRICT_SIGNAL_SCHEMA"
    cache.write_case("1", common)

    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        view = client.get(f"/api/v1/cases/1/{module}-view", params={"as_of_s": 3.0, "window_seconds": 3.0})
        status = client.get(f"/api/v1/cases/1/predictions/{module}/cache-status")

    assert view.status_code == 200
    assert view.json()["prediction_cache"]["abstained_window_count"] == 0
    assert view.json()["prediction_cache"]["abstained_windows"] == []
    assert status.status_code == 200
    assert status.json()["abstained_window_count"] == 1
    assert status.json()["abstained_windows"] == [future_abstention]


@pytest.mark.parametrize("module", ["uc04", "uc05"])
@pytest.mark.parametrize("runtime_ready", [False, True])
@pytest.mark.parametrize("failed_operation", ["status", "read"])
def test_prediction_cache_failure_preserves_recorded_view_and_replay_snapshot(
    tmp_path, module, runtime_ready, failed_operation,
):
    from backend.app.core.errors import cache_not_ready

    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    contract = UC04_CONTRACT if module == "uc04" else UC05_CONTRACT
    service = runtime.models.services[contract.model_id]
    service.model = object()
    service.readiness_status = "INTEGRATION_READY" if runtime_ready else "BLOCKED_CONTRACT_MISMATCH"
    service.readiness_blockers = () if runtime_ready else ("model input contract is unresolved",)
    cache = runtime.uc04_batch.cache if module == "uc04" else runtime.uc05_batch.cache
    calls = []

    def cache_status(_case_id):
        calls.append("status")
        if failed_operation == "status":
            raise cache_not_ready("Prediction cache is corrupt")
        return {"cache_status": "READY"}

    def cache_read(_case_id, **_kwargs):
        calls.append("read")
        raise cache_not_ready("Prediction cache is corrupt")

    cache.status = cache_status
    cache.read_predictions = cache_read
    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        response = client.get(
            f"/api/v1/cases/1/{module}-view",
            params={"as_of_s": 3.0, "window_seconds": 3.0},
        )
        snapshot = runtime.replay_stream.snapshot("1", 3.0)

    assert response.status_code == 200
    for view in (response.json(), snapshot[f"{module}_view"]):
        assert view["predictions"] is None
        assert view["prediction_cache_status"] == "NOT_READY"
        assert view["prediction_cache"]["cache_status"] == "NOT_READY"
        assert view["available_tracks"]
        if module == "uc04":
            assert view["signals"][0]["observations"][0]["value"] == 70.0
        else:
            assert view["waveforms"]["ppg"]["values"]
    expected_calls = ["status"] if failed_operation == "status" else ["status", "read"]
    assert calls == (expected_calls * 2 if runtime_ready else [])


def test_liveness_returns_stable_path_free_backend_identity(tmp_path, monkeypatch):
    from backend.app.core.build_info import get_backend_build_id
    monkeypatch.delenv("SAFEANES_BUILD_ID", raising=False)
    with _client(tmp_path) as client:
        first = client.get("/api/v1/health/live")
        second = client.get("/api/v1/health/live")
        settings = client.app.state.runtime.settings
    assert first.status_code == 200
    assert first.json()["service_name"] == "safeanes-backend"
    assert first.json()["build_id"] == second.json()["build_id"]
    assert first.json()["build_id"] == get_backend_build_id()
    assert len(first.json()["build_id"]) == 64
    assert str(settings.model_root) not in first.text
    assert str(settings.data_root) not in first.text


def test_liveness_uses_explicit_build_identity_captured_in_settings(tmp_path, monkeypatch):
    monkeypatch.setenv("SAFEANES_BUILD_ID", "release-test-17")
    with _client(tmp_path) as client:
        monkeypatch.setenv("SAFEANES_BUILD_ID", "different-process-value")
        live = client.get("/api/v1/health/live")
        ready = client.get("/api/v1/health/ready")
    assert live.json()["build_id"] == "release-test-17"
    assert ready.json()["build_id"] == "release-test-17"
    assert ready.status_code == 503
    assert ready.json()["ready"] is False


def test_health_identity_fields_are_required_in_pydantic_and_openapi(tmp_path):
    from pydantic import ValidationError
    from backend.app.schemas.api import HealthResponse
    for missing in ("service_name", "build_id"):
        values = {"service_name": "safeanes-backend", "build_id": "release-17", "status": "alive"}
        del values[missing]
        with pytest.raises(ValidationError):
            HealthResponse(**values)
    with _client(tmp_path) as client:
        schema = client.get("/openapi.json").json()["components"]["schemas"]["HealthResponse"]
    assert {"service_name", "build_id"}.issubset(schema["required"])


def test_uc04_and_uc05_prediction_sources_separate_live_and_cache(tmp_path):
    settings = _backend_fixture(tmp_path)
    runtime = BackendRuntime(settings=settings, load_models=False, vitaldb_module=_FakeVitalDB)
    for model_id in (UC04_CONTRACT.model_id, UC05_CONTRACT.model_id):
        service = runtime.models.services[model_id]
        service.model = object()
        service.readiness_status = "INTEGRATION_READY"
        service.readiness_blockers = ()

    runtime.models.predict = lambda *_args, **_kwargs: []
    runtime.uc04_batch.cache.read_predictions = lambda case_id, **_kwargs: {
        "case_id": case_id,
        "model_id": UC04_CONTRACT.model_id,
        "predictions": [],
        "source": "OFFLINE_CACHE",
    }
    runtime.uc05_batch.cache.read_predictions = lambda case_id, **_kwargs: {
        "case_id": case_id,
        "model_id": UC05_CONTRACT.model_id,
        "predictions": [],
        "source": "OFFLINE_CACHE",
    }

    with TestClient(create_app(settings=settings, runtime=runtime)) as client:
        responses = {}
        for model in ("uc04", "uc05"):
            responses[(model, "live")] = client.get(
                f"/api/v1/cases/1/predictions/{model}",
                params={"prediction_time_s": 5},
            )
            responses[(model, "cache")] = client.get(
                f"/api/v1/cases/1/predictions/{model}",
                params={"as_of_s": 5},
            )

    assert all(response.status_code == 200 for response in responses.values())
    assert responses[("uc04", "live")].json()["source"] == "LIVE_INFERENCE"
    assert responses[("uc05", "live")].json()["source"] == "LIVE_INFERENCE"
    assert responses[("uc04", "cache")].json()["source"] == "OFFLINE_CACHE"
    assert responses[("uc05", "cache")].json()["source"] == "OFFLINE_CACHE"
