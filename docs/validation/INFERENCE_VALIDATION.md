# SafeAnes UC04/UC05 Inference Validation

Validation date: 2026-10-10  
Scope: actual local checkpoints under `C:\Users\Namdr\Downloads\model`, VitalDB case windows, backend inference/API, and the displayed UC05 model output. This is engineering validation, not clinical validation.

## Current status — 2026-10-10

Both audited checkpoints are now runtime **`INTEGRATION_READY`**. This is
separate from case eligibility and from per-window eligibility. UC05 uses the
strict production gate: valid SpO₂ history plus capnogram, AWP, and PPG are
required; a window that fails the gate produces an explicit abstention and is
not silently filled. Follow-up evidence is **135 backend tests passed / 0
skipped / 13 warnings** with the configured artifacts and VitalDB cache,
**45 focused API/cache tests passed / 1 skipped**, **8 real-model smoke tests
passed**, **151 Node
tests passed**, TypeScript and production build passed. These are
software/inference checks, not clinical validation.

| Readiness dimension | UC04 | UC05 |
|---|---|---|
| Artifact load | PASS | PASS |
| Contract and preprocessing | PASS | PASS under strict exported schema |
| Selected VitalDB cases | `1`, `6388`, `3300` eligible | `1`, `6388`, `3300` eligible |
| Eligible-window forward pass | PASS | PASS |
| Missing/invalid required input | Explicit abstention | Explicit abstention |
| Clinical performance | NOT VERIFIED | NOT VERIFIED |

## Runtime and artifacts

| Item | Verified value | Result |
|---|---|---|
| Python | 3.12.4 | PASS |
| VitalDB Python package | 1.7.2 | PASS |
| PyTorch | 2.14.1+cpu | PASS; CPU only |
| NumPy / Pandas | 2.5.3 / 3.0.6 | PASS |
| UC04 artifact | `SafeAnes-UC04-HypoFormer`, SHA-256 `e8222e0cc9d3416c7382c9fbb53d9331608c7ae92b06f48b00e1933e7af93daa` | PASS |
| UC05 artifact | `SafeAnes-UC05-RespFormer`, SHA-256 `e7785f06bf107c82df7df56966fb1262644b8f0ab1c14b825bee7d5601d854de` | PASS |
| Dataset | VitalDB open dataset 1.0.1 | PASS |
| GPU execution | CUDA unavailable in the tested environment | NOT_VERIFIED |

Checkpoint files were hash checked and strict state-dict loading is covered by the backend tests. Model loading is allowlisted and verifies hashes before safe tensor-only deserialization. No checkpoint was edited or retrained.

## Verified input and output contracts

| | UC04 | UC05 |
|---|---|---|
| Task | New MAP episode `<=65 mmHg` lasting `>=60s` within 5, 10, or 15 minutes | New SpO₂ episode `<90%` lasting `>=60s` within 1, 3, or 5 minutes; auxiliary weak signal-derived ventilation-loss pattern |
| Main input | 300 s history, 1 Hz, 7 numeric features in fixed order; required ART 100 Hz / 3000 samples | 600 s history, 1 Hz, 18 numeric features in fixed order; capnogram/AWP 62.5 Hz / 3750 samples; PPG resampled from 500 Hz to 125 Hz / 7500 samples |
| Preprocessing version | `notebook-compat/uc04-a152750f` | `notebook-compat/uc05-95b2d441` |
| Output semantics | Raw logits plus uncalibrated sigmoid scores; not HPI and not calibrated probabilities | Hypoxemia logits with saved temperature scaling; auxiliary output remains a raw logit. No confidence interval |
| Production readiness | `INTEGRATION_READY` | `INTEGRATION_READY` under strict schema gate |

The exported `signal_schema.json` marks capnogram, airway pressure, and PPG
required. SafeAnes uses that strict schema as the current production contract;
the weaker historical stream-evaluator rule is retained only as provenance and
is not used for production inference.

## Actual checkpoint execution

The configured backend suite with VitalDB and model artifacts completed with
**135 passed, 0 skipped, and 13 warnings**. The focused final API/cache
regression suite completed with **45 passed, 1 skipped**. The real checkpoint
smoke suite completed with **8 passed** against VitalDB input, including repeated inference and strict
window-gate checks. The full frontend Node suite completed with **151 passed**.

Repeated forward outputs were stable for identical input (maximum repeated-output difference reported as zero in the fixed-window smoke run). No supplied frozen training prediction fixture, saved training tensor, or training checkpoint-linked split manifest exists, so independent golden training-output parity is **NOT_VERIFIED**. Unit and contract tests verify the packaged implementation, but they are not an external golden oracle.

## API-to-frontend output agreement

At VitalDB case `1`, replay time `600s`, the API and the running UI matched at
display precision. The UI retained model identity, task, horizon, quality,
coverage, and calibration semantics:

| Output at prediction time 600 s | API value | UI display |
|---|---:|---:|
| UC04 score at the displayed horizon | `.439917` | `.4399` |
| UC05 hypoxemia horizon 1 min | `.0012186` | `.001219` |
| UC05 hypoxemia horizon 3 min | `.006614` | `.006614` |
| UC05 hypoxemia horizon 5 min | `.01198` | `.01198` |

UC04 reports its actual 5/10/15-minute horizons and uncalibrated semantics; it
is not relabeled as HPI. UC05 reports its actual 1/3/5-minute hypoxemia task;
the auxiliary output remains a raw logit with no fabricated confidence. The
strict gate is visible in the model status and per-window quality state.

## Classification

| Requirement | Status | Evidence / limitation |
|---|---|---|
| Actual UC04 checkpoint loads and executes | PASS | Strict load and real VitalDB smoke test |
| Actual UC05 checkpoint loads and executes diagnostically | PASS | Strict-schema diagnostic forward test |
| UC04/UC05 production readiness | PASS for technical integration | Both services report `INTEGRATION_READY` after artifact checks; per-window abstention remains possible |
| Exact feature order, tensor shape, sampling and window contracts | PASS | Contract and preprocessing tests; see each model contract in `docs/integration/` |
| No future samples in input or exposed predictions | PASS | Input validation tests and replay/API checks at multiple cursors |
| Stable repeated inference | PASS | Fixed-window smoke test |
| Independent golden parity against frozen training outputs | NOT_VERIFIED | No saved golden tensors or model outputs were provided |
| Calibrated confidence | NOT_APPLICABLE | No confidence interval exists; UI/API do not fabricate one |
| Clinical performance from this engineering run | NOT_VERIFIED | No independent cohort labels or frozen split membership are available |

Full verified tensor details, preprocessing assumptions, and artifact notes are recorded in [UC04_MODEL_CONTRACT.md](../integration/UC04_MODEL_CONTRACT.md) and [UC05_MODEL_CONTRACT.md](../integration/UC05_MODEL_CONTRACT.md).

## Superseded historical record

The original 2026-10-09 snapshot classified UC05 as
`BLOCKED_CONTRACT_MISMATCH` while the historical stream-evaluator rule and
the exported schema were being reconciled. That classification is retained
only as historical provenance. The current strict-schema runtime status is
`INTEGRATION_READY`; it does not imply clinical validation or universal
window eligibility.
