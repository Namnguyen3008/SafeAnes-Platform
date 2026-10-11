from __future__ import annotations

import math
from typing import Any

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError, cache_not_ready, invalid_time_range
from backend.app.ml.registry.contracts import UC05_CONTRACT
from backend.app.repositories.case_repository import CaseRepository, normalize_case_id
from backend.app.repositories.vitaldb_repository import VitalDBRepository
from backend.app.services.inference.uc05_batch import UC05PredictionCache
from backend.app.services.signals.service import SignalService
from backend.app.services.signals.uc05_events import derive_spo2_desaturation_events


_NUMERIC_TRACKS = {
    "ETCO2": "Primus/ETCO2",
    "RR": "Primus/RR_CO2",
    "SPO2": "Solar8000/PLETH_SPO2",
    "PR": "Solar8000/PLETH_HR",
}
_WAVEFORM_TRACKS = {
    "capno": "Primus/CO2",
    "awp": "Primus/AWP",
    "ppg": "SNUADC/PLETH",
    "flow": "Primus/FLOW",
    "resp": "Primus/RESP",
}


class UC05VitalDBViewService:
    """An as-of bundle of raw VitalDB data, task-definition candidates, and cached model outputs."""

    def __init__(self, settings: Settings, cases: CaseRepository, vitaldb: VitalDBRepository,
                 signals: SignalService, prediction_cache: UC05PredictionCache, models: Any) -> None:
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
                raise cache_not_ready(f"VitalDB raw case {normalized} is not checksum-verified in the local cache")
        as_of = _finite_nonnegative(as_of_s, "as_of_s")
        window = _finite_nonnegative(window_seconds, "window_seconds")
        duration = float(case["duration_seconds"])
        if as_of > duration or window <= 0 or window > self.settings.max_signal_range_seconds:
            raise invalid_time_range("UC05 view time must be in the case and the requested window within configured limits")
        start = max(0.0, as_of - window)
        track_rows = self.cases.list_tracks(normalized)
        tracks = {row["track_name"]: row for row in track_rows}
        available_tracks = sorted(tracks)

        recorded_signals: list[dict[str, Any]] = []
        signal_rows: dict[str, list[dict[str, Any]]] = {}
        if as_of > start:
            for signal, track_name in _NUMERIC_TRACKS.items():
                metadata = tracks.get(track_name)
                if metadata is None or metadata.get("track_type") != "NUMERIC":
                    continue
                raw = self.signals.signals(normalized, track_name, start, as_of)
                raw["signal"] = signal
                raw["observed_update_rate_hz"] = metadata.get("observed_update_rate_hz", "NOT_RECORDED")
                recorded_signals.append(raw)
                signal_rows[signal] = raw["observations"]

        waveforms: dict[str, Any] = {}
        wave_start = max(0.0, as_of - min(30.0, self.settings.max_waveform_range_seconds))
        for name, track_name in _WAVEFORM_TRACKS.items():
            metadata = tracks.get(track_name)
            if metadata is None or metadata.get("track_type") != "WAVEFORM" or as_of <= wave_start:
                waveforms[name] = None
                continue
            try:
                waveforms[name] = self.signals.waveform(normalized, track_name, wave_start, as_of)
            except ApiServiceError as exc:
                if exc.code not in {"INSUFFICIENT_DATA", "TRACK_NOT_AVAILABLE"}:
                    raise
                waveforms[name] = None

        recorded_events: list[dict[str, Any]] = []
        if "EVENT" in tracks:
            recorded_events = [
                {**event, "id": f"vitaldb-annotation-{index}-{event['timestamp']:.3f}",
                 "source_class": "OBSERVED", "definition": "Recorded VitalDB EVENT annotation"}
                for index, event in enumerate(self.vitaldb.read_events(normalized))
                if start <= float(event["timestamp"]) <= as_of
            ]

        derived_events: list[dict[str, Any]] = []
        spo2_track = tracks.get(_NUMERIC_TRACKS["SPO2"])
        if spo2_track and as_of > start:
            lookback_start = max(0.0, start - 60.0)
            spo2 = self.signals.signals(normalized, _NUMERIC_TRACKS["SPO2"], lookback_start, as_of)
            cadence = spo2_track.get("observed_update_rate_hz")
            try:
                cadence_hz = float(cadence)
                interval = 1.0 / cadence_hz if math.isfinite(cadence_hz) and cadence_hz > 0 else None
            except (TypeError, ValueError, OverflowError):
                interval = None
            derived_events = derive_spo2_desaturation_events(
                normalized, spo2["observations"], expected_interval_s=interval
            )
            derived_events = [item for item in derived_events if float(item["end_time_s"]) >= start and float(item["start_time_s"]) <= as_of]

        model_status = self.models.status(UC05_CONTRACT.model_id)
        cache_status = "NOT_READY"
        predictions = None
        prediction_cache_metadata: dict[str, Any] = {
            "case_id": normalized,
            "model_id": UC05_CONTRACT.model_id,
            "model_version": UC05_CONTRACT.model_version,
            "artifact_sha256": UC05_CONTRACT.artifact_sha256,
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
            "available_tracks": available_tracks,
            "signals": recorded_signals,
            "waveforms": waveforms,
            "recorded_events": recorded_events,
            "derived_events": derived_events,
            "predictions": predictions,
            "prediction_cache_status": cache_status,
            "prediction_cache": prediction_cache_metadata,
            "model": {
                "model_id": UC05_CONTRACT.model_id,
                "model_version": UC05_CONTRACT.model_version,
                "artifact_sha256": UC05_CONTRACT.artifact_sha256,
                "task": UC05_CONTRACT.task,
                "output_semantics": dict(UC05_CONTRACT.output_semantics),
                "calibration_status": "CALIBRATED" if UC05_CONTRACT.calibration_method else "NOT_CALIBRATED",
                "calibration_method": UC05_CONTRACT.calibration_method,
                "decision_threshold": UC05_CONTRACT.decision_threshold,
                "horizons_minutes": list(UC05_CONTRACT.prediction_horizons),
                "readiness_status": model_status["readiness_status"],
                "inference_contract_mode": "STRICT_SIGNAL_SCHEMA",
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
