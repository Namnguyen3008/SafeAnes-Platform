# Docker deployment

## Local Compose

The repository Compose setup is deliberately loopback-only and mounts data and
model files from the host. It does not include either `.vital` recordings or
`.pt` checkpoints in an image.

```powershell
Copy-Item .env.example .env
# Edit SAFEANES_DATA_HOST_PATH and MODEL_ARTIFACTS_DIR if needed.
docker compose config --quiet
docker compose up --build
```

Open <http://localhost:3000/safeanes>. Backend liveness is
<http://127.0.0.1:8000/api/v1/health/live>. Compose healthchecks use liveness,
not full model readiness, so the UI can report individual model blockers
without causing Docker to restart a healthy web process. `/health/ready`
remains authoritative for the complete backend readiness result.

The Compose service limits are 4 CPU / 4 GiB / 256 processes for the backend
and 2 CPU / 1 GiB / 128 processes for the frontend. Adjust them only after
measuring on the target host. The API uses one worker because replay sessions
are in-memory and process-local.

## Images and mounts

- `frontend/Dockerfile` uses dependency, build, and slim runtime stages and
  Next.js standalone output.
- `backend/Dockerfile` uses Python 3.12 slim and the verified CPU-only PyTorch
  wheel. It creates a non-root runtime user.
- `SAFEANES_DATA_HOST_PATH` mounts the local VitalDB cache read-only at
  `/app/data`.
- `MODEL_ARTIFACTS_DIR` mounts the trusted external model directory read-only
  at `/models`.
- The backend image includes application code and the small model registry
  manifest, but no raw dataset or checkpoint.
- `.dockerignore` prevents local artifacts, caches, `.env`, and large files
  from entering the build context.

The container paths are configured in Compose. For standalone deployments,
set `SAFEANES_DATA_ROOT`, `SAFEANES_MODEL_ROOT`, `UC04_MODEL_PATH`,
`UC05_MODEL_PATH`, and `MODEL_REGISTRY_PATH` to the mounted locations. Startup
hash validation blocks files that do not match the audited registry.

## External access and secrets

Compose publishes both ports only on `127.0.0.1`. Keep them loopback-bound
unless an authenticated edge is configured. For a host reachable outside
local development:

1. Put a TLS reverse proxy with user authentication/authorization in front of
   the frontend.
2. Keep the FastAPI service private to the compose network or loopback.
3. Set `SAFEANES_ENV=production` and a random `SAFEANES_API_TOKEN` of at least
   16 characters. Set the same value as `SAFEANES_BACKEND_API_TOKEN` for the
   Next.js server-side proxy. The token is never sent to the browser.
4. Configure exact `SAFEANES_ALLOWED_HOSTS` and explicit CORS origins for the
   deployed host. Wildcard CORS is rejected.
5. Store secrets in the deployment secret manager, not `.env`, source control,
   Docker build args, or image layers.

In production the backend rejects protected API requests without the bearer
token, hides interactive OpenAPI documentation routes, and returns generic
errors. `/health/live` and `/health/ready` remain unauthenticated for platform
health probes. The reverse proxy is the user-level access boundary; the
backend token protects the frontend-to-API service boundary.

## Readiness and deployment status

Liveness answers whether the API process responds. Readiness separately
reports the case catalog, locally cached cases, UC04, and UC05. In the verified
configured runtime, `/health/ready` returns HTTP 200 with `ready: true`, and
both model statuses are `INTEGRATION_READY` under the strict UC05 schema gate.
An individual prediction window can still abstain when required input quality
or modality coverage is insufficient. HTTP 503 remains appropriate when a
required artifact, supporting contract, dataset cache, or catalog prerequisite
is unavailable; that failure state is distinct from per-window abstention.

Docker build, Compose startup, container health, and network-to-host mounting
must be verified on the target Docker host; they are not proven by a successful
frontend or backend build. The current workstation's Docker daemon was not
running during this setup pass.

## Linux and GPU

Paths are environment-driven and POSIX-compatible in the Linux containers.
The checked runtime uses CPU PyTorch `2.14.1+cpu`; CPU forward passes have been
verified on the Windows Python runtime. Linux Docker execution remains
unverified until images are built and run on a working Docker daemon. CUDA/GPU
execution has not been tested and is not configured by these images.
