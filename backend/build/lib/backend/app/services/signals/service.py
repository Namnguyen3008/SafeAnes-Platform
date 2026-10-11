from __future__ import annotations

import math
from typing import Any

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError, invalid_time_range, track_not_available
from backend.app.repositories.case_repository import CaseRepository, normalize_case_id
from backend.app.repositories.vitaldb_repository import VitalDBRepository


class SignalService:
    def __init__(
        self,
        settings: Settings,
        cases: CaseRepository,
        vitaldb: VitalDBRepository,
    ) -> None:
        self.settings = settings
        self.cases = cases
        self.vitaldb = vitaldb

    def signals(
        self, case_id: str, track_name: str, start_time_s: float, end_time_s: float
    ) -> dict[str, Any]:
        case = self._validate_range(case_id, start_time_s, end_time_s, waveform=False)
        track = self.cases.get_track(case_id, track_name)
        if track["track_type"] != "NUMERIC":
            raise track_not_available(track_name)
        return self.vitaldb.read_numeric_observations(
            str(case["case_id"]), track_name, start_time_s, end_time_s
        )

    def waveform(
        self, case_id: str, track_name: str, start_time_s: float, end_time_s: float
    ) -> dict[str, Any]:
        case = self._validate_range(case_id, start_time_s, end_time_s, waveform=True)
        track = self.cases.get_track(case_id, track_name)
        if track["track_type"] != "WAVEFORM":
            raise track_not_available(track_name)
        return self.vitaldb.read_waveform_window(
            str(case["case_id"]), track_name, start_time_s, end_time_s
        )

    def events(self, case_id: str) -> dict[str, Any]:
        case = self.cases.get_case(case_id)
        tracks = {track["track_name"] for track in self.cases.list_tracks(case_id)}
        if "EVENT" not in tracks:
            raise track_not_available("EVENT")
        return {
            "case_id": case["case_id"],
            "events": self.vitaldb.read_events(str(case["case_id"])),
        }

    def _validate_range(
        self,
        case_id: str,
        start_time_s: float,
        end_time_s: float,
        *,
        waveform: bool,
    ) -> dict[str, Any]:
        normalized = normalize_case_id(case_id)
        case = self.cases.get_case(normalized)
        try:
            start = float(start_time_s)
            end = float(end_time_s)
            duration = float(case["duration_seconds"])
        except (TypeError, ValueError, OverflowError) as exc:
            raise invalid_time_range("Time values must be finite case-relative seconds") from exc
        max_range = (
            self.settings.max_waveform_range_seconds
            if waveform
            else self.settings.max_signal_range_seconds
        )
        if (
            not math.isfinite(start)
            or not math.isfinite(end)
            or start < 0
            or end <= start
            or end > duration
            or end - start > max_range
        ):
            raise invalid_time_range(
                "Requested interval must be ordered, within the case duration, and below the configured range limit"
            )
        return case
