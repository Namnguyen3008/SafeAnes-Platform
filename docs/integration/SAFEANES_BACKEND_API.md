# SafeAnes Backend API Contract

The FastAPI application publishes interactive OpenAPI at `/docs`, the machine-readable schema at `/openapi.json`, and ReDoc at `/redoc`. A generated OpenAPI snapshot is checked in at `backend/openapi.json`.

All timestamps and range parameters use elapsed seconds from the start of the selected VitalDB case (`seconds_since_case_start`). Case IDs are catalog IDs and are restricted to positive decimal integers. Errors use:

```json
{
  "error": {
    "code": "TRACK_NOT_AVAILABLE",
    "message": "Track ... is not available for this case",
    "request_id": "...",
    "details": {}
  }
}
```

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health/live` | Process liveness |
| GET | `/api/v1/health/ready` | Case catalog, dataset cache, UC04 model, and UC05 model readiness; HTTP 503 if any required prerequisite is unavailable |
| GET | `/api/v1/models` | Allowlisted model status |
| GET | `/api/v1/models/{model_id}/status` | One model's audited readiness |
| GET | `/api/v1/cases` | Locally cataloged cases and inference eligibility |
| GET | `/api/v1/cases/{case_id}` | Case metadata; unavailable demographics stay `NOT_RECORDED` |
| GET | `/api/v1/cases/{case_id}/tracks` | Track metadata and recording coverage |
| GET | `/api/v1/cases/{case_id}/signals?track_name=...&start_s=...&end_s=...` | Raw numeric observations |
| GET | `/api/v1/cases/{case_id}/waveforms?track_name=...&start_s=...&end_s=...` | Raw waveform sample window |
| GET | `/api/v1/cases/{case_id}/events` | Source EVENT annotations |
| GET | `/api/v1/cases/{case_id}/predictions/uc04?prediction_time_s=...` | UC04 predictions for a verified prospective window |
| GET | `/api/v1/cases/{case_id}/predictions/uc05?prediction_time_s=...` | UC05 strict-schema inference for an eligible prospective window; missing required modalities return an explicit eligibility error/abstention |
| POST | `/api/v1/replay/sessions` | Create a replay session |
| GET | `/api/v1/replay/sessions/{session_id}` | Read replay state |
| POST | `/api/v1/replay/sessions/{session_id}/play` | Start/resume replay |
| POST | `/api/v1/replay/sessions/{session_id}/pause` | Pause replay |
| POST | `/api/v1/replay/sessions/{session_id}/seek` | Seek within the case duration |
| POST | `/api/v1/replay/sessions/{session_id}/speed` | Set speed to 1, 2, 5, 10, 30, or 60 |
| GET | `/api/v1/replay/sessions/{session_id}/stream` | Server-sent replay snapshots |

The replay stream uses SSE because clients only receive server-pushed state; play/pause/seek/speed remain explicit REST commands. There is no WebSocket endpoint.

## Error codes

The service returns the requested error distinctions: `CASE_NOT_FOUND` (404), `TRACK_NOT_AVAILABLE` (404), `MODEL_NOT_READY` (503), `INPUT_NOT_ELIGIBLE` (422), `INSUFFICIENT_DATA` (422), `INFERENCE_FAILED` (500), `CACHE_NOT_READY` (503), and `INVALID_TIME_RANGE` (422). Request schema failures return `INVALID_REQUEST` (422). No inference error is converted to a zero score or empty prediction. With the verified local artifacts, both UC04 and UC05 report `INTEGRATION_READY`; `MODEL_NOT_READY` remains the correct response when a configured artifact or supporting contract is unavailable.

Prediction responses include model identity/version, case, prediction time/task, horizon when supported, raw and interpreted output with its semantics, calibration status, observed data coverage, quality, missing features, input window, artifact hash, preprocessing version, and source-track mapping. The response intentionally does not add a confidence score. UC04 scores are explicitly uncalibrated. UC05 hypoxemia horizons use the saved temperature-scaling artifact; its auxiliary ventilation-pattern output remains a raw, uncalibrated logit.

## Current real-data response evidence — 2026-10-10

| Check | Result |
|---|---|
| Selected catalog cases | VitalDB cases `1`, `6388`, and `3300`; all are dual UC04/UC05 eligible under the validated pipelines |
| UC04 at case `1`, `t=600s` | API value `.439917` is rendered as `.4399`; task and uncalibrated semantics remain visible |
| UC05 at case `1`, `t=600s` | API/UI values at 1/3/5 minutes: `.0012186`, `.006614`, `.01198`; UI renders `.001219`, `.006614`, `.01198` |
| EN/VI route state | Navigation retained replay time `00:10:00`; language switching did not reset the case cursor |
| As-of cache metadata | Prediction rows, window counts, eligibility, reasons, and explicit `abstained_windows` are filtered at the replay cursor; future windows are not exposed |

The standalone cache-status response exposes the full persisted cache summary;
the UC04/UC05 view response exposes an as-of projection. A ready model, a ready
cache, an eligible window, and an available prediction are separate states.
The API does not infer abstention from a missing prediction row.

## Model status boundary

`GET /api/v1/models` and `/status` report artifact/runtime readiness. Case
eligibility and per-window quality are reported by the case catalog, prediction
responses, and replay view. This separation is required for truthful UI states:
`MODEL_NOT_READY`, `CACHE_NOT_READY`, `INPUT_NOT_ELIGIBLE`, `ABSTAINED`, and an
available prediction are not interchangeable.
