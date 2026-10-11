from __future__ import annotations

from fractions import Fraction

import numpy as np
from numpy.typing import NDArray
from scipy import signal


def robust_normalize_waveform(
    values: NDArray[np.floating],
    min_valid_fraction: float = 0.8,
    plausible: tuple[float, float] | None = None,
) -> tuple[NDArray[np.float32], bool, float]:
    """Match the notebook's per-window interpolation and robust scaling."""

    x = np.asarray(values, dtype=np.float32).reshape(-1).copy()
    if plausible is not None:
        low, high = plausible
        x[(x < low) | (x > high)] = np.nan
    valid = np.isfinite(x)
    fraction = float(valid.mean()) if x.size else 0.0
    if fraction < min_valid_fraction or int(valid.sum()) < 8:
        return np.zeros_like(x, dtype=np.float32), False, fraction
    indices = np.arange(len(x))
    x[~valid] = np.interp(indices[~valid], indices[valid], x[valid])
    median = float(np.median(x))
    q25, q75 = np.percentile(x, [25, 75])
    scale = max(float((q75 - q25) / 1.349), float(np.std(x)), 1e-3)
    return np.clip((x - median) / scale, -8, 8).astype(np.float32), True, fraction


def resample_poly_safe(
    values: NDArray[np.floating], source_hz: float, target_hz: float
) -> NDArray[np.float32]:
    x = np.asarray(values, dtype=np.float32).reshape(-1)
    if x.size == 0:
        return x.copy()
    if source_hz <= 0 or target_hz <= 0:
        raise ValueError("sample rates must be positive")
    if abs(float(source_hz) - float(target_hz)) < 1e-6:
        return x.copy()
    ratio = Fraction(float(target_hz) / float(source_hz)).limit_denominator(1000)
    return signal.resample_poly(x, ratio.numerator, ratio.denominator).astype(np.float32)


def fixed_length(
    values: NDArray[np.floating] | None, required_length: int
) -> NDArray[np.float32]:
    output = np.full(required_length, np.nan, dtype=np.float32)
    if values is None:
        return output
    x = np.asarray(values, dtype=np.float32).reshape(-1)
    output[: min(x.size, required_length)] = x[:required_length]
    return output


def coverage_score(parts: list[float]) -> float:
    if not parts:
        return 0.0
    return float(np.clip(np.mean(np.asarray(parts, dtype=np.float64)), 0.0, 1.0))


def short_interpolate_without_future(
    values: NDArray[np.floating], max_gap_samples: int = 5
) -> NDArray[np.float32]:
    """Interpolate only interior gaps in this already bounded window.

    Callers must cut source data at prediction_time before invoking this
    function. pandas' limit_area='inside' leaves trailing gaps untouched.
    """

    import pandas as pd

    return (
        pd.Series(np.asarray(values, dtype=np.float32))
        .interpolate(limit=max_gap_samples, limit_area="inside")
        .to_numpy(dtype=np.float32)
    )
