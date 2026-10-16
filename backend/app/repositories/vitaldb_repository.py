from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
import math
import threading
from typing import Any

import numpy as np

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError, insufficient_data, track_not_available
from backend.app.ml.preprocessing.vitaldb_loader import VitalDBCaseSignals, VitalDBDataError, VitalDBWindowLoader
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT
from backend.app.repositories.case_repository import CaseRepository, normalize_case_id


@dataclass(frozen=True)
class _NumericTrackIndex:
    starts: np.ndarray
    prefix_ends: np.ndarray
    values: tuple[np.ndarray, ...] | np.ndarray
    sample_rate_hz: float | None
    is_scalar: bool = False


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
        self._numeric_series: OrderedDict[tuple[str, str], _NumericTrackIndex] = OrderedDict()

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
        try:
            raw_path = self.cases.raw_path(normalized, verify_checksum=True)
        except ApiServiceError as exc:
            if exc.code == "CACHE_NOT_READY" and "missing from the local cache" in exc.message:
                raw_path = self.cases.raw_path(normalized, verify_checksum=False, allow_missing=True)
            else:
                raise
        key = (normalized, track_name)
        with self._lock:
            vf = self._files.get(key)
            if vf is None:
                if not raw_path.is_file():
                    try:
                        import urllib.request
                        raw_path.parent.mkdir(parents=True, exist_ok=True)
                        download_url = manifest.get("source_uri") or f"https://api.vitaldb.net/1.0.1/{normalized}.vital"
                        urllib.request.urlretrieve(download_url, str(raw_path))
                    except Exception as exc:
                        raise ApiServiceError(
                            "CACHE_NOT_READY",
                            f"VitalDB case {normalized} raw file could not be downloaded",
                            status_code=503,
                        ) from exc
                    try:
                        self.cases.raw_path(normalized, verify_checksum=True)
                    except Exception:
                        pass
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
        numeric_index = self._numeric_track_index(str(case_id), track_name, track, metadata, origin)
        rate = numeric_index.sample_rate_hz
        first_record = int(np.searchsorted(numeric_index.prefix_ends, start_time_s, side="right"))
        stop_record = int(np.searchsorted(numeric_index.starts, end_time_s, side="left"))
        values: list[tuple[float, float | None]] = []
        if numeric_index.is_scalar:
            starts_arr = numeric_index.starts
            vals_arr = numeric_index.values
            for record_index in range(first_record, stop_record):
                relative = float(starts_arr[record_index])
                if start_time_s <= relative < end_time_s:
                    v = float(vals_arr[record_index])
                    values.append((relative, _finite_float(v)))
        else:
            for record_index in range(first_record, stop_record):
                relative = float(numeric_index.starts[record_index])
                flat = numeric_index.values[record_index]
                if flat.size == 1:
                    if start_time_s <= relative < end_time_s:
                        values.append((relative, _finite_float(flat[0])))
                    continue

                # Multi-value numeric records use their verified source cadence.
                assert rate is not None
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

    def _numeric_track_index(
        self,
        case_id: str,
        track_name: str,
        track: Any,
        metadata: dict[str, Any],
        origin: float,
    ) -> _NumericTrackIndex:
        key = (case_id, track_name)
        with self._lock:
            cached = self._numeric_series.get(key)
            if cached is not None:
                self._numeric_series.move_to_end(key)
                return cached

        sample_rate = _positive_rate(getattr(track, "srate", None))
        if sample_rate is None:
            sample_rate = _positive_rate(metadata.get("observed_update_rate_hz"))

        is_all_scalar = True
        scalar_starts: list[float] = []
        scalar_vals: list[float] = []
        multi_records: list[tuple[float, np.ndarray]] = []

        for record in getattr(track, "recs", ()) or ():
            record_time = _finite_float(_record_value(record, "dt"))
            if record_time is None:
                continue
            raw_val = _record_value(record, "val")
            if is_all_scalar:
                if isinstance(raw_val, (int, float)):
                    scalar_starts.append(record_time - origin)
                    scalar_vals.append(float(raw_val))
                    continue
                if hasattr(raw_val, "__len__") and len(raw_val) == 1:
                    try:
                        scalar_starts.append(record_time - origin)
                        scalar_vals.append(float(raw_val[0]))
                        continue
                    except (TypeError, ValueError):
                        pass

                is_all_scalar = False
                for s, v in zip(scalar_starts, scalar_vals):
                    multi_records.append((s, np.array([v], dtype=np.float32)))
                scalar_starts.clear()
                scalar_vals.clear()

            try:
                flat = np.asarray(raw_val).reshape(-1)
            except (TypeError, ValueError) as exc:
                raise insufficient_data(f"Numeric track {track_name} contains an invalid record") from exc
            if flat.size > 1 and sample_rate is None:
                raise insufficient_data(
                    f"Numeric track {track_name} contains a multi-value record without a verified sample rate"
                )
            multi_records.append((record_time - origin, flat))

        if is_all_scalar:
            if not scalar_starts:
                starts = np.empty(0, dtype=np.float64)
                vals = np.empty(0, dtype=np.float32)
                ends = np.empty(0, dtype=np.float64)
            else:
                starts = np.fromiter(scalar_starts, dtype=np.float64, count=len(scalar_starts))
                vals = np.fromiter(scalar_vals, dtype=np.float32, count=len(scalar_vals))
                sort_idx = np.argsort(starts)
                starts = starts[sort_idx]
                vals = vals[sort_idx]
                ends = np.nextafter(starts, math.inf)
            built = _NumericTrackIndex(
                starts=starts,
                prefix_ends=ends,
                values=vals,
                sample_rate_hz=sample_rate,
                is_scalar=True,
            )
        else:
            multi_records.sort(key=lambda item: item[0])
            starts = np.fromiter((record[0] for record in multi_records), dtype=np.float64, count=len(multi_records))
            values_by_record = tuple(record[1] for record in multi_records)
            ends = np.fromiter((
                start + (float(values.size) / sample_rate if values.size > 1 and sample_rate else 0.0)
                for start, values in multi_records
            ), dtype=np.float64, count=len(multi_records))
            if len(ends):
                for index, values in enumerate(values_by_record):
                    if values.size == 1:
                        ends[index] = np.nextafter(starts[index], math.inf)
                np.maximum.accumulate(ends, out=ends)
            built = _NumericTrackIndex(
                starts=starts,
                prefix_ends=ends,
                values=values_by_record,
                sample_rate_hz=sample_rate,
                is_scalar=False,
            )

        with self._lock:
            cached = self._numeric_series.get(key)
            if cached is not None:
                self._numeric_series.move_to_end(key)
                return cached
            self._numeric_series[key] = built
            self._trim(self._numeric_series, self.settings.signal_file_cache_entries)
        return built

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
        format_code = _integer_value(getattr(track, "fmt", None))
        gain = _finite_float(getattr(track, "gain", None))
        offset = _finite_float(getattr(track, "offset", None))
        if format_code is not None and format_code > 2 and (gain is None or offset is None):
            raise insufficient_data(
                f"Waveform track {track_name} uses an encoded VitalDB format without a valid gain/offset transform"
            )
        display_min = _finite_float(getattr(track, "mindisp", None))
        display_max = _finite_float(getattr(track, "maxdisp", None))
        display_range = (
            {"min": display_min, "max": display_max}
            if display_min is not None and display_max is not None and display_max > display_min
            else None
        )
        timestamps: list[float] = []
        values: list[float | None] = []
        for record in getattr(track, "recs", ()) or ():
            record_time = _finite_float(_record_value(record, "dt"))
            if record_time is None:
                continue
            relative = record_time - origin
            raw = _record_value(record, "val")
            try:
                # Keep the source dtype for range selection. Converting a full
                # multi-million-sample waveform to float64 for every replay
                # chunk creates a large temporary allocation; only the
                # requested window needs the display-value conversion.
                array = np.asarray(raw).reshape(-1)
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
            try:
                selected = np.asarray(array[first:stop], dtype=np.float64)
            except (TypeError, ValueError, OverflowError) as exc:
                raise insufficient_data(
                    f"Waveform track {track_name} contains a non-numeric sample window"
                ) from exc
            # VitalDB stores some waveform formats as integer ADC values. Its
            # official VitalFile sampling path applies this metadata transform
            # before exposing values in the track's declared unit.
            if format_code is not None and format_code > 2:
                selected = selected * gain + offset
            selected = np.where(np.isfinite(selected) & (selected <= 4e9), selected, np.nan)
            timestamps.extend(relative + index / rate for index in range(first, stop))
            values.extend(_finite_float(item) for item in selected)
        if not timestamps:
            raise insufficient_data("No waveform samples were recorded in the requested time range")
        ordered = sorted(zip(timestamps, values), key=lambda item: item[0])
        timestamps = [item[0] for item in ordered]
        values = [item[1] for item in ordered]
        missing = [value is None for value in values]
        provenance = {
            **_provenance(manifest, track_name),
            "value_transform": {
                "method": "VitalDB gain/offset" if format_code is not None and format_code > 2 else "identity",
                "format_code": format_code if format_code is not None else "NOT_RECORDED",
                "gain": gain if format_code is not None and format_code > 2 else 1.0,
                "offset": offset if format_code is not None and format_code > 2 else 0.0,
                "applied": bool(format_code is not None and format_code > 2),
            },
        }
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
            "display_range": display_range,
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


def _integer_value(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number


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
