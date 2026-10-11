# Local development on Windows

## Requirements

- Windows PowerShell 5.1 or PowerShell 7.
- Node.js 24 and npm (the lockfile is installed with `npm ci`).
- Python 3.12, 64-bit.
- The selected VitalDB files, manifests, and catalog under the configured data root.
- The original UC04/UC05 model directories with all checksum-registered sidecars.

The tested model runtime is Python 3.12.4 with PyTorch 2.14.1 CPU, NumPy
2.5.3, Pandas 3.0.6, SciPy 1.18.1, and VitalDB 1.7.2. CUDA was not verified.
Install the CPU wheel from the official PyTorch index using the
[PyTorch local installation guide](https://docs.pytorch.org/get-started/locally/).

## Configure the local paths

From the repository root:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set these paths for the machine. The checked-in example points to the current
workspace's sibling `model` directory; a fresh clone should change them to the
location where the owner-provided artifacts and selected VitalDB cache were
placed.

```dotenv
SAFEANES_DATA_ROOT=./backend/data
SAFEANES_MODEL_ROOT=../model
UC04_MODEL_PATH=../model/safeanes_uc04_model/model.pt
UC05_MODEL_PATH=../model/safeanes_uc05_respformer_v1/respformer.pt
MODEL_REGISTRY_PATH=./backend/app/ml/registry/model_registry.json
```

Paths in `.env` are resolved from the repository root. Model files are read
only by the inference service; each checkpoint and sidecar is verified against
the committed audited SHA-256 allowlist before use. Never change registry
hashes to make an unverified artifact load.

Run setup checks without downloading any records:

```powershell
.\scripts\initialize-local.ps1
```

Add `-RequireRuntimeArtifacts` to fail the check when the configured model
files or at least one cached VitalDB case are missing. This script only
checks local files; it does not download model or dataset files.

## Install and launch

Create a virtual environment and install the API and tested CPU ML runtime:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install --index-url https://download.pytorch.org/whl/cpu 'torch==2.14.1+cpu'
python -m pip install -r backend/requirements-api.txt -r backend/requirements-ml.txt
python -m pip install -r backend/requirements-api-test.txt
```

Run these in two PowerShell terminals from the repository root:

```powershell
.\scripts\run-local.ps1 backend
```

```powershell
npm ci
.\scripts\run-local.ps1 frontend
```

The backend binds to `127.0.0.1:8000`; Next.js binds to its development
default `localhost:3000`. The browser uses a same-origin Next.js API proxy, so
the backend URL and any service token stay on the server. Local `.env` settings
are loaded by the scripts. Stop each process with Ctrl+C in its terminal.

## Smoke checks

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health/live
Invoke-RestMethod http://127.0.0.1:8000/api/v1/models
Invoke-WebRequest http://127.0.0.1:8000/api/v1/health/ready -SkipHttpErrorCheck
```

The readiness endpoint should report the configured dataset and model state.
With the verified artifacts and cache, both UC04 and UC05 report
`INTEGRATION_READY` under the strict UC05 schema gate. HTTP 503 remains correct
when a required artifact, supporting contract, or dataset cache is unavailable;
the liveness endpoint can still return HTTP 200. Model readiness is separate
from case and per-window eligibility.

To run the opted-in actual checkpoint/VitalDB forward smoke:

```powershell
$env:SAFEANES_MODEL_ROOT = (Resolve-Path ..\model).Path
$env:SAFEANES_RUN_VITALDB_SMOKE = '1'
python -m pytest backend/tests/test_vitaldb_smoke.py -q -s
```

UC05 in this smoke uses the strict exported signal schema. A window missing
valid SpO₂ history, capnogram, AWP, or PPG abstains explicitly; no override or
synthetic waveform is used. This verifies technical inference only and is not
clinical validation.


## Isolated checkout verification (opt-in)

The verifier uses this checkout, local `.env`, existing model artifacts and cached records. It starts hidden backend/frontend child processes on separate loopback ports and stops only its own process trees when checks finish. It does not download data, run Docker, or change your currently running services.

Check arguments and port availability without starting children:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-local-fullstack.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-local-fullstack.tests.ps1
```

Run the service/API probes after local initialization:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-local-fullstack.ps1 -CaseId 6388 -ApiPort 8100 -FrontendPort 3100
```

Defaults are case 6388, API 8100, frontend 3100 and a 90-second wait per service (`-TimeoutSeconds`, 5 to 300). Ports must be distinct, 1024 to 65535, and available before any child starts. The backend runs `.venv` Python when available, with this repository on `PYTHONPATH`; Next.js receives `SAFEANES_API_URL` pointing at the selected API port. Configuration is passed per child without echoing values or changing the caller's environment.

The verifier requires `safeanes-backend` identity and a safe build ID, then
polls the frontend proxy, model list, catalog and selected case within the
bounded service timeout. It reports catalog, dataset cache, model readiness,
case eligibility/cache and owned child exit codes separately.
`SAFEANES_API_TOKEN` and `SAFEANES_BACKEND_API_TOKEN` must match exactly when
either is configured; token values are never printed. Each child receives a
strict allowlisted environment with only required Windows runtime variables
plus its own application settings. `/health/ready` retains the joint
catalog/cache/both-model gate. Exit 0 means these startup probes passed; it
does not establish actual model-forward, browser replay, waveform parity or
clinical validation. Those require the separate integration/release suites.
Exit 1 is a sanitized failure; child logs are suppressed to avoid printing
sensitive configuration or paths. The generated launcher Next directory is
removed only after owned process trees are verified stopped. Use the ordinary
local launch scripts to inspect service errors privately.

The verifier gives its test-owned Next.js process a generated
`SAFEANES_NEXT_DIST_DIR` such as `.next-safeanes-launcher-<suffix>`. The value
is validated as a local basename before Next.js starts, so its dev/build lock
and cache cannot collide with an already running SafeAnes app using `.next`.
The ordinary `npm run dev` workflow remains on `.next` unless this variable is
explicitly set to a valid `.next-safeanes-<suffix>` value.

Next.js may add generated route-type globs to the TypeScript config it uses.
The verifier therefore copies `tsconfig.json` to an owned
`.tsconfig-safeanes-launcher-<suffix>.json`, points Next at that scratch file
with `SAFEANES_TSCONFIG_PATH`, and removes it only after its child processes
stop. The project `tsconfig.json` is left unchanged; the scratch filename is
ignored by Git as a cleanup safeguard.

After the startup/API and strict readiness gates pass, the existing API-to-UI
Playwright suite can be included explicitly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-local-fullstack.ps1 `
  -CaseId 6388 -ApiPort 8100 -FrontendPort 3100 -RunIntegrationTests
```

The workstation visual suite can be included in the same isolated frontend
run. Both switches may be supplied together, and the frontend/API ports and
generated Next.js output directory are shared for the entire invocation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-local-fullstack.ps1 `
  -CaseId 6388 -ApiPort 8100 -FrontendPort 3100 `
  -RunIntegrationTests -RunVisualTests
```

The launcher passes `PLAYWRIGHT_BASE_URL` and `SAFEANES_API_BASE_URL` only to
the test runners, keeps the existing `test-results/integration/` and
`test-results/visual/` artifacts, and does not delete them. Each runner's
output is kept in its launcher-owned log and the console reports only a
sanitized pass/fail status. A failure still cleans up only the backend,
frontend, and test child trees started by this invocation; it does not touch
an existing process on `:3000` or any other unrelated process. Use the
preflight harness first when you are not ready to run the suites.

To capture browser-side waveform timing on real cached case 6388 at 1x/10x/30x/60x,
run the separate opt-in profile. It records UC05 capnogram/pleth and UC04 ABP
frame intervals, trace visibility and case-time advance three times per speed
under `test-results/waveform-performance/`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-local-fullstack.ps1 `
  -CaseId 6388 -ApiPort 8100 -FrontendPort 3100 -RunWaveformProfile
```

The profile is engineering telemetry for the renderer only; it does not assess
clinical waveform validity.

Browser waits are bounded for workstation-scale runs: the integration suite
gets at least 10 minutes and the visual matrix gets at least 15 minutes at the
default startup timeout, with a 30-minute upper bound. The launcher quotes
the discovered `npm`/`npx` executable and artifact paths for Windows
installations under directories such as `Program Files`.

The preflight harness verifies free/distinct ports, invalid arguments and each occupied port, and ensures an unrelated listener remains running. Full service launch and cleanup verification are separate release checks.


The preflight harness was verified under Windows PowerShell 5.1 and PowerShell 7.6.5. It invokes the same shell edition for its child dry-runs and allocates dynamic loopback test ports. To run it with PowerShell 7:

```powershell
pwsh -NoProfile -File scripts/verify-local-fullstack.tests.ps1
pwsh -NoProfile -File scripts/verify-local-fullstack.ps1 -DryRun
```

These cross-version checks exercised preflight only; they did not start services.
