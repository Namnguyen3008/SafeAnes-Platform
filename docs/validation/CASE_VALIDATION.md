# VitalDB Case and Source Integrity Validation

Validation date: 2026-10-09  
Source dataset: VitalDB open dataset 1.0.1, accessed with VitalDB Python 1.7.2. Local `.vital` files were reopened and SHA-256 checked against their case manifests. VitalDB attribution and CC BY 4.0 terms are recorded in [CASE_SELECTION_REPORT.md](../integration/CASE_SELECTION_REPORT.md).

## Search and inspection scope

| Discovery result | Count | Status |
|---|---:|---|
| UC04 index candidates | 3,644 | Candidate count only |
| UC05 strict-schema index candidates | 6,129 | Candidate count only |
| Indexed intersection | 3,443 | Candidate count only |
| Unique candidate IDs | 6,330 | Search scope |
| Full VitalFile/model-window inspections | 3 | PASS for listed cases |
| Not fully inspected | 6,327 | NOT_VERIFIED; not treated as excluded |

Eligibility requires accepted model windows from each model-specific validator and preprocessor. Track presence in the index alone was not accepted as proof. No predictions were used to rank or select cases.

## Selected, revalidated files

| VitalDB case | Duration | UC04 windows | UC05 windows | Raw SHA-256 | Checksum |
|---|---:|---:|---:|---|---|
| `1` | 11,542.1 s | 345 | 347 | `5d661e5420719fb6016f551d6053314571f09a0010c5b34a528cad2e525496b6` | PASS |
| `6388` | 10,249.3 s | 314 | 305 | `06f9aee4f3ea5f72b3e372ef62e4cadbddf2219e6fb03331c3162d6c0e99a04b` | PASS |
| `3300` | 20,660.0 s | 660 | 649 | `938b4e5cfaf65f8ce6ecb7da3024dae9289801e55fa2eec12d02d4600f192422` | PASS |

All three selected files were independently hashed again during this validation; each hash matched its manifest. The catalog contains these three dual-input-eligible cases. Case input eligibility is separate from model readiness: the current UC05 service is `INTEGRATION_READY` under the strict exported schema, while individual windows missing valid SpO₂ history, capnogram, AWP, or PPG abstain.

## Observed track metadata

The inspected cases contain these model-relevant VitalDB tracks. Metadata is reported as recorded by the source parser; `NOT_RECORDED` is preserved when the source does not provide a unit or numeric update rate.

| Track | Type | Recorded sample/update rate | Unit |
|---|---|---:|---|
| `SNUADC/ART` | Waveform | 500 Hz | mmHg |
| `Solar8000/ART_MBP` | Numeric | NOT_RECORDED | mmHg |
| `Solar8000/HR` | Numeric | NOT_RECORDED | /min |
| `Solar8000/PLETH_SPO2` | Numeric | NOT_RECORDED | NOT_RECORDED |
| `Primus/CO2` | Waveform | 62.5 Hz | mmHg |
| `Primus/AWP` | Waveform | 62.5 Hz | hPa |
| `SNUADC/PLETH` | Waveform | 500 Hz | NOT_RECORDED |

The UC04/UC05 preprocessing adapters apply the trained target sampling rules where verified. Case-relative time starts at `0s`; records are bounded by their VitalFile duration. Numeric missingness is preserved as missing/masked values. Quality tests distinguish missing, invalid, artifact, and recorded samples; the pipeline does not replace unavailable clinical values with normal values or zeros.

Missing source unit metadata is a known limitation: the catalog does not infer a unit for PPG or numeric SpO₂ solely to make a display appear complete. The frontend labels unknown quality/unit metadata honestly.

## Eligibility categories

| Requested category | Result | Classification |
|---|---|---|
| UC04-only real case | None among the three inspected cases | NOT_VERIFIED; do not invent an example |
| UC05-only real case | None among the three inspected cases | NOT_VERIFIED; do not invent an example |
| Dual UC04/UC05 input eligibility | Cases `1`, `6388`, `3300` | PASS |
| Actual insufficient-data case in selectable catalog | None selected | NOT_VERIFIED |
| Actual missing-required-track case in selectable catalog | None selected | NOT_VERIFIED |
| Actual invalid-window case in selectable catalog | None selected | NOT_VERIFIED |
| Synthetic/unit fixtures for absent tracks and invalid windows | Covered by backend validation tests | PASS for code-path handling, not proof of a real excluded catalog row |

## Ground-truth and independent evaluation limits

The model artifacts contain no frozen case-ID train/validation/test manifest. Selected case membership is therefore `UNKNOWN`; none is claimed as an independent test case. Trajectory summaries in the case manifests are descriptive source-data checks and are not model evaluation. No case-level AUROC, AUPRC, sensitivity, specificity, event lead time, false-alert rate, or independent calibration result was computed in this run.

| Requirement | Status | Evidence / limitation |
|---|---|---|
| Real case IDs and local source files | PASS | Official VitalDB records 1, 6388, 3300 reopened locally |
| Raw checksums | PASS | All three hashes match manifests |
| Track names, types, timestamp base, known units/rates | PASS | VitalFile manifests and loader checks |
| All source metadata available for every channel | NOT_VERIFIED | Some source unit/update-rate fields are `NOT_RECORDED` |
| All 6,330 candidates fully verified | NOT_VERIFIED | Only 3 were deeply inspected; 6,327 remain unverified |
| Training/validation/test membership | NOT_VERIFIED | No frozen case split IDs were supplied |
| Independent model performance | NOT_APPLICABLE to this engineering validation | Requires verified labels and split membership; metrics were not fabricated |
