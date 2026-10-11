# UC04 VitalDB inference results

Status follow-up (2026-10-10): the aggregate readiness limitation described
below was recorded before the UC05 required-waveform policy was made strict.
UC05 now requires valid SpO₂, capnogram, AWP, and PPG, and its loaded model is
reported `INTEGRATION_READY`; the historical result below is retained as an
as-of-run record. UC05 real-case smoke passed after this change.

Generated with the existing UC04 HypoFormer checkpoint and preprocessing
contract. The checkpoint files were read only; predictions are technical model
outputs and are not clinically validated.

## Verified model contract

- Model: `SafeAnes-UC04-HypoFormer`
- Version: `unversioned+sha256:e8222e0cc9d3416c7382c9fbb53d9331608c7ae92b06f48b00e1933e7af93daa`
- Artifact SHA-256: `e8222e0cc9d3416c7382c9fbb53d9331608c7ae92b06f48b00e1933e7af93daa`
- Runtime: Python 3.12.4, PyTorch 2.14.1+cpu
- Task: score whether a new MAP episode at or below 65 mmHg lasting at least
  60 seconds begins within 5, 10, or 15 minutes.
- Output: raw logit plus sigmoid-transformed **uncalibrated score**. It is not
  HPI, a calibrated probability, a diagnosis, or an observed event.
- Supported horizons: 5, 10, and 15 minutes only. The saved 0.5 threshold is
  returned only for the 5-minute output; the UI does not turn it into an alert.
- Each input window ends at its prediction timestamp. Replay/API reads expose
  only predictions whose prediction timestamp is at or before the as-of time.

## Eligible local cases

All three locally cached UC04-eligible cases from VitalDB 1.0.1 were processed.
Each candidate window passed the trained model's input validation. No case
demographics are repeated here; use the case catalog for recorded metadata.

| VitalDB case | Valid input windows | Horizon outputs | Abstained windows | Status |
|---|---:|---:|---:|---|
| 1 | 345 | 1,035 | 0 | READY |
| 6388 | 314 | 942 | 0 | READY |
| 3300 | 660 | 1,980 | 0 | READY |
| **Total** | **1,319** | **3,957** | **0** | **READY** |

The source raw-file SHA-256, dataset version, model identity, preprocessing
version, and per-window input metadata are retained in the case manifests and
prediction cache. Train/validation/test membership for these cases is unknown;
these results are not an independent performance evaluation.

## Reproducibility and replay check

The generated offline cache was compared with a separate on-demand inference
at case 1, prediction time 600 seconds. The actual checkpoint outputs matched
exactly for all three horizons:

| Horizon | Cached raw logit | On-demand raw logit | Absolute difference |
|---:|---:|---:|---:|
| 5 min | -0.24149799346923828 | -0.24149799346923828 | 0 |
| 10 min | 0.3299698233604431 | 0.3299698233604431 | 0 |
| 15 min | 0.4207121431827545 | 0.4207121431827545 | 0 |

At `as_of_s=600`, the prediction API returned 33 rows covering prediction
timestamps 300 through 600 seconds, with exactly the supported 5/10/15-minute
horizons and no future timestamps. The UC04 view returned actual VitalDB MAP,
SBP, DBP, and HR observations and the recorded `SNUADC/ART` waveform. CI, SV,
SVV, and SVR are shown as unavailable when the selected case has no matching
recorded tracks.

Numeric VitalDB observation quality is currently `UNKNOWN` because the raw
recording does not provide sample-level quality labels through this ingestion
path. Values are preserved as recorded; the UC04 view labels this explicitly.
The model's own per-window data coverage and quality status remain attached to
each prediction.

## Application behavior

- `GET /api/v1/cases/{case_id}/predictions/uc04?as_of_s=...` serves cached
  outputs only and filters by prediction timestamp.
- `GET /api/v1/cases/{case_id}/uc04-view?as_of_s=...` bundles recorded signals,
  waveform, recorded annotations, and the as-of filtered prediction cache.
- `python -m backend.app.services.inference.precompute_uc04` regenerates the
  cache from the exact model and eligible local cases; it does not retrain.
- UC04 and the other workspaces select between the existing synthetic demo and
  recorded VitalDB data through the shared data-source/replay provider. When
  `VITALDB_REPLAY` is active, the selected case and replay cursor are shared by
  the global header, Overview, UC01, UC02, UC03, UC04, and UC05. Synthetic mode
  remains a separate source and is never blended into recorded model inputs.
- Recorded `EVENT` entries are displayed as source annotations. No prediction
  is converted into a hypotension event or alert.
- The UC04 model status reports `INTEGRATION_READY` and its prediction/view
  endpoints serve real data. UC05 also reports `INTEGRATION_READY` under the
  strict exported schema; a UC05 window missing a required signal abstains.
  Aggregate health remains separate from model status and can still be
  unavailable when the configured dataset or artifact cache is not ready.

## Verification performed

- Full backend suite: **71 passed, 2 skipped**. The skipped tests require the
  opt-in network VitalDB smoke flag; actual local VitalDB inference was run by
  the offline batch service and checked through the local API.
- UC04 cache/API regression suite: **15 passed**.
- UC04 frontend adapter test: **1 passed**.
- Next.js production build: **passed**.
- Local built UC04 route: selected VitalDB case 1, sought to 601 seconds, and
  visually/accessibly confirmed the score and 5/10/15-minute outputs align with
  the API cache, alongside recorded signals, unknown quality labeling, and no
  observed-event alert derived from prediction.

## Limitations

- The detailed model-output evidence in this document is UC04-focused, but the
  real data source and replay controls are shared across the global shell,
  Overview, and UC01–UC05 through the common replay provider.
- VitalDB numeric observation quality is `UNKNOWN`; raw values, including
  suspicious values, are not silently repaired or removed from the recording.
- Model calibration, independent ground-truth evaluation, and train/test
  membership are unavailable from the supplied artifacts.
- The global header reflects the selected VitalDB case and source mode during
  recorded replay. Demographic, procedure, OR, and anesthesia fields that are
  absent from VitalDB remain `NOT_RECORDED`; synthetic demographics are not
  substituted into the recorded context.
- UC04 and UC05 model readiness are independent of this UC04 result cache.
  Current UC05 readiness is `INTEGRATION_READY` under the strict schema, while
  per-window eligibility and abstention remain explicit.
