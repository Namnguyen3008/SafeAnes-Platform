# SafeAnes model registry and readiness

**Current verification date:** 2026-10-10  
**Scope:** local allowlisted UC04/UC05 artifacts, validated VitalDB case
windows, backend inference services, replay as-of gating, and frontend model
output display. This is engineering evidence; it is not clinical validation.

## Current readiness matrix

| UC | Model / version | Verified task | Artifact SHA-256 | Runtime readiness | Contract / preprocessing | Case eligibility | Window / live-output status |
|---|---|---|---|---|---|---|---|
| UC04 | `SafeAnes-UC04-HypoFormer` / `unversioned+sha256:e8222e0cc9d3416c7382c9fbb53d9331608c7ae92b06f48b00e1933e7af93daa` | New MAP `<=65 mmHg` episode sustained `>=60s` within 5, 10, or 15 minutes | `e8222e0cc9d3416c7382c9fbb53d9331608c7ae92b06f48b00e1933e7af93daa` | **INTEGRATION_READY** | Fixed 300-second numeric history, 30-second stride, verified feature order and prospective cutoff | Cases `1`, `6388`, `3300` pass UC04 eligibility | Eligible windows execute; invalid windows abstain. Score is uncalibrated; confidence is `null`. |
| UC05 | `SafeAnes-UC05-RespFormer` / `v1+sha256:e7785f06bf107c82df7df56966fb1262644b8f0ab1c14b825bee7d5601d854de` | New SpO₂ `<90%` episode sustained `>=60s` at 1, 3, or 5 minutes; auxiliary signal-derived ventilation-loss pattern | `e7785f06bf107c82df7df56966fb1262644b8f0ab1c14b825bee7d5601d854de` | **INTEGRATION_READY** | Strict exported schema: valid SpO₂ history plus capnogram, AWP, and PPG; 600-second history, 30-second stride | Cases `1`, `6388`, `3300` pass UC05 eligibility | Eligible windows execute; missing/invalid required waveforms abstain. Saved temperature scaling applies only to hypoxemia outputs; auxiliary output is a raw logit. |

`INTEGRATION_READY` means the artifact loads, its audited contract and
preprocessing execute, and a real checkpoint forward pass succeeds. It does
not mean that every case or every time window is eligible, that a prediction
is available at every replay time, or that the output is clinically validated.

## External paths and safe loading

Configure `SAFEANES_MODEL_ROOT`, `UC04_MODEL_PATH`, `UC05_MODEL_PATH`, and
`MODEL_REGISTRY_PATH`. Explicit checkpoint paths may be outside the repository;
their bytes must still match the corresponding audited hash. Expected sidecar
JSON files must be beside the configured checkpoint and match their registered
hashes. The API accepts model IDs only; clients cannot choose a filesystem
path. Pickles are not downloaded or executed, and PyTorch uses
`weights_only=True` after digest verification.

If an artifact is missing, modified, or invalid, that model remains `BLOCKED`
and exposes a path-free `MODEL_NOT_READY` status. This failure state is
separate from the current verified status of both models in the configured
artifact environment.

| Item | UC04 | UC05 |
|---|---|---|
| Checkpoint | `safeanes_uc04_model/model.pt` | `safeanes_uc05_respformer_v1/respformer.pt` |
| Framework | PyTorch; CPU smoke-tested on `2.14.1+cpu` | PyTorch; CPU smoke-tested on `2.14.1+cpu` |
| Python runtime | `3.12.4` | `3.12.4` |
| Supporting artifacts | `config.json`, `thresholds.json` | `config.json`, `signal_schema.json`, `calibration_thresholds_metrics.json` |
| CUDA | Not verified; unavailable in validation environment | Not verified; unavailable in validation environment |

Complete supporting-artifact hashes and feature-level contracts remain in
[UC04_MODEL_CONTRACT.md](integration/UC04_MODEL_CONTRACT.md) and
[UC05_MODEL_CONTRACT.md](integration/UC05_MODEL_CONTRACT.md). No artifact was
retrained or modified.

## Calibration and output semantics

- **UC04:** the checkpoint returns raw logits and sigmoid scores. No fitted
  calibration artifact was supplied, so scores are uncalibrated and confidence
  is unavailable (`null`). The UI must not label these scores as HPI or as
  calibrated probabilities.
- **UC05 hypoxemia output:** the verified saved temperature-scaling artifact
  applies to the 1, 3, and 5-minute outputs. The saved 5-minute threshold is
  exposed only for that horizon.
- **UC05 auxiliary output:** this is an auxiliary raw ventilation-pattern
  logit. No calibration or decision threshold is supplied, and it is not a
  diagnosis, cause, or validated respiratory-risk probability.

## Validated cases and replay evidence

The validated local catalog contains these dual-eligible case IDs:

| Case ID | UC04 | UC05 | Selection status |
|---:|---:|---:|---|
| `1` | eligible | eligible | selected |
| `6388` | eligible | eligible | selected |
| `3300` | eligible | eligible | selected |

At VitalDB case `1`, replay time `600s`, the running UI agreed with the API at
display precision: UC04 rendered `.4399` for the corresponding API value
`.439917`; UC05 rendered `.001219`, `.006614`, and `.01198` for the 1-, 3-, and
5-minute API outputs `.0012186`, `.006614`, and `.01198`. EN/VI route navigation
retained the shared `00:10:00` cursor.

The backend and frontend reveal cached predictions only at or before the replay
cursor. A model may be ready while a window is `ABSTAINED`, a cache is
`NOT_READY`, or an input is otherwise ineligible.

## Verification evidence

| Check | Current result |
|---|---|
| Configured backend suite with VitalDB/model smoke enabled | **135 passed, 0 skipped, 13 warnings** |
| Focused final API/cache regression suite | **45 passed, 1 skipped** |
| Real checkpoint smoke suite | **8 passed** |
| Full frontend Node suite | **151 passed** |
| TypeScript | **PASS** (`npx tsc --noEmit`) |
| Production build | **PASS** (`npm run build`) |
| Synthetic visual suite | **3 passed** at `1440x900` |

The real-mode screenshots are stored under
`C:\Users\Namdr\AppData\Local\Temp\safeanes-sdd\model-readiness\task-4\visual\`
(UC04 EN/VI and UC05 VI). Figma screenshot comparison and the larger viewport
matrix are **NOT VERIFIED**.

## Evidence boundaries and non-claims

- No frozen training tensor/prediction fixture was supplied; independent golden
  preprocessing/output parity is **NOT VERIFIED**.
- Training/validation/test split membership for the selected cases is not
  frozen or known; no independent generalization claim is made.
- No independent case-level clinical performance evaluation was run. AUROC,
  AUPRC, sensitivity, specificity, lead time, false-alert rate, and calibration
  are therefore not reported as engineering results.
- Technical readiness and replay agreement do not establish clinical validity
  or suitability for care decisions.

## Superseded historical status

An earlier validation snapshot recorded UC05 as
`BLOCKED_CONTRACT_MISMATCH` while the exported modality schema and historical
stream-evaluator gate were being reconciled. That is a superseded historical
record. The current production contract is the strict schema described above,
and the current runtime status is `INTEGRATION_READY` when its allowlisted
artifacts load successfully.
