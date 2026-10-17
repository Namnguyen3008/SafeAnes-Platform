from __future__ import annotations

import asyncio
import threading
from types import SimpleNamespace

import pytest

from backend.app.services.inference import inference_worker
from backend.app.services.inference.inference_worker import LiveInferenceWorker
from backend.app.services.replay.manager import ReplayManager
from backend.app.services.replay.replay_scheduler import ReplayInferenceScheduler


import json

from backend.app.ml.contracts.prediction import ModelPrediction

def _session(
    *,
    status: str = "PLAYING",
    current_time_seconds: float = 100.0,
    generation: int = 4,
) -> dict:
    return {
        "session_id": "session-1",
        "case_id": "case-1",
        "status": status,
        "current_time_s": current_time_seconds,
        "current_time_seconds": current_time_seconds,
        "speed": 1,
        "generation": generation,
    }


def _schedule(scheduler: ReplayInferenceScheduler, session: dict) -> list:
    try:
        return asyncio.run(scheduler.schedule_if_due(session, target_model_ids=("uc04",)))
    except TypeError as exc:
        pytest.fail(f"scheduler must accept a replay session snapshot: {exc}")


def _result(session: dict, model_id: str, prediction_time: float) -> inference_worker.LiveInferenceResult:
    return inference_worker.LiveInferenceResult(
        session_id=session["session_id"],
        generation=session["generation"],
        case_id=session["case_id"],
        model_id=model_id,
        prediction_time=prediction_time,
        predictions=[],
        coverage=1.0,
        missing_features=[],
        latency_ms=1.0,
    )


def test_live_inference_result_is_marked_as_live() -> None:
    payload = _result(_session(), "uc04", 125.0).as_dict()

    assert payload["event"] == "inference_result"
    assert payload["source"] == "LIVE_INFERENCE"



def test_local_worker_serializes_model_predictions_for_sse() -> None:
    model_id = "SafeAnes-UC04-HypoFormer"
    prediction = ModelPrediction(
        model_id=model_id,
        model_version="test-model-v1",
        case_id="case-1",
        window_start=0.0,
        window_end=123.0,
        prediction_time=123.0,
        task="test",
        raw_output=0.25,
        interpreted_output={"kind": "test_score", "value": 0.25},
        horizon_if_supported=5,
        quality_status="GOOD",
        data_coverage=1.0,
        missing_features=(),
        preprocessing_version="test-preprocessor-v1",
    )
    prepared = SimpleNamespace(data_coverage=1.0, missing_features=())
    service = SimpleNamespace(
        contract=SimpleNamespace(model_id=model_id),
        predict_window=lambda _window, *, prepared_input: [prediction],
    )

    class Loader:
        def get_window(self, *_args):
            return object(), prepared, {}

    model_manager = SimpleNamespace(
        settings=SimpleNamespace(offload_inference=False),
        _service=lambda _model_id: service,
        _locks={model_id: threading.RLock()},
    )
    worker = LiveInferenceWorker(model_manager, window_loader=Loader())
    try:
        result = worker.execute_sync("session-1", 4, "case-1", model_id, 123.0)
    finally:
        worker.close()

    assert result is not None
    payload = result.as_dict()
    assert json.dumps(payload, allow_nan=False)
    row = payload["predictions"][0]
    assert row["horizon_if_supported"] == 5
    assert row["horizon_minutes_or_null"] == 5
    assert row["raw_output"] == prediction.raw_output
    assert row["interpreted_output"] == prediction.interpreted_output


def test_remote_worker_preserves_preprocessing_quality_metadata() -> None:
    predictions = [{
        "data_coverage": 0.62,
        "missing_features": ["MAP", "SpO2"],
    }]
    model_manager = SimpleNamespace(
        settings=SimpleNamespace(offload_inference=True, inference_url="https://lambda.example"),
        vitaldb=None,
        preprocessor=None,
        predict=lambda case_id, model_id, prediction_time_s: predictions,
    )
    worker = LiveInferenceWorker(model_manager, window_loader=object())

    try:
        result = worker.execute_sync("session-1", 4, "case-1", "uc04", 123.0)
    finally:
        worker.close()

    assert result is not None
    assert result.coverage == 0.62
    assert result.missing_features == ["MAP", "SpO2"]


def test_scheduler_does_not_submit_when_not_playing() -> None:
    class Worker:
        calls = 0

        async def execute_async(self, **kwargs):
            self.calls += 1
            return None

    worker = Worker()
    results = _schedule(ReplayInferenceScheduler(worker), _session(status="PAUSED"))

    assert results == []
    assert worker.calls == 0


def test_scheduler_reevaluates_immediately_for_a_new_generation() -> None:
    class Worker:
        def __init__(self) -> None:
            self.times: list[float] = []

        async def execute_async(self, **kwargs):
            self.times.append(kwargs["prediction_time_s"])
            return _result(
                {
                    "session_id": kwargs["session_id"],
                    "generation": kwargs["generation"],
                    "case_id": kwargs["case_id"],
                },
                kwargs["model_id"],
                kwargs["prediction_time_s"],
            )

    worker = Worker()
    scheduler = ReplayInferenceScheduler(worker)
    first = _session(current_time_seconds=100.0, generation=4)
    restarted = _session(current_time_seconds=100.0, generation=5)

    _schedule(scheduler, first)
    second_results = _schedule(scheduler, restarted)

    assert worker.times == [100.0, 100.0]
    assert len(second_results) == 1
    assert second_results[0].generation == 5


def test_worker_rejects_submission_when_eight_jobs_are_pending() -> None:
    started = threading.Event()
    release = threading.Event()
    worker = LiveInferenceWorker(SimpleNamespace(), window_loader=SimpleNamespace())

    def blocked_inference(*args):
        started.set()
        release.wait(timeout=5)
        return None

    worker.execute_sync = blocked_inference

    async def exercise_capacity() -> None:
        pending = [
            asyncio.create_task(
                worker.execute_async(
                    session_id=f"session-{index}",
                    generation=1,
                    case_id="case-1",
                    model_id="uc04",
                    prediction_time_s=float(index),
                )
            )
            for index in range(8)
        ]
        overflow = asyncio.create_task(
            worker.execute_async(
                session_id="overflow",
                generation=1,
                case_id="case-1",
                model_id="uc04",
                prediction_time_s=9.0,
            )
        )
        try:
            assert await asyncio.to_thread(started.wait, 1.0)
            await asyncio.sleep(0)
            if overflow.done():
                error = overflow.exception()
                assert error is not None
                assert type(error).__name__ == "InferenceCapacityError"
            else:
                pytest.fail("the ninth inference job was queued instead of rejected")
        finally:
            release.set()
            await asyncio.gather(*pending, overflow, return_exceptions=True)
            assert await worker.execute_async(
                session_id="after-release",
                generation=1,
                case_id="case-1",
                model_id="uc04",
                prediction_time_s=10.0,
            ) is None
            worker.close()

    asyncio.run(exercise_capacity())


def test_scheduler_retries_latest_position_after_capacity_is_available() -> None:
    class CapacityOnceWorker:
        def __init__(self) -> None:
            self.times: list[float] = []
            self.reject_next = True

        async def execute_async(self, **kwargs):
            self.times.append(kwargs["prediction_time_s"])
            if self.reject_next:
                self.reject_next = False
                capacity_error = getattr(inference_worker, "InferenceCapacityError", None)
                if capacity_error is None:
                    raise RuntimeError("queue full")
                raise capacity_error()
            return _result(
                {
                    "session_id": kwargs["session_id"],
                    "generation": kwargs["generation"],
                    "case_id": kwargs["case_id"],
                },
                kwargs["model_id"],
                kwargs["prediction_time_s"],
            )

    worker = CapacityOnceWorker()
    scheduler = ReplayInferenceScheduler(worker)

    first = _schedule(scheduler, _session(current_time_seconds=100.0))
    latest = _session(current_time_seconds=137.0)
    second = _schedule(scheduler, latest)

    assert first == []
    assert worker.times == [100.0, 137.0]
    assert len(second) == 1
    assert second[0].prediction_time == 137.0


def test_worker_returns_typed_failure_without_exception_details(caplog) -> None:
    sensitive_detail = "private-window-payload-must-not-escape"

    class FailingWindowLoader:
        def get_window(self, case_id: str, model_id: str, prediction_time_s: float):
            raise RuntimeError(sensitive_detail)

    model_manager = SimpleNamespace(
        settings=SimpleNamespace(offload_inference=False, inference_url=None),
        vitaldb=None,
        preprocessor=None,
    )
    worker = LiveInferenceWorker(model_manager, window_loader=FailingWindowLoader())

    failure = worker.execute_sync("session-1", 7, "case-1", "uc04", 123.0)

    assert failure is not None
    assert type(failure).__name__ == "LiveInferenceFailure"
    payload = failure.as_dict()
    assert payload["event"] == "inference_error"
    assert payload["code"] == "LIVE_INFERENCE_FAILED"
    assert payload["session_id"] == "session-1"
    assert payload["generation"] == 7
    assert payload["case_id"] == "case-1"
    assert payload["prediction_time"] == 123.0
    assert sensitive_detail not in repr(payload)
    assert sensitive_detail not in caplog.text
    worker.close()


@pytest.mark.parametrize("restart_method", ("play", "resume"))
def test_restart_from_completed_session_advances_generation(restart_method: str) -> None:
    manager = ReplayManager()
    created = manager.create(case_id="case-1", duration_seconds=30.0, start_time_s=0.0, speed=1)
    completed = manager.seek(created["session_id"], 30.0)

    restarted = getattr(manager, restart_method)(created["session_id"])

    assert restarted["status"] == "PLAYING"
    assert restarted["current_time_s"] == 0.0
    assert restarted["generation"] == completed["generation"] + 1
    manager.close()
