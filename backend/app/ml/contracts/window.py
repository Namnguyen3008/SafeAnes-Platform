from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping

import numpy as np
from numpy.typing import NDArray


FloatArray = NDArray[np.floating]


@dataclass(frozen=True)
class SignalWindow:
    """A bounded, elapsed-time signal slice from one source track."""

    values: FloatArray
    sample_rate_hz: float
    start_time_s: float
    source_track: str | None = None
    unit: str | None = None

    @property
    def sample_end_time_s(self) -> float:
        if self.values.size == 0:
            return self.start_time_s
        return self.start_time_s + (self.values.size - 1) / self.sample_rate_hz


@dataclass(frozen=True)
class InferenceWindow:
    """Raw model window with elapsed case times and source-track provenance.

    Numeric values are time-major [samples, features]. Waveform values are kept
    separate so each UC can apply its own notebook-compatible preprocessing.
    """

    case_id: str
    window_start_s: float
    window_end_s: float
    prediction_time_s: float
    numeric_values: FloatArray
    numeric_feature_order: tuple[str, ...]
    numeric_sample_rate_hz: float
    numeric_start_time_s: float
    static_features: Mapping[str, float | None]
    waveforms: Mapping[str, SignalWindow] = field(default_factory=dict)
    selected_tracks: Mapping[str, str | None] = field(default_factory=dict)
    source_available_through_s: float | None = None

    @property
    def numeric_end_time_s(self) -> float:
        if self.numeric_values.shape[0] == 0:
            return self.numeric_start_time_s
        return self.numeric_start_time_s + (
            self.numeric_values.shape[0] - 1
        ) / self.numeric_sample_rate_hz
