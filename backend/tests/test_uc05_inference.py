import math
import os
from pathlib import Path

import numpy as np
import pytest

from backend.app.ml.contracts.window import InferenceWindow, SignalWindow
from backend.app.ml.inference.base import ModelNotLoadedError
from backend.app.ml.inference.uc05 import UC05InferenceService
from backend.app.ml.models.uc05.architecture import NUM_FEATURES
from backend.app.ml.preprocessing.uc05 import QualityGateError
from backend.app.ml.registry.artifacts import default_model_root
from backend.app.ml.registry.contracts import UC05_CONTRACT
from backend.app.ml.validation.input_validation import InputValidationError


MODEL_ROOT = Path(os.environ.get("SAFEANES_MODEL_ROOT", default_model_root()))


@pytest.fixture
def loaded_uc05_service():
    override = os.environ.get("UC05_MODEL_PATH")
    checkpoint = Path(override) if override else MODEL_ROOT / UC05_CONTRACT.artifact_path
    required = [checkpoint, *(checkpoint.parent / name for name in UC05_CONTRACT.supporting_artifacts)]
    missing = [path.name for path in required if not path.is_file()]
    if missing:
        pytest.skip("audited UC05 artifacts absent; configure SAFEANES_MODEL_ROOT or UC05_MODEL_PATH: " + ", ".join(missing))
    service = UC05InferenceService(
        model_root=MODEL_ROOT,
        model_path=override,
        model_registry_path=os.environ.get("MODEL_REGISTRY_PATH"),
        device="cpu",
    )
    # Digest, deserialization, schema, and load failures are errors, never skips.
    service.load_model()
    return service


def make_uc05_window() -> InferenceWindow:
    numeric = np.tile(
        np.array(
            [98, 35, 14, 450, 6, 18, 5, 15, 10, 45, 50, 0, 45, 450, 18, 12, 75, 1],
            dtype=np.float32,
        ),
        (600, 1),
    )
    return InferenceWindow(
        case_id="1",
        window_start_s=0,
        window_end_s=600,
        prediction_time_s=600,
        numeric_values=numeric,
        numeric_feature_order=NUM_FEATURES,
        numeric_sample_rate_hz=1,
        numeric_start_time_s=0,
        static_features={
            "age": 77,
            "bmi": 24,
            "asa": 2,
            "sex_male": 0,
            "weight": 65,
            "height": 165,
            "emop": 0,
        },
        waveforms={
            "capno": SignalWindow(np.ones(3750, np.float32), 62.5, 540, "Primus/CO2"),
            "awp": SignalWindow(np.ones(3750, np.float32), 62.5, 540, "Primus/AWP"),
            "ppg": SignalWindow(np.ones(30000, np.float32), 500, 540, "SNUADC/PLETH"),
        },
        selected_tracks={
            "SPO2": "Solar8000/PLETH_SPO2",
            "ppg": "SNUADC/PLETH",
            "capno": "Primus/CO2",
            "awp": "Primus/AWP",
        },
        source_available_through_s=600,
    )


def test_uc05_requires_explicit_model_load() -> None:
    service = UC05InferenceService(model_root=MODEL_ROOT, device="cpu")

    with pytest.raises(ModelNotLoadedError):
        service.predict_window(make_uc05_window())


def test_uc05_applies_saved_temperature_only_to_hypoxemia_logits(loaded_uc05_service) -> None:
    service = loaded_uc05_service

    predictions = service.predict_window(make_uc05_window())

    hypoxemia = predictions[:3]
    assert [item.horizon_if_supported for item in hypoxemia] == [1, 3, 5]
    assert all(item.confidence is None for item in predictions)
    assert all(
        item.interpreted_output["kind"] == "temperature_scaled_probability"
        for item in hypoxemia
    )
    temperature_1m = 0.2664688229560852
    raw = hypoxemia[0].raw_output
    expected = 1 / (1 + math.exp(-raw / temperature_1m))
    assert hypoxemia[0].interpreted_output["value"] == pytest.approx(expected)
    assert hypoxemia[2].interpreted_output["threshold"] == pytest.approx(
        0.1182835621637828
    )

    auxiliary = predictions[3]
    assert auxiliary.horizon_if_supported is None
    assert auxiliary.interpreted_output["kind"] == "raw_logit"
    assert auxiliary.interpreted_output["calibrated"] is False
    assert "not a diagnosis" in auxiliary.task


def test_uc05_all_three_core_waveforms_allow_normal_inference(loaded_uc05_service) -> None:
    service = loaded_uc05_service

    assert service.readiness_status == "INTEGRATION_READY"
    assert {"Primus/CO2", "Primus/AWP", "SNUADC/PLETH"}.issubset(
        set(service.contract.required_tracks)
    )
    predictions = service.predict_window(make_uc05_window())
    assert [item.horizon_if_supported for item in predictions] == [1, 3, 5, None]
    assert all(
        item.interpreted_output["input_contract_mode"] == "STRICT_SIGNAL_SCHEMA"
        for item in predictions
    )


@pytest.mark.parametrize("missing_waveform", ("capno", "awp", "ppg"))
def test_uc05_requires_all_three_core_waveforms(
    missing_waveform: str, loaded_uc05_service,
) -> None:
    service = loaded_uc05_service
    window = make_uc05_window()
    window.waveforms.pop(missing_waveform)

    with pytest.raises(QualityGateError):
        service.preprocess_window(window)


@pytest.mark.parametrize(
    ("role", "wrong_track"),
    (("capno", "Other/CO2"), ("awp", "Other/AWP"), ("ppg", "Other/PLETH")),
)
def test_uc05_requires_audited_sources_for_all_core_waveforms(
    role: str, wrong_track: str
) -> None:
    service = UC05InferenceService(model_root=MODEL_ROOT, device="cpu")
    window = make_uc05_window()
    window.selected_tracks[role] = wrong_track

    with pytest.raises(InputValidationError, match="audited track"):
        service.validate_inputs(window)


def test_uc05_production_inference_reuses_preprocessed_complete_modalities(monkeypatch, loaded_uc05_service) -> None:
    service = loaded_uc05_service
    window = make_uc05_window()
    prepared = service.preprocess_window(window)

    def fail_if_preprocessed_twice(_window):
        pytest.fail("UC05 training transforms should be reused for the forward pass")

    monkeypatch.setattr(service, "preprocess_window", fail_if_preprocessed_twice)
    predictions = service.predict_window(window, prepared_input=prepared)

    assert [item.horizon_if_supported for item in predictions] == [1, 3, 5, None]
    assert all(
        item.interpreted_output.get("input_contract_mode") == "STRICT_SIGNAL_SCHEMA"
        for item in predictions
    )
    assert all(item.prediction_time == 600 for item in predictions)


def test_uc05_abstains_when_airway_pressure_is_missing(loaded_uc05_service) -> None:
    service = loaded_uc05_service
    window = make_uc05_window()
    window.waveforms.pop("awp")

    with pytest.raises(QualityGateError, match="signal_schema.json requires valid capno, AWP, and PPG"):
        service.predict_window(window)


@pytest.mark.parametrize("valid_samples", (0, 479))
def test_uc05_abstains_for_missing_or_insufficient_spo2_history(valid_samples):
    window = make_uc05_window()
    window.numeric_values[valid_samples:, NUM_FEATURES.index("SPO2")] = np.nan
    service = UC05InferenceService(model_root=MODEL_ROOT, device="cpu")
    with pytest.raises(QualityGateError, match="SpO2 history valid fraction"):
        service.preprocess_window(window)


def test_uc05_rejects_unaudited_spo2_source():
    window = make_uc05_window()
    window.selected_tracks["SPO2"] = "Other/SPO2"
    with pytest.raises(InputValidationError, match="audited track"):
        UC05InferenceService(model_root=MODEL_ROOT, device="cpu").validate_inputs(window)


def test_uc05_accepts_verified_spo2_history_gate_boundary():
    window = make_uc05_window()
    window.numeric_values[480:, NUM_FEATURES.index("SPO2")] = np.nan
    prepared = UC05InferenceService(model_root=MODEL_ROOT, device="cpu").preprocess_window(window)
    assert prepared.quality_status == "DEGRADED"
    assert "numeric:SPO2:partial" in prepared.missing_features


def test_uc05_rejects_mismatched_waveform_provenance():
    window = make_uc05_window()
    original = window.waveforms["capno"]
    window.waveforms["capno"] = SignalWindow(original.values, original.sample_rate_hz, original.start_time_s, "Other/CO2")
    with pytest.raises(InputValidationError, match="provenance"):
        UC05InferenceService(model_root=MODEL_ROOT, device="cpu").validate_inputs(window)
