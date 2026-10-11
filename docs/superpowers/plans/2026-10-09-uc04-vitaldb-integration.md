# UC04 Real VitalDB Integration Plan

## Goal

Run the verified SafeAnes UC04 checkpoint over locally cached, validated VitalDB cases and expose timestamped predictions and recorded signals in the existing UC04 workstation. Preserve the model contract: three uncalibrated sigmoid scores for 5, 10, and 15 minute horizons, with no HPI or confidence claim.

## Design

- Extend the existing backend `ModelManager` and repository path instead of creating a second model runtime.
- Add an offline batch inference/cache service. Enumerate only catalog-eligible cases and contract-aligned 30-second windows, apply the existing training preprocessor and input gates, run the loaded checkpoint, and atomically persist outputs with model/preprocessing/checksum provenance.
- Add an as-of prediction endpoint that reads the cache and never returns a prediction whose `prediction_time` is after the requested replay time. Keep the existing point prediction endpoint backward compatible.
- Add a UC04-only VitalDB source control and case selector. Keep the approved workspace composition; reuse its panels while making the source and output semantics explicit.
- Drive real-case playback from the backend replay session API. Fetch only the visible real-data window and as-of predictions. Use the existing clinical waveform canvas for observed ABP with a VitalDB source adapter; no generated values fill missing tracks.
- In VitalDB mode, show recorded measurements only when present, label unavailable parameters as `DATA NOT AVAILABLE`, remove HPI/confidence semantics, show the actual 5/10/15 model scores and recorded EVENT annotations, and do not create clinical event episodes from predictions.

## Work Sequence

1. Write failing tests for cache schema, window eligibility, reproducible persistence, as-of filtering/no leakage, and UC04 output semantics/horizons.
2. Implement the backend cached batch service, manifest/index, and as-of API response.
3. Run batch inference using the actual registered checkpoint on each selected UC04-eligible VitalDB case; store output files under processed VitalDB data.
4. Add failing frontend utility/component checks for model-output mapping (actual horizons only, no HPI/confidence, missing values remain unavailable) and API-time gating.
5. Implement the source selector, case selector, VitalDB replay controls, typed API client, and mappings into current UC04 panels.
6. Add EN/VI labels for recorded VitalDB data, model prediction/output, horizon, input coverage, uncalibrated score, and unavailable data.
7. Verify backend inference/cache/API consistency, frontend type/build checks, replay as-of behavior, and rendered UC04 in both synthetic and VitalDB modes.

## Acceptance Evidence

- All cache predictions identify the exact case, model id/version, prediction time, input interval, supported horizon, raw logit, uncalibrated score, data coverage, quality, calibration status, threshold when verified, and artifact SHA256.
- Output horizons are exactly 5, 10, and 15 minutes; no 1-minute values or HPI labels are emitted for the real model.
- Cache generation is deterministic and reuses existing predictions rather than invoking inference on frontend frames.
- An as-of read at time `t` returns no output with a prediction timestamp greater than `t`.
- Recorded samples, annotations, and model outputs shown in UC04 match the backend API for the selected case and time.
- No unavailable CI/SV/SVV/SVR values or inferred clinical episodes are fabricated.
- Backend tests and Next.js production build pass; actual-case UI render is checked when local services are available.

## Risks / Boundaries

- The registered model score is explicitly uncalibrated and is not an HPI or calibrated probability.
- Case split membership is unknown, so outputs are demonstration/integration results, not independent model evaluation.
- UC04 contract eligibility requires its recorded tracks and training-time preprocessing gates; case-level eligibility alone does not guarantee every window is inferable.
- VitalDB cases contain no synthetic patient demographics; only recorded dataset metadata is presented.
