from __future__ import annotations

from fractions import Fraction

import numpy as np
import pytest
from scipy import signal

from backend.app.ml.contracts.window import InferenceWindow, SignalWindow
from backend.app.ml.preprocessing.uc04 import UC04_FEATURE_ORDER
from backend.app.ml.preprocessing.uc05 import UC05_FEATURE_ORDER
from backend.app.ml.preprocessing.vitaldb_loader import (
    VitalDBCaseSignals,
    LoadedTrackMetadata,
)
from backend.app.ml.preprocessing.vitaldb_pipeline import (
    FeatureState,
    ModelWindowBuilder,
    TrackNameResolver,
    TrainingPreprocessorAdapter,
    UnitValidator,
)
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT


def _uc04_window(*, include_art: bool = True) -> InferenceWindow:
    numeric = np.tile(
        np.array([75, 120, 65, 75, 98, 14, 35], dtype=np.float32),
        (300, 1),
    )
    numeric[120:122, 0] = np.nan
    waves = {
        "ecg": SignalWindow(np.linspace(-1, 1, 7500, dtype=np.float32), 250, 270, "SNUADC/ECG_II", "mV"),
        "ppg": SignalWindow(np.sin(np.linspace(0, 30, 3000, dtype=np.float32)), 100, 270, "SNUADC/PLETH"),
        "capno": SignalWindow(np.linspace(0, 45, 1875, dtype=np.float32), 62.5, 270, "Primus/CO2", "mmHg"),
    }
    if include_art:
        art = np.linspace(50, 120, 3000, dtype=np.float32)
        art[15] = 400.0
        waves["art"] = SignalWindow(art, 100, 270, "SNUADC/ART", "mmHg")
    return InferenceWindow(
        case_id="1",
        window_start_s=0,
        window_end_s=300,
        prediction_time_s=300,
        numeric_values=numeric,
        numeric_feature_order=UC04_FEATURE_ORDER,
        numeric_sample_rate_hz=1,
        numeric_start_time_s=0,
        static_features={"age": 77, "bmi": 26.3, "asa": 2, "emop": 0, "sex_male": 1},
        waveforms=waves,
        selected_tracks={
            "ART_WAVE": "SNUADC/ART",
            "ECG_WAVE": "SNUADC/ECG_II",
            "PPG_WAVE": "SNUADC/PLETH",
            "CAPNO_WAVE": "Primus/CO2",
            "MAP": "Solar8000/ART_MBP",
            "HR": "Solar8000/HR",
        },
        source_available_through_s=300,
    )


def _uc05_window() -> InferenceWindow:
    numeric = np.tile(
        np.array([98, 35, 14, 450, 6, 18, 5, 15, 10, 45, 50, 0, 45, 450, 18, 12, 75, 1], dtype=np.float32),
        (600, 1),
    )
    t = np.arange(30000, dtype=np.float32) / 500
    return InferenceWindow(
        case_id="1",
        window_start_s=0,
        window_end_s=600,
        prediction_time_s=600,
        numeric_values=numeric,
        numeric_feature_order=UC05_FEATURE_ORDER,
        numeric_sample_rate_hz=1,
        numeric_start_time_s=0,
        static_features={"age": 77, "bmi": 26.3, "asa": 2, "sex_male": 1, "weight": 67.5, "height": 160.2, "emop": 0},
        waveforms={
            "capno": SignalWindow(np.sin(np.arange(3750, dtype=np.float32) / 80), 62.5, 540, "Primus/CO2", "mmHg"),
            "awp": SignalWindow(np.cos(np.arange(3750, dtype=np.float32) / 80), 62.5, 540, "Primus/AWP", "hPa"),
            "ppg": SignalWindow(np.sin(2 * np.pi * 1.1 * t), 500, 540, "SNUADC/PLETH"),
        },
        selected_tracks={
            "SPO2": "Solar8000/PLETH_SPO2",
            "capno": "Primus/CO2",
            "awp": "Primus/AWP",
            "ppg": "SNUADC/PLETH",
        },
        source_available_through_s=600,
    )


def _training_waveform_reference(values: np.ndarray, plausible=None) -> np.ndarray:
    values = np.asarray(values, dtype=np.float32).copy()
    if plausible is not None:
        low, high = plausible
        values[(values < low) | (values > high)] = np.nan
    valid = np.isfinite(values)
    values[~valid] = np.interp(np.flatnonzero(~valid), np.flatnonzero(valid), values[valid])
    median = np.median(values)
    q25, q75 = np.percentile(values, [25, 75])
    scale = max((q75 - q25) / 1.349, np.std(values), 1e-3)
    return np.clip((values - median) / scale, -8, 8).astype(np.float32)


def test_track_name_resolver_uses_only_training_notebook_candidates() -> None:
    resolved = TrackNameResolver().resolve("UC04", {"SNUADC/ECG_V5", "Primus/CO2"})

    assert resolved["ECG_WAVE"] == "SNUADC/ECG_V5"
    assert resolved["CAPNO_WAVE"] == "Primus/CO2"
    assert resolved["ART_WAVE"] is None


def test_unit_validator_preserves_native_units_and_reports_unrecorded_units() -> None:
    validator = UnitValidator()
    observed = validator.validate_track("SNUADC/ART", "mmHg")
    unrecorded = validator.validate_track("SNUADC/PLETH", None)

    assert observed.state is FeatureState.OBSERVED
    assert observed.conversion_applied is False
    assert unrecorded.state is FeatureState.NOT_RECORDED
    assert unrecorded.observed_unit == "NOT_RECORDED"


def test_unit_validator_rejects_a_recorded_unit_conflict_without_conversion() -> None:
    check = UnitValidator({"SNUADC/ART": "mmHg"}).validate_track("SNUADC/ART", "kPa")

    assert check.state is FeatureState.INVALID
    assert check.conversion_applied is False


def test_unit_validator_rejects_window_rate_that_differs_from_training_contract() -> None:
    window = _uc04_window()
    art = window.waveforms["art"]
    window.waveforms["art"] = SignalWindow(
        art.values, 50, art.start_time_s, art.source_track, art.unit
    )

    validation = UnitValidator().validate_window(window)

    assert validation.valid is False
    assert "SNUADC/ART" in validation.invalid_tracks
    assert validation.tracks["SNUADC/ART"]["structural_state"] == FeatureState.INVALID.value


def test_unit_validator_checks_uc05_native_ppg_rate_before_polyphase_resampling() -> None:
    window = _uc05_window()
    ppg = window.waveforms["ppg"]
    window.waveforms["ppg"] = SignalWindow(
        ppg.values, 250, ppg.start_time_s, ppg.source_track, ppg.unit
    )

    validation = UnitValidator().validate_window(window)

    assert validation.valid is False
    assert "SNUADC/PLETH" in validation.invalid_tracks
    assert validation.tracks["SNUADC/PLETH"]["structural_state"] == FeatureState.INVALID.value


def test_unit_conflict_marks_associated_model_feature_invalid() -> None:
    result = TrainingPreprocessorAdapter(
        unit_validator=UnitValidator({"SNUADC/ART": "kPa"})
    ).prepare("UC04", _uc04_window())

    states = result.report["quality"]["feature_states"]
    assert result.report["input_eligible"] is False
    assert FeatureState.INVALID.value in states["unit:SNUADC/ART"]
    assert FeatureState.INVALID.value in states["waveform:art"]


def _metadata(track_name: str, track_type: str, rate: float | None, unit: str | None) -> LoadedTrackMetadata:
    return LoadedTrackMetadata(track_name, "VitalDB", track_type, rate, None, unit, 10, 100, [0.0, 100.0])


def test_unit_validator_checks_actual_vitaldb_track_kind_and_training_native_rate() -> None:
    window = _uc05_window()
    tracks = {
        "Solar8000/PLETH_SPO2": _metadata("Solar8000/PLETH_SPO2", "NUMERIC", None, None),
        "Primus/CO2": _metadata("Primus/CO2", "WAVEFORM", 62.5, "mmHg"),
        "Primus/AWP": _metadata("Primus/AWP", "WAVEFORM", 62.5, "hPa"),
        "SNUADC/PLETH": _metadata("SNUADC/PLETH", "WAVEFORM", 500, None),
    }
    series = VitalDBCaseSignals(
        case_id="1",
        model_id=UC05_CONTRACT.model_id,
        duration_seconds=1200,
        numeric_values=window.numeric_values,
        numeric_feature_order=window.numeric_feature_order,
        numeric_track_names={"SPO2": "Solar8000/PLETH_SPO2"},
        waveform_values={name: item.values for name, item in window.waveforms.items()},
        waveform_rates_hz={name: item.sample_rate_hz for name, item in window.waveforms.items()},
        waveform_track_names={name: item.source_track for name, item in window.waveforms.items()},
        static_features=dict(window.static_features),
        selected_tracks=dict(window.selected_tracks),
        track_metadata=tracks,
        pre_roll_seconds=0,
        history_seconds=600,
    )

    assert UnitValidator().validate_series("UC05", series).valid is True
    tracks["SNUADC/PLETH"] = _metadata("SNUADC/PLETH", "WAVEFORM", 250, None)
    invalid_series = VitalDBCaseSignals(**{**series.__dict__, "track_metadata": tracks})
    validation = UnitValidator().validate_series("UC05", invalid_series)
    assert validation.valid is False
    assert "SNUADC/PLETH" in validation.invalid_tracks


def test_adapter_checks_both_native_track_metadata_and_window_tensor_rate() -> None:
    window = _uc05_window()
    ppg = window.waveforms["ppg"]
    window.waveforms["ppg"] = SignalWindow(
        ppg.values, 250, ppg.start_time_s, ppg.source_track, ppg.unit
    )
    tracks = {
        "Solar8000/PLETH_SPO2": _metadata("Solar8000/PLETH_SPO2", "NUMERIC", None, None),
        "Primus/CO2": _metadata("Primus/CO2", "WAVEFORM", 62.5, "mmHg"),
        "Primus/AWP": _metadata("Primus/AWP", "WAVEFORM", 62.5, "hPa"),
        # Native file metadata is valid even though this specific constructed
        # window falsely labels its 500 Hz samples as 250 Hz.
        "SNUADC/PLETH": _metadata("SNUADC/PLETH", "WAVEFORM", 500, None),
    }
    series = VitalDBCaseSignals(
        case_id="1",
        model_id=UC05_CONTRACT.model_id,
        duration_seconds=1200,
        numeric_values=window.numeric_values,
        numeric_feature_order=window.numeric_feature_order,
        numeric_track_names={"SPO2": "Solar8000/PLETH_SPO2"},
        waveform_values={name: item.values for name, item in window.waveforms.items()},
        waveform_rates_hz={name: item.sample_rate_hz for name, item in window.waveforms.items()},
        waveform_track_names={name: item.source_track for name, item in window.waveforms.items()},
        static_features=dict(window.static_features),
        selected_tracks=dict(window.selected_tracks),
        track_metadata=tracks,
        pre_roll_seconds=0,
        history_seconds=600,
    )

    result = TrainingPreprocessorAdapter().prepare("UC05", window, case_signals=series)

    assert result.report["input_eligible"] is False
    assert FeatureState.INVALID.value in result.report["quality"]["feature_states"]["waveform:ppg"]


def test_uc04_training_adapter_matches_training_waveform_transform_and_shapes() -> None:
    window = _uc04_window()
    result = TrainingPreprocessorAdapter().prepare("UC04", window)

    np.testing.assert_allclose(
        result.model_tensors["art"],
        _training_waveform_reference(window.waveforms["art"].values, (-20, 300))[None, :],
        rtol=0,
        atol=1e-6,
    )
    assert result.report["tensor_shape"] == {
        "art": [1, 3000],
        "ecg": [1, 7500],
        "ppg": [1, 3000],
        "capno": [1, 1875],
        "numeric": [1, 300, 7],
        "numeric_mask": [1, 300, 7],
        "static": [1, 5],
        "modality_mask": [1, 4],
    }
    assert result.report["input_eligible"] is True
    assert result.report["inference_eligible"] is True
    assert FeatureState.ARTIFACT.value in result.report["quality"]["feature_states"]["waveform:art"]
    assert FeatureState.INTERPOLATED.value in result.report["quality"]["feature_states"]["waveform:art"]
    assert FeatureState.INTERPOLATED.value in result.report["quality"]["feature_states"]["numeric:MAP"]


def test_uc05_adapter_resamples_and_marks_complete_required_modalities_ready() -> None:
    window = _uc05_window()
    result = TrainingPreprocessorAdapter().prepare("UC05", window)

    ratio = Fraction(125 / 500).limit_denominator(1000)
    resampled = signal.resample_poly(
        window.waveforms["ppg"].values, ratio.numerator, ratio.denominator
    ).astype(np.float32)
    expected = _training_waveform_reference(resampled[:7500])[None, :]
    np.testing.assert_allclose(result.model_tensors["ppg"], expected, rtol=0, atol=1e-6)
    assert result.report["tensor_shape"] == {
        "capno": [1, 3750],
        "awp": [1, 3750],
        "ppg": [1, 7500],
        "flow": [1, 3750],
        "resp": [1, 3750],
        "numeric": [1, 600, 18],
        "numeric_mask": [1, 600, 18],
        "static": [1, 7],
        "wave_mask": [1, 5],
    }
    assert result.report["input_eligible"] is True
    assert result.report["inference_eligible"] is True
    assert result.report["abstain_reasons"] == []


def test_uc05_schema_quality_rejection_is_invalid_but_absent_wave_is_missing() -> None:
    invalid_window = _uc05_window()
    awp = invalid_window.waveforms["awp"].values.copy()
    awp[:1000] = 200.0
    invalid_window.waveforms["awp"] = SignalWindow(
        awp, 62.5, 540, "Primus/AWP", "hPa"
    )
    invalid_result = TrainingPreprocessorAdapter().prepare("UC05", invalid_window)
    invalid_states = invalid_result.report["quality"]["feature_states"]["waveform:awp"]
    assert invalid_result.report["input_eligible"] is False
    assert FeatureState.ARTIFACT.value in invalid_states
    assert FeatureState.INVALID.value in invalid_states

    missing_window = _uc05_window()
    del missing_window.waveforms["capno"]
    missing_result = TrainingPreprocessorAdapter().prepare("UC05", missing_window)
    missing_states = missing_result.report["quality"]["feature_states"]["waveform:capno"]
    assert missing_result.report["input_eligible"] is False
    assert FeatureState.MISSING.value in missing_states
    assert FeatureState.INVALID.value not in missing_states


def test_missing_required_uc04_arterial_signal_abstains_without_normal_fill() -> None:
    result = TrainingPreprocessorAdapter().prepare("UC04", _uc04_window(include_art=False))

    assert result.report["input_eligible"] is False
    assert result.report["inference_eligible"] is False
    assert "waveform:art" in result.report["missing_features"]
    assert FeatureState.MISSING.value in result.report["quality"]["feature_states"]["waveform:art"]
    assert "art" not in result.model_tensors


def test_quality_gate_rejection_is_reported_as_invalid_separately_from_artifact() -> None:
    window = _uc04_window()
    art = window.waveforms["art"].values.copy()
    art[:400] = 400.0
    window.waveforms["art"] = SignalWindow(art, 100, 270, "SNUADC/ART", "mmHg")

    result = TrainingPreprocessorAdapter().prepare("UC04", window)
    states = result.report["quality"]["feature_states"]["waveform:art"]

    assert result.report["input_eligible"] is False
    assert FeatureState.ARTIFACT.value in states
    assert FeatureState.INVALID.value in states
    assert "waveform:art" in result.report["missing_features"]


def test_model_window_builder_enforces_contract_stride_and_half_open_cutoff() -> None:
    duration = 1000.0
    numeric = np.tile(np.array([75, 120, 65, 75, 98, 14, 35], np.float32), (1001, 1))
    series = VitalDBCaseSignals(
        case_id="41",
        model_id=UC04_CONTRACT.model_id,
        duration_seconds=duration,
        numeric_values=numeric,
        numeric_feature_order=UC04_FEATURE_ORDER,
        numeric_track_names={name: None for name in UC04_FEATURE_ORDER},
        waveform_values={"art": np.arange(100000, dtype=np.float32)},
        waveform_rates_hz={"art": 100.0},
        waveform_track_names={"art": "SNUADC/ART"},
        static_features={"age": 60, "bmi": 24, "asa": 2, "emop": 0, "sex_male": 0},
        selected_tracks={"ART_WAVE": "SNUADC/ART", "MAP": "Solar8000/ART_MBP", "HR": "Solar8000/HR"},
        track_metadata={},
        pre_roll_seconds=5,
        history_seconds=300,
    )
    builder = ModelWindowBuilder()

    window = builder.build(series, 360)
    assert window.prediction_time_s == 360
    assert window.waveforms["art"].sample_end_time_s < window.prediction_time_s
    with pytest.raises(ValueError, match="stride"):
        builder.build(series, 361)


def test_model_window_builder_does_not_leak_later_samples_into_same_prediction_time() -> None:
    def build_series(future_value: float) -> VitalDBCaseSignals:
        numeric = np.tile(np.array([75, 120, 65, 75, 98, 14, 35], np.float32), (1001, 1))
        numeric[360:, :] = future_value
        art = np.arange(100000, dtype=np.float32)
        art[36000:] = future_value
        return VitalDBCaseSignals(
            case_id="41",
            model_id=UC04_CONTRACT.model_id,
            duration_seconds=1000,
            numeric_values=numeric,
            numeric_feature_order=UC04_FEATURE_ORDER,
            numeric_track_names={name: None for name in UC04_FEATURE_ORDER},
            waveform_values={"art": art},
            waveform_rates_hz={"art": 100.0},
            waveform_track_names={"art": "SNUADC/ART"},
            static_features={"age": 60, "bmi": 24, "asa": 2, "emop": 0, "sex_male": 0},
            selected_tracks={"ART_WAVE": "SNUADC/ART", "MAP": "Solar8000/ART_MBP", "HR": "Solar8000/HR"},
            track_metadata={},
            pre_roll_seconds=5,
            history_seconds=300,
        )

    builder = ModelWindowBuilder()
    first = builder.build(build_series(-1000), 360)
    second = builder.build(build_series(1000), 360)
    np.testing.assert_array_equal(first.numeric_values, second.numeric_values)
    np.testing.assert_array_equal(first.waveforms["art"].values, second.waveforms["art"].values)


def test_model_contract_windows_and_feature_orders_are_not_refit_or_reordered() -> None:
    adapter = TrainingPreprocessorAdapter()
    uc04 = adapter.prepare("UC04", _uc04_window())
    uc05 = adapter.prepare("UC05", _uc05_window())

    assert tuple(UC04_CONTRACT.feature_order["numeric"]) == UC04_FEATURE_ORDER
    assert tuple(UC05_CONTRACT.feature_order["numeric"]) == UC05_FEATURE_ORDER
    assert uc04.report["preprocessing_version"].startswith("notebook-compat/uc04-")
    assert uc05.report["preprocessing_version"].startswith("notebook-compat/uc05-")
    np.testing.assert_array_equal(uc05.model_tensors["numeric_mask"], np.ones((1, 600, 18), np.float32))


@pytest.mark.parametrize("valid_samples", (0, 479))
def test_uc05_adapter_abstains_when_required_spo2_history_is_unavailable(valid_samples):
    window = _uc05_window()
    window.numeric_values[valid_samples:, UC05_FEATURE_ORDER.index("SPO2")] = np.nan
    result = TrainingPreprocessorAdapter().prepare("UC05", window)
    assert result.report["input_eligible"] is False
    assert result.report["inference_eligible"] is False
    assert any("SpO2 history valid fraction" in reason for reason in result.report["abstain_reasons"])
