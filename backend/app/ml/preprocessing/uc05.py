from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from backend.app.ml.contracts.window import InferenceWindow
from backend.app.ml.models.uc05.architecture import NUM_FEATURES, STATIC_FEATURES
from backend.app.ml.preprocessing.common import (
    coverage_score,
    fixed_length,
    resample_poly_safe,
    robust_normalize_waveform,
    short_interpolate_without_future,
)
from backend.app.ml.validation.input_validation import (
    InputValidationError,
    validate_feature_order,
    validate_future_information,
)


UC05_FEATURE_ORDER = NUM_FEATURES
UC05_STATIC_ORDER = STATIC_FEATURES
UC05_WAVE_ORDER = ("capno", "awp", "ppg", "flow", "resp")
UC05_TARGET_RATE_HZ = {
    "capno": 62.5,
    "awp": 62.5,
    "ppg": 125.0,
    "flow": 62.5,
    "resp": 62.5,
}
UC05_WAVE_SECONDS = 60
UC05_NUMERIC_SECONDS = 600
UC05_PREPROCESSING_VERSION = "notebook-compat/uc05-95b2d441"


class QualityGateError(InputValidationError):
    """Required UC05 signal history does not meet the streaming gate."""


@dataclass(frozen=True)
class PreparedUC05Input:
    waves: dict[str, NDArray[np.float32]]
    numeric: NDArray[np.float32]
    numeric_mask: NDArray[np.float32]
    static: NDArray[np.float32]
    wave_mask: NDArray[np.float32]
    quality_status: str
    data_coverage: float
    missing_features: tuple[str, ...]


def _clean_spo2_for_quality(values: NDArray[np.float32]) -> NDArray[np.float32]:
    clean = np.asarray(values, dtype=np.float32).copy()
    clean[(clean < 50) | (clean > 100)] = np.nan
    return short_interpolate_without_future(clean, 5)


def preprocess_uc05_window(window: InferenceWindow) -> PreparedUC05Input:
    validate_future_information(window)
    validate_feature_order(
        window.numeric_feature_order, UC05_FEATURE_ORDER, "UC05 numeric"
    )
    if window.numeric_values.shape != (UC05_NUMERIC_SECONDS, len(UC05_FEATURE_ORDER)):
        raise InputValidationError(
            "UC05 numeric input must have shape [600, 18]"
        )
    if abs(window.numeric_sample_rate_hz - 1.0) > 1e-6:
        raise InputValidationError("UC05 numeric input must be sampled at 1 Hz")
    if abs(
        window.numeric_start_time_s + UC05_NUMERIC_SECONDS
        - window.prediction_time_s
    ) > 1e-6:
        raise InputValidationError(
            "UC05 numeric window must end at prediction_time_s and span 600 seconds"
        )

    numeric = np.asarray(window.numeric_values, dtype=np.float32).copy()
    numeric_mask = np.isfinite(numeric).astype(np.float32)
    numeric_coverage = numeric_mask.mean(axis=0).astype(float).tolist()
    spo2_index = UC05_FEATURE_ORDER.index("SPO2")
    quality_spo2 = _clean_spo2_for_quality(numeric[:, spo2_index])
    spo2_coverage = float(np.isfinite(quality_spo2).mean())
    if spo2_coverage < 0.8:
        raise QualityGateError("UC05 SpO2 history valid fraction is below 0.80")

    waves: dict[str, NDArray[np.float32]] = {}
    wave_mask: list[float] = []
    coverage_parts = numeric_coverage.copy()
    missing: list[str] = []
    degraded = bool(np.any(numeric_mask == 0))
    for feature, fraction in zip(UC05_FEATURE_ORDER, numeric_coverage):
        if fraction == 0:
            missing.append(f"numeric:{feature}")
        elif fraction < 1:
            missing.append(f"numeric:{feature}:partial")

    for name in UC05_WAVE_ORDER:
        target_hz = UC05_TARGET_RATE_HZ[name]
        target_count = int(round(target_hz * UC05_WAVE_SECONDS))
        source = window.waveforms.get(name)
        if source is None:
            normalized = np.zeros(target_count, dtype=np.float32)
            ok = False
            valid_fraction = 0.0
        else:
            resampled = resample_poly_safe(
                source.values, source.sample_rate_hz, target_hz
            )
            fixed = fixed_length(resampled, target_count)
            plausible = {"capno": (-5, 120), "awp": (-20, 120)}.get(name)
            normalized, ok, valid_fraction = robust_normalize_waveform(
                fixed, min_valid_fraction=0.8, plausible=plausible
            )
        waves[name] = normalized[None, :]
        wave_mask.append(float(ok))
        coverage_parts.append(valid_fraction)
        if not ok:
            missing.append(f"waveform:{name}")
            degraded = True
        elif valid_fraction < 1:
            missing.append(f"waveform:{name}:partial")
            degraded = True

    required_waveforms = ("capno", "awp", "ppg")
    invalid_required = [
        name
        for name in required_waveforms
        if wave_mask[UC05_WAVE_ORDER.index(name)] < 0.5
    ]
    if invalid_required:
        raise QualityGateError(
            "UC05 signal_schema.json requires valid capno, AWP, and PPG; "
            "unavailable or invalid: " + ", ".join(invalid_required)
        )

    static = np.asarray(
        [
            np.nan
            if window.static_features.get(name) is None
            else float(window.static_features[name])
            for name in UC05_STATIC_ORDER
        ],
        dtype=np.float32,
    )
    for name, value in zip(UC05_STATIC_ORDER, static):
        coverage_parts.append(float(np.isfinite(value)))
        if not np.isfinite(value):
            missing.append(f"static:{name}")
            degraded = True

    return PreparedUC05Input(
        waves=waves,
        numeric=numeric[None, :, :],
        numeric_mask=numeric_mask[None, :, :],
        static=static[None, :],
        wave_mask=np.asarray([wave_mask], dtype=np.float32),
        quality_status="DEGRADED" if degraded or spo2_coverage < 1 else "GOOD",
        data_coverage=coverage_score(coverage_parts),
        missing_features=tuple(missing),
    )
