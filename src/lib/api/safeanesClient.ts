/** Typed browser client for the SafeAnes FastAPI v1 contract. */

export type AvailabilityStatus =
  | "AVAILABLE"
  | "NOT_RECORDED"
  | "INSUFFICIENT_DATA"
  | "MODEL_NOT_READY"
  | "ABSTAINED"
  | "INFERENCE_FAILED";

export type ReplayStatus = "STOPPED" | "PLAYING" | "PAUSED" | "COMPLETED";
export type ReplaySpeed = 1 | 2 | 5 | 10 | 30 | 60;

export interface ApiErrorBody {
  code: string;
  message: string;
  request_id?: string | null;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

export interface HealthResponse {
  service_name: "safeanes-backend";
  build_id: string;
  status: string;
  ready?: boolean | null;
  components: Record<string, unknown>;
}

export interface ModelStatusResponse {
  model_id: string;
  model_version: string;
  task: string;
  framework: string;
  artifact_hash: string;
  loaded: boolean;
  readiness_status: string;
  inference_ready: boolean;
  calibration_status: string;
  blockers: string[];
}

export interface ModelsResponse {
  models: ModelStatusResponse[];
}

export interface VitalDbCaseSummary {
  case_id: string;
  duration_seconds: number;
  available_signals: string[];
  uc04_eligible: boolean;
  uc05_eligible: boolean;
  coverage_summary: Record<string, unknown>;
  number_of_valid_windows: Record<string, unknown>;
  inference_readiness: Record<string, unknown>;
  cache_status: string;
}

export interface CasesResponse {
  dataset: string;
  dataset_version: string;
  cases: VitalDbCaseSummary[];
}

export interface CaseDetailResponse {
  case_id: string;
  dataset: string;
  dataset_version: string;
  source: string;
  source_uri?: string | null;
  duration_seconds: number;
  time_basis: "seconds_since_case_start";
  patient_context: Record<string, unknown>;
  eligibility: Record<string, unknown>;
  available_signals: string[];
  raw_file: Record<string, unknown>;
}

export interface TrackMetadata {
  track_name: string;
  source_device: string;
  track_type: string;
  native_sample_rate_hz: number | string;
  observed_update_rate_hz: number | string;
  unit: string;
  record_count: number | string;
  native_sample_count: number | string;
  valid_time_range_seconds: [number, number] | string;
}

export interface TracksResponse {
  case_id: string;
  tracks: TrackMetadata[];
}

export interface Observation {
  case_id: string;
  track_name: string;
  timestamp: number;
  value: number | null;
  unit: string;
  source: string;
  quality: string;
  is_missing: boolean;
  provenance: Record<string, unknown>;
}

export interface SignalsResponse {
  case_id: string;
  track_name: string;
  track_type: string;
  time_basis: "seconds_since_case_start";
  start_time_s: number;
  end_time_s: number;
  unit: string;
  source: string;
  quality: string;
  provenance: Record<string, unknown>;
  observations: Observation[];
}

export interface WaveformWindowResponse {
  case_id: string;
  track_name: string;
  track_type: "WAVEFORM";
  time_basis: "seconds_since_case_start";
  start_time_s: number;
  end_time_s: number;
  sample_rate_hz: number;
  unit: string;
  display_range?: { min: number; max: number } | null;
  source: string;
  quality: string;
  timestamps: number[];
  values: Array<number | null>;
  is_missing: boolean[];
  missing_intervals: Array<{ start_time_s: number; end_time_s: number }>;
  provenance: Record<string, unknown>;
}

export interface CaseEvent {
  case_id: string;
  timestamp: number;
  available_at_s?: number;
  event_type: string;
  description: string;
  source: string;
  quality: string;
  is_missing: false;
  provenance: Record<string, unknown>;
}

export interface EventsResponse {
  case_id: string;
  time_basis: "seconds_since_case_start";
  events: CaseEvent[];
}

export interface UC04ViewResponse {
  case_id: string;
  dataset: string;
  dataset_version: string;
  as_of_s: number;
  window_start_s: number;
  window_end_s: number;
  time_basis: "seconds_since_case_start";
  available_tracks: string[];
  signals: Array<SignalsResponse & { signal: string }>;
  abp_waveform: WaveformWindowResponse | null;
  events: CaseEvent[];
  predictions: PredictionsResponse | null;
  prediction_cache_status: "READY" | "NOT_READY";
  prediction_cache: PredictionCacheStatusResponse | null;
  model: Record<string, unknown>;
}

export interface PredictionCacheStatusResponse {
  case_id: string;
  model_id: string;
  model_version: string | null;
  artifact_sha256: string | null;
  cache_status: "READY" | "NOT_READY";
  prediction_count: number;
  inference_window_count: number;
  abstained_window_count: number;
  abstained_windows: Array<Record<string, unknown>>;
  window_eligibility: string;
  window_status: string;
  window_reason: string | null;
  window_prediction_time_s: number | null;
  window_start_s: number | null;
  window_end_s: number | null;
}

export interface RecordedSignalResponse {
  signal?: string;
  track_name: string;
  unit: string;
  source: string;
  quality: string;
  observations: Observation[];
  [key: string]: unknown;
}

export interface UC05ViewResponse {
  case_id: string;
  dataset: string;
  dataset_version: string;
  as_of_s: number;
  window_start_s: number;
  window_end_s: number;
  time_basis: "seconds_since_case_start";
  available_tracks: string[];
  signals: RecordedSignalResponse[];
  waveforms: Record<string, WaveformWindowResponse | null>;
  recorded_events: Array<Record<string, unknown>>;
  derived_events: Array<Record<string, unknown>>;
  predictions: PredictionsResponse | null;
  prediction_cache_status: "READY" | "NOT_READY";
  prediction_cache: PredictionCacheStatusResponse | null;
  model: Record<string, unknown>;
}

export interface InputWindowResponse {
  start_time_s: number;
  end_time_s: number;
}

export interface PredictionItemResponse {
  case_id: string;
  model_id: string;
  model_version: string;
  prediction_time: number;
  task: string;
  horizon_if_applicable: number | null;
  output: Record<string, unknown>;
  output_semantics: string;
  calibration_status: string;
  data_coverage: number;
  quality: string;
  missing_features: string[];
  input_window: InputWindowResponse;
  artifact_hash: string;
  preprocessing_version: string;
  source_tracks?: Record<string, string | null>;
  input_window_start?: number | null;
  input_window_end?: number | null;
  raw_output?: number | null;
  interpreted_output?: Record<string, unknown> | null;
  horizon_minutes_or_null?: number | null;
  calibrated_or_not?: boolean | null;
  threshold_if_verified?: number | null;
  artifact_sha256?: string | null;
  [key: string]: unknown;
}

export interface PredictionsResponse {
  case_id: string;
  model_id: string;
  predictions: PredictionItemResponse[];
  source: "ON_DEMAND" | "OFFLINE_CACHE";
  cache_status?: "READY" | "NOT_READY" | null;
  as_of_s?: number | null;
  available_horizons_minutes: number[];
  prediction_count?: number | null;
  inference_window_count?: number | null;
  abstained_window_count?: number | null;
  abstained_windows?: Array<Record<string, unknown>>;
  window_eligibility?: string | null;
  window_status?: string | null;
  window_reason?: string | null;
  window_prediction_time_s?: number | null;
  window_start_s?: number | null;
  window_end_s?: number | null;
}

export interface ReplaySessionResponse {
  session_id: string;
  case_id: string;
  status: ReplayStatus;
  current_time_s: number;
  current_time_seconds: number;
  duration_seconds: number;
  speed: ReplaySpeed;
  created_at_utc: string;
  started_at: string | null;
  updated_at: string;
  uc04_model_status: string;
  uc05_model_status: string;
  time_basis: "seconds_since_case_start";
  generation?: number;
}

export class SafeAnesApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | null;
  readonly details: Record<string, unknown>;

  constructor(body: ApiErrorBody, status: number) {
    super(body.message || body.code || `SafeAnes backend request failed (${status}).`);
    this.name = "SafeAnesApiError";
    this.code = body.code || "API_REQUEST_FAILED";
    this.status = status;
    this.requestId = body.request_id ?? null;
    this.details = body.details ?? {};
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const API_ROOT = "/api/backend/v1";
const CASE_SELECTABLE_CACHE_STATUS = "READY";

export function createSafeAnesClient(fetcher: Fetcher = fetch) {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    let response: Response;
    try {
      response = await fetcher(`${API_ROOT}${path}`, { ...init, cache: "no-store" });
    } catch (error) {
      throw new SafeAnesApiError({
        code: "BACKEND_UNAVAILABLE",
        message: error instanceof Error ? error.message : "SafeAnes backend is unavailable.",
      }, 0);
    }

    if (!response.ok) {
      let body: ApiErrorBody = {
        code: "HTTP_REQUEST_FAILED",
        message: `SafeAnes backend request failed (${response.status}).`,
      };
      try {
        const payload = await response.json() as Partial<ApiErrorResponse>;
        if (payload.error) body = { ...body, ...payload.error };
      } catch {
        // Preserve the HTTP status when the API response is not JSON.
      }
      throw new SafeAnesApiError(body, response.status);
    }
    return response.json() as Promise<T>;
  };

  const post = <T>(path: string, body?: unknown) => request<T>(path, {
    method: "POST",
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });

  return {
    healthLive: () => request<HealthResponse>("/health/live"),
    healthReady: () => request<HealthResponse>("/health/ready"),
    listModels: () => request<ModelsResponse>("/models"),
    getModelStatus: (modelId: string) => request<ModelStatusResponse>(`/models/${encodeURIComponent(modelId)}/status`),
    listCases: () => request<CasesResponse>("/cases"),
    getCase: (caseId: string) => request<CaseDetailResponse>(`/cases/${encodeURIComponent(caseId)}`),
    listTracks: (caseId: string) => request<TracksResponse>(`/cases/${encodeURIComponent(caseId)}/tracks`),
    getSignals: (caseId: string, trackName: string, startSeconds: number, endSeconds: number) => {
      const query = new URLSearchParams({ track_name: trackName, start_s: String(startSeconds), end_s: String(endSeconds) });
      return request<SignalsResponse>(`/cases/${encodeURIComponent(caseId)}/signals?${query}`);
    },
    getWaveform: (caseId: string, trackName: string, startSeconds: number, endSeconds: number) => {
      const query = new URLSearchParams({ track_name: trackName, start_s: String(startSeconds), end_s: String(endSeconds) });
      return request<WaveformWindowResponse>(`/cases/${encodeURIComponent(caseId)}/waveforms?${query}`);
    },
    getEvents: (caseId: string) => request<EventsResponse>(`/cases/${encodeURIComponent(caseId)}/events`),
    getUC04View: (caseId: string, asOfSeconds: number, windowSeconds = 1_800) => {
      const query = new URLSearchParams({ as_of_s: String(asOfSeconds), window_seconds: String(windowSeconds) });
      return request<UC04ViewResponse>(`/cases/${encodeURIComponent(caseId)}/uc04-view?${query}`);
    },
    getUC05View: (caseId: string, asOfSeconds: number, windowSeconds = 1_800) => {
      const query = new URLSearchParams({ as_of_s: String(asOfSeconds), window_seconds: String(windowSeconds) });
      return request<UC05ViewResponse>(`/cases/${encodeURIComponent(caseId)}/uc05-view?${query}`);
    },
    getUC04Predictions: (caseId: string, asOfSeconds: number, windowStartSeconds?: number) => {
      const query = new URLSearchParams({ as_of_s: String(asOfSeconds) });
      if (windowStartSeconds !== undefined) query.set("window_start_s", String(windowStartSeconds));
      return request<PredictionsResponse>(`/cases/${encodeURIComponent(caseId)}/predictions/uc04?${query}`);
    },
    getUC05Predictions: (caseId: string, asOfSeconds: number, windowStartSeconds?: number) => {
      const query = new URLSearchParams({ as_of_s: String(asOfSeconds) });
      if (windowStartSeconds !== undefined) query.set("window_start_s", String(windowStartSeconds));
      return request<PredictionsResponse>(`/cases/${encodeURIComponent(caseId)}/predictions/uc05?${query}`);
    },
    createReplaySession: (caseId: string, speed: ReplaySpeed = 1, startTimeSeconds = 0) =>
      post<ReplaySessionResponse>("/replay/sessions", { case_id: caseId, speed, start_time_s: startTimeSeconds }),
    getReplaySession: (sessionId: string) => request<ReplaySessionResponse>(`/replay/sessions/${encodeURIComponent(sessionId)}`),
    playReplay: (sessionId: string) => post<ReplaySessionResponse>(`/replay/sessions/${encodeURIComponent(sessionId)}/play`),
    pauseReplay: (sessionId: string) => post<ReplaySessionResponse>(`/replay/sessions/${encodeURIComponent(sessionId)}/pause`),
    resumeReplay: (sessionId: string) => post<ReplaySessionResponse>(`/replay/sessions/${encodeURIComponent(sessionId)}/resume`),
    resetReplay: (sessionId: string) => post<ReplaySessionResponse>(`/replay/sessions/${encodeURIComponent(sessionId)}/reset`),
    seekReplay: (sessionId: string, timeSeconds: number) => post<ReplaySessionResponse>(
      `/replay/sessions/${encodeURIComponent(sessionId)}/seek`, { time_s: timeSeconds },
    ),
    setReplaySpeed: (sessionId: string, speed: ReplaySpeed) => post<ReplaySessionResponse>(
      `/replay/sessions/${encodeURIComponent(sessionId)}/speed`, { speed },
    ),
    replayStreamUrl: (sessionId: string) => `${API_ROOT}/replay/sessions/${encodeURIComponent(sessionId)}/stream`,
    isCaseSelectable: (item: VitalDbCaseSummary) => item.cache_status.toUpperCase() === CASE_SELECTABLE_CACHE_STATUS,
    getDataAvailabilityStatus: (available: boolean, recorded = true): AvailabilityStatus =>
      available ? "AVAILABLE" : recorded ? "INSUFFICIENT_DATA" : "NOT_RECORDED",
    getModelAvailabilityStatus: (model: Pick<ModelStatusResponse, "inference_ready"> | null | undefined): AvailabilityStatus =>
      model?.inference_ready ? "AVAILABLE" : "MODEL_NOT_READY",
  };
}

export const safeAnesClient = createSafeAnesClient();
