# SafeAnes

SafeAnes is a Next.js clinical workstation UI backed by a FastAPI service for
retrospective VitalDB replay and checksum-verified UC04/UC05 model artifacts.
It is a software demonstration and research integration; it is not a live
patient monitor or clinically validated decision support system.

## Start locally on Windows

1. Install Node.js 24, Python 3.12, and the CPU PyTorch runtime described in
   [Local development](docs/LOCAL_DEVELOPMENT.md).
2. Put the audited model directories outside the repository and update
   `UC04_MODEL_PATH`, `UC05_MODEL_PATH`, and `SAFEANES_MODEL_ROOT` in `.env`.
3. Run:

   ```powershell
   Copy-Item .env.example .env
   .\scripts\initialize-local.ps1
   ```

4. Start the backend and frontend in separate PowerShell terminals:

   ```powershell
   .\scripts\run-local.ps1 backend
   .\scripts\run-local.ps1 frontend
   ```

Open <http://localhost:3000/safeanes>. The backend API is at
<http://127.0.0.1:8000>; API documentation is at `/docs` in local mode.

## Start with Docker Compose

Start Docker Desktop, configure `.env` paths for the local VitalDB cache and
trusted model directory, then run:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

The two services bind to localhost. Data and model artifacts are mounted at
runtime; recordings and checkpoints are excluded from the build context and
images. See [deployment](docs/DEPLOYMENT.md) for the exact mount and readiness
behavior.

## Readiness note

UC04 is technically inference-ready with the audited CPU artifact. The UC05
checkpoint loads and runs diagnostically, but production inference remains
blocked because the exported required-modality schema conflicts with its
training stream evaluator. Accordingly, `/api/v1/health/ready` returns 503
until that model contract is resolved. Liveness and UC04 status remain
available, and failures are not replaced by synthetic predictions.

## Documentation

- [Local development](docs/LOCAL_DEVELOPMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [API](docs/API.md)
- [Models](docs/MODELS.md)
- [VitalDB data](docs/VITALDB.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Case selection report](docs/integration/CASE_SELECTION_REPORT.md)
- [End-to-end validation](docs/validation/END_TO_END_REPORT.md)
