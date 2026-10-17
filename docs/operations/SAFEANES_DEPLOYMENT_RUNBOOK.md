# SafeAnes deployment and release runbook

This runbook describes the release path and the checks required before a SafeAnes environment is treated as healthy. The request path is **browser → Vercel frontend/proxy → FastAPI on Render → Lambda inference**. The browser must never call the Lambda Function URL directly; the service token belongs only to server-side services.

## Release order

1. Open a pull request and wait for the `SafeAnes CI` workflow to pass. It builds the frontend, checks the selected backend contracts, and builds both container images without pushing or deploying them.
2. Merge to `main` only after review. Vercel deploys from its linked Git branch when auto-deploy is enabled. The Render Blueprint sets `autoDeployTrigger: commit`; verify the service is watching the intended branch and that the deploy completed successfully.
3. Release the Lambda image explicitly after CI. Record the Git build ID, ECR image digest, Lambda function name, and resulting deployment IDs before running smoke checks.
4. Run the liveness, readiness, authenticated Lambda contract, and full replay checks below. Promote or announce the release only when each check passes.

The current CI workflow excludes `test_uc05_ready_status_serves_eligible_fixed_window_contract_output` because the checked-in UC05 `config.json` digest does not match the model registry. Artifact integrity validation remains enabled. Treat model readiness and a successful staging inference as release gates until that artifact mismatch is resolved.

## Server-side configuration and secrets

Configure these values in their platform secret/environment settings. Do not commit secret values, put them in a `NEXT_PUBLIC_*` variable, include them in Docker build args, or copy them into logs or release reports.

| Service | Setting | Purpose |
| --- | --- | --- |
| Vercel | `SAFEANES_API_URL` | FastAPI base URL, normally the Render backend URL. |
| Vercel | `SAFEANES_BACKEND_API_TOKEN` | Server-side authorization from the Vercel API proxy to FastAPI. |
| Render | `SAFEANES_INFERENCE_SERVICE_TOKEN` | Bearer token used by FastAPI when it calls Lambda. The Blueprint declares it as an unsynchronized secret. |
| Lambda | `SAFEANES_INFERENCE_SERVICE_TOKEN` | Expected bearer token for `/predict/{model}` requests. It must match Render's value, supplied through the approved secret process. |

The Lambda smoke script reads `SAFEANES_INFERENCE_SERVICE_TOKEN` from its process environment and sends it only as an `Authorization: Bearer` header. It fails before making a request when the variable is absent. Never paste its value into a command line argument.

## Lambda image release

The release helper builds the image, pushes a build-specific ECR tag, resolves the immutable `sha256` digest, and updates the named function to that digest. It requires Docker, AWS CLI credentials with the needed ECR/Lambda permissions, and the repository's configured AWS account and region. `SAFEANES_BUILD_ID` is optional; when unset, the helper uses the current Git commit ID.

Always select a staging function explicitly for staging. The default function remains `safeanes-inference`, so omitting `--function-name` can update the default environment.

```powershell
$env:SAFEANES_BUILD_ID = (git rev-parse --short=12 HEAD).Trim()
python aws/scripts/deploy_lambda.py --function-name safeanes-inference-staging
```

Record the printed build ID, `sha256` digest, and immutable ECR reference. The helper does not print the service token. Do not run it against a production function until the production release is separately approved.

Before release, capture the currently deployed Lambda image reference for rollback:

```powershell
aws lambda get-function `
  --function-name safeanes-inference-staging `
  --region ap-southeast-1 `
  --query 'Code.ResolvedImageUri' `
  --output text
```

## Health and smoke checks

Use the Vercel deployment URL and the backend URL from the deployment configuration; do not infer that a build succeeded from the URL alone.

```powershell
Invoke-WebRequest -Uri "https://safeanes.vercel.app/safeanes" -UseBasicParsing
Invoke-RestMethod -Uri "https://<render-host>/api/v1/health/live"
Invoke-RestMethod -Uri "https://<render-host>/api/v1/health/ready"
```

Require HTTP 200 for the frontend and liveness route. Readiness must report the service ready and UC04/UC05 inference availability; a live HTTP process alone does not mean model artifacts loaded successfully. If readiness is false or an expected model is missing, stop and inspect the backend deploy logs and artifact checksums.

The Lambda smoke script checks Lambda `/health` and verifies that authenticated UC04/UC05 requests with missing prepared tensors are rejected with `PREPARED_TENSORS_REQUIRED`. This proves the auth and no-fabricated-prediction contract; it is not a positive model inference test.

```powershell
# Populate this process variable from the approved secret store without echoing it.
python aws/scripts/test_lambda_inference.py --url "https://<staging-lambda-function-url>/"
```

For positive inference, use the staging SafeAnes UI with an approved eligible replay case. Start replay and verify UC04 and UC05 results arrive through the FastAPI/SSE path with source `LIVE_INFERENCE`; a cached result must remain labelled `OFFLINE_CACHE`. Confirm waveform/replay SSE continues to advance while inference runs. A missing token, rejected input, unavailable model, or upstream error must be visible as an error and must never be represented by a sample prediction.

## Rollback

Stop promotion if any health, readiness, authenticated contract, live inference, provenance, or replay SSE check fails. Keep production unchanged while diagnosing a staging failure.

- **Vercel:** use the deployment dashboard to promote the last known-good deployment for the same project and environment.
- **Render:** use the service dashboard to roll back to the last known-good deploy, or redeploy the reviewed commit that produced it.
- **Lambda:** use the previously recorded immutable ECR digest, never a mutable `latest` tag:

```powershell
aws lambda update-function-code `
  --function-name safeanes-inference-staging `
  --image-uri "127091441306.dkr.ecr.ap-southeast-1.amazonaws.com/safeanes-inference@sha256:<previous-digest>" `
  --region ap-southeast-1
aws lambda wait function-updated-v2 --function-name safeanes-inference-staging --region ap-southeast-1
```

Re-run health and readiness after rollback, then record the failed build ID, candidate digest, last known-good deployment/digest, failed checks, and rollback verification. Keep token values and other credentials out of that record.
