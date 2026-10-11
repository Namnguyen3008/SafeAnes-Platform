# SafeAnes Full-Stack Provenance and Replay QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure SafeAnes end-to-end checks use this repository's frontend and backend, configured VitalDB cache, and checksum-verified model artifacts.

**Architecture:** Add a path-free runtime identity to the existing health contract, then create an opt-in full-stack smoke workflow that launches the checked-out backend and frontend under test-owned ports. Playwright verifies visible replay state against the same API and terminates both processes after the run.

**Tech Stack:** FastAPI, Pydantic, PowerShell, Next.js, TypeScript, Playwright, pytest, local VitalDB cache, PyTorch.

**Spec:** `docs/LOCAL_DEVELOPMENT.md`; `docs/DEPLOYMENT.md`; `docs/API.md`; `docs/validation/END_TO_END_REPORT.md`; `docs/validation/REPLAY_VALIDATION.md`; `docs/design/FINAL_FIGMA_UI_QA.md`.

## Global Constraints

- Do not expose absolute model/data paths, tokens, patient identifiers, or secrets in health responses, browser UI, or logs.
- Run the backend from this SafeAnes checkout and use only configured local model/data directories.
- Keep real replay case-relative and prospective; filter every observation and prediction by the canonical cursor.
- Do not display real-mode model values unless their API response supplies them.
- Do not turn VitalDB source gaps or unknown quality into normal measurements.
- Do not alter clinical page layouts to show engineering diagnostics; keep any runtime identity in the existing simulation/status control.
- Do not download all VitalDB records or model artifacts as part of tests or builds.

---

### Task 1: Add a path-free backend identity contract

**Files:**
- Create: `backend/app/core/build_info.py`
- Modify: `backend/app/api/routes/health.py`
- Modify: `backend/app/schemas/api.py`
- Modify: `backend/app/core/config.py`
- Modify: `src/lib/api/safeanesClient.ts`
- Test: `backend/tests/test_api_backend.py`
- Test: `backend/tests/test_runtime_configuration.py`
- Test: `tests/safeanes-client.test.cjs`

**Interfaces:**
- `get_backend_build_id() -> str`: returns an explicit `SAFEANES_BUILD_ID` when set; otherwise computes a stable SHA-256 over sorted `backend/app/**/*.py` relative names and bytes.
- `HealthResponse`: adds `service_name: "safeanes-backend"` and `build_id: string` without changing liveness/readiness semantics.
- `HealthResponse` TypeScript interface: carries the same two additive fields.

- [x] **Step 1: Add a failing test that `/api/v1/health/live` returns a stable build ID and the SafeAnes service name.**

```python
assert body["service_name"] == "safeanes-backend"
assert body["build_id"] == get_backend_build_id()
assert str(settings.model_root) not in response.text
assert str(settings.data_root) not in response.text
```

- [x] **Step 2: Add a test that an explicit `SAFEANES_BUILD_ID` takes precedence and rejects an empty value.**
- [x] **Step 3: Implement the build fingerprint over normalized relative file names and file bytes.** Never include the absolute checkout path in the digest input or response.
- [x] **Step 4: Add the fields to `/health/live` and its Pydantic/TypeScript response types.** Keep `/health/ready` component checks unchanged.
- [x] **Step 5: Run focused API/config/client tests.**

Run: `.\.venv\Scripts\python.exe -m pytest backend/tests/test_api_backend.py backend/tests/test_runtime_configuration.py -q`

Run: `node --test tests/safeanes-client.test.cjs`

---

### Task 2: Create an opt-in local full-stack verification script

**Files:**
- Create: `scripts/verify-local-fullstack.ps1`
- Modify: `docs/LOCAL_DEVELOPMENT.md`
- Modify: `docs/TROUBLESHOOTING.md`
- Read: `scripts/run-local.ps1`
- Read: `.env.example`

**Interfaces:**
- Script accepts `-CaseId`, `-ApiPort`, and `-FrontendPort`; defaults to case `6388`, API `8100`, and frontend `3100`.
- Script starts `python -m uvicorn backend.app.main:app` with the current repository root on `PYTHONPATH`, starts `npm run dev` from the current root with the API base URL set to the selected API port, waits for health, and stops only its own child processes in `finally`.
- Script prints endpoint status, build ID, case ID, model readiness labels, and exit codes; it never prints environment secrets or filesystem paths.
- `/health/ready` retains the existing joint gate: catalog ready, dataset cache ready, and both UC04/UC05 inference ready. The launcher reports catalog/cache/model statuses separately; liveness alone is insufficient.

- [x] **Step 1: Add PowerShell tests or a dry-run mode test that validates port arguments and refuses an already occupied port before starting children.**
- [x] **Step 2: Implement the process launcher with a repository-root working directory and per-process environment variables.** Do not call `docker compose` or download artifacts from this smoke script.
- [x] **Step 3: Poll `/api/v1/health/live` and require `service_name == "safeanes-backend"`; fail early if another app answers.**
- [x] **Step 4: Poll `/api/v1/models`, `/api/v1/cases`, and the selected case details.** Report model readiness, case eligibility, and cache readiness as separate fields.
- [x] **Step 5: Implement `finally` cleanup for only the process IDs started by this script.** Do not kill unrelated Node/Python processes.
- [x] **Step 6: Document exact PowerShell invocation and failure meanings.**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-local-fullstack.ps1 -CaseId 6388`

#### Task 2 follow-up: isolate launcher output and opt-in browser runners

- [x] The launcher assigns each frontend child a generated
  `SAFEANES_NEXT_DIST_DIR` matching `.next-safeanes-<suffix>`; the root Next
  config validates explicit values and `.gitignore` covers generated output.
- [x] `-RunIntegrationTests` runs the existing integration suite only after
  the test-owned API/frontend readiness gates, passes both loopback origins,
  preserves `test-results/integration/`, and cleans only launcher-owned trees.
- [x] `-RunVisualTests` runs `npm run test:visual` against the same live
  frontend/API ports and generated Next output; both switches may be combined,
  and `test-results/visual/` is preserved.
- [x] Focused distDir tests and launcher preflight tests pass under Windows
  PowerShell 5.1 and PowerShell 7.6.5.
- [x] Independent review hardening clears inherited child environment values,
  preserves only required Windows runtime variables, validates backend/proxy
  token pairing, and probes the frontend backend-health proxy.
- [x] Model/catalog/case probes use bounded polling; cleanup verifies owned
  process trees and removes only the exact generated distDir child after the
  checkout path is resolved.
- [x] The hardening harness covers environment omission, token mismatch,
  space-containing command paths, timeout bounds, process cleanup and safe
  distDir cleanup without starting application services.
- [x] Full integration and visual suites were run through the test-owned
  release-smoke launcher; current results are recorded in Task 5 and the
  validation reports.
- [x] The launcher now directs Next.js to an owned temporary tsconfig so
  generated route types cannot mutate the project `tsconfig.json`; the scratch
  config is removed after owned child processes stop.

---

### Task 3: Add API-to-UI replay parity coverage

**Files:**
- Create: `tests/integration/playwright.config.ts`
- Create: `tests/integration/vitaldb-replay.spec.ts`
- Modify: `src/lib/api/safeanesClient.ts` only if response contract gaps are found
- Read: `tests/visual/playwright.config.ts`
- Read: `src/context/UC04VitalDbContext.tsx`
- Read: `src/adapters/uc04VitalDbAdapter.ts`
- Read: `src/adapters/uc05VitalDbAdapter.ts`

**Interfaces:**
- Integration config uses `PLAYWRIGHT_BASE_URL` and `SAFEANES_API_BASE_URL` to target only the test-owned services started by Task 2.
- Test reads case, session, UC04 view, and UC05 view through the typed client and compares them with the rendered header, model panels, and waveform timestamp.

- [x] **Step 1: Add a test that starts with case `6388`, seeks to `1025s`, and asserts the header and both workspace contexts show `00:17:05`.**
- [x] **Step 2: Query the API for both UC views at `as_of_s=1025`.** Assert every returned observation and prediction timestamp is `<=1025` and each latest prediction matches the UI text to its rendered precision.
- [x] **Step 3: Navigate Overview → UC01 → UC04 → UC05, switch EN to VI, and assert the case/time/source remain unchanged.**
- [x] **Step 4: Switch to case `3300` and assert the cursor resets to `0s`, selected event clears, and old case predictions disappear.**
- [x] **Step 5: Add failure-state coverage for an unavailable API, a blocked model, and an ineligible case.** Assert the UI shows the existing explicit status and never uses synthetic values as a fallback.
- [x] **Step 6: Run the integration suite with the Task 2 launcher and preserve its test artifacts under `test-results/integration/`.** Six integration tests passed; artifacts remain under `test-results/integration/`.

Run: `npx playwright test --config tests/integration/playwright.config.ts`

---

### Task 4: Automate the workstation visual matrix without changing layout

**Files:**
- Modify: `tests/visual/playwright.config.ts`
- Modify: `tests/visual/workspaces.spec.ts`
- Create: `tests/visual/workstation-matrix.spec.ts`
- Modify: `docs/design/FINAL_FIGMA_UI_QA.md`

**Interfaces:**
- The matrix covers Overview and UC01–UC05, EN and VI, at 1920×1080, 1680×1050, 1600×900, 1440×900, 1366×768, and 1280×720.
- Screenshots use the existing SafeAnes synthetic fixture for stable rendering; the integration plan separately verifies real VitalDB content and provenance.

- [x] **Step 1: Add viewport fixtures with named IDs for all six supported workstation sizes and assert document scroll width never exceeds viewport width.**
- [x] **Step 2: Capture each route and locale at the six requested sizes using the established Playwright screenshot tolerance.**
- [x] **Step 3: Add targeted assertions for UC02 evidence, UC03 alert action labels, UC04 model/measurement separation, and UC05 waveform plot width at 1280×720.**
- [x] **Step 4: Run the visual suite and inspect every new diff before updating baselines.** Nine visual tests passed; no baseline was changed during the matrix run. The pre-existing Overview VI baseline was corrected only after visual inspection confirmed it contained the wrong workspace.
- [x] **Step 5: Update the UI QA report with the automated coverage and separately state that Figma comparison remains unverified while frame context is unavailable.**

Run: `npm run test:visual`

---

### Task 5: Run a single-checkout full-stack release smoke

**Files:**
- Test: `tests/integration/vitaldb-replay.spec.ts`
- Test: `backend/tests/test_api_backend.py`
- Test: `tests/visual/workstation-matrix.spec.ts`
- Modify: `docs/validation/END_TO_END_REPORT.md`
- Modify: `docs/validation/REPLAY_VALIDATION.md`

- [x] **Step 1: Run the backend suite, opt-in checkpoint smoke, Node tests, visual suite, typecheck, and build from the same SafeAnes directory.** Configured backend suite: 152 passed/0 skipped; Node suite: 172 passed; visual suite: 9 passed; `npx tsc --noEmit`: passed; isolated production build: passed.
- [x] **Step 2: Run `scripts/verify-local-fullstack.ps1` and preserve its health/model/case summary.** Case 6388 was cache-ready and dual eligible; both model services reported `INTEGRATION_READY`; the six-test API/browser replay suite passed.
- [x] **Step 3: Confirm the backend build ID in `/health/live` belongs to this source tree's fingerprint.** The test-owned backend returned the source-derived build ID `f28662896aa1b64ac3ab8f0733fbac19599477009e0315cb6ad3dbf49e1f1666`.
- [x] **Step 4: Record API/browser parity values and the real selected case IDs used.** Replay at case 6388/1025s matched API observations and prediction output; switching to case 3300 reset cursor and cleared old event/model state.
- [x] **Step 5: Mark untested outage, Figma, and GPU items `NOT_VERIFIED`; do not infer a pass from frontend build success.** Figma pixel parity, GPU/Linux execution, WCAG contrast automation, full browser-outage injection, and waveform FPS/memory profiling remain unverified or belong to separate plans.

---
