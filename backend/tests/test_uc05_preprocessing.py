import numpy as np

from backend.app.ml.contracts.window import InferenceWindow, SignalWindow
from backend.app.ml.preprocessing.uc05 import UC05_FEATURE_ORDER, preprocess_uc05_window


def make_uc05_window() -> InferenceWindow:
    numeric = np.tile(
        np.array(
            [98, 35, 14, 450, 6, 18, 5, 15, 10, 45, 50, 0, 45, 450, 18, 12, 75, 1],
            dtype=np.float32,
        ),
        (600, 1),
    )
    waves = {
        "capno": SignalWindow(np.ones(3750, np.float32), 62.5, 540.0, "Primus/CO2"),
        "awp": SignalWindow(np.ones(3750, np.float32), 62.5, 540.0, "Primus/AWP"),
        "ppg": SignalWindow(np.ones(30000, np.float32), 500.0, 540.0, "SNUADC/PLETH"),
    }
    return InferenceWindow(
        case_id="case-1",
        window_start_s=0.0,
        window_end_s=600.0,
        prediction_time_s=600.0,
        numeric_values=numeric,
        numeric_feature_order=UC05_FEATURE_ORDER,
        numeric_sample_rate_hz=1.0,
        numeric_start_time_s=0.0,
        static_features={
            "age": 60,
            "bmi": 24,
            "asa": 2,
            "sex_male": 0,
            "weight": 65,
            "height": 165,
            "emop": 0,
        },
        waveforms=waves,
    )


def test_uc05_resamples_only_to_contract_rates_and_masks_absent_modalities() -> None:
    prepared = preprocess_uc05_window(make_uc05_window())

    assert prepared.numeric.shape == (1, 600, 18)
    assert [prepared.waves[name].shape for name in ("capno", "awp", "ppg", "flow", "resp")] == [
        (1, 3750),
        (1, 3750),
        (1, 7500),
        (1, 3750),
        (1, 3750),
    ]
    assert prepared.wave_mask.tolist() == [[1.0, 1.0, 1.0, 0.0, 0.0]]
    assert np.all(prepared.waves["flow"] == 0)
    assert np.all(prepared.waves["resp"] == 0)


def test_uc05_keeps_missing_numeric_cells_masked() -> None:
    window = make_uc05_window()
    numeric = window.numeric_values.copy()
    numeric[12, 0] = np.nan
    window = InferenceWindow(
        **{**window.__dict__, "numeric_values": numeric}
    )

    prepared = preprocess_uc05_window(window)

    assert prepared.numeric_mask[0, 12, 0] == 0
    assert np.isnan(prepared.numeric[0, 12, 0])
