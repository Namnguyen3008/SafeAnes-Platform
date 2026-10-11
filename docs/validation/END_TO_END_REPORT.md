# SafeAnes VitalDB + Pretrained Models: End-to-End Validation

Validation date: 2026-10-10  
Environment: Windows local workstation; Python 3.12.4, VitalDB 1.7.2, PyTorch 2.14.1+cpu, NumPy 2.5.3, Pandas 3.0.6, FastAPI 0.142.2, Next.js 15.5.27. CUDA was unavailable.

## Current status — 2026-10-10

Both UC04 and UC05 now report runtime `INTEGRATION_READY` after artifact and
contract checks. The strict UC05 input rule is explicit: each production
window must contain valid SpO₂ history, capnogram, AWP, and PPG; a failing
window abstains with a reason. This follow-up does not establish clinical
validation or turn model readiness into a performance claim. The configured
backend suite passed **135 tests with 0 skips and 13 warnings**; the focused
API/cache suite passed **45 tests with 1 skip**.

## Overall result

**PASS for the verified engineering path, with explicit limitations.** Real
VitalDB records were checksummed and parsed, model-specific windows were
constructed, both actual local checkpoints were executed, API responses were
gated by replay time, and the running frontend displayed recorded case data
and matching model outputs. The selected catalog cases `1`, `6388`, and `3300`
pass both model eligibility pipelines. This report does not establish clinical
validity.

## Requirement classification

| Test category / requirement | Status | Result |
|---|---|---|
| Source integrity for selected local VitalDB cases | PASS | Cases `1`, `6388`, and `3300` reopened; all raw checksums match manifests; track metadata and case-relative time inspected |
| Source integrity for the entire discovery index | NOT_VERIFIED | 3 of 6,330 unique indexed candidates were fully inspected; 6,327 remain unverified |
| UC04 checkpoint, input path, inference, semantics | PASS | Exact checkpoint/hash loads and executes; task is new sustained MAP-low episode at 5/10/15 min; scores are uncalibrated |
| UC05 checkpoint forward execution | PASS | Exact checkpoint/hash executes on strict-schema eligible windows |
| UC05 production readiness | PASS for technical integration | `INTEGRATION_READY` after strict schema/artifact checks; individual windows can abstain |
| Golden training-output parity | NOT_VERIFIED | No frozen golden predictions/tensors were supplied |
| Temporal integrity / no future leakage | PASS | Feature builders and replay reject future input; API and UI reveal only predictions at or before cursor |
| UC04-only, UC05-only, dual and real excluded-case coverage | PARTIAL | Cases `1`, `6388`, and `3300` are dual eligible; no verified UC04-only or UC05-only selected case is available, and insufficient/missing/invalid windows are represented through eligibility tests rather than a dedicated catalog example |
| Prediction performance against independent case-level labels | NOT_APPLICABLE to this run | Split IDs are unknown; no independent case-level metrics were computed |
| Backend/frontend case, time, waveform, output and coverage agreement | PASS for checked case/view | Case 1 at 600s; API/UI model values match at display precision and retain task, horizon, quality, and calibration semantics |
| Numeric parity across every field on all six routes | NOT_VERIFIED | Cross-route case/time/mode was verified; all individual numeric fields were not separately diffed |
| VitalDB replay controls and future gating | PASS | Backend tests and short API probes at 1x/10x/30x/60x, pause, seek, reset |
| Route and EN/VI persistence | PASS | Browser check across Overview and UC01–UC05; language change and reload preserved case/time/source |
| Frontend case-selector switch between real cases | PASS | Current Playwright integration switched case 6388 → 3300, reset the cursor, and confirmed the previous event and prediction were cleared |
| API/model latency | PASS as a measured observation | Single warm UC04/UC05 views took 470.5/791.0 ms; not a load benchmark |
| Cold replay latency | NOT_VERIFIED against an SLO | Fresh process snapshot measured 1.68s and 3,438,427 bytes; an earlier ~11.7s measurement was not reproduced; no latency target was specified |
| Frontend memory/FPS under playback | NOT_VERIFIED | No profiler capture |
| Failure handling: bad/missing case/track/model/window/cache/network | PASS at backend/test level | Structured errors and no fake fallback values covered by tests |
| Network interruption visible in browser | PASS | Current Playwright integration interrupted API access; recorded mode remained selected and the failure state stayed explicit |
| Synthetic-demo separation and regression | PASS | Explicit source label/mode and the full 151-test frontend Node suite pass; real-data view does not blend synthetic outputs |
| Clinical validation or care suitability | NOT_APPLICABLE / NOT CLAIMED | Engineering success is not clinical evidence |

## Model outputs and provenance

The backend model registry reports:

- UC04 `SafeAnes-UC04-HypoFormer`, artifact SHA-256 `e8222e0cc9d3416c7382c9fbb53d9331608c7ae92b06f48b00e1933e7af93daa`, readiness `INTEGRATION_READY`.
- UC05 `SafeAnes-UC05-RespFormer`, artifact SHA-256 `e7785f06bf107c82df7df56966fb1262644b8f0ab1c14b825bee7d5601d854de`, readiness `INTEGRATION_READY` under the strict exported schema.

At case 1 and UI replay time 600s, the API and UI matched at display
precision: UC04 `.439917` rendered `.4399`; UC05 1/3/5-minute outputs
`.0012186/.006614/.01198` rendered `.001219/.006614/.01198`. UC04 retains
uncalibrated 5/10/15-minute semantics. UC05 uses saved temperature scaling for
the hypoxemia outputs, while its auxiliary output remains a raw logit. Neither
model has a fabricated confidence score.

## Validation commands and fixes

Fresh checks in this validation run:

| Check | Result |
|---|---|
| Configured backend suite with VitalDB/model smoke enabled | **135 passed, 0 skipped, 13 warnings** |
| Focused API/cache regression suite | **45 passed, 1 skipped** |
| Real checkpoint smoke suite | **8 passed** (included in the configured run) |
| `node --test tests/*.test.cjs` | **151 passed, 0 failed** |
| `npx tsc --noEmit` after the Next build completed | **Passed** |
| `npm run build` | **Passed**; Next.js generated Overview and all six module/supporting routes |
| Local `/api/v1/health/live` | **200**, `alive` |
| Local `/api/v1/health/ready` | Depends on configured dataset/model cache; model readiness is independently reported and both current model services are `INTEGRATION_READY` |
| Local model/case/prediction endpoints | **200** for catalog and eligible windows; UC04/UC05 statuses explicit |
| Browser route/language/reload check | **Passed** for VitalDB case 1 at `00:10:00`; EN/VI navigation retained the shared cursor |

Two validation defects were corrected before these results: the checked OpenAPI snapshot was regenerated and aligned with the typed frontend response contract; VitalDB source mode is now restored across a browser reload, with a regression test. The first standalone typecheck overlapped `next build` while `.next/types` was being regenerated and failed on missing generated files; the sequential rerun after build passed.

The suite reported Starlette/httpx deprecation and PyTorch Transformer nested-tensor warnings. They did not fail tests. The replay snapshot is bounded but sizeable; this validation measured 1.68 seconds and about 3.44 MB in a fresh runtime. A previously reported 11.7 second cold time was not reproduced, and no response-time SLO was provided.

## Remaining blockers

1. **No external golden parity set:** no frozen training tensors or outputs were supplied for independent preprocessing/output parity.
2. **Incomplete case census:** only 3 of 6,330 index candidates received full validation. The current catalog contains three dual-input-eligible cases and no verified single-model-only selected case.
3. **No independent clinical evaluation:** selected-case train/test membership is unknown and this run did not compute clinical performance metrics.
4. **Replay performance limits:** browser memory/FPS under waveform playback were not profiled, and no formal latency SLO was supplied.
5. **Runtime provenance gaps:** model training package versions, complete training run provenance, artifact licensing from the model owner, and CUDA execution remain unverified.

## Superseded historical record

An earlier 2026-10-09 validation snapshot classified UC05 as
`BLOCKED_CONTRACT_MISMATCH` because the historical stream-evaluator gate had
not yet been reconciled with the exported schema. That record is retained for
audit history only. The current strict schema is the production contract and
the current technical readiness status is `INTEGRATION_READY`.

Detailed results: [inference validation](INFERENCE_VALIDATION.md), [case validation](CASE_VALIDATION.md), [replay validation](REPLAY_VALIDATION.md).

## Latest full-stack verification refresh — 2026-10-10

The following checks were rerun from `C:\Users\Namdr\Downloads\SafeAnes`
using test-owned service ports 8100/3100. The user's existing port 3000 was not
started or stopped by the verification launcher.

| Check | Result |
|---|---|
| Configured backend suite, real model/checkpoint smoke enabled | **152 passed, 0 skipped, 13 warnings** |
| `node --test tests/*.test.cjs` | **172 passed, 0 failed** |
| PowerShell launcher checks | **24 passed** on Windows PowerShell 5.1 and PowerShell 7.6.5 |
| API/browser replay integration | **6 passed**; case 6388 at 1025 s matched API observations/predictions, and switching to 3300 cleared prior replay selections and outputs |
| Visual regression and workstation matrix | **9 passed**; six viewport projects, Overview + UC01–UC05, EN/VI; no uncontrolled horizontal page overflow |
| `npx tsc --noEmit` | **Passed** |
| Isolated Next.js production build | **Passed**; all SafeAnes routes generated |
| Full-stack health / readiness | **Passed**; catalog and selected cache ready; UC04 and UC05 `INTEGRATION_READY` |
| Replay launcher cleanup | **Passed**; project `tsconfig.json` hash unchanged and owned temporary tsconfig/output removed |

The full-stack run returned source-derived backend build ID
`f28662896aa1b64ac3ab8f0733fbac19599477009e0315cb6ad3dbf49e1f1666`.
The isolated build used a launcher-owned Next output directory and temporary
tsconfig; the normal `.next` output was not used. Browser screenshots and test
logs are stored locally under `test-results/visual/` and
`test-results/integration/` (ignored local artifacts).

Still `NOT_VERIFIED`: exact Figma pixel comparison, GPU/Linux execution,
independent clinical performance, frozen training-split membership, browser
waveform FPS/memory profiling, and full WCAG contrast automation. Engineering
test success does not establish clinical validation.
