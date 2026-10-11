from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import math
from typing import Any, Mapping

import numpy as np

from backend.app.ml.contracts.window import InferenceWindow
from backend.app.ml.inference.uc04 import UC04InferenceService
from backend.app.ml.inference.uc05 import UC05InferenceService
from backend.app.ml.preprocessing.uc04 import (
    UC04_FEATURE_ORDER,
    UC04_PREPROCESSING_VERSION,
    UC04_STATIC_ORDER,
    UC04_WAVE_ORDER,
    PreparedUC04Input,
    preprocess_uc04_window,
)
from backend.app.ml.preprocessing.uc05 import (
    UC05_FEATURE_ORDER,
    UC05_PREPROCESSING_VERSION,
    UC05_STATIC_ORDER,
    UC05_WAVE_ORDER,
    PreparedUC05Input,
    preprocess_uc05_window,
)
from backend.app.ml.preprocessing.vitaldb_loader import (
    LoadedTrackMetadata,
    TrackNameResolver,
    VitalDBCaseSignals,
    VitalDBDataError,
    VitalDBWindowLoader,
)
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT
from backend.app.ml.validation.input_validation import InputValidationError


class FeatureState(str, Enum):
    OBSERVED = "OBSERVED"
    MISSING = "MISSING"
    INVALID = "INVALID"
    ARTIFACT = "ARTIFACT"
    NOT_RECORDED = "NOT_RECORDED"
    INTERPOLATED = "INTERPOLATED"


@dataclass(frozen=True)
class UnitCheck:
    track_name: str
    observed_unit: str
    expected_unit: str | None
    state: FeatureState
    conversion_applied: bool
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "track_name": self.track_name,
            "observed_unit": self.observed_unit,
            "expected_unit": self.expected_unit or "NOT_RECORDED",
            "state": self.state.value,
            "conversion_applied": self.conversion_applied,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class UnitValidation:
    valid: bool
    tracks: Mapping[str, Mapping[str, Any]]
    invalid_tracks: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "tracks": {name: dict(value) for name, value in self.tracks.items()},
            "invalid_tracks": list(self.invalid_tracks),
        }


class VitalDBTrackReader:
    """Read a real VitalDB case through the audited loader and source mappings."""

    def __init__(self, loader: VitalDBWindowLoader | None = None) -> None:
        self.loader = loader or VitalDBWindowLoader()

    def read_case(
        self,
        model_id: str,
        case_id: int | str,
        *,
        source_path: str | None = None,
        case_metadata: Mapping[str, Any] | None = None,
    ) -> VitalDBCaseSignals:
        return self.loader.load_case_signals(
            model_id,
            case_id,
            source_path=source_path,
            case_metadata=case_metadata,
        )


class UnitValidator:
    """Validate recorded source units without inventing conversions or units."""

    _UC05_TRAINING_SOURCE_RATES = {
        "capno": 62.5,
        "awp": 62.5,
        "ppg": 500.0,
    }
    _UC04_WINDOW_ROLES = {
        "art": "ART_WAVE",
        "ecg": "ECG_WAVE",
        "ppg": "PPG_WAVE",
        "capno": "CAPNO_WAVE",
    }
    _UC05_WINDOW_ROLES = {name: name for name in ("capno", "awp", "ppg", "flow", "resp")}

    def __init__(self, expected_units: Mapping[str, str] | None = None) -> None:
        # Model artifacts do not provide a complete units manifest. An empty
        # map is intentional: source units are preserved without conversion.
        self.expected_units = dict(expected_units or {})

    def validate_track(
        self, track_name: str, observed_unit: str | None
    ) -> UnitCheck:
        expected = self.expected_units.get(track_name)
        if observed_unit is None or not str(observed_unit).strip():
            return UnitCheck(
                track_name=track_name,
                observed_unit="NOT_RECORDED",
                expected_unit=expected,
                state=FeatureState.NOT_RECORDED,
                conversion_applied=False,
                reason=(
                    "VitalDB did not record a unit; the training path uses this "
                    "track natively and defines no conversion."
                ),
            )
        observed = str(observed_unit).strip()
        if expected is not None and observed.casefold() != expected.strip().casefold():
            return UnitCheck(
                track_name=track_name,
                observed_unit=observed,
                expected_unit=expected,
                state=FeatureState.INVALID,
                conversion_applied=False,
                reason="Recorded source unit does not match the verified unit contract.",
            )
        return UnitCheck(
            track_name=track_name,
            observed_unit=observed,
            expected_unit=expected,
            state=FeatureState.OBSERVED,
            conversion_applied=False,
            reason="Recorded source unit preserved; no unit conversion is defined by training.",
        )

    def validate_series(self, model_id: str, series: VitalDBCaseSignals) -> UnitValidation:
        contract = _contract_for(model_id)
        model = _model_key(contract.model_id)
        wave_roles = (
            {"ART_WAVE", "ECG_WAVE", "PPG_WAVE", "CAPNO_WAVE"}
            if model == "uc04"
            else {"capno", "awp", "ppg", "flow", "resp"}
        )
        checks: dict[str, dict[str, Any]] = {}
        invalid: list[str] = []
        selected = series.selected_tracks
        for role, name in selected.items():
            if not name:
                continue
            metadata = series.track_metadata.get(name)
            if metadata is None:
                invalid.append(name)
                checks[name] = {
                    **self.validate_track(name, None).as_dict(),
                    "track_type": "NOT_RECORDED",
                    "native_sample_rate_hz": "NOT_RECORDED",
                    "structural_state": FeatureState.INVALID.value,
                    "structural_reason": "Selected track has no VitalFile type/rate metadata.",
                }
                continue

            expected_type = "WAVEFORM" if role in wave_roles else "NUMERIC"
            structural_state = FeatureState.OBSERVED
            structural_reasons: list[str] = []
            if metadata.track_type != expected_type:
                structural_state = FeatureState.INVALID
                structural_reasons.append(
                    f"Expected {expected_type}, observed {metadata.track_type or 'NOT_RECORDED'}."
                )
            if expected_type == "WAVEFORM":
                rate = metadata.native_sample_rate_hz
                if rate is None or not math.isfinite(rate) or rate <= 0:
                    structural_state = FeatureState.INVALID
                    structural_reasons.append("Native waveform sample rate is unavailable.")
                elif model == "uc05" and role in self._UC05_TRAINING_SOURCE_RATES:
                    expected_rate = self._UC05_TRAINING_SOURCE_RATES[role]
                    if not math.isclose(rate, expected_rate, rel_tol=0, abs_tol=1e-6):
                        structural_state = FeatureState.INVALID
                        structural_reasons.append(
                            f"Training source rate is {expected_rate:g} Hz; observed {rate:g} Hz."
                        )
            unit_check = self.validate_track(name, metadata.unit)
            if unit_check.state is FeatureState.INVALID:
                structural_state = FeatureState.INVALID
                structural_reasons.append(unit_check.reason)
            if structural_state is FeatureState.INVALID:
                invalid.append(name)
            checks[name] = {
                **unit_check.as_dict(),
                "track_type": metadata.track_type or "NOT_RECORDED",
                "expected_track_type": expected_type,
                "native_sample_rate_hz": (
                    metadata.native_sample_rate_hz
                    if metadata.native_sample_rate_hz is not None
                    else "NOT_RECORDED"
                ),
                "observed_update_rate_hz": (
                    metadata.observed_update_rate_hz
                    if metadata.observed_update_rate_hz is not None
                    else "NOT_RECORDED"
                ),
                "structural_state": structural_state.value,
                "structural_reason": " ".join(structural_reasons) or "Track type/rate verified.",
            }
        return UnitValidation(
            valid=not invalid,
            tracks=checks,
            invalid_tracks=tuple(sorted(set(invalid))),
        )

    def validate_window(self, window: InferenceWindow) -> UnitValidation:
        checks: dict[str, dict[str, Any]] = {}
        invalid: list[str] = []
        model = _model_key(window.model_id) if hasattr(window, "model_id") else None
        # InferenceWindow is deliberately model-agnostic; the canonical
        # numeric order identifies its audited model contract without guesses.
        if model is None:
            model = (
                "uc04"
                if tuple(window.numeric_feature_order) == tuple(UC04_CONTRACT.feature_order["numeric"])
                else "uc05"
                if tuple(window.numeric_feature_order) == tuple(UC05_CONTRACT.feature_order["numeric"])
                else None
            )
        if model is None:
            return UnitValidation(False, {}, ("unrecognized-window-contract",))
        expected_rates = (
            dict(UC04_CONTRACT.sample_rate_hz)
            if model == "uc04"
            else dict(self._UC05_TRAINING_SOURCE_RATES)
        )
        roles = self._UC04_WINDOW_ROLES if model == "uc04" else self._UC05_WINDOW_ROLES
        wave_seconds = 30 if model == "uc04" else 60
        for name, signal in window.waveforms.items():
            source_name = signal.source_track or f"unattributed:{name}"
            unit_check = self.validate_track(source_name, signal.unit)
            reasons: list[str] = []
            expected_rate = expected_rates.get(name)
            observed_rate = float(signal.sample_rate_hz)
            if not math.isfinite(observed_rate) or observed_rate <= 0:
                reasons.append("Observed waveform sample rate is unavailable or invalid.")
            elif expected_rate is not None and not math.isclose(
                observed_rate, float(expected_rate), rel_tol=0, abs_tol=1e-6
            ):
                reasons.append(
                    f"Expected training input rate {expected_rate:g} Hz; "
                    f"observed {observed_rate:g} Hz."
                )
            expected_count = (
                int(round(float(expected_rate or observed_rate) * wave_seconds))
                if math.isfinite(observed_rate) and observed_rate > 0
                else None
            )
            if expected_count is not None and int(signal.values.size) != expected_count:
                reasons.append(
                    f"Expected {expected_count} samples for the trained waveform window; "
                    f"observed {signal.values.size}."
                )
            role = roles.get(name)
            selected_track = window.selected_tracks.get(role) if role else None
            if not signal.source_track or signal.source_track != selected_track:
                reasons.append("Waveform provenance does not match its selected source track.")
            if unit_check.state is FeatureState.INVALID:
                reasons.append(unit_check.reason)
            structural_state = FeatureState.INVALID if reasons else FeatureState.OBSERVED
            checks[source_name] = {
                **unit_check.as_dict(),
                "track_type": "WAVEFORM",
                "expected_track_type": "WAVEFORM",
                "expected_source_rate_hz": expected_rate if expected_rate is not None else "NOT_RECORDED",
                "expected_sample_count": expected_count if expected_count is not None else "NOT_RECORDED",
                "structural_state": structural_state.value,
                "structural_reason": " ".join(reasons) or "Waveform rate, length, and provenance verified.",
            }
            if structural_state is FeatureState.INVALID:
                invalid.append(source_name)
        return UnitValidation(not invalid, checks, tuple(sorted(set(invalid))))


class ModelWindowBuilder:
    """Cut only contract-aligned, half-open windows from the canonical case series."""

    def candidate_times(self, series: VitalDBCaseSignals) -> range:
        contract = _contract_for(series.model_id)
        history = contract.window_seconds["numeric"]
        stride = contract.stride_seconds
        first = ((history + stride - 1) // stride) * stride
        last = int(series.duration_seconds // stride) * stride
        return range(first, last + 1, stride)

    def build(
        self, series: VitalDBCaseSignals, prediction_time_s: float
    ) -> InferenceWindow:
        contract = _contract_for(series.model_id)
        prediction_time = float(prediction_time_s)
        if not math.isfinite(prediction_time):
            raise ValueError("prediction_time_s must be finite")
        stride = contract.stride_seconds
        if abs(prediction_time / stride - round(prediction_time / stride)) > 1e-9:
            raise ValueError(f"prediction time must align to the trained {stride}s stride")
        if series.history_seconds != contract.window_seconds["numeric"]:
            raise VitalDBDataError(
                f"loaded numeric history {series.history_seconds}s differs from the model contract"
            )
        window = series.window_at(prediction_time)
        if (
            window.window_start_s != prediction_time - contract.window_seconds["numeric"]
            or window.window_end_s != prediction_time
            or window.prediction_time_s != prediction_time
        ):
            raise VitalDBDataError("window boundaries do not match the model contract")
        return window


class SignalQualityAnalyzer:
    """Report raw coverage and the exact training preprocessing quality states."""

    _UC04_WAVE_RANGES = {"art": (-20.0, 300.0), "ecg": (-20.0, 20.0), "capno": (-5.0, 100.0)}
    _UC05_WAVE_RANGES = {"capno": (-5.0, 120.0), "awp": (-20.0, 120.0)}

    @staticmethod
    def mark_invalid_if_observed(
        *, quality: dict[str, Any], feature: str, reason: str
    ) -> None:
        # Missing data stays MISSING. INVALID is added only when recorded
        # content exists but a verified quality/schema gate rejects it.
        states = quality["feature_states"].setdefault(feature, [])
        if not any(
            state in {
                FeatureState.OBSERVED.value,
                FeatureState.ARTIFACT.value,
                FeatureState.INTERPOLATED.value,
            }
            for state in states
        ):
            return
        if FeatureState.INVALID.value not in states:
            states.append(FeatureState.INVALID.value)
        if feature not in quality["missing_features"]:
            quality["missing_features"].append(feature)
        if reason and reason not in quality["validation_errors"]:
            quality["validation_errors"].append(reason)

    def analyze(
        self,
        model_id: str,
        window: InferenceWindow,
        prepared: PreparedUC04Input | PreparedUC05Input | None = None,
        *,
        unit_validation: UnitValidation | None = None,
    ) -> dict[str, Any]:
        model = _model_key(model_id)
        feature_states: dict[str, list[str]] = {}
        coverage: dict[str, float | None] = {}
        present: list[str] = []
        missing: set[str] = set()
        artifact_counts: dict[str, int] = {}

        def add_state(feature: str, state: FeatureState) -> None:
            values = feature_states.setdefault(feature, [])
            if state.value not in values:
                values.append(state.value)

        for index, name in enumerate(window.numeric_feature_order):
            key = f"numeric:{name}"
            raw = np.asarray(window.numeric_values[:, index], dtype=np.float32)
            # UC04 carries a five-second pre-roll solely for the notebook's
            # bounded interpolation. Coverage describes the 300-second model
            # window, not those additional pre-roll samples.
            if model == "uc04":
                raw = raw[-300:]
            finite = np.isfinite(raw)
            fraction = float(finite.mean()) if raw.size else 0.0
            coverage[key] = fraction
            track_name = window.selected_tracks.get(name)
            if track_name and finite.any():
                present.append(key)
                add_state(key, FeatureState.OBSERVED)
            if not track_name or not finite.any():
                add_state(key, FeatureState.MISSING)
                missing.add(key)
            elif not finite.all():
                add_state(key, FeatureState.MISSING)

            # The UC05 quality gate excludes out-of-range SpO2 on a copy only;
            # the original numeric feature and mask remain exactly as trained.
            if model == "uc05" and name == "SPO2":
                artifacts = int((finite & ((raw < 50.0) | (raw > 100.0))).sum())
                if artifacts:
                    artifact_counts[key] = artifacts
                    add_state(key, FeatureState.ARTIFACT)

            if model == "uc04" and prepared is not None:
                raw_history = raw
                cooked = np.asarray(prepared.numeric[0, :, index], dtype=np.float32)
                if cooked.size == raw_history.size and np.any(~np.isfinite(raw_history) & np.isfinite(cooked)):
                    add_state(key, FeatureState.INTERPOLATED)

            # This is the audited UC04 MAP quality gate. A present track that
            # falls below it is invalid for model input; an absent track stays
            # MISSING.
            if model == "uc04" and name == "MAP" and fraction < 0.8 and track_name:
                add_state(key, FeatureState.INVALID)
                missing.add(key)

        wave_order = UC04_WAVE_ORDER if model == "uc04" else UC05_WAVE_ORDER
        wave_ranges = self._UC04_WAVE_RANGES if model == "uc04" else self._UC05_WAVE_RANGES
        cooked_waves = (
            {"art": prepared.art[0], "ecg": prepared.ecg[0], "ppg": prepared.ppg[0], "capno": prepared.capno[0]}
            if isinstance(prepared, PreparedUC04Input)
            else prepared.waves if isinstance(prepared, PreparedUC05Input) else {}
        )
        wave_masks = (
            dict(zip(UC04_WAVE_ORDER, prepared.modality_mask[0].tolist()))
            if isinstance(prepared, PreparedUC04Input)
            else dict(zip(UC05_WAVE_ORDER, prepared.wave_mask[0].tolist()))
            if isinstance(prepared, PreparedUC05Input)
            else {}
        )
        for name in wave_order:
            key = f"waveform:{name}"
            signal_window = window.waveforms.get(name)
            if signal_window is None:
                coverage[key] = 0.0
                add_state(key, FeatureState.MISSING)
                missing.add(key)
                continue
            raw = np.asarray(signal_window.values, dtype=np.float32).reshape(-1)
            finite = np.isfinite(raw)
            plausible = wave_ranges.get(name)
            valid = finite.copy()
            artifacts = 0
            if plausible is not None:
                low, high = plausible
                outside = finite & ((raw < low) | (raw > high))
                artifacts = int(outside.sum())
                valid &= ~outside
            fraction = float(valid.mean()) if valid.size else 0.0
            coverage[key] = fraction
            if finite.any():
                present.append(key)
                add_state(key, FeatureState.OBSERVED)
            if not finite.any():
                add_state(key, FeatureState.MISSING)
                missing.add(key)
            elif not finite.all():
                add_state(key, FeatureState.MISSING)
            if artifacts:
                artifact_counts[key] = artifacts
                add_state(key, FeatureState.ARTIFACT)
            cooked = cooked_waves.get(name)
            if (
                cooked is not None
                and wave_masks.get(name, 0) >= 0.5
                and (not finite.all() or artifacts > 0)
            ):
                add_state(key, FeatureState.INTERPOLATED)
            if wave_masks and wave_masks.get(name, 0) < 0.5:
                missing.add(key)
            minimum = 0.9 if model == "uc04" and name == "art" else 0.8
            if finite.any() and (
                fraction < minimum
                or (wave_masks and wave_masks.get(name, 0) < 0.5)
            ):
                # Keep sample-level ARTIFACT/MISSING information while also
                # exposing the model-level quality-gate failure.
                add_state(key, FeatureState.INVALID)
                missing.add(key)

        static_order = UC04_STATIC_ORDER if model == "uc04" else UC05_STATIC_ORDER
        for name in static_order:
            key = f"static:{name}"
            value = window.static_features.get(name)
            is_present = value is not None and math.isfinite(float(value))
            coverage[key] = 1.0 if is_present else 0.0
            if is_present:
                present.append(key)
                add_state(key, FeatureState.OBSERVED)
            else:
                add_state(key, FeatureState.NOT_RECORDED)
                missing.add(key)

        unit_report = unit_validation.as_dict() if unit_validation else self._window_unit_report(window)
        for track_name, check in unit_report["tracks"].items():
            add_state(f"unit:{track_name}", FeatureState(check["state"]))
            if check["state"] == FeatureState.INVALID.value:
                missing.add(f"unit:{track_name}")
            if (
                check.get("structural_state") == FeatureState.INVALID.value
                or check.get("state") == FeatureState.INVALID.value
            ):
                feature = f"track:{track_name}"
                add_state(feature, FeatureState.INVALID)
                missing.add(feature)
                for role, selected_track in window.selected_tracks.items():
                    if selected_track == track_name:
                        model_feature = _feature_for_role(model, role)
                        if model_feature:
                            add_state(model_feature, FeatureState.INVALID)
                            missing.add(model_feature)

        if prepared is not None:
            missing.update(prepared.missing_features)
        return {
            "overall": prepared.quality_status if prepared is not None else "INVALID",
            "feature_states": feature_states,
            "observed_coverage": coverage,
            "aggregate_coverage": prepared.data_coverage if prepared is not None else 0.0,
            "artifact_sample_counts": artifact_counts,
            "validation_errors": [],
            "unit_validation": unit_report,
            "interpolation_policy": (
                "Only notebook-defined interpolation; numeric UC04 internal gaps up to 5 seconds, "
                "UC04/UC05 waveforms use their exported robust-normalization interpolation, "
                "UC05 numeric values are not imputed."
            ),
            "present_features": sorted(set(present)),
            "missing_features": sorted(missing),
        }

    def _window_unit_report(self, window: InferenceWindow) -> dict[str, Any]:
        return UnitValidator().validate_window(window).as_dict()


class UC04FeatureBuilder:
    model_id = UC04_CONTRACT.model_id
    preprocessing_version = UC04_PREPROCESSING_VERSION
    input_order = ("art", "ecg", "ppg", "capno", "numeric", "numeric_mask", "static", "modality_mask")

    def build(self, window: InferenceWindow) -> PreparedUC04Input:
        return UC04InferenceService().preprocess_window(window)

    def model_tensors(self, prepared: PreparedUC04Input) -> dict[str, np.ndarray]:
        return {
            "art": prepared.art,
            "ecg": prepared.ecg,
            "ppg": prepared.ppg,
            "capno": prepared.capno,
            "numeric": prepared.numeric,
            "numeric_mask": prepared.numeric_mask,
            "static": prepared.static,
            "modality_mask": prepared.modality_mask,
        }


class UC05FeatureBuilder:
    model_id = UC05_CONTRACT.model_id
    preprocessing_version = UC05_PREPROCESSING_VERSION
    input_order = ("capno", "awp", "ppg", "flow", "resp", "numeric", "numeric_mask", "static", "wave_mask")

    def build(self, window: InferenceWindow) -> PreparedUC05Input:
        # Preprocessing is allowed for contract inspection, but the service's
        # blocked-inference override remains disabled until readiness is fixed.
        return UC05InferenceService().preprocess_window(window)

    def model_tensors(self, prepared: PreparedUC05Input) -> dict[str, np.ndarray]:
        return {
            **prepared.waves,
            "numeric": prepared.numeric,
            "numeric_mask": prepared.numeric_mask,
            "static": prepared.static,
            "wave_mask": prepared.wave_mask,
        }


@dataclass(frozen=True)
class WindowPreprocessingResult:
    prepared: PreparedUC04Input | PreparedUC05Input | None
    model_tensors: Mapping[str, np.ndarray]
    report: Mapping[str, Any]


class TrainingPreprocessorAdapter:
    """Call only the audited training-compatible transformations and shape gates."""

    _UC05_SCHEMA_REQUIRED = ("capno", "awp", "ppg")

    def __init__(
        self,
        *,
        unit_validator: UnitValidator | None = None,
        quality_analyzer: SignalQualityAnalyzer | None = None,
    ) -> None:
        self.unit_validator = unit_validator or UnitValidator()
        self.quality_analyzer = quality_analyzer or SignalQualityAnalyzer()
        self.builders = {
            "uc04": UC04FeatureBuilder(),
            "uc05": UC05FeatureBuilder(),
        }

    def prepare(
        self,
        model_id: str,
        window: InferenceWindow,
        *,
        case_signals: VitalDBCaseSignals | None = None,
    ) -> WindowPreprocessingResult:
        contract = _contract_for(model_id)
        key = _model_key(contract.model_id)
        builder = self.builders[key]
        unit_validation = (
            _merge_unit_validations(
                self.unit_validator.validate_series(contract.model_id, case_signals),
                self.unit_validator.validate_window(window),
            )
            if case_signals is not None
            else self.unit_validator.validate_window(window)
        )
        tensors: dict[str, np.ndarray] = {}
        prepared: PreparedUC04Input | PreparedUC05Input | None = None
        abstain_reasons: list[str] = []
        preprocessing_errors: list[str] = []
        schema_errors: list[str] = []

        if not unit_validation.valid:
            abstain_reasons.append(
                "Invalid or unverified track structure/rate: "
                + ", ".join(unit_validation.invalid_tracks)
            )
        else:
            try:
                prepared = builder.build(window)
                tensors = builder.model_tensors(prepared)
                validate_model_tensor_shapes(contract.model_id, tensors)
                if key == "uc05":
                    failed_schema = [
                        name
                        for name in self._UC05_SCHEMA_REQUIRED
                        if prepared.wave_mask[0, UC05_WAVE_ORDER.index(name)] < 0.5
                    ]
                    if failed_schema:
                        schema_error = (
                            "Exported UC05 signal_schema.json requires valid capno, AWP, and PPG; "
                            "invalid: " + ", ".join(failed_schema)
                        )
                        abstain_reasons.append(schema_error)
                        schema_errors.append(schema_error)
            except InputValidationError as exc:
                abstain_reasons.append(str(exc))
                preprocessing_errors.append(str(exc))
                prepared = None
                tensors = {}

        quality = self.quality_analyzer.analyze(
            contract.model_id,
            window,
            prepared,
            unit_validation=unit_validation,
        )
        quality["validation_errors"].extend(preprocessing_errors)
        quality["schema_errors"] = schema_errors
        for reason in (*preprocessing_errors, *schema_errors):
            for feature in _features_for_validation_error(key, reason):
                self.quality_analyzer.mark_invalid_if_observed(
                    quality=quality,
                    feature=feature,
                    reason=reason,
                )
        if prepared is None:
            for feature, states in quality["feature_states"].items():
                if feature.startswith(("numeric:", "waveform:")) and FeatureState.INVALID.value in states:
                    if feature not in quality["missing_features"]:
                        quality["missing_features"].append(feature)
        if not unit_validation.valid:
            for track_name in unit_validation.invalid_tracks:
                feature = f"track:{track_name}"
                quality["feature_states"][feature] = [FeatureState.INVALID.value]
                quality["missing_features"].append(feature)

        input_eligible = prepared is not None and bool(tensors) and not any(
            reason.startswith(("Invalid or unverified", "Exported UC05 signal_schema"))
            for reason in abstain_reasons
        )
        blockers = tuple(UC05InferenceService.readiness_blockers) if key == "uc05" else ()
        if blockers:
            abstain_reasons.extend(blockers)
        inference_eligible = input_eligible and not blockers
        tensor_shapes = {name: list(value.shape) for name, value in tensors.items()}
        report = {
            "case_id": window.case_id,
            "model_id": contract.model_id,
            "window_start": window.window_start_s,
            "window_end": window.window_end_s,
            "prediction_time": window.prediction_time_s,
            "required_features": _required_features(key),
            "present_features": quality["present_features"],
            "missing_features": sorted(set(quality["missing_features"])),
            "observed_coverage": quality["observed_coverage"],
            "quality": quality,
            "tensor_shape": tensor_shapes,
            "preprocessing_version": builder.preprocessing_version,
            "input_eligible": input_eligible,
            "inference_eligible": inference_eligible,
            "model_readiness_blockers": list(blockers),
            "abstain_reasons": list(dict.fromkeys(abstain_reasons)),
        }
        return WindowPreprocessingResult(prepared, tensors, report)


def validate_model_tensor_shapes(
    model_id: str, tensors: Mapping[str, np.ndarray]
) -> None:
    contract = _contract_for(model_id)
    input_names = (
        UC04FeatureBuilder.input_order
        if _model_key(contract.model_id) == "uc04"
        else UC05FeatureBuilder.input_order
    )
    missing = [name for name in input_names if name not in tensors]
    if missing:
        raise InputValidationError("prepared tensors are missing: " + ", ".join(missing))
    for name in input_names:
        array = np.asarray(tensors[name])
        expected = contract.input_shape[name]
        if array.ndim != len(expected) or any(
            size is not None and int(size) != int(actual)
            for actual, size in zip(array.shape, expected)
        ):
            raise InputValidationError(
                f"{contract.model_id} {name} tensor shape mismatch: "
                f"expected {expected}, received {tuple(array.shape)}"
            )


def _model_key(model_id: str) -> str:
    normalized = str(model_id).upper()
    if normalized in {"UC04", UC04_CONTRACT.model_id.upper()}:
        return "uc04"
    if normalized in {"UC05", UC05_CONTRACT.model_id.upper()}:
        return "uc05"
    raise ValueError(f"unsupported SafeAnes model: {model_id}")


def _merge_unit_validations(*validations: UnitValidation) -> UnitValidation:
    merged: dict[str, dict[str, Any]] = {}
    invalid: set[str] = set()
    for validation in validations:
        invalid.update(validation.invalid_tracks)
        for track_name, current in validation.tracks.items():
            previous = merged.get(track_name)
            if previous is None:
                merged[track_name] = dict(current)
                continue
            combined = {**previous, **current}
            invalid_structure = any(
                entry.get("structural_state") == FeatureState.INVALID.value
                for entry in (previous, current)
            )
            if invalid_structure:
                combined["structural_state"] = FeatureState.INVALID.value
                reasons = list(dict.fromkeys(
                    reason
                    for entry in (previous, current)
                    for reason in [str(entry.get("structural_reason", "")).strip()]
                    if reason and not reason.endswith("verified.")
                ))
                combined["structural_reason"] = " ".join(reasons) or "Track validation failed."
                invalid.add(track_name)
            merged[track_name] = combined
    return UnitValidation(
        valid=not invalid,
        tracks=merged,
        invalid_tracks=tuple(sorted(invalid)),
    )


def _contract_for(model_id: str):
    key = _model_key(model_id)
    return UC04_CONTRACT if key == "uc04" else UC05_CONTRACT


def _feature_for_role(model_key: str, role: str) -> str | None:
    normalized = str(role).strip().casefold()
    if normalized.endswith("_wave"):
        return f"waveform:{normalized[:-5]}"
    if normalized in {"art", "ecg", "ppg", "capno", "awp", "flow", "resp"}:
        return f"waveform:{normalized}"
    if normalized in {name.casefold() for name in (
        UC04_FEATURE_ORDER if model_key == "uc04" else UC05_FEATURE_ORDER
    )}:
        return f"numeric:{str(role).upper()}"
    return None


def _features_for_validation_error(model_key: str, reason: str) -> tuple[str, ...]:
    message = reason.casefold()
    if model_key == "uc04" and "map history valid fraction" in message:
        return ("numeric:MAP",)
    if model_key == "uc04" and "arterial waveform" in message:
        return ("waveform:art",)
    if model_key == "uc05" and "spo2 history valid fraction" in message:
        return ("numeric:SPO2",)
    if model_key == "uc05" and "requires a valid ppg waveform" in message:
        return ("waveform:ppg",)
    if "provenance does not match selected track" in message:
        for name in ("art", "ecg", "ppg", "capno", "awp", "flow", "resp"):
            if f" {name} " in f" {message} ":
                return (f"waveform:{name}",)
    for name in ("art", "ecg", "ppg", "capno", "awp", "flow", "resp"):
        if f" {name} must use " in f" {message} " or f" {name} must contain " in f" {message} ":
            return (f"waveform:{name}",)
    if message.startswith("exported uc05 signal_schema.json"):
        return tuple(
            f"waveform:{name}"
            for name in ("capno", "awp", "ppg")
            if name in message
        )
    return ()


def _required_features(model_key: str) -> list[str]:
    if model_key == "uc04":
        return [
            "source:SNUADC/ART (ART waveform >= 90% valid)",
            "source:Solar8000/ART_MBP (MAP history >= 80% valid)",
            "source:Solar8000/HR",
        ]
    return [
        "source:Solar8000/PLETH_SPO2 (quality history >= 80% valid)",
        "source:SNUADC/PLETH (PPG >= 80% valid)",
        "source:Primus/CO2 (capnogram >= 80% valid)",
        "source:Primus/AWP (airway pressure >= 80% valid)",
        "strict schema requirement retained; readiness remains blocked by evaluator/schema mismatch",
    ]
