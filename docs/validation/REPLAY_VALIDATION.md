# SafeAnes Replay Validation

Validation date: 2026-10-09  
Replay type: retrospective playback of recorded VitalDB case data. It is not a live patient connection or a live clinical monitor.

## Time and future-data checks

Replay uses case-relative seconds from the VitalDB recording origin. Backend APIs require bounded/as-of requests, and the frontend shares the selected case and cursor across modules.

| Check | Status | Evidence |
|---|---|---|
| Observations after replay time are hidden | PASS | Replay/window tests at multiple seek points; API view at case 6388 `as_of_s=1025` contained observations no later than 1025 s |
| Predictions after replay time are hidden | PASS | Cached prediction results are filtered by `prediction_time`; latest output at `as_of_s=1025` was 1020 s |
| Model input windows end no later than prediction time | PASS | Feature/window validators reject future samples; fixed-window smoke test |
| Future interventions or outcome labels enter the feature window | PASS | Input builders use only the historical window; future sample mutation/rejection tests |
| Backward seek reconstructs current state | PASS | Seek/snapshot tests and backend replay audit across cases `1`, `6388`, `3300` |
| Reset restores case start | PASS | Replay engine and API reset tests |

At case `6388`, UI cursor `00:17:05` (`1025s`) showed model outputs timestamped `00:17:00` (`1020s`). No later prediction was visible. UC05 output values and data coverage matched the API response to displayed precision (see [INFERENCE_VALIDATION.md](INFERENCE_VALIDATION.md)).

## Playback controls and synchronization

Backend replay-session checks exercised 1x, 10x, 30x, and 60x with play, pause, seek, reset, and speed changes. In a short 250 ms playback probe, measured simulated advancement was approximately 0.25s, 2.81s, 7.95s, and 16.92s respectively; the paused cursor remained stable, seeking landed exactly on the requested time, and reset returned to 0. These are functional probes, not timing guarantees or a performance benchmark.

| Frontend behavior | Status | Evidence |
|---|---|---|
| One selected VitalDB case/cursor across Overview, UC01, UC02, UC03, UC04, UC05 | PASS | Browser navigation checked all six routes; case 6388, cursor 00:17:05, VitalDB label persisted |
| Language switch EN ↔ VI preserves source and replay position | PASS | Browser switched to Vietnamese and back to English; same case/cursor remained visible |
| Browser reload preserves VitalDB source mode | PASS | Selected VitalDB, reloaded the local app, and verified recorded-case mode and case 6388 remained selected |
| Backend case switch/reset clears case-specific state | PASS | Backend/API replay tests and cross-case seek checks |
| Interactive UI case-selector switch between two real cases | PASS | Playwright switched case 6388 → 3300; the cursor reset to 0 s and case-specific event/model state cleared |
| Waveforms and trends use recorded samples and retain gaps | PASS | VitalDB adapter and waveform tests; rates/timestamps/quality are preserved and future samples excluded |
| UI full-resolution waveform FPS and memory under all playback speeds | NOT_VERIFIED | No browser profiler/memory capture was run |

## API and throughput observations

Warm local API views for case 6388 at `as_of_s=1025`, one request each:

| Endpoint | HTTP | Elapsed | Response size |
|---|---:|---:|---:|
| `/api/v1/cases/6388/uc04-view?as_of_s=1025&window_seconds=3600` | 200 | 470.5 ms | 1,484,275 bytes |
| `/api/v1/cases/6388/uc05-view?as_of_s=1025&window_seconds=3600` | 200 | 791.0 ms | 1,309,666 bytes |

These are single warm local requests, not a load test. A fresh `BackendRuntime` process produced the case 6388 snapshot at `600s` in **1,684.9 ms**, with a JSON payload of **3,438,427 bytes**. An earlier audit reported about 11.7 seconds for a cold snapshot, but that latency was not reproduced in this fresh-process measurement. The initial payload remains sizeable; it contains bounded 30-minute numeric history, recent waveform windows, metadata, and cached outputs. No latency or payload-size service target was specified, so responsiveness against an acceptance target is **NOT_VERIFIED**.

## Replay classification

| Requirement | Status | Limitation |
|---|---|---|
| 1x/10x/30x/60x controls, pause, seek, reset | PASS | Functional tests and API probes; no hard real-time guarantees |
| Route/language/reload persistence | PASS | Verified on the running UI |
| Case switch through backend session | PASS | Covered by backend tests |
| Case switch through visible UI selector | NOT_VERIFIED | Not changed during browser validation |
| No future observations, predictions, or features | PASS | Boundary tests and API as-of check |
| Bounded waveform delivery and preserved raw gaps | PASS | Stream/window tests |
| Cold replay responsiveness against a defined SLO | NOT_VERIFIED | Fresh process: 1.68 s / 3,438,427 bytes; prior 11.7 s measurement was not reproduced; no SLO was provided |
| Browser FPS and memory leak profile | NOT_VERIFIED | Not measured with a profiler |

## Test-owned replay integration refresh — 2026-10-10

The full-stack Playwright suite passed **6/6**. It exercised the selected
VitalDB case through the rendered UI and typed API, compared as-of observations
and predictions at case 6388 / 1025 s, navigated Overview and UC01/UC04/UC05,
switched EN/VI without resetting replay, and switched cases 6388 → 3300.
Backward seek removed later prediction/output state; case switching reset the
cursor and cleared the prior event selection. The network interruption test
kept VitalDB mode selected and showed failure explicitly rather than falling
back to synthetic measurements.

The test-owned launcher also reported case 6388 dual eligible with cache status
`READY`, both model services `INTEGRATION_READY`, and API/backend build identity
`f28662896aa1b64ac3ab8f0733fbac19599477009e0315cb6ad3dbf49e1f1666`.
PowerShell verification passed 24 checks in Windows PowerShell 5.1 and
PowerShell 7.6.5. The launcher left the project `tsconfig.json` unchanged and
removed its owned temporary config and Next output directory.

The replay/UI integration did not profile Canvas frame intervals, heap growth,
or renderer mount/unmount behavior at 1x/10x/30x/60x; those remain
`NOT_VERIFIED` in the waveform performance plan.
