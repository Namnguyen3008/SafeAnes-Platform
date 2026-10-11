# Troubleshooting

## `/health/live` is 200 but `/health/ready` is 503

These routes intentionally mean different things. Liveness reports whether
FastAPI is responding. Readiness reports the catalog, locally available case
cache, and both model contracts. With the verified artifacts and cache, both
UC04 and UC05 report `INTEGRATION_READY` under the strict UC05 schema gate.
HTTP 503 means a required catalog/cache/artifact prerequisite is unavailable;
it is not the former UC05 contract-mismatch status. Check
`/api/v1/models` for per-model status and remember that an otherwise ready
model can abstain on an ineligible individual window.

## A model shows `MODEL_NOT_READY`

Check `UC04_MODEL_PATH`, `UC05_MODEL_PATH`, and `MODEL_REGISTRY_PATH` in `.env`.
Checkpoint paths must name the original `.pt` file; model sidecars must remain
beside it. Run:

```powershell
.\scripts\initialize-local.ps1 -RequireRuntimeArtifacts
```

It verifies the configured checkpoint and sidecar hashes. The public status
does not reveal local paths; inspect backend logs on the host for the specific
artifact error. Do not alter the registered checksum to clear the status.

## Case list is empty or case data is unavailable

Verify the configured data root contains
`manifests/vitaldb_case_catalog.json`, a per-case manifest, and the matching
raw `.vital` file. A catalog entry without a locally cached raw file is not
replay-ready. Run the documented discovery/ingestion pipeline once on the
host; service startup does not fetch records. Raw checksums are checked before
parsing.

## Docker cannot build or start

1. Start Docker Desktop and switch to Linux containers.
2. Confirm `docker info` shows a server section.
3. Confirm `.env` exists and both bind-mount source paths exist.
4. Validate interpolation with `docker compose config --quiet`.
5. Inspect services with `docker compose ps` and logs with
   `docker compose logs --tail 100 backend frontend`.

The backend healthcheck probes liveness; model readiness may still be 503.
If the backend is restarting, inspect startup logs for model hash, missing
sidecar, data mount, or device configuration errors.

## Frontend reports backend unavailable

Confirm the backend is listening on port 8000 and the browser uses the
Next.js same-origin `/api/backend/v1` proxy. For local development,
`SAFEANES_API_URL` should be `http://127.0.0.1:8000`. In Compose it must be
`http://backend:8000`. In production, `SAFEANES_BACKEND_API_TOKEN` must match
`SAFEANES_API_TOKEN`; the secret is server-only and not a `NEXT_PUBLIC_*`
variable.

## CUDA or PyTorch install issues

The supported documented configuration is CPU-only. Use Python 3.12 and the
CPU wheel command in local setup. CUDA support and GPU Docker execution have
not been validated. A CUDA request fails startup rather than silently falling
back to CPU.

## Permission or port conflicts

Ports 3000 and 8000 are bound to loopback for local use. Stop an older process
or choose another host port in Compose. The API container runs as an unprivileged
user and mounts model/data files read-only; fix host mount permissions rather
than changing the container to root.


## Isolated full-stack verifier failures

`verify-local-fullstack.ps1 -DryRun` fails before starting children when ports overlap, either port is occupied/unavailable, the case ID is not positive, or local `.env` is missing. Choose distinct free ports or stop the process you own; the verifier never stops an unrelated listener.

A failed backend identity check means the endpoint did not identify this SafeAnes service or supply a valid build ID. A timeout may indicate missing Python/npm dependencies, invalid local configuration, or startup failure. Launch the ordinary local scripts to inspect private service logs; the verifier deliberately suppresses child output and never echoes authentication headers, secrets or artifact paths.

Catalog/cache/model readiness are separate reported prerequisites. HTTP 503 is expected when any catalog, dataset cache, UC04 or UC05 requirement is unavailable. An absent selected case or uncached raw file must be resolved through the existing local ingestion/setup flow. The verifier performs no downloads and supplies no substitute predictions. Per-case model eligibility remains distinct from global model readiness.

The command terminates only children it started in `finally` and reports their exit codes. It is a bounded startup smoke command, so services do not stay running afterward. Exit 0 verifies its startup/API probes only; end-to-end replay and inference require the documented integration suite.

## Existing `:3000` app conflicts with the verifier

The isolated verifier does not use the regular `.next` development cache. It
sets a generated, validated `SAFEANES_NEXT_DIST_DIR` matching
`.next-safeanes-<suffix>` for its frontend child, so the test-owned Next.js
process has its own lock and build output. Do not point that variable at an
absolute path, a parent directory, or an arbitrary `.next` name; the launcher
rejects values outside the safe basename pattern.

The verifier also uses an owned temporary `.tsconfig-safeanes-launcher-*.json`
because Next.js writes generated route-type includes into its active tsconfig.
It removes the scratch file after all owned child processes stop and does not
modify the repository `tsconfig.json`. If cleanup cannot verify that those
processes stopped, the run fails and leaves its temporary artifacts for safe
inspection rather than removing files while Next may still use them.

The launcher validates `SAFEANES_API_TOKEN` against
`SAFEANES_BACKEND_API_TOKEN` before starting children. If either value is set,
the two values must be identical. The launcher also checks
`/api/backend/v1/health/live` through the frontend proxy and requires the same
backend identity/build ID as the direct API probe. A mismatch fails with a
sanitized message and never prints the token.

To run the browser suite, add `-RunIntegrationTests` after the API/frontend
probes are known to be usable. Add `-RunVisualTests` to run the workstation
visual suite in that same frontend process; both switches can be used together.
Each suite receives the same test-owned loopback ports through
`PLAYWRIGHT_BASE_URL` and `SAFEANES_API_BASE_URL`; test artifacts remain under
`test-results/integration/` and `test-results/visual/`. The verifier reports a
sanitized failure and retains those artifacts for inspection without printing
child logs or secrets. The launcher quotes npm/npx and output paths, so a
Node.js installation under a path containing spaces is supported. Integration
waits scale to at least 10 minutes and visual runs to at least 15 minutes,
with a bounded 30-minute maximum.

For measured replay/frame behavior, use the separate `-RunWaveformProfile`
switch. It requires cached VitalDB case 6388 and both UC04/UC05 waveforms to be
available. A missing trace or stalled cursor fails the profile; outputs are
preserved under `test-results/waveform-performance/` for inspection.
