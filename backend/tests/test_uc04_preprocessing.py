import numpy as np
import pytest

from backend.app.ml.contracts.window import InferenceWindow, SignalWindow
from backend.app.ml.preprocessing.uc04 import UC04_FEATURE_ORDER, preprocess_uc04_window


def make_uc04_window() -> InferenceWindow:
    numeric = np.tile(
        np.array([75.0, 120.0, 65.0, 75.0, 98.0, 14.0, 35.0], dtype=np.float32),
        (300, 1),
    )
    numeric[120:123, 0] = np.nan
    numeric[-1, 0] = np.nan
    waves = {
        "art": SignalWindow(np.ones(3000, np.float32), 100.0, 270.0, "SNUADC/ART"),
        "ecg": SignalWindow(np.ones(7500, np.float32), 250.0, 270.0, "SNUADC/ECG_II"),
        "ppg": SignalWindow(np.ones(3000, np.float32), 100.0, 270.0, "SNUADC/PLETH"),
        "capno": SignalWindow(np.ones(1875, np.float32), 62.5, 270.0, "Primus/CO2"),
    }
    return InferenceWindow(
        case_id="case-1",
        window_start_s=0.0,
        window_end_s=300.0,
        prediction_time_s=300.0,
        numeric_values=numeric,
        numeric_feature_order=UC04_FEATURE_ORDER,
        numeric_sample_rate_hz=1.0,
        numeric_start_time_s=0.0,
        static_features={"age": 60, "bmi": 24, "asa": 2, "emop": 0, "sex_male": 0},
        waveforms=waves,
    )


def test_uc04_uses_fixed_training_centers_and_window_shapes() -> None:
    prepared = preprocess_uc04_window(make_uc04_window())

    assert prepared.numeric.shape == (1, 300, 7)
    assert prepared.art.shape == (1, 3000)
    assert prepared.ecg.shape == (1, 7500)
    assert prepared.ppg.shape == (1, 3000)
    assert prepared.capno.shape == (1, 1875)
    assert prepared.modality_mask.tolist() == [[1.0, 1.0, 1.0, 1.0]]
    assert prepared.numeric[0, 20, 0] == pytest.approx(75.0)


def test_uc04_interpolation_never_fills_a_trailing_gap_from_future_data() -> None:
    prepared = preprocess_uc04_window(make_uc04_window())

    assert prepared.numeric[0, 121, 0] == pytest.approx(75.0)
    assert np.isnan(prepared.numeric[0, -1, 0])
    assert prepared.numeric_mask[0, -1, 0] == 0
