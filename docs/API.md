# SafeAnes API

FastAPI is the system of record for VitalDB case metadata, observed signals,
model output, and replay state. Browser calls use the Next.js same-origin proxy
at `/api/backend/v1`; the proxy forwards to the server-only
`SAFEANES_API_URL`. In production it adds `SAFEANES_BACKEND_API_TOKEN`, which
must match `SAFEANES_API_TOKEN` on the backend.

## Time and errors

All timestamps and replay positions are elapsed seconds from the source case
recording start. Model prediction records are exposed only as of their
prediction timestamp. Missing samples remain null/missing with quality and
provenance metadata; they are not replaced by zeros.

Errors use a stable shape:

```json
{
  "error": {
    "code": "MODEL_NOT_READY",
    "message": "Model status is unavailable for this request.",
    "request_id": "...",
    "details": {}
  }
}
```

Responses include `X-Request-ID`. A valid incoming ID using letters, digits,
period, underscore, or dash is preserved; other values are replaced. Logs are
structured JSON and exclude credentials and query strings.

## Routes

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/health/live` | Process liveness; does not assert model readiness |
| GET | `/api/v1/health/ready` | Catalog, data cache, and model readiness; can return 503 |
| GET | `/api/v1/models` | Audited model versions, hashes, and readiness |
| GET | `/api/v1/models/{model_id}/status` | Status of one allowlisted model |
| GET | `/api/v1/cases` | Local case catalog and eligibility |
| GET | `/api/v1/cases/{case_id}` | Case metadata and raw-cache provenance |
| GET | `/api/v1/cases/{case_id}/tracks` | Available source track metadata |
| GET | `/api/v1/cases/{case_id}/signals` | Numeric track samples in a bounded interval |
| GET | `/api/v1/cases/{case_id}/waveforms` | Waveform samples in a bounded interval |
| GET | `/api/v1/cases/{case_id}/events` | Recorded source events |
| GET | `/api/v1/cases/{case_id}/predictions/uc04` | UC04 output, only for verified eligible input |
| GET | `/api/v1/cases/{case_id}/predictions/uc05` | UC05 strict-schema output for an eligible window; missing required signals abstain explicitly |
| POST | `/api/v1/replay/sessions` | Create a case replay session |
| GET | `/api/v1/replay/sessions/{session_id}` | Read replay state |
| POST | `/api/v1/replay/sessions/{session_id}/play` | Play or resume |
| POST | `/api/v1/replay/sessions/{session_id}/resume` | Resume a paused replay |
| POST | `/api/v1/replay/sessions/{session_id}/pause` | Pause |
| POST | `/api/v1/replay/sessions/{session_id}/reset` | Reset to case start |
| POST | `/api/v1/replay/sessions/{session_id}/seek` | Seek within the case |
| POST | `/api/v1/replay/sessions/{session_id}/speed` | Set supported replay speed |
| GET | `/api/v1/replay/sessions/{session_id}/stream` | SSE replay state stream |

The API uses SSE for server-pushed replay snapshots; commands remain REST
requests. EventSource performs reconnects. A reconnect snapshot is bounded to
the current replay window; route changes do not create another replay session.

Detailed response shapes and generated OpenAPI are in
`backend/openapi.json` and `/openapi.json` (local/test environments only).


### Backend health identity and readiness

Both health responses include required `service_name: "safeanes-backend"` and `build_id` fields. The build ID is an explicit `SAFEANES_BUILD_ID` release identifier (1 to 128 ASCII characters matching `[A-Za-z0-9][A-Za-z0-9._+-]{0,127}`) or a cached SHA-256 of sorted relative Python source filenames and bytes under `backend/app`. It contains no automatic model/data/check-out paths.

`GET /api/v1/health/live` checks process liveness. `GET /api/v1/health/ready` retains the existing gate: catalog ready **and** dataset cache ready **and** UC04 and UC05 inference ready. Readiness reports these components separately and returns HTTP 503 when any required component is unavailable. A live process alone does not establish cache or model readiness.
