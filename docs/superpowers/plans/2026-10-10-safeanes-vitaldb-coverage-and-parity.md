# SafeAnes VitalDB Coverage and Model Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase the number and diversity of fully inspected VitalDB cases, keep eligibility decisions reproducible, and establish external preprocessing/output parity only when authoritative training fixtures exist.

**Architecture:** Reuse `run_case_discovery()`, the model-specific preprocessing validators, immutable raw VitalDB storage, and per-case manifests. Candidate index membership remains discovery-only. Every eligible case must have at least one accepted model window from the exact production input validator.

**Tech Stack:** Python 3.12, VitalDB 1.7.2, NumPy, Pandas, PyTorch, Pytest, JSON manifests, SHA-256.

**Spec:** `docs/integration/MODEL_AUDIT.md`; `docs/integration/CASE_SELECTION_REPORT.md`; `docs/integration/VITALDB_DATA_PLAN.md`; `docs/validation/CASE_VALIDATION.md`; `docs/integration/UC04_MODEL_CONTRACT.md`; `docs/integration/UC05_MODEL_CONTRACT.md`.

## Global Constraints

- Do not select or exclude a case based only on track-index presence or a model prediction.
- Use official VitalDB source records and preserve raw `.vital` bytes exactly; verify SHA-256 after every copy.
- Preserve `NOT_RECORDED`, `MISSING`, `INVALID`, `ARTIFACT`, and `INTERPOLATED` distinctions.
- Do not invent demographics, units, sources, case split membership, ground truth, or performance metrics.
- Use the UC04 and UC05 model-specific window, feature, unit, sampling, quality, and missingness contracts without fitting new scalers.
- Keep the UC05 strict core-waveform gate: valid SpO₂, capnogram, AWP, and PPG.
- Mark train/validation/test membership `UNKNOWN` unless a verified case-ID split artifact is found.
- Record the VitalDB dataset version and attribution terms with every generated report.

---

### Task 1: Make discovery runs resumable and auditable

**Files:**
- Modify: `backend/app/vitaldb/pipeline.py`
- Modify: `backend/scripts/discover_vitaldb_cases.py`
- Modify: `backend/tests/test_vitaldb_pipeline.py`
- Modify: `backend/tests/test_vitaldb_discovery.py`

**Interfaces:**
- Existing `run_case_discovery(project_root, inspection_budget, target_per_model, dual_target)` remains the entry point.
- Candidate checkpoint data includes dataset version, model-contract versions, seed, inspection cursor, inspected case IDs, and a checksum of the candidate index.

- [ ] **Step 1: Add tests that two runs with the same candidate index, seed, and budget produce the same inspected IDs and eligibility categories.**
- [ ] **Step 2: Add tests that resuming after a partial run does not re-inspect completed case IDs or change their manifests.**
- [ ] **Step 3: Add tests for a changed candidate-index checksum and changed model-contract version; require the old resume cursor to be rejected with a structured reason.**
- [ ] **Step 4: Implement resume metadata in a separate cache file under `backend/data/vitaldb/cache/`; do not mutate raw records or claim inspection beyond completed IDs.**
- [ ] **Step 5: Run discovery unit tests without network access.**

Run: `.\.venv\Scripts\python.exe -m pytest backend/tests/test_vitaldb_discovery.py backend/tests/test_vitaldb_pipeline.py -q`

---

### Task 2: Expand case inspection using the existing deterministic sampling

**Files:**
- Modify: `backend/scripts/discover_vitaldb_cases.py` only if CLI reporting or resume flags need adjustment
- Read: `backend/app/vitaldb/pipeline.py`
- Read: `backend/app/vitaldb/eligibility.py`
- Modify: `backend/tests/test_vitaldb_discovery.py`

**Interfaces:**
- CLI remains `python backend/scripts/discover_vitaldb_cases.py` with `--inspection-budget`, `--target-per-model`, `--dual-target`, and `--project-root`.
- Search results are candidate IDs only; a case is eligible only after a full parser read and an accepted model-specific inference window.

- [ ] **Step 1: Add CLI tests for nonnegative budget validation, deterministic sample order, and a report that separates `inspected`, `eligible`, `excluded`, and `uninspected` IDs.**
- [ ] **Step 2: Run a local discovery batch with `--inspection-budget 80 --target-per-model 10 --dual-target 5` against the configured official index and local cache.** These values increase inspection depth; they are not required counts of eligible cases.
- [ ] **Step 3: Re-open every proposed selected `.vital` file through the existing storage/loader path and compare its digest with the manifest before accepting it.**
- [ ] **Step 4: Record exclusions with the exact failed rule: absent track, invalid unit/rate, insufficient window, quality gate, or parser error. Leave untouched candidates `UNVERIFIED`.
- [ ] **Step 5: Re-run the same batch from its saved checkpoint and verify it produces the same selected IDs and checksums.**

Run: `.\.venv\Scripts\python.exe backend/scripts/discover_vitaldb_cases.py --inspection-budget 80 --target-per-model 10 --dual-target 5`

---

### Task 3: Preserve and regenerate manifests from validated results

**Files:**
- Modify: `backend/app/vitaldb/pipeline.py`
- Modify: `backend/data/manifests/vitaldb_case_catalog.json`
- Modify: `docs/integration/CASE_SELECTION_REPORT.md`
- Modify: `docs/validation/CASE_VALIDATION.md`
- Test: `backend/tests/test_vitaldb_storage.py`
- Test: `backend/tests/test_vitaldb_model_preprocessing.py`

**Interfaces:**
- Each manifest contains verified case ID, dataset/version, raw checksum, selected tracks, native rate/unit/type, quality summary, model-contract versions, valid windows, and explicit eligibility reasons.
- The catalog exposes only non-identifying case metadata and per-model readiness fields.

- [ ] **Step 1: Add manifest tests for deterministic serialization, raw checksum parity, and required `NOT_RECORDED` values.**
- [ ] **Step 2: Add a cross-check that `uc04_eligible` and `uc05_eligible` are true only if their valid-window lists are nonempty and passed the current contract validators.**
- [ ] **Step 3: Regenerate the catalog from current inspected manifests.** Never edit counts or case metadata by hand.
- [ ] **Step 4: Update reports with candidate count, fully inspected count, selected cases, exclusion reasons, and dataset attribution.**
- [ ] **Step 5: Confirm no subject identifier, absolute source timestamp, token, or local artifact path appears in the generated catalog or report.**

Run: `.\.venv\Scripts\python.exe -m pytest backend/tests/test_vitaldb_storage.py backend/tests/test_vitaldb_model_preprocessing.py -q`

---

### Task 4: Search for authoritative model split and golden fixtures

**Files:**
- Read only: configured model artifacts, training notebooks, README, and existing evaluation outputs outside SafeAnes source.
- Create if source fixtures are present: `backend/tests/fixtures/model_golden/manifest.json`
- Create if source fixtures are present: `backend/tests/fixtures/model_golden/uc04.json`
- Create if source fixtures are present: `backend/tests/fixtures/model_golden/uc05.json`
- Modify: `backend/tests/test_vitaldb_model_preprocessing.py`
- Modify: `backend/tests/test_uc04_inference.py`
- Modify: `backend/tests/test_uc05_inference.py`

**Interfaces:**
- Golden fixture manifest records source artifact identity, checkpoint SHA-256, preprocessing version, case/window ID, tensor checksum, expected raw output, and the source file checksum.
- Training split membership is `UNKNOWN` unless a source manifest with case IDs and a verifiable checksum exists.

- [ ] **Step 1: Search the configured model directory for saved test tensors, prediction arrays, explicit case-ID split files, and evaluation exports.** Do not edit or execute notebook cells that write to the model directory.
- [ ] **Step 2: If a fixture exists, verify its source checkpoint and preprocessing identity before importing it.** Reject mismatched or unversioned fixtures.
- [ ] **Step 3: Add one UC04 and one UC05 numeric parity test using the actual supplied fixture and a documented floating-point tolerance derived from the saved runtime/output format.**
- [ ] **Step 4: If no authoritative fixture or split manifest exists, record `NOT_VERIFIED` and create no synthetic golden output.**
- [ ] **Step 5: Run the parity tests only when fixture files exist; keep ordinary unit tests runnable without the external model directory.**

Run: `.\.venv\Scripts\python.exe -m pytest backend/tests/test_uc04_inference.py backend/tests/test_uc05_inference.py backend/tests/test_vitaldb_model_preprocessing.py -q`

---

### Task 5: Separate inference engineering from model evaluation

**Files:**
- Modify: `docs/validation/INFERENCE_VALIDATION.md`
- Modify: `docs/validation/CASE_VALIDATION.md`
- Create: `docs/validation/MODEL_EVALUATION_READINESS.md`
- Read: `backend/data/manifests/vitaldb_case_catalog.json`

**Interfaces:**
- Engineering report states artifact load, preprocessing, tensor, API, and replay results.
- Evaluation-readiness report lists task labels, verified case splits, eligible labeled windows, and missing requirements for AUROC/AUPRC/event-level metrics.

- [ ] **Step 1: Add separate result tables for inference function and clinical-task evaluation.**
- [ ] **Step 2: Compute no discrimination, calibration, lead-time, or false-alert metrics until case split membership and labels match the verified model task.**
- [ ] **Step 3: Report selected cases with split membership `UNKNOWN` where no authoritative split exists.**
- [ ] **Step 4: Link each report row to its case manifest and model contract version.**

---

### Task 6: Run reproducibility and safe-data checks

**Files:**
- Test: `backend/tests/test_vitaldb_discovery.py`
- Test: `backend/tests/test_vitaldb_pipeline.py`
- Test: `backend/tests/test_vitaldb_storage.py`
- Test: `backend/tests/test_vitaldb_model_preprocessing.py`
- Test: `backend/tests/test_uc04_inference.py`
- Test: `backend/tests/test_uc05_inference.py`

- [ ] **Step 1: Run offline discovery/storage/contract tests.**
- [ ] **Step 2: Run opted-in checkpoint smoke tests only against checksum-matched local records.**
- [ ] **Step 3: Repeat the saved discovery batch and compare catalog/manifests byte-for-byte except for explicitly recorded execution timestamps.**
- [ ] **Step 4: Record exact inspected IDs and hashes in `CASE_VALIDATION.md`; leave all uninspected cases unverified.**
- [ ] **Step 5: Confirm no clinical performance claim appears without a verified test cohort and label definition.**
