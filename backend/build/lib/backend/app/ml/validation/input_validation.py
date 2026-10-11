from __future__ import annotations

import math

from backend.app.ml.contracts.window import InferenceWindow


class InputValidationError(ValueError):
    """Base class for rejected inference windows."""


class FutureInformationError(InputValidationError):
    """Raised when a model input includes samples after its prediction time."""


class FeatureOrderError(InputValidationError):
    """Raised when feature columns do not match the trained model contract."""


class WindowShapeError(InputValidationError):
    """Raised when a signal window cannot represent its declared time range."""


def validate_feature_order(
    actual: tuple[str, ...], expected: tuple[str, ...], field_name: str
) -> None:
    if actual != expected:
        raise FeatureOrderError(
            f"{field_name} feature order mismatch: expected {expected}, received {actual}"
        )


def validate_future_information(window: InferenceWindow) -> None:
    """Reject malformed or future-dated samples before any preprocessing."""

    times = (
        window.window_start_s,
        window.window_end_s,
        window.prediction_time_s,
        window.numeric_start_time_s,
    )
    if not all(math.isfinite(value) for value in times):
        raise WindowShapeError("window times must be finite elapsed seconds")
    if window.window_start_s > window.window_end_s:
        raise WindowShapeError("window_start_s must not exceed window_end_s")
    if window.window_end_s > window.prediction_time_s:
        raise FutureInformationError("window_end_s is after prediction_time_s")
    if window.numeric_sample_rate_hz <= 0:
        raise WindowShapeError("numeric_sample_rate_hz must be positive")

    numeric_end = window.numeric_end_time_s
    if not math.isfinite(numeric_end):
        raise WindowShapeError("numeric sample timestamps are invalid")
    if numeric_end > window.prediction_time_s + 1e-9:
        raise FutureInformationError(
            f"numeric samples end at {numeric_end}, after prediction_time_s "
            f"{window.prediction_time_s}"
        )

    if (
        window.source_available_through_s is not None
        and window.source_available_through_s < window.prediction_time_s - 1e-9
    ):
        raise WindowShapeError(
            "source_available_through_s precedes prediction_time_s"
        )
    if (
        window.source_available_through_s is not None
        and window.source_available_through_s < window.numeric_end_time_s - 1e-9
    ):
        raise FutureInformationError(
            "numeric samples extend beyond the source's available-through time"
        )

    for name, signal in window.waveforms.items():
        if signal.sample_rate_hz <= 0 or not math.isfinite(signal.sample_rate_hz):
            raise WindowShapeError(f"{name} sample rate must be finite and positive")
        if not math.isfinite(signal.start_time_s):
            raise WindowShapeError(f"{name} start time must be finite")
        if signal.values.ndim != 1:
            raise WindowShapeError(f"{name} waveform must be a one-dimensional array")
        if signal.values.size == 0:
            continue
        signal_end = signal.sample_end_time_s
        if signal_end > window.prediction_time_s + 1e-9:
            raise FutureInformationError(
                f"{name} samples end at {signal_end}, after prediction_time_s "
                f"{window.prediction_time_s}"
            )
        if (
            window.source_available_through_s is not None
            and signal_end > window.source_available_through_s + 1e-9
        ):
            raise FutureInformationError(
                f"{name} samples extend beyond the source's available-through time"
            )
