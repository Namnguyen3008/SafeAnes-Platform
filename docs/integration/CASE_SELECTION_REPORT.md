# VitalDB case selection and eligibility report

Generated: 2026-10-09T11:03:25.383123+00:00

UC05 contract update: the production gate now requires valid SpO₂, capnogram,
AWP, and PPG for every eligible window. This follows the exported schema and
the confirmed SafeAnes requirement; the historical stream evaluator's looser
gate is documented but not used. The selected cases below were already
validated using the strict three-waveform gate.

## Source and search scope

- Dataset version: `1.0.1`.
- Installed VitalDB Python library: `1.7.2`.
- UC04 indexed candidates: **3644**.
- UC05 strict-schema indexed candidates: **6129**.
- Indexed intersection: **3443**; this is only a candidate count.
- Unique candidate IDs across both sets: **6330**.
- Full VitalFile/preprocessor inspections: **3 of 6330 unique candidates** (inspection budget 40; sampled queue 40).
- Not inspected: **6327**. These are unverified, not excluded.
- Inspection stopped after 3 cases when the configured eligibility targets were reached, or when the sampled queue/budget was exhausted.
- Candidate sampling is deterministic and stratified across the candidate-ID range. Candidate-index track presence is never treated as eligibility.
- For each inspected case, eligibility requires at least one 30-second-stride window accepted by the existing UC-specific service validator and preprocessing code.
- UC05 additionally requires valid SpO₂, capnogram, AWP, and PPG because its exported `signal_schema.json` marks all three waveforms required.
- No model predictions were generated or used to select cases.

## Verified eligibility among inspected cases

- UC04 eligible: **3**.
- UC05 eligible under the strict exported schema: **3**.
- Dual eligible (each model independently has accepted windows): **3**.
- Selected and locally revalidated: **3**.

## Selected cases

### VitalDB case 1

- Eligibility: UC04 `True`, UC05 `True`; categories `UC04_ELIGIBLE, UC05_ELIGIBLE, DUAL_UC04_UC05_ELIGIBLE`.
- Duration: 11542.1 seconds.
- Raw size / SHA-256: 17561476 bytes / `5d661e5420719fb6016f551d6053314571f09a0010c5b34a528cad2e525496b6`.
- Valid windows: UC04 345, UC05 347.
- Mean accepted-window coverage: UC04 0.7754137681159421, UC05 0.4482387125744385.
- Observed signal profile (descriptive): MAP median 80.0 mmHg (p10–p90 58.0–112.0); SpO₂ median 99.0% (p10–p90 96.0–100.0).
- Task-threshold trajectory descriptors are also recorded; no model prediction was used for ranking.
- Split membership: UC04 `UNKNOWN`, UC05 `UNKNOWN`.
- UC05 input eligibility is ready for the strict production gate; checkpoint readiness is reported separately by the model runtime.
- Tracked signal coverage and gap details are in the adjacent machine-readable case manifest.

### VitalDB case 6388

- Eligibility: UC04 `True`, UC05 `True`; categories `UC04_ELIGIBLE, UC05_ELIGIBLE, DUAL_UC04_UC05_ELIGIBLE`.
- Duration: 10249.3 seconds.
- Raw size / SHA-256: 11539724 bytes / `06f9aee4f3ea5f72b3e372ef62e4cadbddf2219e6fb03331c3162d6c0e99a04b`.
- Valid windows: UC04 314, UC05 305.
- Mean accepted-window coverage: UC04 0.7784312234607218, UC05 0.4407751473329428.
- Observed signal profile (descriptive): MAP median 87.0 mmHg (p10–p90 63.0–100.0); SpO₂ median 100.0% (p10–p90 100.0–100.0).
- Task-threshold trajectory descriptors are also recorded; no model prediction was used for ranking.
- Split membership: UC04 `UNKNOWN`, UC05 `UNKNOWN`.
- UC05 input eligibility is ready for the strict production gate; checkpoint readiness is reported separately by the model runtime.
- Tracked signal coverage and gap details are in the adjacent machine-readable case manifest.

### VitalDB case 3300

- Eligibility: UC04 `True`, UC05 `True`; categories `UC04_ELIGIBLE, UC05_ELIGIBLE, DUAL_UC04_UC05_ELIGIBLE`.
- Duration: 20660.0 seconds.
- Raw size / SHA-256: 19773340 bytes / `938b4e5cfaf65f8ce6ecb7da3024dae9289801e55fa2eec12d02d4600f192422`.
- Valid windows: UC04 660, UC05 649.
- Mean accepted-window coverage: UC04 0.7768342171717172, UC05 0.4403317958636827.
- Observed signal profile (descriptive): MAP median 72.0 mmHg (p10–p90 57.0–90.0); SpO₂ median 100.0% (p10–p90 100.0–100.0).
- Task-threshold trajectory descriptors are also recorded; no model prediction was used for ranking.
- Split membership: UC04 `UNKNOWN`, UC05 `UNKNOWN`.
- UC05 input eligibility is ready for the strict production gate; checkpoint readiness is reported separately by the model runtime.
- Tracked signal coverage and gap details are in the adjacent machine-readable case manifest.

## Excluded inspected cases

No fully inspected case was excluded by input validation in this run.

VitalDB API notices:
- find_cases() relies on the per-track 'trks' index, which is deprecated and may be removed in a future release.

## Selection and quality rules

- Eligibility uses the existing UC04/UC05 preprocessing coverage and validation rules, including the trained feature order, sample rates, window sizes, missing-value policy, and signal plausibility filters.
- No pipeline-wide minimum coverage threshold was added. Per-track coverage, NaN/gap counts, valid overlap, and model-window counts are descriptive; model gates decide input eligibility.
- Case selection favors dual eligibility, then mean accepted-window data coverage, then a distinct observed task-label trajectory signature where present. It never ranks by model prediction.
- MAP ≤65 mmHg sustained for 60 seconds and SpO₂ <90% sustained for 60 seconds are included only as observed trajectory descriptors matching the model label definitions; they are not presented as diagnoses or clinical guidance.
- Training/validation/test membership is `UNKNOWN`: the model directory contains notebooks that describe a generated patient-level split, but no frozen case-ID split manifest was found beside the artifacts. This catalog does not claim independent evaluation.

## Data storage and provenance

- Selected records are saved byte-for-byte from the official versioned `.vital` source under `backend/data/vitaldb/raw/` and checked with VitalFile plus SHA-256.
- Raw files are write-once. Processed quality summaries and per-case manifests are stored alongside them; raw samples are not normalized, interpolated, or rewritten.
- Absolute deidentified timestamps are omitted from manifests; all times are relative to the VitalFile shared time origin.
- Patient metadata in the catalog is read from the official deidentified case metadata; missing fields are `NOT_RECORDED`. Subject identifiers are not exported.

## License and attribution

VitalDB describes its open dataset as available under **CC BY 4.0**. Attribute VitalDB, link the license, and indicate changes when redistributing adapted material. Do not attempt re-identification. Dataset citation: Lee HC et al., *VitalDB, a high-fidelity multi-parameter vital signs database in surgical patients*, Scientific Data (2022).

- [VitalDB terms and conditions](https://vitaldb.net/docs/?documentId=General/Terms_and_Conditions.md)
- [VitalDB open dataset overview](https://vitaldb.net/docs/?documentId=OpenDataset/Overview.md)
- [Official VitalDB API](https://api.vitaldb.net/)

## Readiness note

Case-input eligibility is reported independently from the loaded model status.
The UC05 service now exposes `INTEGRATION_READY` only after the verified model
and sidecars load; each prediction window must still pass the three-waveform
quality gate.
