from __future__ import annotations

import logging
from typing import Any

from backend.app.ml.contracts.window import InferenceWindow
from backend.app.ml.preprocessing.vitaldb_pipeline import TrainingPreprocessorAdapter
from backend.app.repositories.vitaldb_repository import VitalDBRepository

logger = logging.getLogger("safeanes.replay.window_loader")


class WindowLoader:
    """Fast, contiguous in-memory window extractor for real-time model inference.
    
    Extracts time-bounded windows [t-W, t] for UC04 (300s) and UC05 (600s)
    with O(1) array slicing from cached VitalDBCaseSignals.
    """

    def __init__(self, vitaldb: VitalDBRepository, preprocessor: TrainingPreprocessorAdapter | None = None) -> None:
        self.vitaldb = vitaldb
        self.preprocessor = preprocessor or TrainingPreprocessorAdapter()

    def get_window(
        self,
        case_id: str,
        model_id: str,
        prediction_time_s: float,
    ) -> tuple[InferenceWindow, Any, dict[str, Any]] | None:
        """Extract and preprocess an inference window at the given timestamp.
        
        Returns (window, prepared_input, report) or None if insufficient history.
        """
        try:
            series = self.vitaldb.get_model_series(case_id, model_id)
            if prediction_time_s < series.history_seconds:
                return None
            window = series.window_at(float(prediction_time_s))
            prepared = self.preprocessor.prepare(model_id, window, case_signals=series)
            if not prepared.report.get("input_eligible") or not prepared.report.get("inference_eligible"):
                return None
            return window, prepared.prepared, prepared.report
        except Exception as exc:
            logger.debug(f"Window extraction skipped at {prediction_time_s}s for {model_id}: {exc}")
            return None
