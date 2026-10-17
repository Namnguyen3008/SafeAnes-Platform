from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import logging
import time
from typing import Any

from backend.app.services.inference.model_manager import ModelManager
from backend.app.services.replay.window_loader import WindowLoader

logger = logging.getLogger("safeanes.inference_worker")


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
            "coverage": self.coverage,
            "missing_features": self.missing_features,
            "latency_ms": self.latency_ms,
        }


class LiveInferenceWorker:
    """Dedicated background worker executing PyTorch inference on CPU/GPU.
    
    Ensures model weights are held in RAM/VRAM as singletons and inference
    never blocks the FastAPI event loop.
    """

    def __init__(self, model_manager: ModelManager, window_loader: WindowLoader | None = None) -> None:
        self.model_manager = model_manager
        self.window_loader = window_loader or WindowLoader(model_manager.vitaldb, model_manager.preprocessor)
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="LiveInferenceWorker")

    def execute_sync(
        self,
        session_id: str,
        generation: int,
        case_id: str,
        model_id: str,
        prediction_time_s: float,
    ) -> LiveInferenceResult | None:
        """Run synchronized inference within a thread worker."""
        t0 = time.perf_counter()
        try:
            if getattr(self.model_manager.settings, "offload_inference", False) and getattr(self.model_manager.settings, "inference_url", None):
                predictions = self.model_manager.predict(case_id, model_id, prediction_time_s)
                latency_ms = round((time.perf_counter() - t0) * 1000, 2)
                return LiveInferenceResult(
                    session_id=session_id,
                    generation=generation,
                    case_id=case_id,
                    model_id=model_id,
                    prediction_time=prediction_time_s,
                    predictions=predictions,
                    coverage=1.0,
                    missing_features=[],
                    latency_ms=latency_ms,
                )

            extracted = self.window_loader.get_window(case_id, model_id, prediction_time_s)
            if extracted is None:
                return None
            window, prepared_input, report = extracted
            
            service = self.model_manager._service(model_id)
            with self.model_manager._locks[service.contract.model_id]:
                predictions = service.predict_window(window, prepared_input=prepared_input)
            
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
        except Exception as exc:
            logger.warning(
                f"Live inference failed for {model_id} at {prediction_time_s}s in case {case_id}: {exc}"
            )
            return None

    async def execute_async(
        self,
        session_id: str,
        generation: int,
        case_id: str,
        model_id: str,
        prediction_time_s: float,
    ) -> LiveInferenceResult | None:
        """Asynchronously dispatch model inference to the thread pool."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor,
            self.execute_sync,
            session_id,
            generation,
            case_id,
            model_id,
            prediction_time_s,
        )

    def close(self) -> None:
        self._executor.shutdown(wait=False)
