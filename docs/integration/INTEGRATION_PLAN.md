# SafeAnes Real VitalDB + UC04/UC05 Integration Plan

Audit date: 2026-10-09  
Status: Core UC04/UC05 model, Python API, VitalDB replay, and recorded-mode UI integration are implemented. This document retains the original implementation sequence and plan-time blockers as historical context; deployment packaging and model-owner release conditions remain separate release checks. The original model artifacts and checkpoints remain unmodified.

> **Historical plan note:** The proposed components, endpoints, and gate checklists below were written before the API and frontend integration was completed. Their earlier “add” and “remaining” wording describes plan state at authoring time, not the current runtime contract. The current strict UC05 gate reports `INTEGRATION_READY`; an ineligible individual window abstains.

## Integration target

Preserve the existing Next.js UI and synthetic SafeAnes demo. Add an explicitly selected real VitalDB workflow backed by a separate Python inference/data service. Keep synthetic and real case state, clocks, observations, predictions, and alerts distinct.

Data flow: SafeAnes UC04/UC05 UI → typed Next.js service client → Python API → VitalDB catalog/case loader → model-specific preprocessing → one-time-loaded PyTorch model → provenance-rich prediction response → existing visualization adapters.

The current SimulationReplayContext remains the owner of the synthetic demo clock. A real VitalDB workspace needs a separate selected-case state and replay clock based on the selected record’s elapsed case time. Route and language changes should preserve whichever mode and case the user selected.

## Proposed deployable components

1. **Next.js application**: retain the current UI. Add a source selector for the current synthetic demo versus a real VitalDB case, then adapt real observations and model results into existing UC04/UC05 panels. Do not feed real inputs into the synthetic model engines.
2. **Python inference API**: FastAPI service with pinned Python/PyTorch/VitalDB/scientific dependencies. Load each checkpoint once at process start, verify its checksum and strict state-dict compatibility, call eval/inference_mode, and expose readiness separately per model. Initially support CPU; enable CUDA only in an environment where the exact runtime has been verified.
3. **VitalDB case service**: allowlisted case/track catalog and on-demand retrieval of the selected case. Use a bounded cache outside the repository. Do not accept arbitrary URLs or arbitrary track names from the browser.
4. **Model runtime package**: copy architecture and preprocessing definitions into a versioned, tested inference package without editing the original notebooks or model files. Preserve each model’s exact feature order, sampling rates, windows, normalization, masks, and thresholds. Record the model file checksum and preprocessing version with every result.
5. **Local deployment**: a later Docker Compose file may run the Next.js and Python services with an external persistent cache volume and read-only checkpoint mounts. No container files exist today; add them only during implementation after dependency versions and model use terms are settled.

## API shape to implement

These are proposed contracts, not existing endpoints:

- GET /v1/health: API readiness, VitalDB connectivity, and per-model load/checksum status.
- GET /v1/vitaldb/cases: filtered case catalog fields needed by the workstation.
- GET /v1/vitaldb/cases/{caseId}/tracks: selected case track availability and target-rate mapping.
- GET /v1/vitaldb/cases/{caseId}/observations?fromSec=&toSec=: bounded numeric/waveform windows for replay; carry timestamps, source, unit when known, validity and quality.
- POST /v1/vitaldb/cases/{caseId}/predict/uc04 and /predict/uc05: evaluate a complete model-compatible window ending at a specified elapsed case time. Reject incomplete/bad-quality windows or return an explicit unavailable result; never fill absent signals with normal physiology.

Prediction responses should identify case ID, window end time, horizon, model ID/version, checkpoint SHA-256, preprocessing version, input tracks, coverage/missing modalities, calibration status, raw model output and any derived score. The response should distinguish a measured observation from a model estimate and retain the exact event/case time. Prevent future-data leakage by constraining every input sample to timestamps at or before the requested window end.

## UI binding without redesign

- Keep current UC04/UC05 charts, panels, alarms, and EN/VI copy structure.
- Adapt server responses into a real-data view model instead of placing real values into the existing fictional case.
- Preserve the same selected real case and cursor while navigating modules or switching language.
- Keep UC04/UC05 prediction overlays visually separate from measurements and from the synthetic demo outputs.
- Attach case ID, model/checkpoint identity, input window, track coverage and calibration status to the existing model-detail/evidence surfaces.
- Do not create real clinical alerts from output until alert behavior and calibration policy have a separate reviewed specification.
- Preserve the existing synthetic full-case demo as a clearly labeled, deterministic mode.

The current PredictionEvent type includes probability, confidence, and dataCoverage. A real adapter must not invent confidence. Before binding, either make confidence optional/unknown and add source/calibration metadata, or define a separate real-inference response type and map it only after the UI can display score type accurately. UC04’s current package does not include fitted temperatures, so do not label its sigmoid outputs as calibrated probabilities. UC05 temperatures are present, but the weak held-out event result should remain visible in model metadata and must not be interpreted as clinical validation.

## Implementation sequence and gates

### Gate 1 — Freeze the contracts

Status at plan authoring: partially complete. The exact artifact hashes, model
inputs, architecture, preprocessing, outputs, and runtime have been recorded in
the UC04/UC05 model contracts. The following unresolved modality/licensing
items are retained as historical plan state. The current UC05 production gate
requires valid SpO₂, capnogram, AWP, and PPG and reports `INTEGRATION_READY`;
windows that fail that contract abstain. Model licensing remains a release
provenance limitation.

- Resolve UC05 capno/AWP/PPG required-versus-optional semantics.
- Confirm model artifact licenses and the exact model version/provenance.
- Decide how unavailable signals, source unit metadata, resampling, interpolation, and quality masks are represented in API responses.
- Recover or regenerate split/run manifests and the missing UC04 calibration/evaluation artifacts if available from the model owner.

### Gate 2 — Package faithful inference

Status: implemented and CPU smoke-tested. Both strict checkpoint loads and
real VitalDB case-window forward passes succeed. UC05 uses the confirmed strict
modality contract and reports `INTEGRATION_READY`; windows missing valid SpO₂
history, capnogram, AWP, or PPG abstain explicitly. No independent notebook
golden output was supplied.

- Build standalone model classes and preprocessing from the audited notebooks without changing the original files.
- Pin dependency versions and add architecture/checkpoint checksum tests.
- Compare packaged tensors against notebook-generated tensors for the same VitalDB case/time.
- Verify each model on eligible, quality-gated real case windows and test malformed, missing, stale, and future samples.

### Gate 3 — Build the data/API service

Status at plan authoring: case discovery, model-window eligibility, immutable local raw caching,
per-case manifests, and the JSON case catalog are implemented. The run on
2026-10-09 searched the complete VitalDB index, deeply inspected three
deterministically sampled cases after eligibility targets were reached, and
re-opened the selected official `.vital` files locally before cataloging them.
See [CASE_SELECTION_REPORT.md](CASE_SELECTION_REPORT.md) and
`backend/data/manifests/vitaldb_case_catalog.json`. Candidate index matches are
never treated as eligible. The statement that the HTTP API and frontend binding
were not yet part of the gate is historical plan state. The current HTTP API,
readiness/model endpoints, replay service, typed frontend adapters, and shared
VitalDB replay binding are implemented and documented in
[SAFEANES_BACKEND_API.md](SAFEANES_BACKEND_API.md).

- Historical plan item: add a bounded selected-case API, health/readiness checks,
  timeout/error handling, and request resource limits.
- Historical plan item: add prediction endpoints that validate fixed shapes, feature
  order, units where supplied, timestamps, missingness and model quality gates.
- Historical plan item: add request IDs and an audit record with case/window/model/
  preprocessor/checkpoint identifiers.
- UC05 input cases can pass the strict exported schema and inference readiness
  is `INTEGRATION_READY`; individual windows that fail the required-waveform
  gate are represented as explicit abstentions.

### Gate 4 — Bind the existing UI (completed implementation; historical sequence)

- The explicit real-versus-synthetic data-source mode is implemented.
- Typed API clients and adapters are connected to the current UC04/UC05 components.
- The selected real case cursor and observations are synchronized across routes.
- Unavailable/low-coverage states remain distinct from measured physiology, with EN/VI behavior retained.

### Gate 5 — Release checks

- Test deterministic preprocessing, model loading, checkpoint hashes, API schemas, window boundaries, no future leakage, and signal-quality gating.
- Replay representative cases and verify cursor/route/language persistence.
- Run the existing frontend build and backend tests.
- Verify local Compose startup, health checks, clean shutdown, cache persistence and CPU memory/latency on the target machine.
- Keep the real-data integration opt-in until its technical checks and model-owner release conditions are satisfied.

## Remaining release blockers

- UC04 has no supplied calibration file or evaluation metrics tied to its checkpoint.
- UC05's saved evaluation artifact contains only one test event with zero
  detected; this is insufficient for a clinical performance claim. The former
  modality-schema mismatch is superseded by the verified strict schema gate,
  which now reports runtime `INTEGRATION_READY` and abstains per ineligible
  window.
- Both packages lack complete run-to-checkpoint provenance. Tested inference
  runtime requirements now exist, but the original training lockfile is absent.
- The inference API and UC04/UC05 recorded-mode UI binding are implemented and
  technically verified. Deployment configuration and model-owner release
  conditions still require separate review before production use.
- Model artifact licensing is not included in the model folder.
- The local machine’s verified PyTorch interpreter is CPU-only; GPU support is not verified.

These blockers do not prevent building a controlled technical demo, but they prevent describing model output as validated clinical guidance.
