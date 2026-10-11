import numpy as np
import pytest

from backend.app.ml.contracts.window import InferenceWindow, SignalWindow
from backend.app.ml.validation.input_validation import (
    FeatureOrderError,
    FutureInformationError,
    validate_feature_order,
    validate_future_information,
)


def make_window(wave_end_time: float = 9.9) -> InferenceWindow:
    return InferenceWindow(
        case_id="case-1",
        window_start_s=0.0,
        window_end_s=10.0,
        prediction_time_s=10.0,
        numeric_values=np.zeros((10, 1), dtype=np.float32),
        numeric_feature_order=("MAP",),
        numeric_sample_rate_hz=1.0,
        numeric_start_time_s=0.0,
        static_features={},
        waveforms={
            "art": SignalWindow(
                values=np.zeros(10, dtype=np.float32),
                sample_rate_hz=1.0,
                start_time_s=wave_end_time - 9.0,
                source_track="SNUADC/ART",
            )
        },
        selected_tracks={"MAP": "Solar8000/ART_MBP"},
    )


def test_future_waveform_samples_are_rejected_before_preprocessing() -> None:
    window = make_window(wave_end_time=10.1)

    with pytest.raises(FutureInformationError):
        validate_future_information(window)


def test_samples_at_or_before_prediction_time_are_allowed() -> None:
    window = make_window(wave_end_time=9.9)

    validate_future_information(window)


def test_feature_order_mismatch_is_not_silently_reordered() -> None:
    with pytest.raises(FeatureOrderError):
        validate_feature_order(("HR", "MAP"), ("MAP", "HR"), "numeric")
