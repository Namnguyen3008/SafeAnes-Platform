# SafeAnes Model Readiness and Output Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make UC04/UC05 readiness and model outputs consistent from the loaded checkpoint through the API and existing clinical panels.

**Architecture:** `ModelManager.status()` remains the runtime source of model readiness. Case-level signal eligibility stays a separate property. Health, prediction endpoints, replay snapshots, and frontend panels consume the same typed status and preserve explicit unavailable/abstained states.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, PyTorch, TypeScript, Next.js, pytest, Node test runner, Playwright.

**Spec:** `docs/MODELS.md`; `docs/integration/UC04_MODEL_CONTRACT.md`; `docs/integration/UC05_MODEL_CONTRACT.md`; `docs/validation/INFERENCE_VALIDATION.md`; `docs/validation/END_TO_END_REPORT.md`; `docs/design/SAFEANES_UI_AUDIT.md`.

## Global Constraints

- Keep the exact audited checkpoint hashes and safe tensor-only loading path.
- Do not resolve a status conflict by weakening UC05's four-signal strict input gate.
- Do not expose fabricated confidence, zero-risk placeholders, or predictions from the synthetic scenario in VitalDB mode.
- Separate model readiness, case eligibility, per-window input eligibility, and prediction availability.
- Preserve output task names, horizons, calibration status, and artifact hash from the verified contract.
- Keep all error responses structured and path-free.

---

### Task 1: Add a readiness contract regression matrix

**Files:**
- Modify: `backend/tests/test_api_backend.py`
- Modify: `backend/tests/test_runtime_configuration.py`
- Read: `backend/app/services/inference/model_manager.py`
- Read: `backend/app/api/routes/health.py`

**Interfaces:**
- Consumes: `ModelManager.status(model_id)` and `ModelManager.statuses()`.
- Produces: assertions that the same `inference_ready`, `readiness_status`, and `blockers` drive `/health/ready`, `/models/{model_id}/status`, and UC05 prediction responses.

- [x] **Step 1: Add a failing test for the blocked state.** Extend `test_uc05_diagnostic_cache_is_not_served_while_model_contract_is_blocked` so the response includes the runtime readiness status and blockers, and verify no predictions are returned.

```python
assert response.status_code == 503
assert response.json()["error"]["code"] == "MODEL_NOT_READY"
assert response.json()["error"]["details"]["readiness_status"] == "BLOCKED_CONTRACT_MISMATCH"
assert "predictions" not in response.json()
```

- [x] **Step 2: Add a passing-state API test using the existing test runtime.** Set its UC05 service to the already-tested ready state and provide an eligible fixed window; assert the returned model ID, task, horizons, `calibration_status`, and artifact hash match `UC05_CONTRACT`.
- [x] **Step 3: Add a health/status consistency test.** In `backend/tests/test_api_backend.py`, verify `/health/ready` cannot report ready when either model is blocked, and `/models` reports the identical readiness value.
- [x] **Step 4: Run the targeted tests and record the initial failures.**

Run: `.\.venv\Scripts\python.exe -m pytest backend/tests/test_api_backend.py backend/tests/test_runtime_configuration.py -q`

Expected before implementation: the new status-consistency assertion fails if any route computes or serializes a different readiness state.

---

### Task 2: Keep model readiness separate from case eligibility

**Files:**
- Modify: `backend/app/services/inference/model_manager.py`
- Modify: `backend/app/schemas/api.py`
- Modify: `backend/app/services/cases/service.py`
- Test: `backend/tests/test_ml_registry.py`
- Test: `backend/tests/test_api_backend.py`

**Interfaces:**
- Consumes: the compiled UC04/UC05 model contracts, verified artifact status, and existing catalog eligibility fields.
- Produces: `ModelStatusResponse` for loaded-model readiness and `CaseSummary` for per-case input eligibility; neither field is reused as the other.

- [x] **Step 1: Run existing contract tests before editing.** Confirm `test_registry_contracts_pin_the_audited_checkpoint_digests`, `test_uc05_requires_all_three_core_waveforms`, and `test_uc05_abstains_when_airway_pressure_is_missing` pass.
- [x] **Step 2: Add a regression case where the case is eligible but UC05 is blocked.** Assert the case remains selectable while its inference state is unavailable.
- [x] **Step 3: Make `/health/ready`, model status, prediction endpoints, and UC04/UC05 view builders read readiness from `ModelManager.status()` only.** Keep `CaseSummary.uc05_eligible` derived from validated input windows; never promote it into `inference_ready`.
- [x] **Step 4: Preserve `MODEL_NOT_READY` for a blocked model and `INPUT_NOT_ELIGIBLE`/abstention for an ineligible window.** Do not return an empty success response or a zero score.
- [x] **Step 5: Run the tests from Step 1 plus `backend/tests/test_uc05_inference.py`.** Contract and focused readiness regressions pass. The initially reported OpenAPI snapshot failure is resolved; the configured full backend suite now passes.

Run: `.\.venv\Scripts\python.exe -m pytest backend/tests/test_ml_registry.py backend/tests/test_uc05_inference.py backend/tests/test_api_backend.py -q`

---

### Task 3: Resolve the UC05 readiness contradiction from executable evidence

**Files:**
- Read: `backend/app/ml/inference/uc05.py`
- Read: `backend/app/ml/preprocessing/uc05.py`
- Read: `backend/app/vitaldb/eligibility.py`
- Read: `backend/app/ml/registry/model_registry.json`
- Modify: `backend/tests/test_uc05_inference.py`
- Modify: `backend/tests/test_vitaldb_model_preprocessing.py`

**Interfaces:**
- Consumes: the configured `SafeAnes-UC05-RespFormer` checkpoint and sidecars at their registered SHA-256 values.
- Produces: a readiness result supported by an actual checkpoint load, one valid four-signal VitalDB window, one abstention case, and repeatable output.

- [x] **Step 1: Run the existing UC05 test set and record its model/artifact/environment inputs.**

Run: `$env:SAFEANES_RUN_VITALDB_SMOKE='1'; .\.venv\Scripts\python.exe -m pytest backend/tests/test_uc05_inference.py backend/tests/test_vitaldb_model_preprocessing.py -q`

- [x] **Step 2: Verify the checkpoint and sidecar hashes against `model_registry.json` without printing model paths or secrets.** The test output must show only artifact aliases and pass/fail status.
- [x] **Step 3: Compare every production required track against the exported `signal_schema.json` and the notebook preprocessing contract.** Keep `SPO2`, `capno`, `awp`, and `ppg` required unless a checksum-linked authoritative model-owner artifact proves a different contract.
- [x] **Step 4: Add or update tests for one eligible window, each missing required waveform, and a repeated fixed-window forward pass.** Use the existing tests `test_uc05_all_three_core_waveforms_allow_normal_inference`, `test_uc05_requires_all_three_core_waveforms`, `test_uc05_requires_audited_sources_for_all_core_waveforms`, and `test_uc05_abstains_when_airway_pressure_is_missing` as the regression set.
- [x] **Step 5: Keep the outcome explicit.** If the evidence passes, report `INTEGRATION_READY` with the four-signal gate. If it does not, preserve a specific `BLOCKED` status and list the failed requirement; do not change the gate to force a green result.
- [x] **Step 6: Run the real VitalDB smoke tests for cases `1`, `6388`, and `3300` only when their local files are present and checksums match manifests.**

Run: `$env:SAFEANES_RUN_VITALDB_SMOKE='1'; .\.venv\Scripts\python.exe -m pytest backend/tests -q`

---

### Task 4: Keep model outputs truthful in UC04 and UC05

**Files:**
- Modify: `src/components/modules/uc04/PredictedHpiPanel.tsx`
- Modify: `src/components/modules/uc05/ClinicalSummaryRail.tsx`
- Modify: `src/context/UC04VitalDbContext.tsx`
- Modify: `src/context/RespiratoryContext.tsx`
- Modify: `src/i18n/messages.ts`
- Test: `tests/model-output-format.test.cjs`
- Test: `tests/uc05-model-copy.test.cjs`
- Test: `tests/visual/workspaces.spec.ts`

**Interfaces:**
- Consumes: `ModelStatusResponse`, `PredictionItemResponse`, and existing UC04/UC05 typed view models.
- Produces: recorded mode UI that shows the actual task, returned horizons, output semantics, coverage, quality, and model readiness without a demo estimator.

- [x] **Step 1: Add assertions for UC04/UC05 ready, blocked, abstained, and loading states.** Verify recorded mode never renders synthetic percentage risk when backend output is unavailable.
- [x] **Step 2: Render UC04 output with the verified MAP-event task label and only horizons present in the backend response.** Keep the synthetic HPI wording confined to synthetic mode.
- [x] **Step 3: Render UC05 output with the exact SpO₂ task label, saved calibration status, and only returned horizons.** When the model is blocked, show `MODEL_NOT_READY`; when one input window fails, show `ABSTAINED` or the structured reason.
- [x] **Step 4: Add EN/VI strings for each state without shrinking clinical numerics or truncating the model task.**
- [x] **Step 5: Run frontend focused tests and screenshot comparison.** Synthetic-state visual coverage passed at 1440×900; real VitalDB UC04/UC05 screens were captured and checked against API outputs. Exact Figma-frame comparison and the full viewport matrix remain unverified.

Run: `node --test tests/model-output-format.test.cjs tests/uc05-model-copy.test.cjs`

Run: `npm run test:visual -- --grep "UC04|UC05|model"`

---

### Task 5: Replace contradictory readiness claims with a current evidence record

**Files:**
- Modify: `docs/MODELS.md`
- Modify: `docs/integration/UC05_MODEL_CONTRACT.md`
- Modify: `docs/integration/SAFEANES_BACKEND_ARCHITECTURE.md`
- Modify: `docs/integration/SAFEANES_BACKEND_API.md`
- Modify: `docs/validation/INFERENCE_VALIDATION.md`
- Modify: `docs/validation/END_TO_END_REPORT.md`
- Modify: `docs/design/FINAL_FIGMA_UI_QA.md`

**Interfaces:**
- Consumes: output from the exact tests in Tasks 1–4, the live `/health/ready`, `/models`, UC05 status endpoint, and one eligible replay view.
- Produces: one date-stamped current status statement, with prior status retained as superseded history where appropriate.

- [x] **Step 1: Add a status table with separate columns for artifact load, model contract, per-case input eligibility, and live inference availability.**
- [x] **Step 2: Mark old UC05 `BLOCKED_CONTRACT_MISMATCH` statements as historical when the current runtime and tests establish the stricter four-signal readiness gate; retain `BLOCKED` if the evidence does not establish readiness.**
- [x] **Step 3: Report no golden parity or clinical performance unless source fixtures, split membership, and labels are verified.**
- [x] **Step 4: Re-run the documentation search and confirm only one current UC05 status is presented as current.**

Run: `rg -n "Current status|INTEGRATION_READY|BLOCKED_CONTRACT_MISMATCH" docs/MODELS.md docs/integration docs/validation docs/design/FINAL_FIGMA_UI_QA.md`

---

### Task 6: Run the model-output release checks

**Files:**
- Test: `backend/tests/test_api_backend.py`
- Test: `backend/tests/test_uc04_inference.py`
- Test: `backend/tests/test_uc05_inference.py`
- Test: `tests/model-output-format.test.cjs`
- Test: `tests/uc05-model-copy.test.cjs`
- Test: `tests/visual/workspaces.spec.ts`

- [x] **Step 1: Run all backend tests with the configured Python environment.** Configured full suite: 135 passed, 0 skipped, 13 warnings.
- [x] **Step 2: Run all Node tests and visual tests.** Node suite: 151 passed; visual suite: 3 passed at 1440×900.
- [x] **Step 3: Run `npx tsc --noEmit` and `npm run build`.** Both passed.
- [x] **Step 4: Capture one real-mode UC04 view and one real-mode UC05 view from the SafeAnes backend; compare model ID, task, time, horizon, coverage, quality, and artifact hash with their API responses.** API and rendered UI agreed at case 1, 600 seconds; real EN/VI screenshots were inspected.
- [x] **Step 5: Update the validation report with actual results and keep unsupported cases marked `NOT_VERIFIED`.**

## Execution Record — 2026-10-10

- Backend with configured artifacts/cache: 135 passed, 0 skipped, 13 warnings.
- Node tests: 151 passed. Visual regression: 3 passed at 1440×900.
- TypeScript and production build passed (Next.js 15.5.27).
- Actual VitalDB case 1 at 600 seconds: UC04 and UC05 API outputs, task labels, horizons, coverage, quality, artifact hashes, and rendered values were compared. Real screenshots are stored outside the repository under `%TEMP%\safeanes-sdd\model-readiness\task-4\visual`.
- Exact Figma-frame comparison, all viewport sizes, golden training-output parity, GPU/Linux execution, and clinical performance remain `NOT_VERIFIED`.
