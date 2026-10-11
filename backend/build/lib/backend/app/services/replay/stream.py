from __future__ import annotations

import math
from typing import Any

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError
from backend.app.repositories.case_repository import CaseRepository, normalize_case_id
from backend.app.services.inference.uc04_batch import UC04PredictionCache
from backend.app.services.inference.uc05_batch import UC05PredictionCache
from backend.app.services.signals.service import SignalService
from backend.app.services.signals.uc04_view import UC04VitalDBViewService
from backend.app.services.signals.uc05_events import derive_spo2_desaturation_events
from backend.app.services.signals.uc05_view import UC05VitalDBViewService


_UC04_NUMERIC = {
    "MAP": "Solar8000/ART_MBP",
    "SBP": "Solar8000/ART_SBP",
    "DBP": "Solar8000/ART_DBP",
    "HR": "Solar8000/HR",
    "CI": "Solar8000/CI",
    "SV": "Solar8000/SV",
    "SVV": "Solar8000/SVV",
    "SVR": "Solar8000/SVR",
}
_UC05_NUMERIC = {
    "ETCO2": "Primus/ETCO2",
    "RR": "Primus/RR_CO2",
    "SPO2": "Solar8000/PLETH_SPO2",
    "PR": "Solar8000/PLETH_HR",
}
_WAVEFORMS = {
    "abp": "SNUADC/ART",
    "capno": "Primus/CO2",
    "awp": "Primus/AWP",
    "pleth": "SNUADC/PLETH",
    "flow": "Primus/FLOW",
    "resp": "Primus/RESP",
}
_DERIVED_EVENT_LOOKBACK_SECONDS = 180.0
_SNAPSHOT_HISTORY_SECONDS = 1_800.0
_MAX_REPLAY_CHUNK_SECONDS = 30.0


class ReplayStreamService:
    """Builds bounded, case-relative recorded data frames for SSE replay."""

    def __init__(
        self,
        settings: Settings,
        cases: CaseRepository,
        signals: SignalService,
        uc04_view: UC04VitalDBViewService,
        uc05_view: UC05VitalDBViewService,
        uc04_predictions: UC04PredictionCache,
        uc05_predictions: UC05PredictionCache,
    ) -> None:
        self.settings = settings
        self.cases = cases
        self.signals = signals
        self.uc04_view = uc04_view
        self.uc05_view = uc05_view
        self.uc04_predictions = uc04_predictions
        self.uc05_predictions = uc05_predictions

    @property
    def max_chunk_seconds(self) -> float:
        return min(_MAX_REPLAY_CHUNK_SECONDS, float(self.settings.max_waveform_range_seconds))

    def snapshot(self, case_id: str | int, as_of_s: float) -> dict[str, Any]:
        normalized, case, tracks = self._case_tracks(case_id, as_of_s)
        window = min(_SNAPSHOT_HISTORY_SECONDS, self.settings.max_signal_range_seconds)
        uc04 = self.uc04_view.read(normalized, as_of_s=as_of_s, window_seconds=window)
        uc05 = self.uc05_view.read(normalized, as_of_s=as_of_s, window_seconds=window)
        history_start = max(0.0, as_of_s - window)
        medication_tracks = self._medication_tracks(normalized, tracks, history_start, as_of_s)
        return {
            "case_id": normalized,
            "as_of_s": as_of_s,
            "time_basis": "seconds_since_case_start",
            "duration_seconds": float(case["duration_seconds"]),
            "available_tracks": sorted(tracks),
            "track_metadata": [tracks[name] for name in sorted(tracks)],
            "uc04_view": uc04,
            "uc05_view": uc05,
            "medication_tracks": medication_tracks,
        }

    def delta(self, case_id: str | int, start_s: float, end_s: float) -> dict[str, Any]:
        normalized, case, tracks = self._case_tracks(case_id, end_s)
        start = _finite_nonnegative(start_s, "start_s")
        end = _finite_nonnegative(end_s, "end_s")
        duration = float(case["duration_seconds"])
        if end <= start or end > duration:
            raise ApiServiceError("INVALID_TIME_RANGE", "Replay data chunk must be ordered and within the case", status_code=422)
        if end - start > self.max_chunk_seconds:
            raise ApiServiceError("INVALID_TIME_RANGE", "Replay waveform chunk exceeds the configured limit", status_code=422)

        aliases_by_track: dict[str, list[str]] = {}
        for signal, name in _UC04_NUMERIC.items():
            aliases_by_track.setdefault(name, []).append(f"uc04:{signal}")
        for signal, name in _UC05_NUMERIC.items():
            aliases_by_track.setdefault(name, []).append(f"uc05:{signal}")

        numeric_tracks: list[dict[str, Any]] = []
        for track_name, aliases in aliases_by_track.items():
            metadata = tracks.get(track_name)
            if metadata is None or metadata.get("track_type") != "NUMERIC":
                continue
            numeric_tracks.append({
                **self.signals.signals(normalized, track_name, start, end),
                "module_aliases": aliases,
            })

        waveforms: dict[str, dict[str, Any] | None] = {}
        for name, track_name in _WAVEFORMS.items():
            metadata = tracks.get(track_name)
            if metadata is None or metadata.get("track_type") != "WAVEFORM":
                continue
            try:
                waveforms[name] = self.signals.waveform(normalized, track_name, start, end)
            except ApiServiceError as exc:
                if exc.code not in {"INSUFFICIENT_DATA", "TRACK_NOT_AVAILABLE"}:
                    raise

        recorded_events = self._recorded_events(normalized, tracks, start, end)
        derived_events = self._derived_events(normalized, tracks, start, end)
        medication_tracks = self._medication_tracks(normalized, tracks, start, end)
        return {
            "case_id": normalized,
            "from_s": start,
            "as_of_s": end,
            "time_basis": "seconds_since_case_start",
            "numeric_tracks": numeric_tracks,
            "waveforms": waveforms,
            "recorded_events": recorded_events,
            "derived_events": derived_events,
            "medication_tracks": medication_tracks,
            "predictions": {
                "uc04": self._predictions(self.uc04_predictions, normalized, start, end),
                "uc05": self._predictions(self.uc05_predictions, normalized, start, end),
            },
        }

    def _case_tracks(self, case_id: str | int, as_of_s: float) -> tuple[str, dict[str, Any], dict[str, dict[str, Any]]]:
        normalized = normalize_case_id(case_id)
        case = self.cases.get_case(normalized)
        as_of = _finite_nonnegative(as_of_s, "as_of_s")
        if as_of > float(case["duration_seconds"]):
            raise ApiServiceError("INVALID_TIME_RANGE", "Replay cursor is beyond the recorded case", status_code=422)
        tracks = {item["track_name"]: item for item in self.cases.list_tracks(normalized)}
        return normalized, case, tracks

    def _recorded_events(
        self, case_id: str, tracks: dict[str, dict[str, Any]], start_s: float, end_s: float
    ) -> list[dict[str, Any]]:
        if "EVENT" not in tracks or tracks["EVENT"].get("track_type") != "EVENT":
            return []
        return [
            {
                **event,
                "id": f"vitaldb-annotation-{index}-{event['timestamp']:.3f}",
                "source_class": "OBSERVED",
                "definition": "Recorded VitalDB EVENT annotation",
                "available_at_s": event["timestamp"],
            }
            for index, event in enumerate(self.uc05_view.vitaldb.read_events(case_id))
            if start_s < float(event["timestamp"]) <= end_s
        ]

    def _derived_events(
        self, case_id: str, tracks: dict[str, dict[str, Any]], start_s: float, end_s: float
    ) -> list[dict[str, Any]]:
        spo2_track = _UC05_NUMERIC["SPO2"]
        metadata = tracks.get(spo2_track)
        if metadata is None or metadata.get("track_type") != "NUMERIC":
            return []
        lookback_start = max(0.0, end_s - _DERIVED_EVENT_LOOKBACK_SECONDS)
        if end_s <= lookback_start:
            return []
        observations = self.signals.signals(case_id, spo2_track, lookback_start, end_s)["observations"]
        cadence = metadata.get("observed_update_rate_hz") or metadata.get("native_sample_rate_hz")
        try:
            cadence_hz = float(cadence)
            interval = 1.0 / cadence_hz if math.isfinite(cadence_hz) and cadence_hz > 0 else None
        except (TypeError, ValueError, OverflowError):
            interval = None
        events = derive_spo2_desaturation_events(case_id, observations, expected_interval_s=interval)
        return [
            {**event, "available_at_s": event.get("end_time_s", event["timestamp"])}
            for event in events
            if start_s < float(event.get("end_time_s", event["timestamp"])) <= end_s
        ]

    def _medication_tracks(
        self, case_id: str, tracks: dict[str, dict[str, Any]], start_s: float, end_s: float
    ) -> list[dict[str, Any]]:
        if end_s <= start_s:
            return []
        output = []
        for track_name, metadata in tracks.items():
            device = str(metadata.get("source_device", ""))
            if metadata.get("track_type") != "NUMERIC":
                continue
            if not (track_name.startswith("Orchestra/") or "infusion pump" in device.lower()):
                continue
            try:
                rows = self.signals.signals(case_id, track_name, start_s, end_s)
            except ApiServiceError as exc:
                if exc.code in {"INSUFFICIENT_DATA", "TRACK_NOT_AVAILABLE"}:
                    continue
                raise
            output.append({
                **rows,
                "record_class": "OBSERVED_PUMP_TRACK",
                "administration_status": "NOT_INFERRED_FROM_TRACK",
            })
        return output

    @staticmethod
    def _predictions(cache: Any, case_id: str, start_s: float, end_s: float) -> dict[str, Any] | None:
        if cache.status(case_id).get("cache_status") != "READY":
            return None
        try:
            result = cache.read_predictions(case_id, as_of_s=end_s, window_start_s=start_s)
        except ApiServiceError:
            return None
        rows = result.get("predictions", [])
        result["predictions"] = [row for row in rows if float(row.get("prediction_time", -1)) <= end_s]
        return result


def _finite_nonnegative(value: Any, name: str) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ApiServiceError("INVALID_TIME_RANGE", f"{name} must be a finite case-relative time", status_code=422) from exc
    if not math.isfinite(numeric) or numeric < 0:
        raise ApiServiceError("INVALID_TIME_RANGE", f"{name} must be a finite case-relative time", status_code=422)
    return numeric
