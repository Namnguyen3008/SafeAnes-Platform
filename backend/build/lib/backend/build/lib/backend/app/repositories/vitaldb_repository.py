from __future__ import annotations

from collections import OrderedDict
import math
import threading
from typing import Any

import numpy as np

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError, insufficient_data, track_not_available
from backend.app.ml.preprocessing.vitaldb_loader import VitalDBCaseSignals, VitalDBDataError, VitalDBWindowLoader
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT
from backend.app.repositories.case_repository import CaseRepository, normalize_case_id


class VitalDBRepository:
    """Bounded read cache over immutable local VitalDB records."""

    def __init__(
        self,
        settings: Settings,
        cases: CaseRepository,
        *,
        vitaldb_module: Any | None = None,
    ) -> None:
        self.settings = settings
        self.cases = cases
        self._vitaldb = vitaldb_module
        self._lock = threading.RLock()
        self._series_lock_guard = threading.Lock()
        self._series_locks: dict[tuple[str, str], threading.Lock] = {}
        self._files: OrderedDict[tuple[str, str], Any] = OrderedDict()
        self._series: OrderedDict[tuple[str, str], VitalDBCaseSignals] = OrderedDict()

    @property
    def vitaldb(self) -> Any:
        if self._vitaldb is None:
            try:
                import vitaldb
            except ImportError as exc:
                raise ApiServiceError(
                    "CACHE_NOT_READY",
                    "The VitalDB Python package is not installed in this runtime",
                    status_code=503,
                ) from exc
            self._vitaldb = vitaldb
        return self._vitaldb

    def _open_track_file(self, case_id: str, track_name: str) -> tuple[Any, Any, dict[str, Any], dict[str, Any]]:
        normalized = normalize_case_id(case_id)
        track_metadata = self.cases.get_track(normalized, track_name)
        manifest = self.cases.get_manifest(normalized)
        raw_path = self.cases.raw_path(normalized)
        key = (normalized, track_name)
        with self._lock:
            vf = self._files.get(key)
            if vf is None:
                try:
                    vf = self.vitaldb.VitalFile(str(raw_path), track_names=[track_name])
                except Exception as exc:
                    raise ApiServiceError(
                        "CACHE_NOT_READY",
                        f"VitalDB case {normalized} could not be parsed",
                        status_code=503,
                    ) from exc
                self._files[key] = vf
                self._trim(self._files, self.settings.signal_file_cache_entries)
            else:
                self._files.move_to_end(key)
        track = getattr(vf, "trks", {}).get(track_name)
        if track is None:
            raise track_not_available(track_name)
        return vf, track, track_metadata, manifest

    def read_numeric_observations(
        self,
        case_id: str,
        track_name: str,
        start_time_s: float,
        end_time_s: float,
    ) -> dict[str, Any]:
        vf, track, metadata, manifest = self._open_track_file(case_id, track_name)
        if _track_type(track) != "NUMERIC":
            raise track_not_available(track_name)
        origin = float(getattr(vf, "dtstart", math.nan))
        if not math.isfinite(origin):
            raise insufficient_data("VitalDB file has no valid case-time origin")
        values: list[tuple[float, float | None]] = []
        rate = _positive_rate(getattr(track, "srate", None))
        if rate is None:
            rate = _positive_rate(metadata.get("observed_update_rate_hz"))
        for record in getattr(track, "recs", ()) or ():
            record_time = _finite_float(_record_value(record, "dt"))
            if record_time is None:
                continue
            relative = record_time - origin
            raw = _record_value(record, "val")
            try:
                array = np.asarray(raw)
            except (TypeError, ValueError) as exc:
                raise insufficient_data(f"Numeric track {track_name} contains an invalid record") from exc
            flat = array.reshape(-1)
            if flat.size == 1:
                if start_time_s <= relative < end_time_s:
                    values.append((relative, _finite_float(flat[0])))
                    if len(values) > self.settings.max_samples_per_response:
                        raise ApiServiceError(
                            "INVALID_TIME_RANGE",
                            "Requested numeric window exceeds the response sample limit",
                            status_code=422,
                            details={"max_samples": self.settings.max_samples_per_response},
                        )
                continue
            if rate is None:
                raise insufficient_data(
                    f"Numeric track {track_name} contains a multi-value record without a verified sample rate"
                )
            first = max(0, int(math.ceil((start_time_s - relative) * rate - 1e-9)))
            stop = min(flat.size, int(math.ceil((end_time_s - relative) * rate - 1e-9)))
            if stop > first:
                if len(values) + stop - first > self.settings.max_samples_per_response:
                    raise ApiServiceError(
                        "INVALID_TIME_RANGE",
                        "Requested numeric window exceeds the response sample limit",
                        status_code=422,
                        details={"max_samples": self.settings.max_samples_per_response},
                    )
                values.extend(
                    (relative + index / rate, _finite_float(flat[index]))
                    for index in range(first, stop)
                )
            if len(values) > self.settings.max_samples_per_response:
                raise ApiServiceError(
                    "INVALID_TIME_RANGE",
                    "Requested numeric window exceeds the response sample limit",
                    status_code=422,
                    details={"max_samples": self.settings.max_samples_per_response},
                )
        values.sort(key=lambda item: item[0])
        provenance = _provenance(manifest, track_name)
        source = _not_recorded(getattr(track, "dname", None) or metadata.get("source_device"))
        return {
            "case_id": str(case_id),
            "track_name": track_name,
            "track_type": "NUMERIC",
            "start_time_s": start_time_s,
            "end_time_s": end_time_s,
            "unit": _not_recorded(getattr(track, "unit", None) or metadata.get("unit")),
            "source": source,
            "quality": "UNKNOWN",
            "provenance": provenance,
            "observations": [
                {
                    "case_id": str(case_id),
                    "track_name": track_name,
                    "timestamp": timestamp,
                    "value": value,
                    "unit": _not_recorded(getattr(track, "unit", None) or metadata.get("unit")),
                    "source": source,
                    "quality": "MISSING" if value is None else "UNKNOWN",
                    "is_missing": value is None,
                    "provenance": provenance,
                }
                for timestamp, value in values
            ],
        }

    def read_waveform_window(
        self,
        case_id: str,
        track_name: str,
        start_time_s: float,
        end_time_s: float,
    ) -> dict[str, Any]:
        vf, track, metadata, manifest = self._open_track_file(case_id, track_name)
        if _track_type(track) != "WAVEFORM":
            raise track_not_available(track_name)
        rate = _positive_rate(getattr(track, "srate", None))
        if rate is None:
            raise insufficient_data(f"Waveform track {track_name} has no verified native sample rate")
        origin = float(getattr(vf, "dtstart", math.nan))
        if not math.isfinite(origin):
            raise insufficient_data("VitalDB file has no valid case-time origin")
        timestamps: list[float] = []
        values: list[float | None] = []
        for record in getattr(track, "recs", ()) or ():
            record_time = _finite_float(_record_value(record, "dt"))
            if record_time is None:
                continue
            relative = record_time - origin
            raw = _record_value(record, "val")
            try:
                array = np.asarray(raw, dtype=np.float64).reshape(-1)
            except (TypeError, ValueError, OverflowError) as exc:
                raise insufficient_data(
                    f"Waveform track {track_name} contains a non-numeric record"
                ) from exc
            first = max(0, int(math.ceil((start_time_s - relative) * rate - 1e-9)))
            stop = min(array.size, int(math.ceil((end_time_s - relative) * rate - 1e-9)))
            if stop <= first:
                continue
            if len(values) + (stop - first) > self.settings.max_samples_per_response:
                raise ApiServiceError(
                    "INVALID_TIME_RANGE",
                    "Requested waveform window exceeds the response sample limit",
                    status_code=422,
                    details={"max_samples": self.settings.max_samples_per_response},
                )
            timestamps.extend(relative + index / rate for index in range(first, stop))
            values.extend(_finite_float(item) for item in array[first:stop])
        if not timestamps:
            raise insufficient_data("No waveform samples were recorded in the requested time range")
        ordered = sorted(zip(timestamps, values), key=lambda item: item[0])
        timestamps = [item[0] for item in ordered]
        values = [item[1] for item in ordered]
        missing = [value is None for value in values]
        provenance = _provenance(manifest, track_name)
        unit = _not_recorded(getattr(track, "unit", None) or metadata.get("unit"))
        source = _not_recorded(getattr(track, "dname", None) or metadata.get("source_device"))
        missing_intervals = _missing_intervals(
            timestamps, values, rate, start_time_s, end_time_s
        )
        return {
            "case_id": str(case_id),
            "track_name": track_name,
            "start_time_s": start_time_s,
            "end_time_s": end_time_s,
            "sample_rate_hz": rate,
            "unit": unit,
            "source": source,
            "quality": "DEGRADED" if missing_intervals else "UNKNOWN",
            "timestamps": timestamps,
            "values": values,
            "is_missing": missing,
            "missing_intervals": missing_intervals,
            "provenance": provenance,
        }

    def read_events(self, case_id: str, event_track: str = "EVENT") -> list[dict[str, Any]]:
        vf, track, metadata, manifest = self._open_track_file(case_id, event_track)
        if _track_type(track) != "EVENT":
            raise track_not_available(event_track)
        origin = float(getattr(vf, "dtstart", math.nan))
        if not math.isfinite(origin):
            raise insufficient_data("VitalDB file has no valid case-time origin")
        source = _not_recorded(getattr(track, "dname", None) or metadata.get("source_device"))
        provenance = _provenance(manifest, event_track)
        events: list[dict[str, Any]] = []
        for record in getattr(track, "recs", ()) or ():
            timestamp = _finite_float(_record_value(record, "dt"))
            description = _record_value(record, "val")
            if timestamp is None or not isinstance(description, str):
                continue
            events.append({
                "case_id": str(case_id),
                "timestamp": timestamp - origin,
                "event_type": "VITALDB_ANNOTATION",
                "description": description,
                "source": source,
                "quality": "UNKNOWN",
                "provenance": provenance,
            })
        return sorted(events, key=lambda item: item["timestamp"])

    def get_model_series(self, case_id: str, model_id: str) -> VitalDBCaseSignals:
        normalized = normalize_case_id(case_id)
        canonical_model_id = _canonical_model_id(model_id)
        key = (normalized, canonical_model_id)
        with self._series_lock_guard:
            series_lock = self._series_locks.setdefault(key, threading.Lock())
        with series_lock:
            return self._load_model_series(normalized, canonical_model_id, key)

    def _load_model_series(
        self, normalized: str, canonical_model_id: str, key: tuple[str, str]
    ) -> VitalDBCaseSignals:
        with self._lock:
            cached = self._series.get(key)
            if cached is not None:
                self._series.move_to_end(key)
                return cached
        raw_path = self.cases.raw_path(normalized)
        manifest = self.cases.get_manifest(normalized)
        context = manifest.get("patient_context", {})
        case_metadata = {
            name: None if context.get(name) == "NOT_RECORDED" else context.get(name)
            for name in ("age", "sex", "asa", "bmi", "weight", "height", "emop")
        }
        loader = VitalDBWindowLoader(vitaldb_module=self.vitaldb)
        try:
            series = loader.load_case_signals(
                canonical_model_id,
                normalized,
                source_path=str(raw_path),
                case_metadata=case_metadata,
            )
        except VitalDBDataError as exc:
            message = str(exc)
            if "lacks required track" in message or "missing " in message:
                raise track_not_available(message) from exc
            raise insufficient_data("The selected case does not contain an eligible model window", details={"reason": message}) from exc
        except Exception as exc:
            raise ApiServiceError(
                "CACHE_NOT_READY",
                "VitalDB model input tracks could not be read from the local cache",
                status_code=503,
            ) from exc
        with self._lock:
            self._series[key] = series
            self._trim(self._series, self.settings.model_series_cache_entries)
        return series

    @staticmethod
    def _trim(cache: OrderedDict, limit: int) -> None:
        while len(cache) > max(1, limit):
            cache.popitem(last=False)


def _track_type(track: Any) -> str:
    raw = getattr(track, "type", None)
    return {1: "WAVEFORM", 2: "NUMERIC", 5: "EVENT"}.get(raw, "UNKNOWN")


def _record_value(record: Any, key: str) -> Any:
    return record.get(key) if isinstance(record, dict) else getattr(record, key, None)


def _positive_rate(value: Any) -> float | None:
    try:
        rate = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return rate if math.isfinite(rate) and rate > 0 else None


def _finite_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) else None


def _not_recorded(value: Any) -> str:
    return "NOT_RECORDED" if value is None or str(value).strip() == "" else str(value)


def _provenance(manifest: dict[str, Any], track_name: str) -> dict[str, Any]:
    return {
        "dataset": str(manifest.get("dataset", "VitalDB")),
        "dataset_version": str(manifest.get("source_dataset_version", "NOT_RECORDED")),
        "source_uri": manifest.get("source_uri"),
        "raw_sha256": manifest.get("raw_file", {}).get("sha256"),
        "track_name": track_name,
        "time_basis": "seconds_since_case_start",
    }


def _missing_intervals(
    timestamps: list[float],
    values: list[float | None],
    rate: float,
    start_time_s: float,
    end_time_s: float,
) -> list[dict[str, float]]:
    expected_step = 1.0 / rate
    intervals: list[tuple[float, float]] = []
    if not timestamps:
        return [{"start_time_s": start_time_s, "end_time_s": end_time_s}]
    if timestamps[0] - start_time_s > expected_step * 1.5:
        intervals.append((start_time_s, timestamps[0]))
    for index, (left, right) in enumerate(zip(timestamps, timestamps[1:])):
        if right - left > expected_step * 1.5:
            intervals.append((left + expected_step, right))
        if index < len(values) and values[index] is None:
            intervals.append((left, left + expected_step))
    if values and values[-1] is None:
        intervals.append((timestamps[-1], timestamps[-1] + expected_step))
    after_last = timestamps[-1] + expected_step
    if end_time_s - after_last > expected_step * 1.5:
        intervals.append((after_last, end_time_s))

    merged: list[list[float]] = []
    for interval_start, interval_end in sorted(intervals):
        if interval_end <= interval_start:
            continue
        if merged and interval_start <= merged[-1][1] + expected_step * 0.1:
            merged[-1][1] = max(merged[-1][1], interval_end)
        else:
            merged.append([interval_start, interval_end])
    return [{"start_time_s": left, "end_time_s": right} for left, right in merged]


def _canonical_model_id(model_id: str):
    normalized = model_id.casefold()
    if normalized in {"uc04", UC04_CONTRACT.model_id.casefold()}:
        return UC04_CONTRACT.model_id
    if normalized in {"uc05", UC05_CONTRACT.model_id.casefold()}:
        return UC05_CONTRACT.model_id
    raise ValueError(f"unsupported model id: {model_id}")
