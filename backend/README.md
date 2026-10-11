# SafeAnes model inference package

This package executes the allowlisted UC04 and UC05 checkpoints from the local
`model` directory. It does not train, download, or replace model artifacts.

Install the CPU runtime from this folder with:

```powershell
python -m pip install -r requirements-ml.txt
python -m pip install -r requirements-ml-test.txt
```

The tested local environment is Python 3.12.4, PyTorch 2.14.1+cpu, NumPy
2.5.3, pandas 3.0.6, SciPy 1.18.1, VitalDB 1.7.2, and pytest 9.1.1. The
training package versions were not supplied, so these pins describe the tested
inference runtime, not a recovered training lockfile.

Set `SAFEANES_MODEL_ROOT` to the trusted model directory when it is not the
sibling `model` directory. The registry checks the path against a fixed
allowlist and verifies SHA-256 before loading a checkpoint with
`torch.load(weights_only=True)`.

`VitalDBWindowLoader.load_window(model_id, case_id, prediction_time_s)` builds
half-open, time-bounded input windows. It requires the VitalDB metadata API and
Python package. `UC04InferenceService` and `UC05InferenceService` each require
an explicit `load_model()` call before `predict_window(window)`.

Discover and validate real cases against the model preprocessing contracts:

```powershell
python backend/scripts/discover_vitaldb_cases.py --inspection-budget 80
```

The command uses `find_cases()` only to form candidate sets, then validates
30-second-stride windows through the UC04/UC05 preprocessing gates. Selected
official `.vital` records are stored write-once in `backend/data/vitaldb/raw/`;
case manifests and the frontend-facing catalog are generated under
`backend/data/vitaldb/manifests/` and `backend/data/manifests/`. The default
inspection budget is deterministic; uninspected candidate IDs remain
unverified. UC05 eligibility requires valid SpO₂, capnogram, AWP, and PPG.

Run unit tests from the repository root:

```powershell
python -m pytest backend/tests -q
```

The public VitalDB forward smoke is opt-in because it needs network access:

```powershell
$env:SAFEANES_RUN_VITALDB_SMOKE = '1'
python -m pytest backend/tests/test_vitaldb_smoke.py -q -s
```

UC05 loads with `readiness_status = INTEGRATION_READY` when its trusted checkpoint
and sidecars pass verification. Every inference window still requires valid
SpO₂, capnogram, AWP, and PPG; missing any required signal causes abstention.
See the UC05 model contract for the strict production input rule and remaining
model-validation limits.

## FastAPI service

Install the API runtime in addition to the ML runtime, then start the local
service from the repository root:

```powershell
python -m pip install -r backend/requirements-api.txt
python -m pip install -r backend/requirements-ml.txt
$env:SAFEANES_DATA_ROOT = (Resolve-Path backend/data).Path
$env:SAFEANES_MODEL_ROOT = (Resolve-Path ..\model).Path
$env:SAFEANES_CORS_ORIGINS = 'http://localhost:3000'
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Open `/docs` for interactive API docs. The checked OpenAPI contract is
`backend/openapi.json`; architecture, local configuration, routes, errors,
time conventions, and Docker usage are in
`docs/integration/SAFEANES_BACKEND_ARCHITECTURE.md` and
`docs/integration/SAFEANES_BACKEND_API.md`. Replay sessions are in-memory, so
the provided deployment configuration uses one worker per service instance.
