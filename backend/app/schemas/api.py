from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field



class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorBody(ApiModel):
    code: str
    message: str
    request_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(ApiModel):
    error: ErrorBody


class HealthResponse(ApiModel):
    service_name: Literal["safeanes-backend"]
    build_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$", min_length=1, max_length=128)
    status: str
    ready: bool | None = None
    components: dict[str, Any] = Field(default_factory=dict)


class ModelStatusResponse(ApiModel):
    model_id: str
    model_version: str
    task: str
    framework: str
    artifact_hash: str
    loaded: bool
    readiness_status: str
    inference_ready: bool
    calibration_status: str
    blockers: list[str] = Field(default_factory=list)


class ModelsResponse(ApiModel):
    models: list[ModelStatusResponse]


class CaseSummary(ApiModel):
    case_id: str
    duration_seconds: float
    available_signals: list[str]
    uc04_eligible: bool
    uc05_eligible: bool
    coverage_summary: dict[str, Any] = Field(default_factory=dict)
    number_of_valid_windows: dict[str, Any] = Field(default_factory=dict)
    inference_readiness: dict[str, Any] = Field(default_factory=dict)
    cache_status: str


class CasesResponse(ApiModel):
    dataset: str
    dataset_version: str
    cases: list[CaseSummary]


class CaseDetailResponse(ApiModel):
    case_id: str
    dataset: str
    dataset_version: str
    source: str
    source_uri: str | None = None
    duration_seconds: float
    time_basis: Literal["seconds_since_case_start"] = "seconds_since_case_start"
    patient_context: dict[str, Any] = Field(default_factory=dict)
    eligibility: dict[str, Any] = Field(default_factory=dict)
    available_signals: list[str]
    raw_file: dict[str, Any] = Field(default_factory=dict)


class TrackMetadata(ApiModel):
    track_name: str
    source_device: str
    track_type: str
    native_sample_rate_hz: float | str
    observed_update_rate_hz: float | str
    unit: str
    record_count: int | str
    native_sample_count: int | str
    valid_time_range_seconds: list[float] | str


class TracksResponse(ApiModel):
    case_id: str
    tracks: list[TrackMetadata]


class Observation(ApiModel):
    case_id: str
    track_name: str
    timestamp: float
    value: float | None
    unit: str
    source: str
    quality: str
    is_missing: bool
    provenance: dict[str, Any]


class SignalsResponse(ApiModel):
    case_id: str
    track_name: str
    track_type: str
    time_basis: Literal["seconds_since_case_start"] = "seconds_since_case_start"
    start_time_s: float
    end_time_s: float
    unit: str
    source: str
    quality: str
    provenance: dict[str, Any]
    observations: list[Observation]


class WaveformWindowResponse(ApiModel):
    case_id: str
    track_name: str
    track_type: Literal["WAVEFORM"] = "WAVEFORM"
    time_basis: Literal["seconds_since_case_start"] = "seconds_since_case_start"
    start_time_s: float
    end_time_s: float
    sample_rate_hz: float
    unit: str
    display_range: dict[str, float] | None = None
    source: str
    quality: str
    timestamps: list[float]
    values: list[float | None]
    is_missing: list[bool]
    missing_intervals: list[dict[str, float]]
    provenance: dict[str, Any]


class CaseEvent(ApiModel):
    case_id: str
    timestamp: float
    event_type: str
    description: str
    source: str
    quality: str
    is_missing: Literal[False] = False
    provenance: dict[str, Any]


class EventsResponse(ApiModel):
    case_id: str
    time_basis: Literal["seconds_since_case_start"] = "seconds_since_case_start"
    events: list[CaseEvent]


class InputWindowResponse(ApiModel):
    start_time_s: float
    end_time_s: float


class PredictionItemResponse(ApiModel):
    model_config = ConfigDict(extra="allow")
    case_id: str
    model_id: str
    model_version: str
    prediction_time: float
    task: str
    horizon_if_applicable: int | None
    output: dict[str, Any]
    output_semantics: str
    calibration_status: str
    data_coverage: float
    quality: str
    missing_features: list[str]
    input_window: InputWindowResponse
    artifact_hash: str
    preprocessing_version: str
    source_tracks: dict[str, str | None] = Field(default_factory=dict)
    input_window_start: float | None = None
    input_window_end: float | None = None
    raw_output: float | None = None
    interpreted_output: dict[str, Any] | None = None
    horizon_minutes_or_null: int | None = None
    calibrated_or_not: bool | None = None
    threshold_if_verified: float | None = None
    artifact_sha256: str | None = None


class PredictionsResponse(ApiModel):
    case_id: str
    model_id: str
    predictions: list[PredictionItemResponse]
    source: Literal["ON_DEMAND", "OFFLINE_CACHE"] = "ON_DEMAND"
    cache_status: Literal["READY", "NOT_READY"] | None = None
    as_of_s: float | None = None
    available_horizons_minutes: list[int] = Field(default_factory=list)
    prediction_count: int | None = None
    inference_window_count: int | None = None
    abstained_window_count: int | None = None
    abstained_windows: list[dict[str, Any]] = Field(default_factory=list)
    window_eligibility: str | None = None
    window_status: str | None = None
    window_reason: str | None = None
    window_prediction_time_s: float | None = None
    window_start_s: float | None = None
    window_end_s: float | None = None


class PredictionCacheStatusResponse(ApiModel):
    case_id: str
    model_id: str
    model_version: str | None = None
    artifact_sha256: str | None = None
    cache_status: Literal["READY", "NOT_READY"]
    prediction_count: int
    inference_window_count: int
    abstained_window_count: int = 0
    abstained_windows: list[dict[str, Any]] = Field(default_factory=list)
    window_eligibility: str = "NOT_EVALUATED"
    window_status: str = "NOT_EVALUATED"
    window_reason: str | None = None
    window_prediction_time_s: float | None = None
    window_start_s: float | None = None
    window_end_s: float | None = None


class UC04SignalResponse(SignalsResponse):
    signal: str


class UC04ViewResponse(ApiModel):
    case_id: str
    dataset: str
    dataset_version: str
    as_of_s: float
    window_start_s: float
    window_end_s: float
    time_basis: Literal["seconds_since_case_start"] = "seconds_since_case_start"
    available_tracks: list[str]
    signals: list[UC04SignalResponse]
    abp_waveform: WaveformWindowResponse | None = None
    events: list[CaseEvent]
    predictions: PredictionsResponse | None = None
    prediction_cache_status: Literal["READY", "NOT_READY"]
    prediction_cache: PredictionCacheStatusResponse | None = None
    model: dict[str, Any] = Field(default_factory=dict)


class UC05ViewResponse(ApiModel):
    case_id: str
    dataset: str
    dataset_version: str
    as_of_s: float
    window_start_s: float
    window_end_s: float
    time_basis: Literal["seconds_since_case_start"] = "seconds_since_case_start"
    available_tracks: list[str]
    signals: list[dict[str, Any]]
    waveforms: dict[str, WaveformWindowResponse | None]
    recorded_events: list[dict[str, Any]]
    derived_events: list[dict[str, Any]]
    predictions: PredictionsResponse | None = None
    prediction_cache_status: Literal["READY", "NOT_READY"]
    prediction_cache: PredictionCacheStatusResponse | None = None
    model: dict[str, Any]


class ReplaySessionCreate(ApiModel):
    case_id: str
    start_time_s: float = 0.0
    speed: Literal[1, 2, 5, 10, 30, 60] = 1


class ReplaySeekRequest(ApiModel):
    time_s: float


class ReplaySpeedRequest(ApiModel):
    speed: Literal[1, 2, 5, 10, 30, 60]


class ReplaySessionResponse(ApiModel):
    session_id: str
    case_id: str
    status: Literal["STOPPED", "PLAYING", "PAUSED", "COMPLETED"]
    current_time_s: float
    current_time_seconds: float
    duration_seconds: float
    speed: int
    created_at_utc: str
    started_at: str | None
    updated_at: str
    uc04_model_status: str
    uc05_model_status: str
    time_basis: Literal["seconds_since_case_start"] = "seconds_since_case_start"
    generation: int = 1
