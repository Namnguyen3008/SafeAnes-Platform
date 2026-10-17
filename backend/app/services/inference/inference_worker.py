from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import logging
import math
import threading
import time
from typing import Any

from backend.app.services.inference.model_manager import ModelManager
from backend.app.services.replay.window_loader import WindowLoader

logger = logging.getLogger("safeanes.inference_worker")
MAX_PENDING_JOBS = 8


@dataclass(frozen=True)
class LiveInferenceResult:
    session_id: str
    generation: int
    case_id: str
    model_id: str
    prediction_time: float
    predictions: list[dict[str, Any]]
    coverage: float | None
    missing_features: list[str]
    latency_ms: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "event": "inference_result",
            "session_id": self.session_id,
            "generation": self.generation,
            "case_id": self.case_id,
            "model_id": self.model_id,
            "prediction_time": self.prediction_time,
            "predictions": self.predictions,
            "source": "LIVE_INFERENCE",
            "coverage": self.coverage,
            "missing_features": self.missing_features,
            "latency_ms": self.latency_ms,
        }


@dataclass(frozen=True)
class LiveInferenceFailure:
    session_id: str
    generation: int
    case_id: str
    model_id: str
    prediction_time: float
    code: str = "LIVE_INFERENCE_FAILED"

    def as_dict(self) -> dict[str, Any]:
        return {
            "event": "inference_error",
            "session_id": self.session_id,
            "generation": self.generation,
            "case_id": self.case_id,
            "model_id": self.model_id,
            "prediction_time": self.prediction_time,
            "code": self.code,
        }


class InferenceCapacityError(RuntimeError):
    """Raised when the bounded live-inference queue is full."""

    def __init__(self) -> None:
        super().__init__("live inference worker is at capacity")


class LiveInferenceWorker:
    """Dedicated background worker executing PyTorch inference on CPU/GPU.
    
    Ensures model weights are held in RAM/VRAM as singletons and inference
    never blocks the FastAPI event loop.
    """

    def __init__(self, model_manager: ModelManager, window_loader: WindowLoader | None = None) -> None:
        self.model_manager = model_manager
        self.window_loader = window_loader or WindowLoader(model_manager.vitaldb, model_manager.preprocessor)
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="LiveInferenceWorker")
        self._pending_lock = threading.Lock()
        self._pending_jobs = 0

    def execute_sync(
        self,
        session_id: str,
        generation: int,
        case_id: str,
        model_id: str,
        prediction_time_s: float,
    ) -> LiveInferenceResult | LiveInferenceFailure | None:
        """Run synchronized inference within a thread worker."""
        t0 = time.perf_counter()
        try:
            if getattr(self.model_manager.settings, "offload_inference", False) and getattr(self.model_manager.settings, "inference_url", None):
                predictions = self.model_manager.predict(case_id, model_id, prediction_time_s)
                if not predictions or not isinstance(predictions[0], dict):
                    raise ValueError("remote inference did not return prediction metadata")
                prediction_metadata = predictions[0]
                coverage = prediction_metadata.get("data_coverage")
                missing_features = prediction_metadata.get("missing_features")
                if (
                    isinstance(coverage, bool)
                    or not isinstance(coverage, (int, float))
                    or not math.isfinite(float(coverage))
                    or not 0.0 <= float(coverage) <= 1.0
                    or not isinstance(missing_features, list)
                    or any(not isinstance(feature, str) for feature in missing_features)
                ):
                    raise ValueError("remote inference returned invalid quality metadata")
                latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                return LiveInferenceResult(
                    session_id=session_id,
                    generation=generation,
                    case_id=case_id,
                    model_id=model_id,
                    prediction_time=prediction_time_s,
                    predictions=predictions,
                    coverage=float(coverage),
                    missing_features=list(missing_features),
                    latency_ms=latency_ms,
                )

            extracted = self.window_loader.get_window(case_id, model_id, prediction_time_s)
            if extracted is None:
                return None
            window, prepared_input, report = extracted
            
            service = self.model_manager._service(model_id)
            with self.model_manager._locks[service.contract.model_id]:
                raw_predictions = service.predict_window(window, prepared_input=prepared_input)
            predictions = []
            for raw_prediction in raw_predictions:
                prediction = (
                    raw_prediction.as_dict()
                    if callable(getattr(raw_prediction, "as_dict", None))
                    else raw_prediction
                )
                if isinstance(prediction, dict) and "horizon_minutes_or_null" not in prediction:
                    prediction = {
                        **prediction,
                        "horizon_minutes_or_null": prediction.get("horizon_if_supported"),
                    }
                predictions.append(prediction)
            
            latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            coverage = None
            missing: list[str] = []
            if hasattr(prepared_input, "data_coverage"):
                coverage = float(prepared_input.data_coverage)
            if hasattr(prepared_input, "missing_features"):
                missing = list(prepared_input.missing_features)

            return LiveInferenceResult(
                session_id=session_id,
                generation=generation,
                case_id=case_id,
                model_id=model_id,
                prediction_time=prediction_time_s,
                predictions=predictions,
                coverage=coverage,
                missing_features=missing,
                latency_ms=latency_ms,
            )
        except Exception:
            logger.warning("Live inference failed for model=%s code=LIVE_INFERENCE_FAILED", model_id)
            return LiveInferenceFailure(
                session_id=session_id,
                generation=generation,
                case_id=case_id,
                model_id=model_id,
                prediction_time=prediction_time_s,
            )

    async def execute_async(
        self,
        session_id: str,
        generation: int,
        case_id: str,
        model_id: str,
        prediction_time_s: float,
    ) -> LiveInferenceResult | LiveInferenceFailure | None:
        """Asynchronously dispatch model inference to the thread pool."""
        loop = asyncio.get_running_loop()
        with self._pending_lock:
            if self._pending_jobs >= MAX_PENDING_JOBS:
                raise InferenceCapacityError()
            self._pending_jobs += 1

        try:
            future = self._executor.submit(
                self.execute_sync,
                session_id,
                generation,
                case_id,
                model_id,
                prediction_time_s,
            )
        except BaseException:
            self._release_pending_slot()
            raise

        future.add_done_callback(lambda _: self._release_pending_slot())
        return await asyncio.wrap_future(future, loop=loop)

    def _release_pending_slot(self) -> None:
        with self._pending_lock:
            self._pending_jobs -= 1

    def close(self) -> None:
        self._executor.shutdown(wait=False)
