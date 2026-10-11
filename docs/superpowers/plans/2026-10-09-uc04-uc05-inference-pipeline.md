# UC04 / UC05 Reproducible Inference Pipeline Implementation Plan

> **For agentic workers:** Execute inline in this session. Every production behavior is developed test-first.

**Goal:** Add a tested Python inference package that loads the audited UC04/UC05 checkpoints, reproduces their window preprocessing, and returns timestamped, quality-aware predictions without future leakage.

**Architecture:** Add a framework-neutral package under backend/app/ml with typed contracts, a fixed local artifact registry, notebook-compatible architecture modules, per-model preprocessing and inference services, and VitalDB window loading. Keep model IDs and preprocessing separate from the existing synthetic frontend engines.

**Tech Stack:** Python 3.12, PyTorch 2.14.1+cpu for verified local runtime, NumPy 2.5.3, pandas 3.0.6, SciPy 1.18.1, VitalDB 1.7.2, pytest 9.1.1.

**Spec:** Current user requirements and docs/integration/MODEL_AUDIT.md.

## Global Constraints

- Do not retrain or write to source checkpoint files.
- Only load registry-allowlisted local paths, verify SHA-256, and call torch.load with weights_only=true.
- Preserve notebook feature order, tensor shape, fixed scalers, per-window waveform normalization, quality gates, and saved calibration only.
- Block input windows containing any timestamp later than prediction_time.
- Never label UC04 sigmoid output as calibrated probability; return null confidence.
- Preserve the separate UC05 auxiliary ventilation-pattern output as an uncalibrated logit.
- No golden model-output files exist in the audited package; do not fabricate them.

---

### Task 1: Test-first public input/output contracts and future-leakage guard

**Files:**
- Create: backend/tests/test_ml_contracts.py
- Create: backend/tests/test_ml_window_validation.py
- Create: backend/app/ml/contracts/model_contract.py
- Create: backend/app/ml/contracts/window.py
- Create: backend/app/ml/contracts/prediction.py
- Create: backend/app/ml/validation/input_validation.py

- [ ] Write tests for feature-order mismatch, wrong sample rate, window shape mismatch, and a waveform whose end timestamp exceeds prediction_time.
- [ ] Run pytest and confirm those tests fail because the package is absent.
- [ ] Add typed immutable contracts and validation errors; require all signal end times to be at or before prediction_time.
- [ ] Run those tests to green.

### Task 2: Registry security and artifact identity

**Files:**
- Create: backend/tests/test_ml_registry.py
- Create: backend/app/ml/registry/artifacts.py
- Create: backend/app/ml/registry/contracts.py

- [ ] Test an allowlisted checkpoint loads only after its SHA-256 matches and an out-of-root path is rejected.
- [ ] Confirm the new tests fail before registry code exists.
- [ ] Implement fixed registry paths under SAFEANES_MODEL_ROOT, exact checkpoint hashes, safe torch.load(weights_only=true), and strict rejection of non-state-dict content.
- [ ] Verify checkpoint tampering/path traversal cases fail without deserialization.

### Task 3: Restore both architectures and deterministic preprocessing

**Files:**
- Create: backend/tests/test_uc04_preprocessing.py
- Create: backend/tests/test_uc05_preprocessing.py
- Create: backend/app/ml/models/uc04/architecture.py
- Create: backend/app/ml/models/uc05/architecture.py
- Create: backend/app/ml/preprocessing/common.py
- Create: backend/app/ml/preprocessing/uc04.py
- Create: backend/app/ml/preprocessing/uc05.py

- [ ] Add literal-fixture tests for fixed numeric normalization, waveform robust scaling, missing masks, output order, and expected input dimensions.
- [ ] Run tests to observe the missing-package failures.
- [ ] Implement the notebook-derived architectures and preprocessing. For UC04, truncate numeric data at prediction_time before short-gap interpolation; normalize only supplied waveform windows. For UC05, retain the exact numeric mask/normalization and waveform resampling/normalization contract.
- [ ] Verify exact state-dict strict loading and unit tests.

### Task 4: Model services and prediction semantics

**Files:**
- Create: backend/tests/test_uc04_inference.py
- Create: backend/tests/test_uc05_inference.py
- Create: backend/app/ml/models/uc04/contract.py
- Create: backend/app/ml/models/uc05/contract.py
- Create: backend/app/ml/inference/base.py
- Create: backend/app/ml/inference/uc04.py
- Create: backend/app/ml/inference/uc05.py

- [ ] Test raw logits, horizon order, UC04 uncalibrated score semantics, UC05 saved temperature scaling, null confidence, and auxiliary output semantics.
- [ ] Verify tests fail before services exist.
- [ ] Implement load_model, validate_inputs, preprocess_window, predict_window, and postprocess_output for each UC.
- [ ] Run tests on CPU using real checkpoint files.

### Task 5: VitalDB source adapter, documentation, integration test, and final verification

**Files:**
- Create: backend/tests/test_vitaldb_smoke.py
- Create: backend/app/ml/preprocessing/vitaldb_loader.py
- Create: backend/requirements.txt
- Create: backend/app/ml/__init__.py and package initializers
- Create: docs/integration/UC04_MODEL_CONTRACT.md
- Create: docs/integration/UC05_MODEL_CONTRACT.md

- [ ] Add an opt-in VitalDB case-window test that retrieves only registry-approved track candidates and feeds bounded windows into the services.
- [ ] Confirm the integration test skips when explicitly disabled and fails with a clear network/data error when enabled but unavailable.
- [ ] Run the smoke test with VitalDB case 1 for both models; report execution separately from model validation.
- [ ] Run the full backend pytest suite and inspect generated-file/checkpoint hashes to confirm source artifacts stayed unchanged.

