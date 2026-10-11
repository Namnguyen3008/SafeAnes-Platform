from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import pandas as pd

from backend.app.ml.contracts.window import InferenceWindow, SignalWindow
from backend.app.ml.models.uc04.architecture import NUM_KEYS as UC04_NUM_KEYS
from backend.app.ml.models.uc05.architecture import NUM_FEATURES as UC05_NUM_FEATURES
from backend.app.ml.registry.contracts import UC04_CONTRACT, UC05_CONTRACT


CASES_URL = "https://api.vitaldb.net/cases"
TRACKS_URL = "https://api.vitaldb.net/trks"

UC04_TRACK_CANDIDATES = {
    "ART_WAVE": ("SNUADC/ART",),
    "ECG_WAVE": ("SNUADC/ECG_II", "SNUADC/ECG_V5"),
    "PPG_WAVE": ("SNUADC/PLETH",),
    "CAPNO_WAVE": ("Primus/CO2",),
    "MAP": ("Solar8000/ART_MBP",),
    "SBP": ("Solar8000/ART_SBP",),
    "DBP": ("Solar8000/ART_DBP",),
    "HR": ("Solar8000/HR",),
    "SPO2": ("Solar8000/PLETH_SPO2",),
    "RR": ("Solar8000/RR_CO2", "Solar8000/RR", "Primus/RR_CO2"),
    "ETCO2": ("Solar8000/ETCO2", "Primus/ETCO2"),
}

UC05_TRACK_CANDIDATES = {
    "capno": ("Primus/CO2",),
    "awp": ("Primus/AWP",),
    "ppg": ("SNUADC/PLETH",),
    "SPO2": ("Solar8000/PLETH_SPO2",),
    "ETCO2": ("Primus/ETCO2", "Solar8000/ETCO2"),
    "RR_CO2": ("Primus/RR_CO2", "Solar8000/RR_CO2"),
    "TV": ("Primus/TV", "Solar8000/VENT_TV"),
    "MV": ("Primus/MV", "Solar8000/VENT_MV"),
    "PIP": ("Primus/PIP_MBAR", "Solar8000/VENT_PIP"),
    "PEEP": ("Primus/PEEP_MBAR", "Solar8000/VENT_MEAS_PEEP"),
    "PPLAT": ("Primus/PPLAT_MBAR", "Solar8000/VENT_PPLAT"),
    "MAWP": ("Primus/MAWP_MBAR", "Solar8000/VENT_MAWP"),
    "FIO2": ("Primus/FIO2", "Solar8000/FIO2"),
    "COMPLIANCE": ("Primus/COMPLIANCE", "Solar8000/VENT_COMPL"),
    "VENT_LEAK": ("Primus/VENT_LEAK",),
    "SET_FIO2": ("Primus/SET_FIO2", "Solar8000/VENT_SET_FIO2"),
    "SET_TV": ("Primus/SET_TV_L", "Solar8000/VENT_SET_TV"),
    "SET_PIP": ("Primus/SET_PIP", "Primus/SET_INSP_PRES", "Solar8000/VENT_SET_PCP"),
    "SET_RR": ("Primus/SET_RR_IPPV", "Solar8000/VENT_RR"),
    "HR": ("Solar8000/HR",),
    "MAC": ("Primus/MAC",),
}


class VitalDBDataError(RuntimeError):
    """VitalDB metadata, tracks, or a requested case window is unavailable."""


@dataclass(frozen=True)
class LoadedTrackMetadata:
    track_name: str
    source_device: str | None
    track_type: str | None
    native_sample_rate_hz: float | None
    observed_update_rate_hz: float | None
    unit: str | None
    record_count: int | None
    native_sample_count: int | None
    valid_time_range_seconds: list[float] | None


@dataclass(frozen=True)
class VitalDBCaseSignals:
    """One time-aligned VitalDB case series reusable across model windows."""

    case_id: str
    model_id: str
    duration_seconds: float
    numeric_values: np.ndarray
    numeric_feature_order: tuple[str, ...]
    numeric_track_names: dict[str, str | None]
    waveform_values: dict[str, np.ndarray]
    waveform_rates_hz: dict[str, float]
    waveform_track_names: dict[str, str | None]
    static_features: dict[str, float | None]
    selected_tracks: dict[str, str | None]
    track_metadata: dict[str, LoadedTrackMetadata]
    pre_roll_seconds: int
    history_seconds: int

    def window_at(self, prediction_time_s: float) -> InferenceWindow:
        if not math.isfinite(float(prediction_time_s)):
            raise ValueError("prediction_time_s must be finite")
        prediction_time_s = float(prediction_time_s)
        if abs(prediction_time_s - round(prediction_time_s)) > 1e-6:
            raise ValueError("prediction_time_s must align to the 1 Hz numeric grid")
        if prediction_time_s < self.history_seconds:
            raise VitalDBDataError(
                f"{self.model_id} requires at least {self.history_seconds} seconds of case history"
            )
        if prediction_time_s > self.duration_seconds:
            raise VitalDBDataError("prediction time is beyond the VitalDB recording end")

        numeric_count = self.history_seconds + self.pre_roll_seconds
        numeric_start = int(round(prediction_time_s)) - numeric_count
        numeric_end = int(round(prediction_time_s))
        raw_numeric = np.full(
            (numeric_count, len(self.numeric_feature_order)), np.nan, dtype=np.float32
        )
        source_start = max(0, numeric_start)
        source_end = min(numeric_end, self.numeric_values.shape[0])
        if source_end > source_start:
            destination_start = source_start - numeric_start
            raw_numeric[
                destination_start : destination_start + source_end - source_start
            ] = self.numeric_values[source_start:source_end]

        wave_duration = 30 if self.model_id == UC04_CONTRACT.model_id else 60
        waveforms: dict[str, SignalWindow] = {}
        for name, rate_hz in self.waveform_rates_hz.items():
            signal = _window_slice(
                self.waveform_values.get(name),
                rate_hz=rate_hz,
                prediction_time_s=prediction_time_s,
                duration_seconds=wave_duration,
                source_track=self.waveform_track_names.get(name),
            )
            if signal is not None:
                track = self.track_metadata.get(signal.source_track or "")
                waveforms[name] = SignalWindow(
                    values=signal.values,
                    sample_rate_hz=signal.sample_rate_hz,
                    start_time_s=signal.start_time_s,
                    source_track=signal.source_track,
                    unit=track.unit if track else None,
                )

        return InferenceWindow(
            case_id=self.case_id,
            window_start_s=prediction_time_s - self.history_seconds,
            window_end_s=prediction_time_s,
            prediction_time_s=prediction_time_s,
            numeric_values=raw_numeric,
            numeric_feature_order=self.numeric_feature_order,
            numeric_sample_rate_hz=1.0,
            numeric_start_time_s=float(numeric_start),
            static_features=self.static_features,
            waveforms=waveforms,
            selected_tracks=self.selected_tracks,
            source_available_through_s=prediction_time_s,
        )


def _static_value(row: pd.Series, name: str) -> float | None:
    value = pd.to_numeric(row.get(name), errors="coerce")
    return float(value) if pd.notna(value) and math.isfinite(float(value)) else None


def _static_features(row: pd.Series, model_id: str) -> dict[str, float | None]:
    sex = str(row.get("sex", "")).strip().upper()
    sex_male = 1.0 if sex == "M" else 0.0 if sex == "F" else None
    if model_id == UC04_CONTRACT.model_id:
        names = ("age", "bmi", "asa", "emop")
        values = {name: _static_value(row, name) for name in names}
        values["sex_male"] = sex_male
        return values
    names = ("age", "bmi", "asa", "weight", "height", "emop")
    values = {name: _static_value(row, name) for name in names}
    values["sex_male"] = sex_male
    return values


def _case_metadata(
    case_id: int,
    vitaldb_module: Any | None = None,
    *,
    include_indexed_tracks: bool = True,
) -> tuple[pd.Series, set[str]]:
    if vitaldb_module is None:
        try:
            import vitaldb as vitaldb_module
        except ImportError as exc:
            raise VitalDBDataError("VitalDB Python package is required") from exc
    try:
        clinical = vitaldb_module.load_clinical_data([case_id])
    except Exception as exc:
        raise VitalDBDataError(f"could not read VitalDB case metadata: {exc}") from exc
    if clinical is None or len(clinical) == 0:
        raise VitalDBDataError(f"VitalDB case {case_id} does not exist in case metadata")
    if not include_indexed_tracks:
        return clinical.iloc[0], set()
    try:
        track_frame = vitaldb_module.get_track_names([case_id])
    except Exception as exc:
        raise VitalDBDataError(f"could not read VitalDB track index: {exc}") from exc
    if isinstance(track_frame, pd.DataFrame):
        if "tnames" in track_frame.columns:
            available = {
                str(name)
                for values in track_frame["tnames"].dropna()
                for name in (values if isinstance(values, (list, tuple, set)) else [values])
            }
        elif "tname" in track_frame.columns:
            available = set(track_frame["tname"].dropna().astype(str))
        else:
            raise VitalDBDataError("VitalDB track metadata is missing tnames")
    elif isinstance(track_frame, (list, tuple, set)):
        available = set(map(str, track_frame))
    else:
        raise VitalDBDataError("VitalDB returned an unsupported track metadata shape")
    return clinical.iloc[0], available


def _choose_tracks(
    candidates: dict[str, tuple[str, ...]], available: set[str]
) -> dict[str, str | None]:
    return {
        role: next((name for name in names if name in available), None)
        for role, names in candidates.items()
    }


class TrackNameResolver:
    """Resolve only the VitalDB track aliases used by the training notebooks."""

    def resolve(self, model_id: str, available: set[str] | tuple[str, ...] | list[str]) -> dict[str, str | None]:
        selected_model = VitalDBWindowLoader._model_id(model_id)
        candidates = (
            UC04_TRACK_CANDIDATES
            if selected_model == UC04_CONTRACT.model_id
            else UC05_TRACK_CANDIDATES
        )
        return _choose_tracks(candidates, set(map(str, available)))


def _window_slice(
    values: np.ndarray | None,
    *,
    rate_hz: float,
    prediction_time_s: float,
    duration_seconds: int,
    source_track: str | None,
) -> SignalWindow | None:
    if values is None:
        return None
    source = np.asarray(values, dtype=np.float32).reshape(-1)
    # The notebook indexes samples from case-time zero and uses [t-window:t].
    # floor excludes the sample at prediction_time and every later observation.
    end_index = int(math.floor(prediction_time_s * rate_hz + 1e-9))
    count = int(round(duration_seconds * rate_hz))
    start_index = end_index - count
    window = np.full(count, np.nan, dtype=np.float32)
    src_start = max(0, start_index)
    src_end = min(end_index, source.size)
    if src_end > src_start:
        dst_start = src_start - start_index
        window[dst_start : dst_start + (src_end - src_start)] = source[src_start:src_end]
    return SignalWindow(
        values=window,
        sample_rate_hz=rate_hz,
        start_time_s=start_index / rate_hz,
        source_track=source_track,
    )


class VitalDBWindowLoader:
    """Loads aligned VitalDB series and cuts model windows at prediction time."""

    def __init__(
        self,
        *,
        vitaldb_module: Any | None = None,
        track_name_resolver: TrackNameResolver | None = None,
    ) -> None:
        if vitaldb_module is None:
            try:
                import vitaldb as vitaldb_module
            except ImportError as exc:
                raise VitalDBDataError(
                    "VitalDB Python package is required for real case extraction"
                ) from exc
        self.vitaldb = vitaldb_module
        self.track_name_resolver = track_name_resolver or TrackNameResolver()

    @staticmethod
    def _model_id(model_id: str) -> str:
        aliases = {"UC04": UC04_CONTRACT.model_id, "UC05": UC05_CONTRACT.model_id}
        resolved = aliases.get(model_id.upper(), model_id)
        if resolved not in {UC04_CONTRACT.model_id, UC05_CONTRACT.model_id}:
            raise ValueError(f"unsupported model id: {model_id}")
        return resolved

    @staticmethod
    def _track_array(vf: Any, track_name: str | None, rate_hz: float) -> np.ndarray | None:
        if track_name is None:
            return None
        values = vf.to_numpy([track_name], interval=1.0 / float(rate_hz))
        if values is None or len(values) == 0:
            return None
        return np.asarray(values[:, 0], dtype=np.float32)

    @staticmethod
    def _profile(model_id: str) -> tuple[
        dict[str, tuple[str, ...]],
        tuple[str, ...],
        dict[str, float],
        dict[str, str],
        int,
        int,
    ]:
        if model_id == UC04_CONTRACT.model_id:
            return (
                UC04_TRACK_CANDIDATES,
                UC04_NUM_KEYS,
                {"art": 100.0, "ecg": 250.0, "ppg": 100.0, "capno": 62.5},
                {"art": "ART_WAVE", "ecg": "ECG_WAVE", "ppg": "PPG_WAVE", "capno": "CAPNO_WAVE"},
                5,
                300,
            )
        return (
            UC05_TRACK_CANDIDATES,
            UC05_NUM_FEATURES,
            {"capno": 62.5, "awp": 62.5, "ppg": 500.0, "flow": 62.5, "resp": 62.5},
            {name: name for name in ("capno", "awp", "ppg", "flow", "resp")},
            0,
            600,
        )

    @staticmethod
    def _track_info(
        vf: Any, name: str, *, origin_timestamp: float = 0.0
    ) -> LoadedTrackMetadata:
        trk = getattr(vf, "trks", {}).get(name)
        if trk is None:
            return LoadedTrackMetadata(name, None, None, None, None, None, None, None, None)
        raw_type = getattr(trk, "type", None)
        type_name = {1: "WAVEFORM", 2: "NUMERIC"}.get(raw_type, str(raw_type) if raw_type is not None else None)
        raw_rate = getattr(trk, "srate", None)
        try:
            rate = float(raw_rate)
            if not math.isfinite(rate) or rate <= 0:
                rate = None
        except (TypeError, ValueError):
            rate = None
        raw_unit = getattr(trk, "unit", None)
        unit = str(raw_unit).strip() if raw_unit is not None and str(raw_unit).strip() else None
        records = list(getattr(trk, "recs", ()) or ())
        record_times: list[float] = []
        record_ends: list[float] = []
        native_sample_count = 0
        for record in records:
            raw_time = record.get("dt") if isinstance(record, dict) else getattr(record, "dt", None)
            try:
                timestamp = float(raw_time)
            except (TypeError, ValueError):
                continue
            if not math.isfinite(timestamp):
                continue
            value = record.get("val") if isinstance(record, dict) else getattr(record, "val", None)
            sample_count = int(np.asarray(value).size) if value is not None else 0
            record_times.append(timestamp - float(origin_timestamp))
            if type_name == "WAVEFORM" and rate and sample_count > 0:
                native_sample_count += sample_count
                record_ends.append(timestamp - float(origin_timestamp) + (sample_count - 1) / rate)
            else:
                record_ends.append(timestamp - float(origin_timestamp))
        if type_name == "WAVEFORM" and record_ends:
            valid_end = max(record_ends)
        else:
            valid_end = max(record_times) if record_times else None
        valid_range = (
            [float(min(record_times)), float(valid_end)]
            if record_times and valid_end is not None
            else None
        )
        observed_rate = None
        if type_name == "NUMERIC" and len(record_times) > 1:
            intervals = np.diff(np.sort(np.asarray(record_times, dtype=np.float64)))
            positive_intervals = intervals[intervals > 0]
            if positive_intervals.size:
                observed_rate = float(1.0 / np.median(positive_intervals))
        return LoadedTrackMetadata(
            track_name=name,
            source_device=str(getattr(trk, "dname", "")).strip() or None,
            track_type=type_name,
            native_sample_rate_hz=rate,
            observed_update_rate_hz=observed_rate,
            unit=unit,
            record_count=len(records) if records else None,
            native_sample_count=(native_sample_count if records and type_name == "WAVEFORM" else None),
            valid_time_range_seconds=valid_range,
        )

    def load_case_signals(
        self,
        model_id: str,
        case_id: int | str,
        *,
        source_path: str | Path | None = None,
        case_metadata: Mapping[str, Any] | None = None,
    ) -> VitalDBCaseSignals:
        selected_model = self._model_id(model_id)
        try:
            case_id_int = int(case_id)
        except (TypeError, ValueError) as exc:
            raise ValueError("case_id must be an integer VitalDB case id") from exc
        if case_id_int <= 0:
            raise ValueError("case_id must be positive")

        if case_metadata is None:
            case, indexed_tracks = _case_metadata(
                case_id_int, self.vitaldb, include_indexed_tracks=False
            )
        else:
            # A selected local case manifest is already derived from the
            # official deidentified metadata API. Reuse that snapshot so local
            # window validation does not need a second network lookup.
            case_values = dict(case_metadata)
            case_values["caseid"] = case_id_int
            case = pd.Series(case_values)
            indexed_tracks = set()
        candidates, numeric_features, wave_rates, wave_roles, pre_roll, history = self._profile(selected_model)
        requested_names = sorted(
            track for choices in candidates.values() for track in choices
        ) if not indexed_tracks else sorted({
            track for choices in candidates.values() for track in choices if track in indexed_tracks
        })
        if not requested_names:
            raise VitalDBDataError(f"VitalDB case {case_id_int} has no tracks indexed for {selected_model}")
        source: int | str = case_id_int
        if source_path is not None:
            source = str(Path(source_path).expanduser().resolve(strict=True))
        try:
            vf = self.vitaldb.VitalFile(source, track_names=requested_names)
        except Exception as exc:
            raise VitalDBDataError(f"could not load VitalDB case {case_id_int}: {exc}") from exc

        actual = set()
        get_names = getattr(vf, "get_track_names", None)
        if callable(get_names):
            actual = set(map(str, get_names() or []))
        if not actual:
            actual = set(getattr(vf, "trks", {}).keys()) or set(requested_names)
        chosen = self.track_name_resolver.resolve(selected_model, actual)

        if selected_model == UC04_CONTRACT.model_id:
            for required in ("ART_WAVE", "MAP", "HR"):
                if chosen[required] is None:
                    raise VitalDBDataError(f"UC04 VitalDB case lacks required track {required}")
        else:
            strict_wave_tracks = ("capno", "awp", "ppg")
            absent = [role for role in ("SPO2", *strict_wave_tracks) if chosen.get(role) is None]
            if absent:
                raise VitalDBDataError(
                    "UC05 signal_schema.json requires SPO2, capno, AWP, and PPG; "
                    f"missing {', '.join(absent)}"
                )

        case_origin = float(getattr(vf, "dtstart", 0))
        track_metadata = {
            name: self._track_info(vf, name, origin_timestamp=case_origin)
            for name in sorted(set(requested_names) & actual)
        }

        numeric_tracks = {feature: chosen.get(feature) for feature in numeric_features}
        present_numeric_tracks = list(dict.fromkeys(name for name in numeric_tracks.values() if name))
        if not present_numeric_tracks:
            raise VitalDBDataError("case does not contain any model numeric tracks")
        try:
            numeric_data = vf.to_numpy(present_numeric_tracks, interval=1.0)
        except Exception as exc:
            raise VitalDBDataError(f"could not sample VitalDB numeric tracks: {exc}") from exc
        if numeric_data is None or len(numeric_data) == 0:
            raise VitalDBDataError("VitalDB returned no numeric samples")
        numeric_data = np.asarray(numeric_data, dtype=np.float32)
        numeric_matrix = np.full((numeric_data.shape[0], len(numeric_features)), np.nan, dtype=np.float32)
        track_index = {track: index for index, track in enumerate(present_numeric_tracks)}
        for column, track in enumerate(numeric_tracks.values()):
            if track is not None:
                numeric_matrix[:, column] = numeric_data[:, track_index[track]]

        waveform_values: dict[str, np.ndarray] = {}
        resolved_waveform_rates: dict[str, float] = {}
        waveform_track_names: dict[str, str | None] = {}
        for name, configured_rate_hz in wave_rates.items():
            track_name = chosen.get(wave_roles[name])
            waveform_track_names[name] = track_name
            if track_name is None:
                continue
            metadata = track_metadata.get(track_name)
            if metadata is not None and metadata.track_type not in (None, "WAVEFORM"):
                continue
            if selected_model == UC04_CONTRACT.model_id:
                # The UC04 notebook asks VitalFile.to_numpy for its trained
                # output rate, allowing VitalDB's own timestamp-aware resampling.
                sample_rate_hz = configured_rate_hz
            else:
                # UC05's notebook resamples from its declared native waveform
                # rate with scipy.signal.resample_poly. Never guess that rate.
                sample_rate_hz = (
                    metadata.native_sample_rate_hz if metadata is not None else None
                )
                if sample_rate_hz is None or not math.isfinite(sample_rate_hz) or sample_rate_hz <= 0:
                    continue
            values = self._track_array(vf, track_name, sample_rate_hz)
            if values is not None:
                waveform_values[name] = values
                resolved_waveform_rates[name] = float(sample_rate_hz)

        duration = float(getattr(vf, "dtend", 0) - getattr(vf, "dtstart", 0))
        if not math.isfinite(duration) or duration <= 0:
            metadata_end = _static_value(case, "caseend")
            duration = metadata_end or 0.0
        if duration <= 0:
            raise VitalDBDataError("VitalDB recording duration is missing or invalid")

        selected_tracks = dict(chosen)
        return VitalDBCaseSignals(
            case_id=str(case_id_int),
            model_id=selected_model,
            duration_seconds=duration,
            numeric_values=numeric_matrix,
            numeric_feature_order=tuple(numeric_features),
            numeric_track_names=numeric_tracks,
            waveform_values=waveform_values,
            waveform_rates_hz=resolved_waveform_rates,
            waveform_track_names=waveform_track_names,
            static_features=_static_features(case, selected_model),
            selected_tracks=selected_tracks,
            track_metadata=track_metadata,
            pre_roll_seconds=pre_roll,
            history_seconds=history,
        )

    def load_window(
        self,
        model_id: str,
        case_id: int | str,
        prediction_time_s: float,
        *,
        source_path: str | Path | None = None,
    ) -> InferenceWindow:
        return self.load_case_signals(
            model_id, case_id, source_path=source_path
        ).window_at(prediction_time_s)
