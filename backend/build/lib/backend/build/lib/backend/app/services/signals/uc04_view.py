from __future__ import annotations

import math
from typing import Any

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError, cache_not_ready, invalid_time_range
from backend.app.repositories.case_repository import CaseRepository, normalize_case_id
from backend.app.repositories.vitaldb_repository import VitalDBRepository
from backend.app.services.inference.uc04_batch import UC04PredictionCache
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
    ) -> None:
        self.settings = settings
        self.cases = cases
        self.vitaldb = vitaldb
        self.signals = signals
        self.prediction_cache = prediction_cache

    def read(self, case_id: str | int, *, as_of_s: float, window_seconds: float = 1800.0) -> dict[str, Any]:
        normalized = normalize_case_id(case_id)
        case = self.cases.get_case(normalized)
        if case.get("raw_file", {}).get("cache_status") != "READY":
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
            waveform_start = max(0.0, as_of - 30.0)
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

        cache_status = self.prediction_cache.status(normalized)["cache_status"]
        predictions = None
        if cache_status == "READY":
            try:
                predictions = self.prediction_cache.read_predictions(
                    normalized, as_of_s=as_of, window_start_s=start
                )
            except ApiServiceError:
                cache_status = "NOT_READY"

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
        }


def _finite_nonnegative(value: Any, name: str) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise invalid_time_range(f"{name} must be a finite non-negative number") from exc
    if not math.isfinite(numeric) or numeric < 0:
        raise invalid_time_range(f"{name} must be a finite non-negative number")
    return numeric
