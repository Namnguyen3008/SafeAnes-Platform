from __future__ import annotations

import json
import math
import os
import tempfile
import threading
from copy import deepcopy
from pathlib import Path
from typing import Any

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError, cache_not_ready, input_not_eligible, model_not_ready
from backend.app.ml.preprocessing.uc04 import UC04_PREPROCESSING_VERSION
from backend.app.ml.registry.contracts import UC04_CONTRACT
from backend.app.repositories.case_repository import CaseRepository, normalize_case_id
from backend.app.services.inference.prediction_file_cache import VerifiedJsonFileCache


_SUPPORTED_HORIZONS = tuple(UC04_CONTRACT.prediction_horizons)


class UC04PredictionCache:
    """Immutable-source, atomically written UC04 batch output cache."""

    schema_version = 1

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.root = settings.data_root / "processed" / "uc04_predictions"
        self._lock = threading.RLock()
        self._record_cache = VerifiedJsonFileCache(settings.prediction_cache_entries)

    def path_for(self, case_id: str | int) -> Path:
        normalized = normalize_case_id(case_id)
        return self.root / f"{normalized}.json"

    def write_case(self, case_id: str | int, record: dict[str, Any]) -> Path:
        normalized = normalize_case_id(case_id)
        if str(record.get("case_id")) != normalized:
            raise ValueError("prediction cache case_id does not match the requested case")
        path = self.path_for(normalized)
        serialized = json.dumps(record, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
        with self._lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            temp_path: Path | None = None
            try:
                with tempfile.NamedTemporaryFile(
                    mode="w", encoding="utf-8", newline="\n", dir=path.parent,
                    prefix=f".{normalized}.", suffix=".tmp", delete=False,
                ) as handle:
                    temp_path = Path(handle.name)
                    handle.write(serialized)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temp_path, path)
                self._record_cache.invalidate(normalized)
            finally:
                if temp_path is not None and temp_path.exists():
                    temp_path.unlink()
        return path

    def read_case(self, case_id: str | int) -> dict[str, Any]:
        normalized = normalize_case_id(case_id)
        path = self.path_for(normalized)
        return deepcopy(self._read_verified_case(normalized, path))

    def _read_verified_case(self, normalized: str, path: Path | None = None) -> dict[str, Any]:
        cache_path = path or self.path_for(normalized)
        message = f"UC04 prediction cache for case {normalized} is unavailable or invalid"
        return self._record_cache.read(
            normalized,
            cache_path,
            unavailable_message=message,
            validate=lambda record: self._validate_case_record(normalized, record),
        )

    def _validate_case_record(self, normalized: str, record: dict[str, Any]) -> None:
        if record.get("schema_version") != self.schema_version:
            raise cache_not_ready(f"UC04 prediction cache for case {normalized} has an unsupported schema")
        if record.get("case_id") != normalized or record.get("model_id") != UC04_CONTRACT.model_id:
            raise cache_not_ready(f"UC04 prediction cache for case {normalized} has mismatched identity")
        if record.get("model_version") != UC04_CONTRACT.model_version:
            raise cache_not_ready(f"UC04 prediction cache for case {normalized} has a stale model version")
        if record.get("artifact_sha256") != UC04_CONTRACT.artifact_sha256:
            raise cache_not_ready(f"UC04 prediction cache for case {normalized} has a stale artifact hash")
        if record.get("preprocessing_version") != UC04_PREPROCESSING_VERSION:
            raise cache_not_ready(f"UC04 prediction cache for case {normalized} has stale preprocessing")
        self._validate_prediction_rows(normalized, record.get("predictions"))

    def read_predictions(
        self,
        case_id: str | int,
        *,
        as_of_s: float,
        window_start_s: float | None = None,
    ) -> dict[str, Any]:
        as_of = _finite_time(as_of_s, "as_of_s")
        start = None if window_start_s is None else _finite_time(window_start_s, "window_start_s")
        if start is not None and start > as_of:
            raise ApiServiceError("INVALID_TIME_RANGE", "window_start_s cannot be later than as_of_s", status_code=422)
        normalized = normalize_case_id(case_id)
        record = self._read_verified_case(normalized)
        duration = float(record.get("case_duration_seconds", math.nan))
        if not math.isfinite(duration) or as_of > duration:
            raise ApiServiceError("INVALID_TIME_RANGE", "as_of_s must be within the cached case duration", status_code=422)
        due = [
            row for row in record["predictions"]
            if row["prediction_time"] <= as_of
            and (start is None or row["prediction_time"] >= start)
        ]
        evidence = _window_evidence(
            record,
            as_of_s=as_of,
            window_seconds=float(UC04_CONTRACT.window_seconds["numeric"]),
            minimum_time_s=start,
        )
        prediction_count, inference_window_count, abstained_window_count = _as_of_counts(
            record, as_of_s=as_of, minimum_time_s=start,
        )
        return {
            "case_id": str(case_id),
            "model_id": record["model_id"],
            "source": "OFFLINE_CACHE",
            "cache_status": "READY",
            "as_of_s": as_of,
            "available_horizons_minutes": list(_SUPPORTED_HORIZONS),
            "prediction_count": prediction_count,
            "inference_window_count": inference_window_count,
            "abstained_window_count": abstained_window_count,
            "abstained_windows": [
                row for row in record.get("abstained_windows", [])
                if isinstance(row, dict)
                and _finite_or_none(row.get("prediction_time")) is not None
                and _finite_or_none(row.get("prediction_time")) <= as_of
                and (start is None or _finite_or_none(row.get("prediction_time")) >= start)
            ],
            **evidence,
            "predictions": due,
        }

    def window_evidence(self, case_id: str | int, *, as_of_s: float) -> dict[str, Any]:
        """Return persisted evidence for the latest due model window.

        A missing prediction is never treated as abstention. The status can only
        be ABSTAINED when the immutable cache explicitly records that candidate
        window in ``abstained_windows``.
        """
        normalized = normalize_case_id(case_id)
        record = self._read_verified_case(normalized)
        as_of = _finite_time(as_of_s, "as_of_s")
        duration = float(record.get("case_duration_seconds", math.nan))
        if not math.isfinite(duration) or as_of > duration:
            raise ApiServiceError("INVALID_TIME_RANGE", "as_of_s must be within the cached case duration", status_code=422)
        return _window_evidence(
            record,
            as_of_s=as_of,
            window_seconds=float(UC04_CONTRACT.window_seconds["numeric"]),
        )

    def status(self, case_id: str | int) -> dict[str, Any]:
        normalized = normalize_case_id(case_id)
        path = self.path_for(normalized)
        if not path.is_file():
            return {"case_id": normalized, "model_id": UC04_CONTRACT.model_id,
                    "cache_status": "NOT_READY", "prediction_count": 0,
                    "inference_window_count": 0}
        record = self._read_verified_case(normalized, path)
        return {"case_id": normalized, "model_id": record["model_id"],
                "model_version": record["model_version"], "artifact_sha256": record["artifact_sha256"],
                "cache_status": "READY", "prediction_count": len(record["predictions"]),
                "inference_window_count": record["inference_window_count"],
                "abstained_window_count": len(record["abstained_windows"]),
                # This endpoint is a full-cache summary. View services replace
                # this list with the as-of filtered detail before replay use.
                "abstained_windows": list(record["abstained_windows"])}

    @staticmethod
    def _validate_prediction_rows(case_id: str, predictions: Any) -> None:
        if not isinstance(predictions, list):
            raise cache_not_ready(f"UC04 prediction cache for case {case_id} has invalid prediction rows")
        last_key: tuple[float, int] | None = None
        for row in predictions:
            if not isinstance(row, dict) or row.get("case_id") != case_id:
                raise cache_not_ready(f"UC04 prediction cache for case {case_id} contains an invalid row")
            try:
                prediction_time = _finite_time(row["prediction_time"], "prediction_time")
                horizon = int(row["horizon_minutes_or_null"])
                window_start = _finite_time(row["input_window_start"], "input_window_start")
                window_end = _finite_time(row["input_window_end"], "input_window_end")
                raw_output = float(row["raw_output"])
                coverage = float(row["data_coverage"])
            except (KeyError, TypeError, ValueError) as exc:
                raise cache_not_ready(f"UC04 prediction cache for case {case_id} contains malformed output") from exc
            if horizon not in _SUPPORTED_HORIZONS or window_end != prediction_time or window_start > window_end:
                raise cache_not_ready(f"UC04 prediction cache for case {case_id} violates the UC04 window contract")
            if not math.isfinite(raw_output) or not 0 <= coverage <= 1:
                raise cache_not_ready(f"UC04 prediction cache for case {case_id} contains non-finite values")
            if row.get("calibrated_or_not") is not False:
                raise cache_not_ready(f"UC04 prediction cache for case {case_id} has unsupported calibration semantics")
            key = (prediction_time, horizon)
            if last_key is not None and key <= last_key:
                raise cache_not_ready(f"UC04 prediction cache for case {case_id} is not uniquely time ordered")
            last_key = key


class UC04OfflineBatchService:
    """Precomputes eligible windows through the already verified inference service."""

    def __init__(self, settings: Settings, cases: CaseRepository, models: Any) -> None:
        self.settings = settings
        self.cases = cases
        self.models = models
        self.cache = UC04PredictionCache(settings)

    def generate_case(self, case_id: str | int, *, force: bool = False) -> dict[str, Any]:
        normalized = normalize_case_id(case_id)
        case = self.cases.get_case(normalized)
        manifest = self.cases.get_manifest(normalized)
        if not bool(manifest.get("eligibility", {}).get("uc04", False)):
            raise input_not_eligible(f"VitalDB case {normalized} is not cataloged as UC04 eligible")
        if case.get("raw_file", {}).get("cache_status") == "CACHE_NOT_READY":
            raise cache_not_ready(f"VitalDB raw case {normalized} is not checksum-verified in the local cache")
        status = self.models.status(UC04_CONTRACT.model_id)
        if not status.get("inference_ready"):
            raise model_not_ready("The verified UC04 checkpoint is not ready for offline inference", details=status)

        if not force:
            try:
                existing = self.cache.read_case(normalized)
                if self._matches_source(existing, case, manifest):
                    return self._summary(existing, reused=True)
            except ApiServiceError:
                pass

        candidate_times = _candidate_times(manifest, float(case["duration_seconds"]))
        predictions: list[dict[str, Any]] = []
        abstained: list[dict[str, Any]] = []
        for prediction_time in candidate_times:
            try:
                outputs = self.models.predict(normalized, UC04_CONTRACT.model_id, prediction_time)
            except ApiServiceError as exc:
                if exc.code in {"INPUT_NOT_ELIGIBLE", "INSUFFICIENT_DATA"}:
                    abstained.append({
                        "prediction_time": prediction_time,
                        "window_start_s": max(0.0, prediction_time - float(UC04_CONTRACT.window_seconds["numeric"])),
                        "window_end_s": prediction_time,
                        "code": exc.code,
                        "message": exc.message,
                    })
                    continue
                raise
            window_rows = [_prediction_cache_row(item) for item in outputs]
            if tuple(row["horizon_minutes_or_null"] for row in window_rows) != _SUPPORTED_HORIZONS:
                raise ApiServiceError("INFERENCE_FAILED", "UC04 runtime returned unsupported prediction horizons", status_code=500)
            predictions.extend(window_rows)

        if not predictions:
            raise ApiServiceError("INSUFFICIENT_DATA", f"No UC04 inference-eligible windows exist for case {normalized}", status_code=422)
        predictions.sort(key=lambda row: (row["prediction_time"], row["horizon_minutes_or_null"]))
        record = {
            "schema_version": self.cache.schema_version,
            "case_id": normalized,
            "dataset": str(case.get("dataset", "VitalDB")),
            "dataset_version": str(case.get("dataset_version", "NOT_RECORDED")),
            "case_duration_seconds": float(case["duration_seconds"]),
            "raw_sha256": case.get("raw_file", {}).get("sha256"),
            "model_id": UC04_CONTRACT.model_id,
            "model_version": UC04_CONTRACT.model_version,
            "artifact_sha256": UC04_CONTRACT.artifact_sha256,
            "task": UC04_CONTRACT.task,
            "output_semantics": UC04_CONTRACT.output_semantics["score"],
            "calibrated_or_not": False,
            "available_horizons_minutes": list(_SUPPORTED_HORIZONS),
            "threshold_if_verified": {"5": 0.5, "10": None, "15": None},
            "preprocessing_version": UC04_PREPROCESSING_VERSION,
            "inference_window_count": len(predictions) // len(_SUPPORTED_HORIZONS),
            "candidate_window_count": len(candidate_times),
            "abstained_windows": abstained,
            "predictions": predictions,
        }
        self.cache.write_case(normalized, record)
        return self._summary(record, reused=False)

    def generate_all(self, *, case_ids: list[str] | None = None, force: bool = False) -> list[dict[str, Any]]:
        cases = self.cases.list_cases()["cases"]
        requested = None if case_ids is None else {normalize_case_id(item) for item in case_ids}
        eligible = [
            row for row in cases if row.get("uc04_eligible") and row.get("cache_status") == "READY"
            and (requested is None or str(row["case_id"]) in requested)
        ]
        if requested is not None:
            missing = requested - {str(row["case_id"]) for row in eligible}
            if missing:
                raise input_not_eligible("Requested VitalDB cases are not locally cached and UC04 eligible", details={"case_ids": sorted(missing)})
        return [self.generate_case(row["case_id"], force=force) for row in eligible]

    @staticmethod
    def _matches_source(record: dict[str, Any], case: dict[str, Any], manifest: dict[str, Any]) -> bool:
        return (
            record.get("raw_sha256") == case.get("raw_file", {}).get("sha256")
            and record.get("dataset_version") == case.get("dataset_version")
            and float(record.get("case_duration_seconds", -1)) == float(case.get("duration_seconds", -2))
        )

    @staticmethod
    def _summary(record: dict[str, Any], *, reused: bool) -> dict[str, Any]:
        return {
            "case_id": record["case_id"],
            "model_id": record["model_id"],
            "model_version": record["model_version"],
            "artifact_sha256": record["artifact_sha256"],
            "candidate_window_count": record["candidate_window_count"],
            "inference_window_count": record["inference_window_count"],
            "prediction_count": len(record["predictions"]),
            "abstained_windows": record["abstained_windows"],
            "horizons_minutes": record["available_horizons_minutes"],
            "cache_reused": reused,
            "status": "READY",
            "predictions": record["predictions"],
        }


def _candidate_times(manifest: dict[str, Any], duration_s: float) -> list[float]:
    valid_windows = manifest.get("valid_windows", {}).get("uc04")
    if isinstance(valid_windows, list):
        values = [
            _finite_time(item["prediction_time_seconds"], "prediction_time_seconds")
            for item in valid_windows if isinstance(item, dict) and "prediction_time_seconds" in item
        ]
    else:
        stride = int(UC04_CONTRACT.stride_seconds)
        minimum = int(UC04_CONTRACT.window_seconds["numeric"])
        values = [float(value) for value in range(minimum, int(duration_s) + 1, stride)]
    return sorted({value for value in values if value <= duration_s})


def _prediction_cache_row(item: dict[str, Any]) -> dict[str, Any]:
    output = item["output"]
    interpreted = output["interpreted"]
    return {
        "case_id": str(item["case_id"]),
        "model_id": item["model_id"],
        "model_version": item["model_version"],
        "prediction_time": float(item["prediction_time"]),
        "input_window_start": float(item["input_window"]["start_time_s"]),
        "input_window_end": float(item["input_window"]["end_time_s"]),
        "task": item["task"],
        "raw_output": float(output["raw"]),
        "interpreted_output": interpreted,
        "horizon_minutes_or_null": item["horizon_if_applicable"],
        "data_coverage": float(item["data_coverage"]),
        "quality": item["quality"],
        "calibrated_or_not": bool(interpreted.get("calibrated", False)),
        "threshold_if_verified": interpreted.get("threshold"),
        "artifact_sha256": item["artifact_hash"],
        "preprocessing_version": item["preprocessing_version"],
        "missing_features": list(item.get("missing_features", [])),
        # Keep the point-inference API response fields for clients that consume
        # both cached and on-demand predictions through the same schema.
        "horizon_if_applicable": item["horizon_if_applicable"],
        "output": output,
        "output_semantics": item["output_semantics"],
        "calibration_status": item["calibration_status"],
        "input_window": item["input_window"],
        "artifact_hash": item["artifact_hash"],
        "source_tracks": item.get("source_tracks", {}),
    }


def _finite_time(value: Any, name: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ApiServiceError("INVALID_TIME_RANGE", f"{name} must be a finite number", status_code=422) from exc
    if not math.isfinite(result) or result < 0:
        raise ApiServiceError("INVALID_TIME_RANGE", f"{name} must be finite and non-negative", status_code=422)
    return result


def _window_evidence(
    record: dict[str, Any], *, as_of_s: float, window_seconds: float,
    minimum_time_s: float | None = None,
) -> dict[str, Any]:
    prediction_rows = record.get("predictions", [])
    abstained_rows = record.get("abstained_windows", [])
    candidate_times = {
        float(row["prediction_time"])
        for row in prediction_rows
        if isinstance(row, dict) and _finite_or_none(row.get("prediction_time")) is not None
    }
    candidate_times.update(
        float(row["prediction_time"])
        for row in abstained_rows
        if isinstance(row, dict) and _finite_or_none(row.get("prediction_time")) is not None
    )
    due_times = [
        time for time in candidate_times
        if time <= as_of_s and (minimum_time_s is None or time >= minimum_time_s)
    ]
    if not due_times:
        return {
            "window_eligibility": "NOT_EVALUATED",
            "window_status": "NOT_EVALUATED",
            "window_reason": "No persisted model window is due at this replay time.",
            "window_prediction_time_s": None,
            "window_start_s": None,
            "window_end_s": None,
        }
    prediction_time = max(due_times)
    abstained = [
        row for row in abstained_rows
        if isinstance(row, dict) and _finite_or_none(row.get("prediction_time")) == prediction_time
    ]
    if abstained:
        row = abstained[0]
        start = _finite_or_none(row.get("window_start_s"))
        end = _finite_or_none(row.get("window_end_s"))
        start = max(0.0, prediction_time - window_seconds) if start is None else start
        end = prediction_time if end is None else end
        code = str(row.get("code", "INPUT_NOT_ELIGIBLE"))
        message = str(row.get("message", "The persisted model window was explicitly abstained."))
        return {
            "window_eligibility": "ABSTAINED",
            "window_status": "ABSTAINED",
            "window_reason": f"{code}: {message}",
            "window_prediction_time_s": prediction_time,
            "window_start_s": start,
            "window_end_s": end,
        }
    eligible_rows = [
        row for row in prediction_rows
        if isinstance(row, dict) and _finite_or_none(row.get("prediction_time")) == prediction_time
    ]
    starts = [_finite_or_none(row.get("input_window_start")) for row in eligible_rows]
    starts = [value for value in starts if value is not None]
    return {
        "window_eligibility": "ELIGIBLE" if eligible_rows else "NOT_EVALUATED",
        "window_status": "ELIGIBLE" if eligible_rows else "NOT_EVALUATED",
        "window_reason": None if eligible_rows else "No persisted eligible or explicitly abstained result exists for this window.",
        "window_prediction_time_s": prediction_time,
        "window_start_s": min(starts) if starts else max(0.0, prediction_time - window_seconds),
        "window_end_s": prediction_time,
    }


def _finite_or_none(value: Any) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return numeric if math.isfinite(numeric) else None


def _as_of_counts(
    record: dict[str, Any], *, as_of_s: float, minimum_time_s: float | None,
) -> tuple[int, int, int]:
    """Count only persisted rows/windows that are due at the replay cursor."""
    prediction_times = {
        time for row in record.get("predictions", [])
        if isinstance(row, dict)
        and (time := _finite_or_none(row.get("prediction_time"))) is not None
        and time <= as_of_s
        and (minimum_time_s is None or time >= minimum_time_s)
    }
    abstained_times = {
        time for row in record.get("abstained_windows", [])
        if isinstance(row, dict)
        and (time := _finite_or_none(row.get("prediction_time"))) is not None
        and time <= as_of_s
        and (minimum_time_s is None or time >= minimum_time_s)
    }
    prediction_count = sum(
        1 for row in record.get("predictions", [])
        if isinstance(row, dict)
        and (time := _finite_or_none(row.get("prediction_time"))) is not None
        and time <= as_of_s
        and (minimum_time_s is None or time >= minimum_time_s)
    )
    return prediction_count, len(prediction_times | abstained_times), len(abstained_times)
