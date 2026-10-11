from dataclasses import dataclass

from backend.app.vitaldb.eligibility import (
    classify_case_eligibility,
    discover_candidates,
    select_case_ids,
)


class _CandidateApi:
    def __init__(self, result):
        self.result = result
        self.requested_tracks = None

    def find_cases(self, track_names):
        self.requested_tracks = list(track_names)
        return self.result


def test_candidate_search_deduplicates_and_sorts_index_matches_without_claiming_eligibility():
    api = _CandidateApi([19, 4, 19, 8])

    candidates = discover_candidates(api, "UC04")

    assert candidates == [4, 8, 19]
    assert api.requested_tracks == [
        "SNUADC/ART",
        "Solar8000/ART_MBP",
        "Solar8000/HR",
    ]


def test_dual_eligibility_requires_an_accepted_window_for_each_model():
    category = classify_case_eligibility(
        uc04_valid_windows=[930.0], uc05_valid_windows=[]
    )

    assert category == ("UC04_ELIGIBLE",)

    category = classify_case_eligibility(
        uc04_valid_windows=[930.0], uc05_valid_windows=[960.0]
    )
    assert category == (
        "UC04_ELIGIBLE",
        "UC05_ELIGIBLE",
        "DUAL_UC04_UC05_ELIGIBLE",
    )


def test_case_selection_is_deterministic_and_only_uses_verified_eligibility():
    reports = [
        {"case_id": 12, "uc04_valid_windows": [900], "uc05_valid_windows": []},
        {"case_id": 7, "uc04_valid_windows": [900], "uc05_valid_windows": [900]},
        {"case_id": 2, "uc04_valid_windows": [], "uc05_valid_windows": [900]},
        {"case_id": 5, "uc04_valid_windows": [900], "uc05_valid_windows": []},
    ]

    selected = select_case_ids(
        reports, uc04_target=2, uc05_target=2, dual_target=1
    )

    assert selected == [7, 2, 5]
    assert selected == select_case_ids(
        reports, uc04_target=2, uc05_target=2, dual_target=1
    )


def test_missing_catalog_attributes_are_explicit_not_recorded():
    from backend.app.vitaldb.eligibility import catalog_attribute

    assert catalog_attribute(None) == "NOT_RECORDED"
    assert catalog_attribute(0) == 0
import numpy as np

from backend.app.ml.contracts.window import InferenceWindow, SignalWindow
from backend.app.ml.models.uc05.architecture import NUM_FEATURES as UC05_FEATURES
from backend.app.vitaldb.eligibility import validate_model_window


def test_uc05_window_must_pass_preprocessor_and_all_schema_required_waveforms():
    window = _valid_uc05_window()

    result = validate_model_window("UC05", window)

    assert result.accepted is True
    assert result.data_coverage is not None


def test_uc05_schema_required_awp_gap_blocks_window_even_when_stream_gate_passes():
    window = _valid_uc05_window()
    waveforms = dict(window.waveforms)
    waveforms["awp"] = SignalWindow(
        np.full(3750, np.nan, dtype=np.float32), 62.5, 540, "Primus/AWP", "hPa"
    )
    invalid_window = InferenceWindow(
        **{**window.__dict__, "waveforms": waveforms}
    )

    result = validate_model_window("UC05", invalid_window)

    assert result.accepted is False
    assert "schema.json requires valid capno, AWP, and PPG" in result.reason


def _valid_uc05_window():
    x = np.arange(3750, dtype=np.float32)
    waveforms = {
        "capno": SignalWindow(20 + 5 * np.sin(x / 30), 62.5, 540, "Primus/CO2", "mmHg"),
        "awp": SignalWindow(10 + 2 * np.sin(x / 24), 62.5, 540, "Primus/AWP", "hPa"),
        "ppg": SignalWindow(0.4 + 0.1 * np.sin(np.arange(30000) / 60), 500, 540, "SNUADC/PLETH"),
    }
    numeric = np.ones((600, len(UC05_FEATURES)), dtype=np.float32)
    numeric[:, UC05_FEATURES.index("SPO2")] = 98
    return InferenceWindow(
        case_id="41",
        window_start_s=0,
        window_end_s=600,
        prediction_time_s=600,
        numeric_values=numeric,
        numeric_feature_order=UC05_FEATURES,
        numeric_sample_rate_hz=1,
        numeric_start_time_s=0,
        static_features={name: None for name in ("age", "bmi", "asa", "sex_male", "weight", "height", "emop")},
        waveforms=waveforms,
        selected_tracks={
            "SPO2": "Solar8000/PLETH_SPO2",
            "capno": "Primus/CO2",
            "awp": "Primus/AWP",
            "ppg": "SNUADC/PLETH",
        },
        source_available_through_s=600,
    )
def test_selection_prefers_quality_and_observed_trajectory_diversity_not_case_id():
    reports = [
        {"case_id": 10, "uc04_valid_windows": [1], "uc05_valid_windows": [1], "selection_coverage": 0.90, "trajectory_signature": "stable"},
        {"case_id": 20, "uc04_valid_windows": [1], "uc05_valid_windows": [1], "selection_coverage": 0.80, "trajectory_signature": "variable"},
        {"case_id": 30, "uc04_valid_windows": [1], "uc05_valid_windows": [1], "selection_coverage": 0.98, "trajectory_signature": "stable"},
    ]

    selected = select_case_ids(
        reports, uc04_target=2, uc05_target=2, dual_target=2
    )

    assert selected == [30, 20]
