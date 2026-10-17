from __future__ import annotations

import logging
from typing import Any

from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT
from backend.app.services.inference.inference_worker import (
    InferenceCapacityError,
    LiveInferenceFailure,
    LiveInferenceResult,
    LiveInferenceWorker,
)

logger = logging.getLogger("safeanes.replay.scheduler")


class ReplayInferenceScheduler:
    """Schedules adaptive live inference during recorded replay.
    
    Dynamically scales evaluation stride depending on playback speed (1x to 60x),
    discards stale generations on Seek/Reset, and submits jobs to the worker.
    """

    def __init__(self, worker: LiveInferenceWorker) -> None:
        self.worker = worker
        self._last_evaluated: dict[tuple[str, int, str], float] = {}

    @staticmethod
    def adaptive_stride(speed: int) -> float:
        """Adaptive evaluation stride in simulated case seconds."""
        if speed <= 1:
            return 10.0
        if speed <= 2:
            return 10.0
        if speed <= 5:
            return 15.0
        if speed <= 10:
            return 30.0
        return 60.0

    def should_evaluate(
        self,
        session_id: str,
        generation: int,
        model_id: str,
        current_time_s: float,
        speed: int,
    ) -> bool:
        key = (session_id, generation, model_id)
        last = self._last_evaluated.get(key)
        if last is None:
            return True
        stride = self.adaptive_stride(speed)
        return (current_time_s - last) >= stride or current_time_s < last

    def mark_evaluated(self, session_id: str, generation: int, model_id: str, time_s: float) -> None:
        self._last_evaluated[(session_id, generation, model_id)] = time_s

    def reset_session(self, session_id: str) -> None:
        keys_to_remove = [k for k in self._last_evaluated if k[0] == session_id]
        for k in keys_to_remove:
            self._last_evaluated.pop(k, None)

    async def schedule_if_due(
        self,
        session: dict[str, Any],
        target_model_ids: tuple[str, ...] = (UC05_CONTRACT.model_id, UC04_CONTRACT.model_id),
    ) -> list[LiveInferenceResult | LiveInferenceFailure]:
        """Check a replay snapshot and execute live inference for due models."""
        if session.get("status") != "PLAYING":
            return []

        try:
            session_id = str(session["session_id"])
            generation = int(session["generation"])
            case_id = str(session["case_id"])
            current_time_s = float(session.get("current_time_seconds", session.get("current_time_s")))
            speed = int(session["speed"])
        except (KeyError, TypeError, ValueError):
            logger.warning("Replay inference skipped because the PLAYING snapshot is incomplete")
            return []

        results: list[LiveInferenceResult | LiveInferenceFailure] = []
        for model_id in target_model_ids:
            if self.should_evaluate(session_id, generation, model_id, current_time_s, speed):
                try:
                    res = await self.worker.execute_async(
                        session_id=session_id,
                        generation=generation,
                        case_id=case_id,
                        model_id=model_id,
                        prediction_time_s=current_time_s,
                    )
                except InferenceCapacityError:
                    logger.debug("Replay inference tick deferred because the worker is at capacity")
                    continue
                self.mark_evaluated(session_id, generation, model_id, current_time_s)
                if res is not None and res.generation == generation:
                    results.append(res)
        return results
