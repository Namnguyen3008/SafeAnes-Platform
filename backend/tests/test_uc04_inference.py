import os
from pathlib import Path

import numpy as np
import pytest

from backend.app.ml.contracts.window import InferenceWindow, SignalWindow
from backend.app.ml.inference.base import ModelNotLoadedError
from backend.app.ml.inference.uc04 import UC04InferenceService
from backend.app.ml.models.uc04.architecture import NUM_KEYS
from backend.app.ml.registry.artifacts import default_model_root


MODEL_ROOT = Path(os.environ.get("SAFEANES_MODEL_ROOT", default_model_root()))


def make_uc04_window() -> InferenceWindow:
    numeric = np.tile(
        np.array([75, 120, 65, 75, 98, 14, 35], dtype=np.float32),
        (300, 1),
    )
    return InferenceWindow(
        case_id="1",
        window_start_s=0,
        window_end_s=300,
        prediction_time_s=300,
        numeric_values=numeric,
        numeric_feature_order=NUM_KEYS,
        numeric_sample_rate_hz=1,
        numeric_start_time_s=0,
        static_features={"age": 77, "bmi": 24, "asa": 2, "emop": 0, "sex_male": 0},
        waveforms={
            "art": SignalWindow(np.ones(3000, np.float32), 100, 270, "SNUADC/ART"),
            "ecg": SignalWindow(np.ones(7500, np.float32), 250, 270, "SNUADC/ECG_II"),
            "ppg": SignalWindow(np.ones(3000, np.float32), 100, 270, "SNUADC/PLETH"),
            "capno": SignalWindow(np.ones(1875, np.float32), 62.5, 270, "Primus/CO2"),
        },
        selected_tracks={
            "ART_WAVE": "SNUADC/ART",
            "MAP": "Solar8000/ART_MBP",
            "HR": "Solar8000/HR",
            "ECG_WAVE": "SNUADC/ECG_II",
            "PPG_WAVE": "SNUADC/PLETH",
            "CAPNO_WAVE": "Primus/CO2",
        },
        source_available_through_s=300,
    )


def test_uc04_requires_explicit_model_load() -> None:
    service = UC04InferenceService(model_root=MODEL_ROOT, device="cpu")

    with pytest.raises(ModelNotLoadedError):
        service.predict_window(make_uc04_window())


def test_uc04_returns_ordered_uncalibrated_scores_with_null_confidence() -> None:
    service = UC04InferenceService(model_root=MODEL_ROOT, device="cpu")
    service.load_model()

    predictions = service.predict_window(make_uc04_window())

    assert [item.horizon_if_supported for item in predictions] == [5, 10, 15]
    assert all(item.model_id == "SafeAnes-UC04-HypoFormer" for item in predictions)
    assert all(item.confidence is None for item in predictions)
    assert all(
        item.interpreted_output["kind"] == "uncalibrated_sigmoid_score"
        for item in predictions
    )
    assert all(0 <= item.interpreted_output["value"] <= 1 for item in predictions)
    assert predictions[0].interpreted_output["threshold"] == 0.5
    assert predictions[1].interpreted_output["threshold"] is None
    assert all(item.prediction_time == 300 for item in predictions)


def test_uc04_accepts_the_already_validated_preprocessing_result(monkeypatch) -> None:
    service = UC04InferenceService(model_root=MODEL_ROOT, device="cpu")
    service.load_model()
    window = make_uc04_window()
    prepared = service.preprocess_window(window)

    def fail_if_preprocessed_twice(_window):
        pytest.fail("UC04 training transforms should be reused for the forward pass")

    monkeypatch.setattr(service, "preprocess_window", fail_if_preprocessed_twice)
    predictions = service.predict_window(window, prepared_input=prepared)

    assert [item.horizon_if_supported for item in predictions] == [5, 10, 15]
