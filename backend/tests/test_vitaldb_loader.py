import numpy as np
import pytest

from backend.app.ml.preprocessing.vitaldb_loader import _window_slice
from backend.app.ml.validation.input_validation import (
    FutureInformationError,
    validate_future_information,
)
from backend.app.ml.contracts.window import InferenceWindow


def test_vitaldb_waveform_slice_uses_half_open_prediction_time() -> None:
    source = np.arange(20, dtype=np.float32)
    signal = _window_slice(
        source,
        rate_hz=2,
        prediction_time_s=8,
        duration_seconds=4,
        source_track="test/track",
    )

    assert signal is not None
    assert signal.start_time_s == 4
    assert signal.values.tolist() == [8, 9, 10, 11, 12, 13, 14, 15]
    assert signal.sample_end_time_s == 7.5


def test_future_dated_waveform_is_rejected() -> None:
    from backend.app.ml.contracts.window import SignalWindow

    window = InferenceWindow(
        case_id="case",
        window_start_s=0,
        window_end_s=10,
        prediction_time_s=10,
        numeric_values=np.zeros((1, 1), dtype=np.float32),
        numeric_feature_order=("x",),
        numeric_sample_rate_hz=1,
        numeric_start_time_s=9,
        static_features={},
        waveforms={"x": SignalWindow(np.arange(4), 1, 9, "x")},
        source_available_through_s=10,
    )
    with pytest.raises(FutureInformationError):
        validate_future_information(window)
import numpy as np

from backend.app.ml.preprocessing.vitaldb_loader import VitalDBWindowLoader


def test_case_series_reuses_aligned_source_and_cuts_half_open_windows(monkeypatch):
    from backend.app.ml.preprocessing import vitaldb_loader

    monkeypatch.setattr(
        vitaldb_loader,
        "_case_metadata",
        lambda case_id, vitaldb_module=None, **kwargs: (_metadata_row(), _available_tracks()),
    )
    fake = _FakeVitalDB()
    loader = VitalDBWindowLoader(vitaldb_module=fake)

    case = loader.load_case_signals("UC04", 41)
    window = case.window_at(360)

    assert fake.vital_file_calls == 1
    assert window.numeric_values.shape == (305, 7)
    assert window.numeric_start_time_s == 55
    assert window.window_start_s == 60
    assert window.window_end_s == 360
    assert window.waveforms["art"].values[0] == 33000
    assert window.waveforms["art"].sample_end_time_s == 359.99
    assert window.source_available_through_s == 360


def _metadata_row():
    import pandas as pd
    return pd.Series({"caseend": 1000, "age": 67, "bmi": 24, "asa": 3, "sex": "F", "emop": 1})


def _available_tracks():
    return {"SNUADC/ART", "Solar8000/ART_MBP", "Solar8000/HR"}


class _FakeVitalFile:
    def __init__(self, case_id, track_names=None):
        assert case_id == 41
        self.dtstart = 1000.0
        self.dtend = 2000.0
        self.trks = {}
        self._track_names = list(track_names or [])

    def get_track_names(self):
        return self._track_names

    def to_numpy(self, track_names, interval=1.0):
        count = int(round(1000 / interval))
        result = np.zeros((count, len(track_names)), dtype=np.float32)
        for index, name in enumerate(track_names):
            result[:, index] = np.arange(count, dtype=np.float32) + index * 10000
        return result


class _FakeVitalDB:
    def __init__(self):
        self.vital_file_calls = 0
        self.VitalFile = self._vital_file

    def _vital_file(self, *args, **kwargs):
        self.vital_file_calls += 1
        return _FakeVitalFile(*args, **kwargs)
def test_metadata_loader_handles_current_vitaldb_get_track_names_schema():
    import pandas as pd

    from backend.app.ml.preprocessing.vitaldb_loader import _case_metadata

    class CurrentVitalDBApi:
        @staticmethod
        def load_clinical_data(case_ids):
            return pd.DataFrame([{"caseid": 41, "caseend": 800, "age": 67}])

        @staticmethod
        def get_track_names(case_ids):
            return pd.DataFrame([{"caseid": 41, "tnames": ["SNUADC/ART", "Solar8000/ART_MBP"]}])

    case, tracks = _case_metadata(41, CurrentVitalDBApi)

    assert case["caseid"] == 41
    assert tracks == {"SNUADC/ART", "Solar8000/ART_MBP"}
def test_track_inventory_distinguishes_native_rate_from_observed_numeric_update_rate():
    from types import SimpleNamespace

    from backend.app.ml.preprocessing.vitaldb_loader import VitalDBWindowLoader

    vital_file = SimpleNamespace(
        dtstart=1000.0,
        trks={
            "Solar8000/HR": SimpleNamespace(
                type=2,
                srate=0.0,
                unit="/min",
                dname="Solar8000",
                recs=[{"dt": 1001.0, "val": 70.0}, {"dt": 1003.0, "val": 71.0}],
            )
        },
    )

    info = VitalDBWindowLoader._track_info(
        vital_file, "Solar8000/HR", origin_timestamp=1000.0
    )

    assert info.native_sample_rate_hz is None
    assert info.observed_update_rate_hz == 0.5
    assert info.valid_time_range_seconds == [1.0, 3.0]
    assert info.source_device == "Solar8000"
    assert info.unit == "/min"
def test_case_series_can_be_loaded_from_the_local_immutable_raw_path(tmp_path, monkeypatch):
    from backend.app.ml.preprocessing import vitaldb_loader

    monkeypatch.setattr(
        vitaldb_loader,
        "_case_metadata",
        lambda case_id, vitaldb_module=None, **kwargs: (_metadata_row(), _available_tracks()),
    )
    source_file = tmp_path / "41.vital"
    source_file.write_bytes(b"raw")

    class PathApi:
        received_path = None

        @staticmethod
        def VitalFile(source, track_names=None):
            PathApi.received_path = source
            return _FakeVitalFile(41, track_names=track_names)

    case = VitalDBWindowLoader(vitaldb_module=PathApi).load_case_signals(
        "UC04", 41, source_path=source_file
    )

    assert PathApi.received_path == str(source_file.resolve())
    assert case.case_id == "41"
def test_case_loader_uses_vitalfile_track_names_without_deprecated_track_index(tmp_path):
    import pandas as pd

    class CurrentApi:
        @staticmethod
        def load_clinical_data(case_ids):
            return pd.DataFrame([{"caseid": 41, "caseend": 1000, "age": 67, "sex": "F"}])

        @staticmethod
        def get_track_names(case_ids):
            raise AssertionError("deprecated per-track index must not be used for case inspection")

        @staticmethod
        def VitalFile(source, track_names=None):
            return _FakeVitalFile(41, track_names=[
                "SNUADC/ART", "Solar8000/ART_MBP", "Solar8000/HR"
            ])

    case = VitalDBWindowLoader(vitaldb_module=CurrentApi).load_case_signals("UC04", 41)

    assert case.selected_tracks["ART_WAVE"] == "SNUADC/ART"
def test_header_only_track_metadata_marks_unavailable_record_counts_not_zero():
    from types import SimpleNamespace

    from backend.app.ml.preprocessing.vitaldb_loader import VitalDBWindowLoader

    vital_file = SimpleNamespace(
        dtstart=0.0,
        trks={
            "SNUADC/ART": SimpleNamespace(
                type=1, srate=500.0, unit="mmHg", dname="SNUADC", recs=[]
            )
        },
    )

    info = VitalDBWindowLoader._track_info(vital_file, "SNUADC/ART")

    assert info.record_count is None
    assert info.native_sample_count is None
    assert info.valid_time_range_seconds is None
