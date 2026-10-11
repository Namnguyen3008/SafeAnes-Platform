from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import heapq
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import tempfile
import urllib.request
import warnings
from typing import Any, Iterable, Mapping, Sequence

import numpy as np

from backend.app.ml.preprocessing.vitaldb_loader import (
    LoadedTrackMetadata,
    VitalDBCaseSignals,
    VitalDBDataError,
    VitalDBWindowLoader,
)
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT
from .eligibility import (
    UC05_SCHEMA_REQUIRED_TRACKS,
    classify_case_eligibility,
    discover_candidates,
    required_candidate_tracks,
    select_case_ids,
    validate_model_window,
)
from .storage import ImmutableVitalDBStore, build_official_case_uri


class VitalDBPipelineError(RuntimeError):
    """The real-case discovery run could not produce a trustworthy catalog."""


UC04_PLAUSIBLE_RANGES = {
    "art": (-20.0, 300.0),
    "ecg": (-20.0, 20.0),
    "capno": (-5.0, 100.0),
}
UC05_PLAUSIBLE_RANGES = {
    "capno": (-5.0, 120.0),
    "awp": (-20.0, 120.0),
    "SPO2": (50.0, 100.0),
}


def stratified_sample(values: Sequence[int], limit: int) -> list[int]:
    """Deterministically cover the complete sorted candidate-ID range."""
    items = sorted({int(value) for value in values if int(value) > 0})
    if limit < 0:
        raise ValueError("limit cannot be negative")
    if limit == 0 or not items:
        return []
    if len(items) <= limit:
        return items
    if limit == 1:
        return [items[len(items) // 2]]
    indexes = [round(index * (len(items) - 1) / (limit - 1)) for index in range(limit)]
    center = limit // 2
    ordered_positions = [center]
    if 0 != center:
        ordered_positions.append(0)
    if limit - 1 not in ordered_positions:
        ordered_positions.append(limit - 1)
    covered = sorted(ordered_positions)
    intervals: list[tuple[int, int, int]] = []
    for left, right in zip(covered, covered[1:]):
        start, end = left + 1, right - 1
        if start <= end:
            heapq.heappush(intervals, (-(end - start + 1), start, end))
    while intervals:
        _, start, end = heapq.heappop(intervals)
        midpoint = (start + end) // 2
        ordered_positions.append(midpoint)
        for next_start, next_end in ((start, midpoint - 1), (midpoint + 1, end)):
            if next_start <= next_end:
                heapq.heappush(
                    intervals,
                    (-(next_end - next_start + 1), next_start, next_end),
                )
    return [items[indexes[position]] for position in ordered_positions]


def signal_quality_summary(
    values: Iterable[float] | np.ndarray,
    *,
    sample_rate_hz: float,
    plausible: tuple[float, float] | None = None,
) -> dict[str, Any]:
    if not math.isfinite(float(sample_rate_hz)) or sample_rate_hz <= 0:
        raise ValueError("sample_rate_hz must be positive and finite")
    signal = np.asarray(values, dtype=np.float64).reshape(-1)
    finite = np.isfinite(signal)
    nan_mask = np.isnan(signal)
    missing = ~finite
    gap_starts = np.flatnonzero(missing & ~np.r_[False, missing[:-1]])
    gap_ends = np.flatnonzero(missing & ~np.r_[missing[1:], False]) + 1
    gap_lengths = gap_ends - gap_starts
    interval_preview_limit = 20
    valid_indexes = np.flatnonzero(finite)
    implausible_count = 0
    model_valid = finite.copy()
    if plausible is not None:
        low, high = plausible
        implausible = finite & ((signal < low) | (signal > high))
        implausible_count = int(implausible.sum())
        model_valid &= ~implausible
    valid_range = None
    if valid_indexes.size:
        valid_range = [
            float(valid_indexes[0] / sample_rate_hz),
            float(valid_indexes[-1] / sample_rate_hz),
        ]
    sample_count = int(signal.size)
    finite_count = int(finite.sum())
    model_valid_count = int(model_valid.sum())
    nan_count = int(nan_mask.sum())
    return {
        "sample_count": sample_count,
        "finite_count": finite_count,
        "valid_fraction": finite_count / sample_count if sample_count else 0.0,
        "model_valid_fraction": model_valid_count / sample_count if sample_count else 0.0,
        "nan_count": nan_count,
        "nan_fraction": nan_count / sample_count if sample_count else 0.0,
        "nonfinite_count": int(missing.sum()),
        "missing_interval_count": int(gap_lengths.size),
        "longest_missing_interval_seconds": (
            float(gap_lengths.max() / sample_rate_hz) if gap_lengths.size else 0.0
        ),
        "missing_intervals_preview_seconds": [
            [float(start / sample_rate_hz), float(end / sample_rate_hz)]
            for start, end in zip(gap_starts[:interval_preview_limit], gap_ends[:interval_preview_limit])
        ],
        "missing_intervals_preview_truncated": bool(gap_starts.size > interval_preview_limit),
        "implausible_sample_count": implausible_count,
        "artifact_count_from_model_plausibility_filter": implausible_count,
        "plausible_range": list(plausible) if plausible else None,
        "valid_time_range_seconds": valid_range,
    }


def _model_id_key(model_id: str) -> str:
    upper = model_id.upper()
    if upper in {"UC04", UC04_CONTRACT.model_id.upper()}:
        return "uc04"
    if upper in {"UC05", UC05_CONTRACT.model_id.upper()}:
        return "uc05"
    raise ValueError(f"unsupported model id: {model_id}")


def _count_sustained_runs(values: np.ndarray, threshold: float, *, below: bool, seconds: int) -> int:
    data = np.asarray(values, dtype=np.float64).reshape(-1)
    valid = np.isfinite(data)
    condition = (data < threshold) if below else (data <= threshold)
    matched = valid & condition
    starts = np.flatnonzero(matched & ~np.r_[False, matched[:-1]])
    ends = np.flatnonzero(matched & ~np.r_[matched[1:], False]) + 1
    return int(np.sum((ends - starts) >= seconds))


def _distribution(values: np.ndarray, *, unit: str | None) -> dict[str, Any]:
    data = np.asarray(values, dtype=np.float64).reshape(-1)
    data = data[np.isfinite(data)]
    if not data.size:
        return {"unit": unit or "NOT_RECORDED", "sample_count": 0, "min": None, "p10": None, "median": None, "p90": None, "max": None}
    low, p10, median, p90, high = np.percentile(data, [0, 10, 50, 90, 100])
    return {
        "unit": unit or "NOT_RECORDED",
        "sample_count": int(data.size),
        "min": float(low),
        "p10": float(p10),
        "median": float(median),
        "p90": float(p90),
        "max": float(high),
    }


def _metadata_json(metadata: LoadedTrackMetadata | None) -> dict[str, Any]:
    if metadata is None:
        return {
            "source_device": "NOT_RECORDED",
            "track_type": "NOT_RECORDED",
            "native_sample_rate_hz": "NOT_RECORDED",
            "observed_update_rate_hz": "NOT_RECORDED",
            "unit": "NOT_RECORDED",
            "record_count": "NOT_RECORDED",
            "native_sample_count": "NOT_RECORDED",
            "valid_time_range_seconds": "NOT_RECORDED",
        }
    return {
        "source_device": metadata.source_device or "NOT_RECORDED",
        "track_type": metadata.track_type or "NOT_RECORDED",
        "native_sample_rate_hz": metadata.native_sample_rate_hz if metadata.native_sample_rate_hz is not None else "NOT_RECORDED",
        "observed_update_rate_hz": metadata.observed_update_rate_hz if metadata.observed_update_rate_hz is not None else "NOT_RECORDED",
        "unit": metadata.unit or "NOT_RECORDED",
        "record_count": metadata.record_count if metadata.record_count is not None else "NOT_RECORDED",
        "native_sample_count": metadata.native_sample_count if metadata.native_sample_count is not None else "NOT_RECORDED",
        "valid_time_range_seconds": metadata.valid_time_range_seconds if metadata.valid_time_range_seconds is not None else "NOT_RECORDED",
    }


def _series_diagnostics(series: VitalDBCaseSignals) -> dict[str, Any]:
    model = _model_id_key(series.model_id)
    ranges = UC04_PLAUSIBLE_RANGES if model == "uc04" else UC05_PLAUSIBLE_RANGES
    diagnostics: dict[str, Any] = {}
    required_tracks = required_candidate_tracks(model)

    for index, feature in enumerate(series.numeric_feature_order):
        track_name = series.numeric_track_names.get(feature)
        values = series.numeric_values[:, index]
        rate = 1.0
        unit_range = ranges.get(feature)
        metadata = series.track_metadata.get(track_name or "")
        diagnostics[f"numeric:{feature}"] = {
            "track_name": track_name or "NOT_RECORDED",
            **_metadata_json(metadata),
            "analysis_sample_rate_hz": rate,
            "quality": signal_quality_summary(values, sample_rate_hz=rate, plausible=unit_range),
        }

    for name, rate in series.waveform_rates_hz.items():
        track_name = series.waveform_track_names.get(name)
        values = series.waveform_values.get(name, np.asarray([], dtype=np.float32))
        metadata = series.track_metadata.get(track_name or "")
        diagnostics[f"waveform:{name}"] = {
            "track_name": track_name or "NOT_RECORDED",
            **_metadata_json(metadata),
            "analysis_sample_rate_hz": rate,
            "quality": signal_quality_summary(values, sample_rate_hz=rate, plausible=ranges.get(name)),
        }

    track_ranges = {}
    for role in required_tracks:
        metadata = series.track_metadata.get(role)
        if metadata and metadata.valid_time_range_seconds:
            track_ranges[role] = metadata.valid_time_range_seconds
        else:
            feature = next((key for key, name in series.numeric_track_names.items() if name == role), None)
            if feature is not None:
                values = series.numeric_values[:, series.numeric_feature_order.index(feature)]
                diag = signal_quality_summary(values, sample_rate_hz=1.0)
            else:
                wave_name = next((key for key, name in series.waveform_track_names.items() if name == role), None)
                values = series.waveform_values.get(wave_name or "", np.asarray([], dtype=np.float32))
                rate = series.waveform_rates_hz.get(wave_name or "", 1.0)
                diag = signal_quality_summary(values, sample_rate_hz=rate)
            track_ranges[role] = diag["valid_time_range_seconds"]

    known_ranges = [value for value in track_ranges.values() if value is not None]
    overlap = None
    if known_ranges:
        start = max(value[0] for value in known_ranges)
        end = min(value[1] for value in known_ranges)
        overlap = {"start_seconds": start, "end_seconds": end, "duration_seconds": max(0.0, end - start)}

    def channel(feature: str) -> np.ndarray:
        if feature in series.numeric_feature_order:
            return series.numeric_values[:, series.numeric_feature_order.index(feature)]
        return np.asarray([], dtype=np.float32)

    map_distribution = _distribution(channel("MAP"), unit="mmHg") if model == "uc04" else None
    spo2_distribution = _distribution(channel("SPO2"), unit="%")
    hr_distribution = _distribution(channel("HR"), unit="/min")
    map_low_run_count = (
        _count_sustained_runs(channel("MAP"), 65.0, below=False, seconds=60)
        if model == "uc04" else 0
    )
    spo2_low_run_count = _count_sustained_runs(channel("SPO2"), 90.0, below=True, seconds=60)
    trajectory = {
        "map_distribution": map_distribution,
        "heart_rate_distribution": hr_distribution,
        "spo2_distribution": spo2_distribution,
        "map_task_threshold_runs_60s": map_low_run_count if model == "uc04" else None,
        "spo2_task_threshold_runs_60s": spo2_low_run_count,
        "selection_signature": {
            "map_task_threshold_observed": bool(map_low_run_count) if model == "uc04" else "NOT_APPLICABLE",
            "spo2_task_threshold_observed": bool(spo2_low_run_count),
        },
        "thresholds_are_model_task_labels_not_clinical_interpretations": True,
    }
    return {
        "tracks": diagnostics,
        "time_synchronization": {
            "timebase": "VitalFile shared dtstart; all arrays are case-relative and aligned on that origin",
            "case_relative_range_seconds": [0.0, float(series.duration_seconds)],
            "required_track_ranges_seconds": track_ranges,
            "required_track_overlap": overlap,
            "based_on_common_vitalfile_time_grid": True,
        },
        "trajectory_summary": trajectory,
    }


class CaseInspector:
    """Runs the shipped preprocessing gates across complete model windows."""

    def __init__(self, loader: VitalDBWindowLoader | None = None) -> None:
        self.loader = loader or VitalDBWindowLoader()

    def inspect(
        self,
        case_id: int,
        model_ids: Sequence[str],
        *,
        source_path: str | Path | None = None,
    ) -> dict[str, Any]:
        model_results: dict[str, Any] = {}
        actual_track_metadata: dict[str, dict[str, Any]] = {}
        durations: list[float] = []

        for requested_model in model_ids:
            model = _model_id_key(requested_model)
            contract = UC04_CONTRACT if model == "uc04" else UC05_CONTRACT
            try:
                series = self.loader.load_case_signals(
                    model, case_id, source_path=source_path
                )
            except (VitalDBDataError, OSError, ValueError) as exc:
                model_results[model] = {
                    "eligible": False,
                    "load_error": f"{type(exc).__name__}: {exc}",
                    "valid_windows": [],
                    "number_of_valid_windows": 0,
                    "rejected_window_reasons": {},
                    "quality_summary": None,
                    "trajectory_summary": None,
                }
                continue

            durations.append(series.duration_seconds)
            for name, metadata in series.track_metadata.items():
                actual_track_metadata[name] = _metadata_json(metadata)
            diagnostics = _series_diagnostics(series)
            stride = int(contract.stride_seconds)
            first_time = int(math.ceil(contract.window_seconds["numeric"] / stride) * stride)
            last_time = int(series.duration_seconds // stride) * stride
            valid_windows: list[dict[str, Any]] = []
            rejection_reasons: Counter[str] = Counter()
            rejection_examples: dict[str, float] = {}
            window_coverages: list[float] = []
            for prediction_time in range(first_time, last_time + 1, stride):
                window = series.window_at(prediction_time)
                result = validate_model_window(model, window)
                if not result.accepted:
                    reason = result.reason or "unspecified input validation failure"
                    rejection_reasons[reason] += 1
                    rejection_examples.setdefault(reason, float(prediction_time))
                    continue
                coverage = float(result.data_coverage or 0.0)
                window_coverages.append(coverage)
                valid_windows.append({
                    "prediction_time_seconds": float(prediction_time),
                    "window_start_seconds": float(window.window_start_s),
                    "window_end_seconds": float(window.window_end_s),
                    "quality_status": result.quality_status,
                    "data_coverage": coverage,
                    "missing_features": list(result.missing_features),
                })

            quality = {
                **diagnostics,
                "window_validation": {
                    "window_seconds": contract.window_seconds,
                    "stride_seconds": stride,
                    "tested_window_count": len(range(first_time, last_time + 1, stride)),
                    "valid_window_count": len(valid_windows),
                    "rejected_window_count": sum(rejection_reasons.values()),
                    "valid_window_coverage_mean": (
                        float(np.mean(window_coverages)) if window_coverages else None
                    ),
                    "valid_window_coverage_min": (
                        float(min(window_coverages)) if window_coverages else None
                    ),
                    "rejected_window_reasons": dict(sorted(rejection_reasons.items())),
                    "rejected_window_examples_seconds": rejection_examples,
                    "coverage_thresholds": {
                        "source": "existing UC preprocessing code only; no pipeline-wide threshold added"
                    },
                },
            }
            model_results[model] = {
                "eligible": bool(valid_windows),
                "load_error": None,
                "valid_windows": valid_windows,
                "number_of_valid_windows": len(valid_windows),
                "rejected_window_reasons": dict(sorted(rejection_reasons.items())),
                "quality_summary": quality,
                "trajectory_summary": diagnostics["trajectory_summary"],
                "selected_tracks": series.selected_tracks,
            }

        uc04_windows = model_results.get("uc04", {}).get("valid_windows", [])
        uc05_windows = model_results.get("uc05", {}).get("valid_windows", [])
        categories = classify_case_eligibility(
            uc04_valid_windows=[entry["prediction_time_seconds"] for entry in uc04_windows],
            uc05_valid_windows=[entry["prediction_time_seconds"] for entry in uc05_windows],
        )
        trajectory_signatures = []
        for model in ("uc04", "uc05"):
            value = model_results.get(model, {}).get("trajectory_summary")
            if value:
                trajectory_signatures.append(value.get("selection_signature"))
        coverages = [
            result["quality_summary"]["window_validation"]["valid_window_coverage_mean"]
            for result in model_results.values()
            if result.get("quality_summary")
            and result["quality_summary"]["window_validation"]["valid_window_coverage_mean"] is not None
        ]
        return {
            "case_id": int(case_id),
            "duration_seconds": min(durations) if durations else None,
            "available_tracks_verified": sorted(actual_track_metadata),
            "track_metadata": actual_track_metadata,
            "models": model_results,
            "eligibility_categories": list(categories),
            "uc04_valid_windows": [entry["prediction_time_seconds"] for entry in uc04_windows],
            "uc05_valid_windows": [entry["prediction_time_seconds"] for entry in uc05_windows],
            "selection_coverage": float(np.mean(coverages)) if coverages else 0.0,
            "trajectory_signature": trajectory_signatures,
        }


def _candidate_queue(uc04: Sequence[int], uc05: Sequence[int], budget: int) -> list[int]:
    if budget <= 0:
        raise ValueError("inspection budget must be positive")
    dual = sorted(set(uc04) & set(uc05))
    single = sorted((set(uc04) | set(uc05)) - set(dual))
    if not single:
        return stratified_sample(dual, budget)
    dual_quota = min(len(dual), max(2, int(math.ceil(budget * 0.75))))
    dual_sample = stratified_sample(dual, dual_quota)
    single_sample = stratified_sample(single, max(0, budget - len(dual_sample)))
    queue = dual_sample + single_sample
    if len(queue) < min(budget, len(set(uc04) | set(uc05))):
        remaining = sorted((set(uc04) | set(uc05)) - set(queue))
        queue.extend(remaining[: budget - len(queue)])
    return queue[:budget]


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _atomic_json(path: Path, content: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    temp = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as output:
            json.dump(content, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def _track_inventory_from_raw(
    raw_path: Path,
    vitaldb_module: Any,
    loader: VitalDBWindowLoader,
    selected_metadata: Mapping[str, Mapping[str, Any]],
) -> tuple[list[dict[str, Any]], float]:
    try:
        vital_file = vitaldb_module.VitalFile(str(raw_path), header_only=True)
    except Exception as exc:
        raise VitalDBPipelineError(f"saved raw case failed VitalFile header validation: {exc}") from exc
    origin = float(vital_file.dtstart)
    duration = float(vital_file.dtend - vital_file.dtstart)
    names = vital_file.get_track_names()
    inventory: list[dict[str, Any]] = []
    for name in sorted(map(str, names or [])):
        info = loader._track_info(vital_file, name, origin_timestamp=origin)
        item = {"track_name": name, **_metadata_json(info)}
        selected = selected_metadata.get(name)
        if selected:
            for field in ("record_count", "native_sample_count", "observed_update_rate_hz", "valid_time_range_seconds"):
                if selected.get(field) is not None:
                    item[field] = selected[field]
        inventory.append(item)
    if duration <= 0:
        raise VitalDBPipelineError("saved raw case has invalid recording duration")
    return inventory, duration


def _clinical_context(vitaldb_module: Any, case_id: int) -> dict[str, Any]:
    fields = ("age", "sex", "asa", "bmi", "weight", "height")
    frame = vitaldb_module.load_clinical_data([case_id], params=["caseid", *fields])
    if frame is None or len(frame) == 0:
        return {field: "NOT_RECORDED" for field in fields}
    row = frame.iloc[0]
    result: dict[str, Any] = {}
    for field in fields:
        value = row.get(field)
        if value is None or (isinstance(value, float) and not math.isfinite(value)):
            result[field] = "NOT_RECORDED"
        elif isinstance(value, np.generic):
            result[field] = value.item()
        else:
            result[field] = value
    return result


def _readiness(model: str, eligible: bool) -> str:
    if not eligible:
        return "INPUT_NOT_ELIGIBLE"
    if model == "uc05":
        return "INPUT_READY_MODEL_BLOCKED_CONTRACT_MISMATCH"
    return "INPUT_READY_MODEL_INTEGRATION_READY"


def _make_manifest(
    inspected: Mapping[str, Any],
    *,
    raw_path: Path,
    raw_sha256: str,
    raw_size_bytes: int,
    download_time: str,
    download_time_basis: str,
    source_uri: str,
    dataset_version: str,
    vitaldb_module: Any,
    loader: VitalDBWindowLoader,
) -> dict[str, Any]:
    selected_metadata: dict[str, Mapping[str, Any]] = {}
    for model_result in inspected["models"].values():
        selected_metadata.update(model_result.get("quality_summary", {}).get("tracks", {}))
    selected_track_metadata = {
        item.get("track_name"): item for item in selected_metadata.values() if item.get("track_name")
    }
    # The full raw header is the authoritative case inventory; the selected
    # model series adds observed record times and update rates for input tracks.
    inventory, duration = _track_inventory_from_raw(
        raw_path, vitaldb_module, loader, selected_track_metadata
    )
    actual_names = {item["track_name"] for item in inventory}
    eligible04 = bool(inspected["models"].get("uc04", {}).get("eligible"))
    eligible05 = bool(inspected["models"].get("uc05", {}).get("eligible"))
    missing_tracks = {
        "uc04": sorted(set(required_candidate_tracks("UC04")) - actual_names),
        "uc05": sorted(set(UC05_SCHEMA_REQUIRED_TRACKS) - actual_names),
    }
    contracts = {
        "uc04": UC04_CONTRACT.model_version,
        "uc05": UC05_CONTRACT.model_version,
    }
    return {
        "schema_version": "1.0",
        "case_id": str(inspected["case_id"]),
        "dataset": "VitalDB",
        "source": "official_dataset",
        "source_uri": source_uri,
        "download_time_utc": download_time,
        "download_time_basis": download_time_basis,
        "source_dataset_version": dataset_version,
        "vitaldb_python_version": importlib.metadata.version("vitaldb"),
        "raw_file": {
            "relative_path": f"raw/{raw_path.name}",
            "size_bytes": raw_size_bytes,
            "sha256": raw_sha256,
            "immutable": True,
        },
        "recording": {
            "duration_seconds": duration,
            "relative_time_range_seconds": [0.0, duration],
            "absolute_timestamps_excluded": True,
        },
        "eligibility": {
            "uc04": eligible04,
            "uc05": eligible05,
            "categories": inspected["eligibility_categories"],
        },
        "available_tracks": inventory,
        "available_track_names": sorted(actual_names),
        "missing_required_tracks": missing_tracks,
        "valid_windows": {
            model: result.get("valid_windows", [])
            for model, result in inspected["models"].items()
        },
        "number_of_valid_windows": {
            model: result.get("number_of_valid_windows", 0)
            for model, result in inspected["models"].items()
        },
        "quality_summary": {
            model: result.get("quality_summary")
            for model, result in inspected["models"].items()
        },
        "model_contract_versions": contracts,
        "model_readiness": {
            "uc04": _readiness("uc04", eligible04),
            "uc05": _readiness("uc05", eligible05),
        },
        "training_split_membership": {
            "uc04": "UNKNOWN",
            "uc05": "UNKNOWN",
            "reason": "Frozen original case-ID split manifests were not present beside the model artifacts.",
        },
        "patient_context": _clinical_context(vitaldb_module, int(inspected["case_id"])),
        "attribution": "VitalDB open dataset, CC BY 4.0; see https://vitaldb.net/docs/?documentId=General/Terms_and_Conditions.md",
    }


def _catalog_entry(manifest: Mapping[str, Any]) -> dict[str, Any]:
    eligibility = manifest["eligibility"]
    quality = manifest["quality_summary"]
    means = {}
    for model in ("uc04", "uc05"):
        validation = (quality.get(model) or {}).get("window_validation") or {}
        means[model] = validation.get("valid_window_coverage_mean", "NOT_RECORDED")
    return {
        "case_id": manifest["case_id"],
        "duration_seconds": manifest["recording"]["duration_seconds"],
        "available_signals": manifest["available_track_names"],
        "uc04_eligible": eligibility["uc04"],
        "uc05_eligible": eligibility["uc05"],
        "coverage_summary": means,
        "number_of_valid_windows": manifest["number_of_valid_windows"],
        "inference_readiness": manifest["model_readiness"],
        "patient_context": manifest["patient_context"],
        "dataset_version": manifest["source_dataset_version"],
    }


def _download_raw_case(
    store: ImmutableVitalDBStore,
    case_id: int,
    dataset_version: str,
    *,
    timeout_seconds: float = 120.0,
) -> tuple[Path, str, str, int, str]:
    uri = build_official_case_uri(case_id, dataset_version)
    destination = store.raw_dir / f"{case_id}.vital"
    download_metadata_path = store.root / "cache" / f"{case_id}.download.json"
    if destination.exists():
        store.validator(destination)
        checksum = _sha256_file(destination)
        if download_metadata_path.exists():
            previous = json.loads(download_metadata_path.read_text(encoding="utf-8"))
            if previous.get("raw_sha256") == checksum:
                return (
                    destination,
                    checksum,
                    str(previous.get("download_time_utc", "NOT_RECORDED")),
                    destination.stat().st_size,
                    str(previous.get("download_time_basis", "NOT_RECORDED")),
                )
        written_time = datetime.fromtimestamp(destination.stat().st_mtime, timezone.utc).isoformat()
        _atomic_json(download_metadata_path, {
            "case_id": str(case_id),
            "source_uri": uri,
            "dataset_version": dataset_version,
            "raw_sha256": checksum,
            "download_time_utc": written_time,
            "download_time_basis": "existing raw file's filesystem write timestamp",
        })
        return (
            destination,
            checksum,
            written_time,
            destination.stat().st_size,
            "existing raw file's filesystem write timestamp",
        )
    request = urllib.request.Request(
        uri,
        headers={"User-Agent": "SafeAnes-VitalDB-Case-Discovery/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            record = store.store_stream(case_id, response, source_uri=uri)
    except Exception as exc:
        raise VitalDBPipelineError(f"could not download official VitalDB case {case_id}: {exc}") from exc
    _atomic_json(download_metadata_path, {
        "case_id": str(case_id),
        "source_uri": uri,
        "dataset_version": dataset_version,
        "raw_sha256": record.sha256,
        "download_time_utc": record.download_time_utc,
        "download_time_basis": "download completed and stored by this pipeline run",
    })
    return (
        record.path,
        record.sha256,
        record.download_time_utc,
        record.size_bytes,
        "download completed and stored by this pipeline run",
    )


def _write_report(
    path: Path,
    *,
    dataset_version: str,
    vitaldb_version: str,
    candidate_counts: Mapping[str, int],
    inspected_reports: Sequence[Mapping[str, Any]],
    selected_manifests: Sequence[Mapping[str, Any]],
    budget: int,
    queue_size: int,
    warnings_captured: Sequence[str],
    failed_local_checks: Sequence[Mapping[str, Any]],
) -> None:
    all_candidates = candidate_counts["uc04"] + candidate_counts["uc05"] - candidate_counts["dual_index_candidates"]
    inspected_ids = {int(item["case_id"]) for item in inspected_reports}
    excluded = [
        item for item in inspected_reports
        if not item.get("eligibility_categories")
    ]
    eligible_unselected = [
        item for item in inspected_reports
        if item.get("eligibility_categories")
        and int(item["case_id"]) not in {int(m["case_id"]) for m in selected_manifests}
    ]
    counts04 = sum(bool(item.get("uc04_valid_windows")) for item in inspected_reports)
    counts05 = sum(bool(item.get("uc05_valid_windows")) for item in inspected_reports)
    dual_count = sum(
        bool(item.get("uc04_valid_windows")) and bool(item.get("uc05_valid_windows"))
        for item in inspected_reports
    )
    lines = [
        "# VitalDB case selection and eligibility report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Source and search scope",
        "",
        f"- Dataset version: `{dataset_version}`.",
        f"- Installed VitalDB Python library: `{vitaldb_version}`.",
        f"- UC04 indexed candidates: **{candidate_counts['uc04']}**.",
        f"- UC05 strict-schema indexed candidates: **{candidate_counts['uc05']}**.",
        f"- Indexed intersection: **{candidate_counts['dual_index_candidates']}**; this is only a candidate count.",
        f"- Unique candidate IDs across both sets: **{all_candidates}**.",
        f"- Full VitalFile/preprocessor inspections: **{len(inspected_reports)} of {all_candidates} unique candidates** (inspection budget {budget}; sampled queue {queue_size}).",
        f"- Not inspected: **{max(0, all_candidates - len(inspected_ids))}**. These are unverified, not excluded.",
        f"- Inspection stopped after {len(inspected_reports)} cases when the configured eligibility targets were reached, or when the sampled queue/budget was exhausted.",
        "- Candidate sampling is deterministic and stratified across the candidate-ID range. Candidate-index track presence is never treated as eligibility.",
        "- For each inspected case, eligibility requires at least one 30-second-stride window accepted by the existing UC-specific service validator and preprocessing code.",
        "- UC05 additionally requires valid SpO₂, capnogram, AWP, and PPG because its exported `signal_schema.json` marks all three waveforms required; the service/evaluator mismatch remains a model-readiness blocker.",
        "- No model predictions were generated or used to select cases.",
        "",
        "## Verified eligibility among inspected cases",
        "",
        f"- UC04 eligible: **{counts04}**.",
        f"- UC05 eligible under the strict exported schema: **{counts05}**.",
        f"- Dual eligible (each model independently has accepted windows): **{dual_count}**.",
        f"- Selected and locally revalidated: **{len(selected_manifests)}**.",
        "",
        "## Selected cases",
        "",
    ]
    if not selected_manifests:
        lines.append("No case passed both discovery-time and local-raw revalidation within this run's inspection budget.")
    for manifest in selected_manifests:
        case_id = int(manifest["case_id"])
        eligibility = manifest["eligibility"]
        uc04_trajectory = (manifest.get("quality_summary", {}).get("uc04") or {}).get("trajectory_summary") or {}
        uc05_trajectory = (manifest.get("quality_summary", {}).get("uc05") or {}).get("trajectory_summary") or {}
        observed_profiles: list[str] = []
        map_profile = uc04_trajectory.get("map_distribution")
        spo2_profile = uc05_trajectory.get("spo2_distribution")
        if map_profile and map_profile.get("median") is not None:
            observed_profiles.append(
                f"MAP median {map_profile['median']:.1f} mmHg (p10–p90 {map_profile['p10']:.1f}–{map_profile['p90']:.1f})"
            )
        if spo2_profile and spo2_profile.get("median") is not None:
            observed_profiles.append(
                f"SpO₂ median {spo2_profile['median']:.1f}% (p10–p90 {spo2_profile['p10']:.1f}–{spo2_profile['p90']:.1f})"
            )
        lines.extend([
            f"### VitalDB case {case_id}",
            "",
            f"- Eligibility: UC04 `{eligibility['uc04']}`, UC05 `{eligibility['uc05']}`; categories `{', '.join(eligibility['categories'])}`.",
            f"- Duration: {manifest['recording']['duration_seconds']:.1f} seconds.",
            f"- Raw size / SHA-256: {manifest['raw_file']['size_bytes']} bytes / `{manifest['raw_file']['sha256']}`.",
            f"- Valid windows: UC04 {manifest['number_of_valid_windows'].get('uc04', 0)}, UC05 {manifest['number_of_valid_windows'].get('uc05', 0)}.",
            f"- Mean accepted-window coverage: UC04 {manifest['quality_summary'].get('uc04', {}).get('window_validation', {}).get('valid_window_coverage_mean', 'NOT_RECORDED')}, UC05 {manifest['quality_summary'].get('uc05', {}).get('window_validation', {}).get('valid_window_coverage_mean', 'NOT_RECORDED')}.",
            f"- Observed signal profile (descriptive): {'; '.join(observed_profiles) if observed_profiles else 'NOT_RECORDED'}.",
            "- Task-threshold trajectory descriptors are also recorded; no model prediction was used for ranking.",
            f"- Split membership: UC04 `{manifest['training_split_membership']['uc04']}`, UC05 `{manifest['training_split_membership']['uc05']}`.",
            f"- UC05 model readiness remains `{manifest['model_readiness']['uc05']}` even where case inputs pass.",
            "- Tracked signal coverage and gap details are in the adjacent machine-readable case manifest.",
            "",
        ])
    lines.extend([
        "## Excluded inspected cases",
        "",
    ])
    if not excluded:
        lines.append("No fully inspected case was excluded by input validation in this run.")
    for item in excluded:
        model_errors = []
        for model, result in item["models"].items():
            if result.get("load_error"):
                model_errors.append(f"{model.upper()}: {result['load_error']}")
            else:
                reasons = result.get("rejected_window_reasons", {})
                model_errors.append(f"{model.upper()}: no accepted windows; {reasons or 'no compatible windows'}")
        lines.append(f"- Case {item['case_id']}: " + "; ".join(model_errors) + ".")
    if eligible_unselected:
        lines.extend(["", "Eligible but not selected (selection targets/quality/diversity):"])
        for item in eligible_unselected:
            lines.append(f"- Case {item['case_id']}: {', '.join(item['eligibility_categories'])}.")
    if failed_local_checks:
        lines.extend(["", "Local raw download/revalidation failures:"])
        for failure in failed_local_checks:
            lines.append(f"- Case {failure['case_id']}: {failure['reason']}.")
    if warnings_captured:
        lines.extend(["", "VitalDB API notices:"])
        lines.extend(f"- {notice}" for notice in sorted(set(warnings_captured)))
    lines.extend([
        "",
        "## Selection and quality rules",
        "",
        "- Eligibility uses the existing UC04/UC05 preprocessing coverage and validation rules, including the trained feature order, sample rates, window sizes, missing-value policy, and signal plausibility filters.",
        "- No pipeline-wide minimum coverage threshold was added. Per-track coverage, NaN/gap counts, valid overlap, and model-window counts are descriptive; model gates decide input eligibility.",
        "- Case selection favors dual eligibility, then mean accepted-window data coverage, then a distinct observed task-label trajectory signature where present. It never ranks by model prediction.",
        "- MAP ≤65 mmHg sustained for 60 seconds and SpO₂ <90% sustained for 60 seconds are included only as observed trajectory descriptors matching the model label definitions; they are not presented as diagnoses or clinical guidance.",
        "- Training/validation/test membership is `UNKNOWN`: the model directory contains notebooks that describe a generated patient-level split, but no frozen case-ID split manifest was found beside the artifacts. This catalog does not claim independent evaluation.",
        "",
        "## Data storage and provenance",
        "",
        "- Selected records are saved byte-for-byte from the official versioned `.vital` source under `backend/data/vitaldb/raw/` and checked with VitalFile plus SHA-256.",
        "- Raw files are write-once. Processed quality summaries and per-case manifests are stored alongside them; raw samples are not normalized, interpolated, or rewritten.",
        "- Absolute deidentified timestamps are omitted from manifests; all times are relative to the VitalFile shared time origin.",
        "- Patient metadata in the catalog is read from the official deidentified case metadata; missing fields are `NOT_RECORDED`. Subject identifiers are not exported.",
        "",
        "## License and attribution",
        "",
        "VitalDB describes its open dataset as available under **CC BY 4.0**. Attribute VitalDB, link the license, and indicate changes when redistributing adapted material. Do not attempt re-identification. Dataset citation: Lee HC et al., *VitalDB, a high-fidelity multi-parameter vital signs database in surgical patients*, Scientific Data (2022).",
        "",
        "- [VitalDB terms and conditions](https://vitaldb.net/docs/?documentId=General/Terms_and_Conditions.md)",
        "- [VitalDB open dataset overview](https://vitaldb.net/docs/?documentId=OpenDataset/Overview.md)",
        "- [Official VitalDB API](https://api.vitaldb.net/)",
        "",
        "## Remaining integration blocker",
        "",
        "UC05 case-input eligibility is reported independently from model readiness. The released schema requires capno/AWP/PPG while the inference package records a stream-evaluator contract mismatch; no prediction/UI binding is enabled by this case catalog.",
        "",
    ])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def run_case_discovery(
    *,
    project_root: str | Path | None = None,
    inspection_budget: int = 80,
    target_per_model: int = 3,
    dual_target: int = 2,
) -> dict[str, Any]:
    try:
        import vitaldb
        from vitaldb import dataset as vitaldb_dataset
    except ImportError as exc:
        raise VitalDBPipelineError("Install the audited VitalDB Python library before discovery") from exc

    root = Path(project_root).resolve() if project_root else Path(__file__).resolve().parents[3]
    backend_root = root / "backend"
    data_root = backend_root / "data" / "vitaldb"
    cache_root = data_root / "cache"
    manifest_root = data_root / "manifests"
    processed_root = data_root / "processed"
    catalog_path = backend_root / "data" / "manifests" / "vitaldb_case_catalog.json"
    report_path = root / "docs" / "integration" / "CASE_SELECTION_REPORT.md"
    for path in (cache_root, manifest_root, processed_root):
        path.mkdir(parents=True, exist_ok=True)

    version = str(vitaldb_dataset.DATASET_VERSION)
    library_version = importlib.metadata.version("vitaldb")
    notices: list[str] = []
    with warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter("always", DeprecationWarning)
        uc04_candidates = discover_candidates(vitaldb, "UC04")
        uc05_candidates = discover_candidates(vitaldb, "UC05")
        notices.extend(str(w.message) for w in captured)
    dual_index = set(uc04_candidates) & set(uc05_candidates)
    candidate_counts = {
        "uc04": len(uc04_candidates),
        "uc05": len(uc05_candidates),
        "dual_index_candidates": len(dual_index),
    }
    query_cache = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset": "VitalDB",
        "dataset_version": version,
        "vitaldb_python_version": library_version,
        "candidate_search_method": "vitaldb.find_cases; indexed candidates only",
        "candidate_track_requirements": {
            "uc04": list(required_candidate_tracks("UC04")),
            "uc05": list(required_candidate_tracks("UC05")),
        },
        "candidate_counts": candidate_counts,
        "uc04_candidate_case_ids": uc04_candidates,
        "uc05_candidate_case_ids": uc05_candidates,
        "api_notices": sorted(set(notices)),
    }
    _atomic_json(cache_root / f"candidate_search_v{version}.json", query_cache)

    queue = _candidate_queue(uc04_candidates, uc05_candidates, inspection_budget)
    inspector = CaseInspector(VitalDBWindowLoader(vitaldb_module=vitaldb))
    reports: list[dict[str, Any]] = []
    uc04_set = set(uc04_candidates)
    uc05_set = set(uc05_candidates)
    for case_id in queue:
        models = []
        if case_id in uc04_set:
            models.append("UC04")
        if case_id in uc05_set:
            models.append("UC05")
        inspected = inspector.inspect(case_id, models)
        inspected["candidate_index_membership"] = models
        reports.append(inspected)
        eligible04 = sum(bool(item.get("uc04_valid_windows")) for item in reports)
        eligible05 = sum(bool(item.get("uc05_valid_windows")) for item in reports)
        dual_eligible = sum(bool(item.get("uc04_valid_windows")) and bool(item.get("uc05_valid_windows")) for item in reports)
        if eligible04 >= target_per_model and eligible05 >= target_per_model and dual_eligible >= dual_target:
            break

    store = ImmutableVitalDBStore(data_root, vitaldb_module=vitaldb)
    verified_manifests: list[dict[str, Any]] = []
    failed_local_checks: list[dict[str, Any]] = []
    attempted: set[int] = set()
    selected_ids: set[int] = set()
    eligible_reports = [item for item in reports if item["eligibility_categories"]]

    while True:
        current04 = sum(bool(item.get("eligibility", {}).get("uc04")) for item in verified_manifests)
        current05 = sum(bool(item.get("eligibility", {}).get("uc05")) for item in verified_manifests)
        current_dual = sum(bool(item.get("eligibility", {}).get("uc04")) and bool(item.get("eligibility", {}).get("uc05")) for item in verified_manifests)
        need04 = max(0, target_per_model - current04)
        need05 = max(0, target_per_model - current05)
        need_dual = max(0, dual_target - current_dual)
        if need04 == 0 and need05 == 0 and need_dual == 0:
            break
        remaining = [item for item in eligible_reports if int(item["case_id"]) not in attempted]
        proposed = select_case_ids(
            remaining,
            uc04_target=need04,
            uc05_target=need05,
            dual_target=need_dual,
        )
        if not proposed:
            break
        case_id = proposed[0]
        attempted.add(case_id)
        selected_report = next(item for item in remaining if int(item["case_id"]) == case_id)
        models = selected_report["candidate_index_membership"]
        try:
            uri = build_official_case_uri(case_id, version)
            raw_path, raw_checksum, download_time, raw_bytes, download_time_basis = _download_raw_case(
                store, case_id, version
            )
            local_report = inspector.inspect(case_id, models, source_path=raw_path)
            for model in ("uc04", "uc05"):
                remote_times = selected_report.get(f"{model}_valid_windows", [])
                local_times = local_report.get(f"{model}_valid_windows", [])
                if remote_times and remote_times != local_times:
                    raise VitalDBPipelineError(
                        f"{model.upper()} valid windows changed after local raw re-read"
                    )
                if remote_times and not local_times:
                    raise VitalDBPipelineError(
                        f"{model.upper()} lost all accepted windows after local raw re-read"
                    )
            if not local_report["eligibility_categories"]:
                raise VitalDBPipelineError("local raw file passed no complete input pipeline")
            local_report["candidate_index_membership"] = models
            manifest = _make_manifest(
                local_report,
                raw_path=raw_path,
                raw_sha256=raw_checksum,
                raw_size_bytes=raw_bytes,
                download_time=download_time,
                download_time_basis=download_time_basis,
                source_uri=uri,
                dataset_version=version,
                vitaldb_module=vitaldb,
                loader=inspector.loader,
            )
            manifest_path = manifest_root / f"{case_id}.json"
            processed_path = processed_root / f"{case_id}.json"
            _atomic_json(manifest_path, manifest)
            _atomic_json(processed_path, {
                "case_id": str(case_id),
                "dataset_version": version,
                "raw_sha256": raw_checksum,
                "quality_summary": manifest["quality_summary"],
                "valid_windows": manifest["valid_windows"],
                "eligibility": manifest["eligibility"],
            })
            verified_manifests.append(manifest)
            selected_ids.add(case_id)
        except Exception as exc:
            failed_local_checks.append({"case_id": case_id, "reason": f"{type(exc).__name__}: {exc}"})

    catalog = {
        "schema_version": "1.0",
        "dataset": "VitalDB",
        "dataset_version": version,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": "official_dataset",
        "attribution": "VitalDB open dataset, CC BY 4.0",
        "search_summary": {
            "uc04_index_candidates": len(uc04_candidates),
            "uc05_index_candidates": len(uc05_candidates),
            "dual_index_candidates": len(dual_index),
            "fully_inspected_cases": len(reports),
            "inspection_budget": inspection_budget,
        },
        "cases": [_catalog_entry(manifest) for manifest in verified_manifests],
    }
    _atomic_json(catalog_path, catalog)
    _write_report(
        report_path,
        dataset_version=version,
        vitaldb_version=library_version,
        candidate_counts=candidate_counts,
        inspected_reports=reports,
        selected_manifests=verified_manifests,
        budget=inspection_budget,
        queue_size=len(queue),
        warnings_captured=notices,
        failed_local_checks=failed_local_checks,
    )
    return {
        "catalog_path": str(catalog_path),
        "report_path": str(report_path),
        "dataset_version": version,
        "candidate_counts": candidate_counts,
        "fully_inspected_count": len(reports),
        "eligible_uc04_count": sum(bool(item.get("uc04_valid_windows")) for item in reports),
        "eligible_uc05_count": sum(bool(item.get("uc05_valid_windows")) for item in reports),
        "dual_eligible_count": sum(bool(item.get("uc04_valid_windows")) and bool(item.get("uc05_valid_windows")) for item in reports),
        "selected_case_ids": sorted(selected_ids),
        "failed_local_checks": failed_local_checks,
    }
