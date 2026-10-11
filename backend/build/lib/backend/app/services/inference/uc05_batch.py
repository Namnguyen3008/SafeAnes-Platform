from __future__ import annotations

import json
import math
import os
import tempfile
import threading
from pathlib import Path
from typing import Any

from backend.app.core.config import Settings
from backend.app.core.errors import ApiServiceError, cache_not_ready, input_not_eligible
from backend.app.ml.preprocessing.uc05 import UC05_PREPROCESSING_VERSION
from backend.app.ml.registry.contracts import UC05_CONTRACT
from backend.app.repositories.case_repository import CaseRepository, normalize_case_id


_HORIZONS = tuple(UC05_CONTRACT.prediction_horizons)


class UC05PredictionCache:
    """Bounded-by-case, atomically persisted outputs from the exact UC05 checkpoint."""

    schema_version = 1

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.root = settings.data_root / "processed" / "uc05_predictions"
        self._lock = threading.RLock()

    def path_for(self, case_id: str | int) -> Path:
        return self.root / f"{normalize_case_id(case_id)}.json"

    def write_case(self, case_id: str | int, record: dict[str, Any]) -> Path:
        normalized = normalize_case_id(case_id)
        if str(record.get("case_id")) != normalized:
            raise ValueError("prediction cache case_id does not match requested case")
        path = self.path_for(normalized)
        encoded = json.dumps(record, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
        with self._lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            temp: Path | None = None
            try:
                with tempfile.NamedTemporaryFile(
                    mode="w", encoding="utf-8", newline="\n", dir=path.parent,
                    prefix=f".{normalized}.", suffix=".tmp", delete=False,
                ) as handle:
                    temp = Path(handle.name)
                    handle.write(encoded)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temp, path)
            finally:
                if temp is not None and temp.exists():
                    temp.unlink()
        return path

    def read_case(self, case_id: str | int) -> dict[str, Any]:
        normalized = normalize_case_id(case_id)
        path = self.path_for(normalized)
        if not path.is_file():
            raise cache_not_ready(f"UC05 offline predictions are not cached for VitalDB case {normalized}")
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise cache_not_ready(f"UC05 prediction cache for case {normalized} cannot be read") from exc
        if not isinstance(record, dict) or record.get("schema_version") != self.schema_version:
            raise cache_not_ready(f"UC05 prediction cache for case {normalized} has an unsupported schema")
        expected = {
            "case_id": normalized,
            "model_id": UC05_CONTRACT.model_id,
            "model_version": UC05_CONTRACT.model_version,
            "artifact_sha256": UC05_CONTRACT.artifact_sha256,
            "preprocessing_version": UC05_PREPROCESSING_VERSION,
            "input_contract_mode": "STRICT_SIGNAL_SCHEMA",
        }
        if any(record.get(key) != value for key, value in expected.items()):
            raise cache_not_ready(f"UC05 prediction cache for case {normalized} has stale or mismatched model inputs")
        self._validate_rows(normalized, record.get("predictions"))
        return record

    def read_predictions(
        self, case_id: str | int, *, as_of_s: float, window_start_s: float | None = None,
    ) -> dict[str, Any]:
        as_of = _time(as_of_s, "as_of_s")
        start = None if window_start_s is None else _time(window_start_s, "window_start_s")
        if start is not None and start > as_of:
            raise ApiServiceError("INVALID_TIME_RANGE", "window_start_s cannot be later than as_of_s", status_code=422)
        record = self.read_case(case_id)
        duration = _time(record.get("case_duration_seconds"), "case_duration_seconds")
        if as_of > duration:
            raise ApiServiceError("INVALID_TIME_RANGE", "as_of_s exceeds the case duration", status_code=422)
        rows = [
            row for row in record["predictions"]
            if row["prediction_time"] <= as_of and (start is None or row["prediction_time"] >= start)
        ]
        return {
            "case_id": normalize_case_id(case_id),
            "model_id": UC05_CONTRACT.model_id,
            "source": "OFFLINE_CACHE",
            "cache_status": "READY",
            "as_of_s": as_of,
            "available_horizons_minutes": list(_HORIZONS),
            "predictions": rows,
        }

    def status(self, case_id: str | int) -> dict[str, Any]:
        normalized = normalize_case_id(case_id)
        if not self.path_for(normalized).is_file():
            return {"case_id": normalized, "model_id": UC05_CONTRACT.model_id,
                    "cache_status": "NOT_READY", "prediction_count": 0,
                    "inference_window_count": 0, "abstained_window_count": 0}
        record = self.read_case(normalized)
        return {"case_id": normalized, "model_id": record["model_id"],
                "model_version": record["model_version"], "artifact_sha256": record["artifact_sha256"],
                "cache_status": "READY", "prediction_count": len(record["predictions"]),
                "inference_window_count": record["inference_window_count"],
                "abstained_window_count": len(record["abstained_windows"])}

    @staticmethod
    def _validate_rows(case_id: str, rows: Any) -> None:
        if not isinstance(rows, list):
            raise cache_not_ready(f"UC05 prediction cache for case {case_id} has invalid rows")
        previous: tuple[float, int] | None = None
        for row in rows:
            if not isinstance(row, dict) or row.get("case_id") != case_id:
                raise cache_not_ready(f"UC05 prediction cache for case {case_id} contains an invalid row")
            try:
                prediction_time = _time(row["prediction_time"], "prediction_time")
                start = _time(row["input_window_start"], "input_window_start")
                end = _time(row["input_window_end"], "input_window_end")
                raw = float(row["raw_output"])
                coverage = float(row["data_coverage"])
                horizon_value = row["horizon_minutes_or_null"]
                horizon = 99 if horizon_value is None else int(horizon_value)
            except (KeyError, TypeError, ValueError, OverflowError) as exc:
                raise cache_not_ready(f"UC05 prediction cache for case {case_id} contains malformed output") from exc
            if horizon not in {99, *_HORIZONS} or end != prediction_time or start > end:
                raise cache_not_ready(f"UC05 prediction cache for case {case_id} violates the model window contract")
            if not math.isfinite(raw) or not 0 <= coverage <= 1:
                raise cache_not_ready(f"UC05 prediction cache for case {case_id} contains non-finite values")
            interpreted = row.get("interpreted_output")
            expected_calibration = horizon != 99
            if not isinstance(interpreted, dict) or bool(interpreted.get("calibrated")) != expected_calibration:
                raise cache_not_ready(f"UC05 prediction cache for case {case_id} violates output calibration semantics")
            key = (prediction_time, horizon)
            if previous is not None and key <= previous:
                raise cache_not_ready(f"UC05 prediction cache for case {case_id} is not uniquely time ordered")
            previous = key


class UC05OfflineBatchService:
    def __init__(self, settings: Settings, cases: CaseRepository, models: Any) -> None:
        self.settings = settings
        self.cases = cases
        self.models = models
        self.cache = UC05PredictionCache(settings)

    def generate_case(self, case_id: str | int, *, force: bool = False) -> dict[str, Any]:
        normalized = normalize_case_id(case_id)
        case = self.cases.get_case(normalized)
        manifest = self.cases.get_manifest(normalized)
        if not bool(manifest.get("eligibility", {}).get("uc05", False)):
            raise input_not_eligible(f"VitalDB case {normalized} is not cataloged as UC05 eligible")
        if case.get("raw_file", {}).get("cache_status") != "READY":
            raise cache_not_ready(f"VitalDB raw case {normalized} is not checksum-verified in the local cache")
        status = self.models.status(UC05_CONTRACT.model_id)
        if not status.get("loaded") or status.get("readiness_status") != "BLOCKED_CONTRACT_MISMATCH":
            raise ApiServiceError("MODEL_NOT_READY", "Audited UC05 checkpoint is not loaded with the known contract state", status_code=503, details=status)
        if not force:
            try:
                cached = self.cache.read_case(normalized)
                if self._matches_source(cached, case):
                    return self._summary(cached, reused=True)
            except ApiServiceError:
                pass

        valid = manifest.get("valid_windows", {}).get("uc05")
        if not isinstance(valid, list):
            raise cache_not_ready(f"VitalDB case {normalized} has no UC05 valid-window manifest")
        candidate_times = sorted({
            _time(item["prediction_time_seconds"], "prediction_time_seconds")
            for item in valid if isinstance(item, dict) and "prediction_time_seconds" in item
        })
        predictions: list[dict[str, Any]] = []
        abstained: list[dict[str, Any]] = []
        for prediction_time in candidate_times:
            try:
                outputs = self.models.predict(
                    normalized, UC05_CONTRACT.model_id, prediction_time,
                    strict_uc05_schema=True,
                )
            except ApiServiceError as exc:
                if exc.code in {"INPUT_NOT_ELIGIBLE", "INSUFFICIENT_DATA"}:
                    abstained.append({"prediction_time": prediction_time, "code": exc.code, "message": exc.message})
                    continue
                raise
            converted = [_cache_row(item) for item in outputs]
            if [item["horizon_minutes_or_null"] for item in converted] != [*_HORIZONS, None]:
                raise ApiServiceError("INFERENCE_FAILED", "UC05 runtime returned unexpected horizons", status_code=500)
            predictions.extend(converted)

        predictions.sort(key=lambda item: (item["prediction_time"], 99 if item["horizon_minutes_or_null"] is None else item["horizon_minutes_or_null"]))
        record = {
            "schema_version": self.cache.schema_version,
            "case_id": normalized,
            "dataset": case.get("dataset", "VitalDB"),
            "dataset_version": case.get("dataset_version", "NOT_RECORDED"),
            "case_duration_seconds": float(case["duration_seconds"]),
            "raw_sha256": case.get("raw_file", {}).get("sha256"),
            "model_id": UC05_CONTRACT.model_id,
            "model_version": UC05_CONTRACT.model_version,
            "artifact_sha256": UC05_CONTRACT.artifact_sha256,
            "task": UC05_CONTRACT.task,
            "output_semantics": dict(UC05_CONTRACT.output_semantics),
            "available_horizons_minutes": list(_HORIZONS),
            "threshold_if_verified": {"5": UC05_CONTRACT.decision_threshold.get("5m")},
            "preprocessing_version": UC05_PREPROCESSING_VERSION,
            "input_contract_mode": "STRICT_SIGNAL_SCHEMA",
            "candidate_window_count": len(candidate_times),
            "inference_window_count": len(predictions) // (len(_HORIZONS) + 1),
            "abstained_windows": abstained,
            "predictions": predictions,
        }
        if not predictions:
            raise ApiServiceError("INSUFFICIENT_DATA", f"No UC05 windows passed strict signal_schema validation for case {normalized}", status_code=422, details={"abstained_windows": abstained})
        self.cache.write_case(normalized, record)
        return self._summary(record, reused=False)

    def generate_all(self, *, case_ids: list[str] | None = None, force: bool = False) -> list[dict[str, Any]]:
        cases = self.cases.list_cases()["cases"]
        requested = None if case_ids is None else {normalize_case_id(item) for item in case_ids}
        eligible = [row for row in cases if row.get("uc05_eligible") and row.get("cache_status") == "READY" and
                    (requested is None or str(row["case_id"]) in requested)]
        if requested is not None:
            found = {str(row["case_id"]) for row in eligible}
            missing = requested - found
            if missing:
                raise input_not_eligible("Requested VitalDB cases are not locally cached and UC05 eligible", details={"case_ids": sorted(missing)})
        return [self.generate_case(row["case_id"], force=force) for row in eligible]

    @staticmethod
    def _matches_source(record: dict[str, Any], case: dict[str, Any]) -> bool:
        return (record.get("raw_sha256") == case.get("raw_file", {}).get("sha256")
                and record.get("dataset_version") == case.get("dataset_version")
                and float(record.get("case_duration_seconds", -1)) == float(case.get("duration_seconds", -2)))

    @staticmethod
    def _summary(record: dict[str, Any], *, reused: bool) -> dict[str, Any]:
        return {"case_id": record["case_id"], "model_id": record["model_id"],
                "model_version": record["model_version"], "artifact_sha256": record["artifact_sha256"],
                "candidate_window_count": record["candidate_window_count"],
                "inference_window_count": record["inference_window_count"],
                "prediction_count": len(record["predictions"]), "abstained_windows": record["abstained_windows"],
                "horizons_minutes": record["available_horizons_minutes"], "cache_reused": reused,
                "status": "READY", "predictions": record["predictions"]}


def _cache_row(item: dict[str, Any]) -> dict[str, Any]:
    output = item["output"]
    interpreted = output["interpreted"]
    return {
        "case_id": str(item["case_id"]), "model_id": item["model_id"], "model_version": item["model_version"],
        "prediction_time": float(item["prediction_time"]),
        "input_window_start": float(item["input_window"]["start_time_s"]),
        "input_window_end": float(item["input_window"]["end_time_s"]), "task": item["task"],
        "raw_output": float(output["raw"]), "interpreted_output": interpreted,
        "horizon_minutes_or_null": item["horizon_if_applicable"],
        "data_coverage": float(item["data_coverage"]), "quality": item["quality"],
        "calibrated_or_not": interpreted.get("calibrated") is True,
        "threshold_if_verified": interpreted.get("threshold"), "artifact_sha256": item["artifact_hash"],
        "preprocessing_version": item["preprocessing_version"], "missing_features": list(item.get("missing_features", [])),
        "input_contract_mode": interpreted.get("input_contract_mode", "UNKNOWN"),
        "horizon_if_applicable": item["horizon_if_applicable"], "output": output,
        "output_semantics": item["output_semantics"], "calibration_status": item["calibration_status"],
        "input_window": item["input_window"], "artifact_hash": item["artifact_hash"],
        "source_tracks": item.get("source_tracks", {}),
    }


def _time(value: Any, name: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ApiServiceError("INVALID_TIME_RANGE", f"{name} must be finite", status_code=422) from exc
    if not math.isfinite(result) or result < 0:
        raise ApiServiceError("INVALID_TIME_RANGE", f"{name} must be finite and non-negative", status_code=422)
    return result
