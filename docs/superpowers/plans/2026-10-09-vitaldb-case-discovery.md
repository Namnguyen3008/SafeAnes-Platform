# VitalDB Case Discovery and Eligibility Implementation Plan

> **For agentic workers:** Execute inline in this task; user authorized implementation. Use test-first steps and preserve the model/checkpoint files.

**Goal:** Search the official VitalDB open dataset, validate real cases against the exact UC04/UC05 preprocessing contracts, cache selected immutable source records, and emit case manifests plus a machine-readable catalog.

**Architecture:** Use `vitaldb==1.7.2` and its installed versioned dataset (`vitaldb.dataset.DATASET_VERSION == 1.0.1`). Use `find_cases()` only to produce broad indexed candidates; inspect exact track/device/rate/unit/time metadata and aligned samples from each authoritative versioned `.vital` source. The existing UC04 and UC05 preprocessors are the eligibility gates. Strict UC05 eligibility requires all three waveform modalities marked required by `signal_schema.json`. The final implementation superseded the plan-time schema/evaluator mismatch: runtime readiness is `INTEGRATION_READY`, while failed individual windows abstain.

**Tech Stack:** Python 3.12, VitalDB Python API, existing NumPy/pandas/SciPy/PyTorch package, pytest, JSON manifests, SHA-256.

**Spec:** User request dated 2026-10-09; [UC04 model contract](../../integration/UC04_MODEL_CONTRACT.md), [UC05 model contract](../../integration/UC05_MODEL_CONTRACT.md), and [existing inference package](../../../backend/app/ml/).

## Global Constraints

- Never synthesize, interpolate for storage, or alter the downloaded raw `.vital` files.
- Never select case IDs without deriving them from VitalDB candidate discovery and full model-window validation.
- Treat the VitalDB track index as a candidate index only; verify against each `.vital` file.
- Only apply validity thresholds already specified by each model preprocessing contract; label extra signal diagnostics as descriptive, not pass/fail.
- UC05's contradictory required-modality contracts must remain visible and block default inference readiness.
- Do not present unavailable demographics as known; frontend catalog fields contain no demographics.
- Record dataset version, exact source URI, download time, raw checksum, and CC BY 4.0 attribution.
- Keep original checkpoints under `Downloads/model` untouched.

---

### Task 1: Build discovery and quality-rule tests

**Files:**
- Create: `backend/tests/test_vitaldb_discovery.py`
- Create: `backend/tests/test_vitaldb_storage.py`

**Interfaces:**
- Candidate search returns sorted integer IDs and does not treat suffix-index matches as eligibility.
- Window evaluation calls the real model preprocessors and records accepted/rejected times.
- Case selection is deterministic and enforces per-model and dual categories.
- Raw storage refuses overwrite, verifies `.vital` format, and records SHA-256.

- [ ] Write tests for exact candidate filtering, full-window gating, dual eligibility, empty/unavailable coverage, deterministic selection, immutable writes, checksum stability, and catalog `NOT_RECORDED` behavior.
- [ ] Run those tests and confirm expected failures before production implementation.

### Task 2: Share an in-memory VitalDB case series

**Files:**
- Modify: `backend/app/ml/preprocessing/vitaldb_loader.py`
- Test: `backend/tests/test_vitaldb_loader.py`

**Interfaces:**
- Add `VitalDBWindowLoader.load_case_signals(model_id, case_id, source_path=None)` returning one loaded case series with actual track metadata and `window_at(prediction_time_s)`.
- Preserve `load_window(...)` as a one-window wrapper.
- Use `VitalFile` on official dataset case IDs or local immutable raw paths; obtain shared time origin and actual track metadata from the VitalFile.

- [ ] Add failing tests for exact native track metadata, aligned half-open model windows, and source-path loading.
- [ ] Refactor current one-window loader to share the case-series representation and run loader tests.

### Task 3: Inspect model-compatible windows and signal quality

**Files:**
- Create: `backend/app/vitaldb/__init__.py`
- Create: `backend/app/vitaldb/eligibility.py`
- Create: `backend/app/vitaldb/contracts.py`
- Test: `backend/tests/test_vitaldb_discovery.py`

**Interfaces:**
- `CaseInspector.inspect(case_id)` returns track inventory, coverage diagnostics, synchronized valid windows, excluded-window reasons, UC04/UC05 eligibility, and trajectory descriptors.
- Load the fixed `UC04_CONTRACT`/`UC05_CONTRACT`; validate windows with `UC04InferenceService.preprocess_window()` and `UC05InferenceService.preprocess_window()`.
- Strict UC05 candidate eligibility requires capno, AWP, PPG, and valid SpO2 per the exported schema, as well as satisfying the stream evaluator's PPG + capno/AWP gate.
- Do not run model outputs to select cases.

- [ ] Test that `DUAL_UC04_UC05_ELIGIBLE` requires a valid window accepted by both preprocessing pipelines.
- [ ] Test existing contract gates, coverage, missing-interval calculation, plausibility counts, and quality metadata.
- [ ] Implement a time-aligned full-case audit at each model's configured 30-second stride.

### Task 4: Add immutable raw storage and manifests/catalog generation

**Files:**
- Create: `backend/app/vitaldb/storage.py`
- Create: `backend/app/vitaldb/pipeline.py`
- Create: `backend/scripts/discover_vitaldb_cases.py`
- Test: `backend/tests/test_vitaldb_storage.py`
- Generate: `backend/data/vitaldb/raw/`, `processed/`, `manifests/`, `cache/`
- Generate: `backend/data/manifests/vitaldb_case_catalog.json`

**Interfaces:**
- Downloader URL is built only from official API host, dataset version, and validated integer case ID.
- Existing raw records are verified and never overwritten; raw metadata is adjacent in a manifest.
- Pipeline searches track-index candidates, inspects candidates deterministically, selects by coverage plus observed non-prediction trajectory diversity, and writes one manifest per selected case.
- Catalog includes only case IDs, case duration, signal availability, eligibility, measured coverage, valid-window counts, and readiness; no guessed demographics.

- [ ] Test path traversal rejection, interrupted/invalid downloads, overwrite protection, checksums, atomic metadata writes, selection counts, and explicit under-target results.
- [ ] Implement pipeline and run it with a documented candidate-inspection budget; report uninspected candidates separately from excluded cases.
- [ ] Cache selected raw `.vital` records without writing transformed samples into the raw directory.

### Task 5: Documentation and end-to-end verification

**Files:**
- Create: `docs/integration/CASE_SELECTION_REPORT.md`
- Modify: `docs/integration/INTEGRATION_PLAN.md`
- Verify: generated case manifests/catalog and model artifact hashes.

- [ ] Run unit tests and the live VitalDB discovery/validation pipeline.
- [ ] Reopen every selected local raw record and rerun both input gates for its recorded valid windows.
- [ ] Verify catalog and manifests are generated solely from observed VitalDB metadata and sample results.
- [ ] Report actual selected IDs, searched/inspected counts, exclusions, license/attribution, and unresolved UC05 readiness.
