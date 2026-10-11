from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from backend.app.ml.contracts.window import InferenceWindow
from backend.app.ml.models.uc04.architecture import NUM_KEYS, STATIC_KEYS
from backend.app.ml.preprocessing.common import (
    coverage_score,
    robust_normalize_waveform,
    short_interpolate_without_future,
)
from backend.app.ml.validation.input_validation import (
    FeatureOrderError,
    InputValidationError,
    validate_feature_order,
    validate_future_information,
)


UC04_FEATURE_ORDER = NUM_KEYS
UC04_STATIC_ORDER = STATIC_KEYS
UC04_WAVE_ORDER = ("art", "ecg", "ppg", "capno")
UC04_TARGET_RATE_HZ = {"art": 100.0, "ecg": 250.0, "ppg": 100.0, "capno": 62.5}
UC04_WAVE_SECONDS = 30
UC04_NUMERIC_SECONDS = 300
UC04_PREPROCESSING_VERSION = "notebook-compat/uc04-a152750f"


class QualityGateError(InputValidationError):
    """Required UC04 signals do not meet notebook quality gates."""


@dataclass(frozen=True)
class PreparedUC04Input:
    art: NDArray[np.float32]
    ecg: NDArray[np.float32]
    ppg: NDArray[np.float32]
    capno: NDArray[np.float32]
    numeric: NDArray[np.float32]
    numeric_mask: NDArray[np.float32]
    static: NDArray[np.float32]
    modality_mask: NDArray[np.float32]
    quality_status: str
    data_coverage: float
    missing_features: tuple[str, ...]


def preprocess_uc04_window(window: InferenceWindow) -> PreparedUC04Input:
    validate_future_information(window)
    validate_feature_order(
        window.numeric_feature_order, UC04_FEATURE_ORDER, "UC04 numeric"
    )
    raw_rows = window.numeric_values.shape[0]
    if (
        window.numeric_values.ndim != 2
        or window.numeric_values.shape[1] != len(UC04_FEATURE_ORDER)
        or raw_rows not in (UC04_NUMERIC_SECONDS, UC04_NUMERIC_SECONDS + 5)
    ):
        raise InputValidationError(
            "UC04 numeric input must have shape [300, 7] or [305, 7] with a 5-second interpolation pre-roll"
        )
    if abs(window.numeric_sample_rate_hz - 1.0) > 1e-6:
        raise InputValidationError("UC04 numeric input must be sampled at 1 Hz")
    if abs(
        window.numeric_start_time_s + raw_rows - window.prediction_time_s
    ) > 1e-6:
        raise InputValidationError(
            "UC04 numeric input must end at prediction_time_s and match its sample count"
        )

    raw_input = np.asarray(window.numeric_values, dtype=np.float32).copy()
    interpolated_prefix = np.column_stack(
        [
            short_interpolate_without_future(raw_input[:, index], 5)
            for index in range(raw_input.shape[1])
        ]
    ).astype(np.float32)
    raw_numeric = raw_input[-UC04_NUMERIC_SECONDS:, :]
    raw_valid = np.isfinite(raw_numeric)
    numeric_coverage = raw_valid.mean(axis=0).astype(float).tolist()
    numeric = interpolated_prefix[-UC04_NUMERIC_SECONDS:, :]
    numeric_mask = np.isfinite(numeric).astype(np.float32)
    map_index = UC04_FEATURE_ORDER.index("MAP")
    if float(numeric_mask[:, map_index].mean()) < 0.8:
        raise QualityGateError("UC04 MAP history valid fraction is below 0.80")

    waveform_outputs: dict[str, NDArray[np.float32]] = {}
    modality_values: list[float] = []
    coverage_parts: list[float] = numeric_coverage.copy()
    missing: list[str] = []
    degraded = bool(np.any(~raw_valid))
    for feature, fraction in zip(UC04_FEATURE_ORDER, numeric_coverage):
        if fraction == 0:
            missing.append(f"numeric:{feature}")
        elif fraction < 1:
            missing.append(f"numeric:{feature}:partial")

    for name in UC04_WAVE_ORDER:
        signal_window = window.waveforms.get(name)
        expected_count = int(round(UC04_TARGET_RATE_HZ[name] * UC04_WAVE_SECONDS))
        minimum = 0.9 if name == "art" else 0.8
        if signal_window is None:
            normalized = np.zeros(expected_count, dtype=np.float32)
            ok = False
            valid_fraction = 0.0
        else:
            if abs(signal_window.sample_rate_hz - UC04_TARGET_RATE_HZ[name]) > 1e-6:
                raise InputValidationError(
                    f"UC04 {name} must use the trained {UC04_TARGET_RATE_HZ[name]} Hz rate"
                )
            if signal_window.values.size != expected_count:
                raise InputValidationError(
                    f"UC04 {name} must contain exactly {expected_count} samples"
                )
            plausible = {"art": (-20, 300), "ecg": (-20, 20), "capno": (-5, 100)}.get(name)
            normalized, ok, valid_fraction = robust_normalize_waveform(
                signal_window.values, min_valid_fraction=minimum, plausible=plausible
            )
        if name == "art" and not ok:
            raise QualityGateError("UC04 arterial waveform must be at least 90% valid")
        waveform_outputs[name] = normalized
        modality_values.append(float(ok))
        coverage_parts.append(valid_fraction)
        if not ok:
            missing.append(f"waveform:{name}")
            degraded = True
        elif valid_fraction < 1:
            missing.append(f"waveform:{name}:partial")
            degraded = True

    static = np.asarray(
        [
            np.nan
            if window.static_features.get(name) is None
            else float(window.static_features[name])
            for name in UC04_STATIC_ORDER
        ],
        dtype=np.float32,
    )
    for name, value in zip(UC04_STATIC_ORDER, static):
        coverage_parts.append(float(np.isfinite(value)))
        if not np.isfinite(value):
            missing.append(f"static:{name}")
            degraded = True

    if any(fraction < 1 for fraction in numeric_coverage):
        degraded = True
    return PreparedUC04Input(
        art=waveform_outputs["art"][None, :],
        ecg=waveform_outputs["ecg"][None, :],
        ppg=waveform_outputs["ppg"][None, :],
        capno=waveform_outputs["capno"][None, :],
        numeric=numeric[None, :, :],
        numeric_mask=numeric_mask[None, :, :],
        static=static[None, :],
        modality_mask=np.asarray([modality_values], dtype=np.float32),
        quality_status="DEGRADED" if degraded else "GOOD",
        data_coverage=coverage_score(coverage_parts),
        missing_features=tuple(missing),
    )
