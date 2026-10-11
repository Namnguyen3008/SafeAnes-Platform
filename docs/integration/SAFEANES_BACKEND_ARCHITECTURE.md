# SafeAnes backend architecture

## Runtime layout

The API is a synchronous FastAPI service. Blocking VitalDB file reads and PyTorch inference run in FastAPI's worker thread pool. `BackendRuntime` owns one local case repository, a bounded VitalDB file/model-series cache, one instance of each allowlisted model service, and an in-memory replay manager. Model objects are loaded once during application lifespan startup and protected by per-model reentrant locks during inference.

```text
Next.js client
    | HTTPS / JSON + one-way SSE
    v
FastAPI routes -> case/signal/inference/replay services
    |                 |                    |
    |                 v                    v
    |          immutable VitalDB       UC04 / UC05
    |          .vital + manifests       allowlisted artifacts
    v
structured errors / OpenAPI
```

Case metadata comes from `backend/data/manifests/vitaldb_case_catalog.json` and the per-case manifests. Raw `.vital` data is read from `backend/data/vitaldb/raw/`; the manifest checksum is verified before a file is parsed. This implementation does not download data during an API request. Use the existing discovery/ingestion pipeline to populate the local catalog and immutable cache.

No database is required for current behavior: catalogs/manifests are local files and replay sessions are ephemeral. Replay state is process-local, so deploy one API worker per instance. Persistent or multi-worker replay would need a shared session store before scaling workers horizontally.

## Real model readiness

Only the fixed UC04 and UC05 contracts in the repository are loadable. API input never selects an artifact path. The artifact registry checks allowlisted paths and SHA-256. Startup loads each available model once and records load failures rather than making liveness fail.

UC04 and UC05 can return their audited outputs once loaded and input-eligible. UC05 uses the strict exported signal schema: capnogram, airway pressure (AWP), and PPG must each pass the required quality gate. A ready model does not imply that every case or every replay window is eligible; an ineligible window is represented by an explicit abstention and reason. The API never substitutes a synthetic prediction, and confidence is not returned because neither contract supplies a confidence interval.

### Current readiness evidence — 2026-10-10

| Dimension | UC04 | UC05 |
|---|---|---|
| Artifact load | `INTEGRATION_READY` | `INTEGRATION_READY` |
| Contract verification | PASS | PASS under strict `signal_schema.json` gate |
| Selected cases | `1`, `6388`, `3300` dual eligible | `1`, `6388`, `3300` dual eligible |
| Window behavior | Eligible windows predict; invalid windows abstain | Eligible windows predict; missing capno/AWP/PPG windows abstain |
| Calibration | None; score is uncalibrated and confidence is unavailable | Saved temperature scaling for hypoxemia horizons; auxiliary raw logit remains uncalibrated |
| Clinical performance | NOT VERIFIED | NOT VERIFIED |

The model registry, case catalog, window eligibility, and cached prediction
layers are intentionally separate. This allows a model to be runtime-ready
while a case, cache, or individual time window remains unavailable.

An earlier validation snapshot described UC05 as `BLOCKED_CONTRACT_MISMATCH`
while the historical stream-evaluator rule was being reconciled. That is a
**superseded historical record**, not the current runtime status.

## Time, quality, and provenance

Observation timestamps and query bounds are elapsed seconds from the start of the VitalDB case (`seconds_since_case_start`). Event timestamps are converted from source Unix times using the raw file's `dtstart`; original record values, source track, unit, dataset version, and raw checksum are retained in response provenance. NaN/invalid samples return `value: null`, `is_missing: true`, and missing quality; no physiological zero is inserted.

Prediction requests are prospective: the builder cuts a model window ending at `prediction_time_s`, validates the fixed training-time feature order, and rejects future data through the existing inference contract. Missing required artifacts or an unavailable model return explicit readiness errors; an otherwise ready UC05 model abstains when an individual window fails the strict modality gate.

## Local configuration

Copy `backend/.env.example` to a local environment file or set the variables in the shell. `SAFEANES_DATA_ROOT` points to the populated data directory; `SAFEANES_MODEL_ROOT` points to the trusted sibling `model` directory. CORS is disabled by default. When configured, `SAFEANES_CORS_ORIGINS` must contain explicit `http(s)` origins; wildcard origins are rejected.

Install and run from the repository root:

```powershell
python -m pip install -r backend/requirements-api.txt
python -m pip install -r backend/requirements-ml.txt
$env:SAFEANES_DATA_ROOT = (Resolve-Path backend/data).Path
$env:SAFEANES_MODEL_ROOT = (Resolve-Path ..\model).Path
$env:SAFEANES_CORS_ORIGINS = 'http://localhost:3000'
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

The model artifacts and data cache are not copied into the source tree/image by the Dockerfile. Build from the repository root and mount those directories read-only:

```powershell
docker build -f backend/Dockerfile -t safeanes-backend .
docker run --rm -p 8000:8000 `
  -e SAFEANES_CORS_ORIGINS=http://localhost:3000 `
  -v "${PWD}/backend/data:/app/data:ro" `
  -v "${PWD}/../model:/models:ro" safeanes-backend
```

The `/api/v1/health/ready` endpoint returns 503 while a required model or the
configured dataset is blocked or not loaded; `/api/v1/health/live` reports
process liveness separately. Model readiness and prediction-cache readiness
remain distinct in view responses and replay snapshots.
