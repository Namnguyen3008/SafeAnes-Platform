from __future__ import annotations

import math
from typing import Any

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError, cache_not_ready, invalid_time_range
from backend.app.repositories.case_repository import CaseRepository, normalize_case_id
from backend.app.repositories.vitaldb_repository import VitalDBRepository
from backend.app.services.inference.uc04_batch import UC04PredictionCache
from backend.app.services.inference.model_manager import ModelManager
from backend.app.ml.registry.contracts import UC04_CONTRACT
from backend.app.services.signals.service import SignalService


_NUMERIC_TRACKS = {
    "MAP": "Solar8000/ART_MBP",
    "SBP": "Solar8000/ART_SBP",
    "DBP": "Solar8000/ART_DBP",
    "HR": "Solar8000/HR",
    "CI": "Solar8000/CI",
    "SV": "Solar8000/SV",
    "SVV": "Solar8000/SVV",
    "SVR": "Solar8000/SVR",
}


class UC04VitalDBViewService:
    """As-of bounded signal/event bundle for the UC04 real-case workstation."""

    def __init__(
        self,
        settings: Settings,
        cases: CaseRepository,
        vitaldb: VitalDBRepository,
        signals: SignalService,
        prediction_cache: UC04PredictionCache,
        models: ModelManager,
    ) -> None:
        self.settings = settings
        self.cases = cases
        self.vitaldb = vitaldb
        self.signals = signals
        self.prediction_cache = prediction_cache
        self.models = models

    def read(self, case_id: str | int, *, as_of_s: float, window_seconds: float = 1800.0) -> dict[str, Any]:
        normalized = normalize_case_id(case_id)
        case = self.cases.get_case(normalized)
        if case.get("raw_file", {}).get("cache_status") != "READY":
            try:
                self.cases.ensure_raw_cached(normalized)
                case = self.cases.get_case(normalized)
            except Exception:
                raise cache_not_ready(f"VitalDB raw case {normalized} is not ready in the local cache")
        as_of = _finite_nonnegative(as_of_s, "as_of_s")
        window = _finite_nonnegative(window_seconds, "window_seconds")
        duration = float(case["duration_seconds"])
        if as_of > duration or window <= 0 or window > self.settings.max_signal_range_seconds:
            raise invalid_time_range("UC04 view time must be within the case and the window must be configured and positive")
        start = max(0.0, as_of - window)
        track_rows = self.cases.list_tracks(normalized)
        track_by_name = {row["track_name"]: row for row in track_rows}
        available_names = sorted(track_by_name)

        recorded_signals: list[dict[str, Any]] = []
        for signal, track_name in _NUMERIC_TRACKS.items():
            metadata = track_by_name.get(track_name)
            if metadata is None or metadata.get("track_type") != "NUMERIC" or as_of <= start:
                continue
            signal_data = self.signals.signals(normalized, track_name, start, as_of)
            signal_data["signal"] = signal
            recorded_signals.append(signal_data)

        waveform = None
        waveform_name = "SNUADC/ART"
        if waveform_name in track_by_name and as_of > 0:
            waveform_start = max(0.0, as_of - 15.0)
            if as_of > waveform_start:
                try:
                    waveform = self.signals.waveform(normalized, waveform_name, waveform_start, as_of)
                except ApiServiceError as exc:
                    if exc.code not in {"INSUFFICIENT_DATA", "TRACK_NOT_AVAILABLE"}:
                        raise

        annotations: list[dict[str, Any]] = []
        if "EVENT" in track_by_name:
            annotations = [
                event for event in self.vitaldb.read_events(normalized)
                if start <= float(event["timestamp"]) <= as_of
            ]

        model_status = self.models.status(UC04_CONTRACT.model_id)
        cache_status = "NOT_READY"
        predictions = None
        prediction_cache_metadata: dict[str, Any] = {
            "case_id": normalized,
            "model_id": UC04_CONTRACT.model_id,
            "model_version": UC04_CONTRACT.model_version,
            "artifact_sha256": UC04_CONTRACT.artifact_sha256,
            "cache_status": "NOT_READY",
            "prediction_count": 0,
            "inference_window_count": 0,
            "abstained_window_count": 0,
            "abstained_windows": [],
            "window_eligibility": "NOT_EVALUATED",
            "window_status": "NOT_EVALUATED",
            "window_reason": "Prediction cache is not ready.",
            "window_prediction_time_s": None,
            "window_start_s": None,
            "window_end_s": None,
        }
        if model_status["inference_ready"]:
            try:
                cache_summary = self.prediction_cache.status(normalized)
                cache_status = cache_summary["cache_status"]
                prediction_cache_metadata.update(cache_summary)
                if cache_status == "READY":
                    predictions = self.prediction_cache.read_predictions(
                        normalized, as_of_s=as_of, window_start_s=start
                    )
                    prediction_cache_metadata.update({
                        key: predictions.get(key)
                        for key in (
                            "prediction_count", "inference_window_count", "abstained_window_count",
                            "abstained_windows",
                            "window_eligibility", "window_status", "window_reason",
                            "window_prediction_time_s", "window_start_s", "window_end_s",
                        )
                        if key in predictions
                    })
            except ApiServiceError as exc:
                if exc.code != "CACHE_NOT_READY":
                    raise
                cache_status = "NOT_READY"
                prediction_cache_metadata.update(_cache_not_ready_fields())

        return {
            "case_id": normalized,
            "dataset": case["dataset"],
            "dataset_version": case["dataset_version"],
            "as_of_s": as_of,
            "window_start_s": start,
            "window_end_s": as_of,
            "time_basis": "seconds_since_case_start",
            "available_tracks": available_names,
            "signals": recorded_signals,
            "abp_waveform": waveform,
            "events": annotations,
            "predictions": predictions,
            "prediction_cache_status": cache_status,
            "prediction_cache": prediction_cache_metadata,
            "model": {
                "model_id": UC04_CONTRACT.model_id,
                "model_version": UC04_CONTRACT.model_version,
                "artifact_sha256": UC04_CONTRACT.artifact_sha256,
                "task": UC04_CONTRACT.task,
                "output_semantics": UC04_CONTRACT.output_semantics["score"],
                "calibration_status": "CALIBRATED" if UC04_CONTRACT.calibration_method else "NOT_CALIBRATED",
                "calibration_method": UC04_CONTRACT.calibration_method,
                "horizons_minutes": list(UC04_CONTRACT.prediction_horizons),
                "readiness_status": model_status["readiness_status"],
                "inference_contract_mode": "VERIFIED_MODEL_CONTRACT",
                "clinical_use": False,
            },
        }


def _finite_nonnegative(value: Any, name: str) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise invalid_time_range(f"{name} must be a finite non-negative number") from exc
    if not math.isfinite(numeric) or numeric < 0:
        raise invalid_time_range(f"{name} must be a finite non-negative number")
    return numeric


def _cache_not_ready_fields() -> dict[str, Any]:
    """Keep nested cache metadata coherent with the view-level status."""
    return {
        "cache_status": "NOT_READY",
        "prediction_count": 0,
        "inference_window_count": 0,
        "abstained_window_count": 0,
        "abstained_windows": [],
        "window_eligibility": "NOT_EVALUATED",
        "window_status": "NOT_EVALUATED",
        "window_reason": "Prediction cache is not ready.",
        "window_prediction_time_s": None,
        "window_start_s": None,
        "window_end_s": None,
    }
