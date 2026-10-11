# UC05 RespFormer model contract

**Current verification date:** 2026-10-10

## Current readiness matrix

| Dimension | Status | Evidence boundary |
|---|---|---|
| Artifact load | **PASS** | The allowlisted `respformer.pt` and all checksum-linked supporting JSON artifacts load with tensor-only deserialization. |
| Model contract | **PASS** | The exported schema is enforced as the production contract: valid SpO₂ history plus capnogram, AWP, and PPG are required for a window. |
| Selected-case eligibility | **PASS** | VitalDB cases `1`, `6388`, and `3300` independently pass the UC04 and UC05 eligibility pipelines and are catalogued as dual eligible. |
| Window eligibility | **PASS** | Each window is evaluated at its prediction timestamp; a missing or invalid required modality produces an explicit abstention. |
| Live output | **PASS** | The real checkpoint forward pass and replay/API/UI output path were exercised on VitalDB data. |
| Clinical validation | **NOT VERIFIED** | No claim of clinical performance, care suitability, or independent generalization is made. |

The readiness status below means **technical inference integration only**. It is
separate from case eligibility and from per-window eligibility: a ready model
can still abstain on a particular window.

Status: **TECHNICALLY INTEGRATION_READY under the confirmed strict production
gate**. The exact checkpoint, architecture, calibration, preprocessing, and
forward pass have been verified. SafeAnes requires valid capnogram, airway
pressure (AWP), and PPG for every production UC05 inference window, following
the exported `signal_schema.json`. Windows missing any core waveform abstain.
This status confirms engineering integration only, not clinical validation.

## Exact artifact and runtime

| Field | Verified value |
|---|---|
| Model ID | `SafeAnes-UC05-RespFormer` |
| Version | `v1+sha256:e7785f06bf107c82df7df56966fb1262644b8f0ab1c14b825bee7d5601d854de` |
| Artifact | `safeanes_uc05_respformer_v1/respformer.pt` — raw PyTorch state dict |
| SHA-256 | `e7785f06bf107c82df7df56966fb1262644b8f0ab1c14b825bee7d5601d854de` |
| Supporting files | `config.json` SHA-256 `6f402ec3d388028b4fc7b05b8ea8d187402b0d8fdd6a67dfba2f16d8a02b69a`; `signal_schema.json` SHA-256 `c7387214dabba32f48eb59bdd9e0d7fbea1bde5eb3af699d450881b8461b54d9`; `calibration_thresholds_metrics.json` SHA-256 `870a8ce5b1d008741a6fbb645114728c822075ac736e6bda9975ecadbcd22866` |
| Framework | PyTorch; training version is not recorded. Forward pass verified on 2.14.1+cpu |
| Tested runtime | Python 3.12.4, CPU; CUDA unavailable and not verified |
| Architecture | RespFormer v1 restored from the supplied notebook; strict state-dict load succeeds (446 entries) |

RespFormer uses five ConvNeXt1D waveform encoders, an 18-feature numeric
projection, a static projection, a Transformer backbone, three hypoxemia
horizon outputs, and an auxiliary ventilation-pattern output. Loaded
normalization buffers were checked against the notebook constants.

## Input contract

Primary task: estimate onset of a new SpO2 episode `< 90%` sustained for at
least 60 seconds at 1, 3, or 5 minutes. Training windows use 600 seconds and a
30-second stride. The auxiliary output represents a weak signal-derived
ventilation-loss pattern; it is not a diagnosis or explanation of cause.

| Input | Shape per request | Sampling / source |
|---|---:|---|
| Numeric history | `[600,18]` | 1 Hz; exact order below |
| Capnogram | `[3750]` | 62.5 Hz, `Primus/CO2` |
| Airway pressure | `[3750]` | 62.5 Hz, `Primus/AWP` |
| PPG | `[7500]` after resampling | 125 Hz target; VitalDB source `SNUADC/PLETH` at 500 Hz |
| Flow | `[3750]` | 62.5 Hz, optional in training sample builder |
| Respiratory trace | `[3750]` | 62.5 Hz, optional in training sample builder |
| Static | `[7]` | `age, bmi, asa, sex_male, weight, height, emop` |

Numeric feature order is `SPO2, ETCO2, RR_CO2, TV, MV, PIP, PEEP, PPLAT,
MAWP, FIO2, COMPLIANCE, VENT_LEAK, SET_FIO2, SET_TV, SET_PIP, SET_RR, HR,
MAC`. Candidate VitalDB track mapping matches the training notebook. Missing
numeric values remain NaN with a cell mask; normalization uses embedded fixed
centers/scales, clips to `[-8,8]`, and the model maps invalid normalized values
to zero.

Waveforms are resampled with polyphase resampling where needed, padded/truncated
to trained length, normalized per window by median and
`max(IQR/1.349, standard deviation, 1e-3)`, and clipped to `[-8,8]`. A waveform
mask is passed to the model. Flow and respiratory waveforms can be absent.
SpO2 values outside `[50,100]` are excluded for the 80% signal-quality gate;
interior gaps up to five samples are interpolated for that gate only. The model
input retains raw missingness and a cell-level mask.

The production service requires valid SpO2 history and each of the three core
waveforms independently: capnogram, airway pressure, and PPG. Flow and
respiratory traces remain optional. The input is cut at prediction time and
future samples are rejected before preprocessing. Missing or invalid required
signals cause an abstention; no waveform is fabricated to fill a gap.

## Required-modality decision

The artifact schema marks capnogram, AWP, and PPG `optional=false`. A historical
stream evaluator accepted PPG plus either capnogram or AWP, and the model
architecture accepts modality masks. SafeAnes has adopted the stricter
three-waveform production eligibility rule, as explicitly confirmed for this
integration. This does not claim that the historical evaluator used that same
gate or that all modalities are mathematically necessary to execute the
checkpoint. Runtime readiness is `INTEGRATION_READY`; windows not satisfying
the selected production contract are rejected before inference.

## Output contract and saved calibration

The forward pass returns raw hypoxemia logits `[1,3]` ordered 1, 3, and 5
minutes, plus one auxiliary raw ventilation-pattern logit `[1]`.

The allowlisted `calibration_thresholds_metrics.json` has successful
per-horizon temperature scaling:

| Horizon | Temperature |
|---:|---:|
| 1 min | `0.2664688229560852` |
| 3 min | `0.24328535795211792` |
| 5 min | `0.20453710854053497` |

The service applies `sigmoid(logit / temperature)` to the three hypoxemia
outputs only. `confidence` remains `null`; temperature scaling does not create
a confidence interval. The saved 5-minute threshold is `0.1182835621637828`;
it is returned only with the 5-minute horizon. No auxiliary calibration or
threshold is supplied, so the auxiliary value remains a raw logit.

Stored evaluation evidence in the calibration artifact is weak: validation
event sensitivity was 2/14 (14.3%) with 0.483 false alerts/hour; test event
sensitivity was 0/1 with 0.316 false alerts/hour. The test event count is one.
These figures are reported as artifact contents, not as independently
reproduced metrics, and do not establish reliable event performance.

## Current API/cache execution — case 1 at `t=600s`

The verified current VitalDB cache/API row uses the prospective window
`[0s, 600s]`, the strict signal-schema gate, and the exact UC05 checkpoint.
The three hypoxemia values below are temperature-scaled outputs; the auxiliary
value is a raw logit with no calibration or diagnosis attached.

| Output | Raw output | API interpreted output | Calibration |
|---|---:|---:|---|
| Hypoxemia, 1 min | `-1.7876935005187988` | `0.0012186064230534353` | Saved temperature scaling |
| Hypoxemia, 3 min | `-1.219323754310608` | `0.006614151206447809` | Saved temperature scaling |
| Hypoxemia, 5 min | `-0.9025083184242249` | `0.011980253518175056` | Saved temperature scaling |
| Auxiliary ventilation-pattern output | `-4.387986183166504` | raw logit `-4.387986183166504` | Not calibrated |

The current cache records `DEGRADED` input quality and `0.38127777945871155`
aggregate coverage. The cache file is
`backend/data/processed/uc05_predictions/1.json`; its generation run
identifier is not recorded in the model contract. The model remains
technically `INTEGRATION_READY`; per-window strict-gate failures abstain.

The configured backend suite passed **135 tests with 0 skips and 13 warnings**;
the dedicated real-model smoke subset passed **8 tests**; the focused backend
API/cache suite passed **45 tests with 1 expected artifact-gated skip**. Repeated
inference on identical input was finite and stable within
`rtol=1e-5, atol=1e-6`.

## Superseded one-off smoke output

The following values came from an earlier CPU smoke run recorded as case 1 at
`t=600s`; the exact cache row/run identifier and input-quality reconstruction
are not available. They are preserved for audit history only and must not be
used as the current API parity reference:

- Historical raw logits at 1/3/5 minutes:
  `-1.78873718`, `-1.22046566`, `-0.90277129`.
- Historical temperature-scaled values: `0.00121385`, `0.00658338`,
  `0.01196504`.
- Historical auxiliary raw logit: `-4.38626337`.
- Historical reported coverage: `0.414611`, quality `DEGRADED`.

The notebook includes no saved prediction fixture or executed golden output.
The package tests strict checkpoint compatibility and repeated inference on an
identical real window instead of presenting self-generated values as an
independent golden reference. Golden parity, frozen split membership, and
independent clinical performance remain **NOT VERIFIED**.

## Loading and security

The registry allowlists the checkpoint and supporting JSON artifacts and
verifies each SHA-256 before loading. Checkpoints are deserialized with
`torch.load(weights_only=True)` and checked as tensor-only state dictionaries.
No arbitrary pickle loading or download is performed by the registry.

## Remaining limitations

- The model's historical stream-evaluator eligibility was looser than the
  production contract now enforced by SafeAnes; the strict exported schema is
  the current production gate. No independent retraining or clinical
  validation was performed.
- Training framework/package versions, checkpoint-linked training run, a
  complete per-channel units manifest, model license, and independent golden
  predictions were not supplied.
- CUDA was not available for validation.
- This is technical inference integration, not clinical validation or a
  recommendation for patient care.

## Superseded historical status

An earlier 2026-10-09 validation snapshot recorded
`BLOCKED_CONTRACT_MISMATCH` while the exported schema and historical stream
evaluator were being reconciled. That text describes the pre-confirmation
state only and is superseded by the strict-gate `INTEGRATION_READY` status
above. The historical evaluator is retained as provenance, not as the active
runtime contract.
