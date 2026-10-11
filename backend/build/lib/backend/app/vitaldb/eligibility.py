from __future__ import annotations

from dataclasses import dataclass
import json
import math
from typing import Any, Mapping, Sequence

from backend.app.ml.contracts.window import InferenceWindow
from backend.app.ml.inference.uc04 import UC04InferenceService
from backend.app.ml.inference.uc05 import UC05InferenceService
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT
from backend.app.ml.validation.input_validation import InputValidationError


class VitalDBDiscoveryError(RuntimeError):
    """The VitalDB index could not supply a trustworthy candidate set."""


UC05_SCHEMA_REQUIRED_TRACKS = (
    "Solar8000/PLETH_SPO2",
    "Primus/CO2",
    "Primus/AWP",
    "SNUADC/PLETH",
)


@dataclass(frozen=True)
class CaseWindowValidation:
    model_id: str
    prediction_time_s: float
    accepted: bool
    reason: str | None
    quality_status: str | None = None
    data_coverage: float | None = None
    missing_features: tuple[str, ...] = ()


def required_candidate_tracks(model_id: str) -> tuple[str, ...]:
    key = model_id.upper()
    if key in {"UC04", UC04_CONTRACT.model_id.upper()}:
        return UC04_CONTRACT.required_tracks
    if key in {"UC05", UC05_CONTRACT.model_id.upper()}:
        # The exported signal schema says all three core waveforms are required.
        # This intentionally preserves the unresolved stream-evaluator mismatch.
        return UC05_SCHEMA_REQUIRED_TRACKS
    raise ValueError(f"unsupported model id: {model_id}")


def discover_candidates(vitaldb_api: Any, model_id: str) -> list[int]:
    """Return indexed candidates only; this does not imply input eligibility."""
    finder = getattr(vitaldb_api, "find_cases", None)
    if not callable(finder):
        raise VitalDBDiscoveryError("installed VitalDB library has no find_cases API")
    tracks = list(required_candidate_tracks(model_id))
    try:
        result = finder(tracks)
    except Exception as exc:
        raise VitalDBDiscoveryError(f"VitalDB candidate search failed: {exc}") from exc
    if result is None:
        raise VitalDBDiscoveryError("VitalDB candidate search returned no result")
    candidates: set[int] = set()
    for value in result:
        try:
            case_id = int(value)
        except (TypeError, ValueError, OverflowError):
            continue
        if case_id > 0:
            candidates.add(case_id)
    return sorted(candidates)


def validate_model_window(model_id: str, window: InferenceWindow) -> CaseWindowValidation:
    """Run the existing UC preprocessing validator without executing inference."""
    key = model_id.upper()
    if key in {"UC04", UC04_CONTRACT.model_id.upper()}:
        canonical_id = UC04_CONTRACT.model_id
        service = UC04InferenceService()
    elif key in {"UC05", UC05_CONTRACT.model_id.upper()}:
        canonical_id = UC05_CONTRACT.model_id
        service = UC05InferenceService()
    else:
        raise ValueError(f"unsupported model id: {model_id}")

    try:
        prepared = service.preprocess_window(window)
        if canonical_id == UC05_CONTRACT.model_id:
            expected_sources = {
                "SPO2": "Solar8000/PLETH_SPO2",
                "capno": "Primus/CO2",
                "awp": "Primus/AWP",
                "ppg": "SNUADC/PLETH",
            }
            for role, expected in expected_sources.items():
                if window.selected_tracks.get(role) != expected:
                    raise InputValidationError(
                        f"UC05 schema-required {role} source must be {expected}"
                    )
            masks = prepared.wave_mask[0]
            mask_indices = {"capno": 0, "awp": 1, "ppg": 2}
            invalid = [name for name, index in mask_indices.items() if masks[index] < 0.5]
            if invalid:
                raise InputValidationError(
                    "UC05 signal_schema.json requires valid capno, AWP, and PPG; "
                    f"invalid: {', '.join(invalid)}"
                )
        return CaseWindowValidation(
            model_id=canonical_id,
            prediction_time_s=window.prediction_time_s,
            accepted=True,
            reason=None,
            quality_status=prepared.quality_status,
            data_coverage=float(prepared.data_coverage),
            missing_features=tuple(prepared.missing_features),
        )
    except InputValidationError as exc:
        return CaseWindowValidation(
            model_id=canonical_id,
            prediction_time_s=window.prediction_time_s,
            accepted=False,
            reason=str(exc),
        )


def classify_case_eligibility(
    *, uc04_valid_windows: Sequence[float], uc05_valid_windows: Sequence[float]
) -> tuple[str, ...]:
    categories: list[str] = []
    if uc04_valid_windows:
        categories.append("UC04_ELIGIBLE")
    if uc05_valid_windows:
        categories.append("UC05_ELIGIBLE")
    if uc04_valid_windows and uc05_valid_windows:
        categories.append("DUAL_UC04_UC05_ELIGIBLE")
    return tuple(categories)


def select_case_ids(
    reports: Sequence[Mapping[str, Any]],
    *,
    uc04_target: int,
    uc05_target: int,
    dual_target: int,
) -> list[int]:
    """Select the smallest deterministic set meeting targets, dual cases first."""
    for target in (uc04_target, uc05_target, dual_target):
        if target < 0:
            raise ValueError("selection targets cannot be negative")

    normalized: list[tuple[int, bool, bool, float, str]] = []
    seen: set[int] = set()
    for report in reports:
        try:
            case_id = int(report["case_id"])
        except (KeyError, TypeError, ValueError, OverflowError):
            continue
        if case_id <= 0 or case_id in seen:
            continue
        seen.add(case_id)
        try:
            coverage = float(report.get("selection_coverage", 0.0) or 0.0)
        except (TypeError, ValueError, OverflowError):
            coverage = 0.0
        if not math.isfinite(coverage):
            coverage = 0.0
        try:
            signature = json.dumps(report.get("trajectory_signature"), sort_keys=True)
        except (TypeError, ValueError):
            signature = str(report.get("trajectory_signature"))
        normalized.append(
            (
                case_id,
                bool(report.get("uc04_valid_windows")),
                bool(report.get("uc05_valid_windows")),
                coverage,
                signature,
            )
        )
    selected: list[int] = []
    chosen: set[int] = set()
    chosen_signatures: set[str] = set()
    count04 = count05 = count_dual = 0

    def rank_key(row: tuple[int, bool, bool, float, str]) -> tuple[int, float, int]:
        return (-int(row[4] not in chosen_signatures), -row[3], row[0])

    def add(row: tuple[int, bool, bool, float, str]) -> None:
        nonlocal count04, count05, count_dual
        case_id, eligible04, eligible05, _, signature = row
        chosen.add(case_id)
        selected.append(case_id)
        chosen_signatures.add(signature)
        count04 += int(eligible04)
        count05 += int(eligible05)
        count_dual += int(eligible04 and eligible05)

    dual_candidates = [row for row in normalized if row[1] and row[2]]
    while count_dual < dual_target and dual_candidates:
        dual_candidates.sort(key=rank_key)
        add(dual_candidates.pop(0))

    while count04 < uc04_target or count05 < uc05_target:
        candidates = [
            row for row in normalized
            if row[0] not in chosen
            and ((row[1] and count04 < uc04_target) or (row[2] and count05 < uc05_target))
        ]
        if not candidates:
            break
        candidates.sort(key=lambda row: (
            -int(row[1] and count04 < uc04_target)
            -int(row[2] and count05 < uc05_target),
            *rank_key(row),
        ))
        add(candidates[0])
    return selected


def catalog_attribute(value: Any) -> Any:
    if value is None:
        return "NOT_RECORDED"
    if isinstance(value, float) and not math.isfinite(value):
        return "NOT_RECORDED"
    return value
