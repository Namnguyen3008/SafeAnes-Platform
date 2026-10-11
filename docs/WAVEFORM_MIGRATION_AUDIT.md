# SafeAnes Waveform Migration Audit and Results

**Date:** 2026-10-08  
**Scope:** Analysis of read-only `C:\Users\Namdr\Downloads\webui` and implementation/verification in the SafeAnes simulation, waveform, chart, and UC01–UC05 UI paths.

## Reference source and reuse boundary

The reference package is a React 19/Vite application with no charting dependency. Its replay monitor renders each signal with a 2D Canvas, uses a bounded 10-second API frame, and retains per-channel units, source track, rate, and availability. The renderer sizes its backing store for `devicePixelRatio`, redraws on data or `ResizeObserver` changes, uses fixed fallback ranges or a robust percentile range when the source does not provide one, clips the trace to the plot, breaks paths at `null` samples, and maps sample time onto a wrapped 10-second sweep. The stack keeps each signal label, rate, status, trace, and value together and scrolls the channel list independently.

The reference root contains no `LICENSE`, `COPYING`, `NOTICE`, or visible Git metadata. The source therefore does not establish an approved reuse license or ownership. No reference implementation code will be copied or adapted verbatim. SafeAnes will independently implement the compatible Canvas, high-DPI, bounded-window, explicit-gap, and synchronized-time techniques after the comparison below.

## Original SafeAnes waveform implementation (pre-migration baseline)

SafeAnes has no ECG stream. The simulation generates ABP, capnogram, and pleth segments at 25 Hz in eight-second clips. Clips are recorded at five-minute intervals and selected scenario moments, with deterministic seed-based morphology. The UC05 view adapter converts the last visible segment into an SVG `d` string. It checks segment-level quality and age, but it maps every sample in a clip across the full SVG width without clipping samples to `simulationTime`; a clip can therefore display samples whose sample time is still in the future. The adapter can also leave an eight-second clip visible for up to five minutes and eight seconds, so its apparent trace becomes stale between recordings.

UC05 uses one SVG `<path>` for the trace and SVG elements for the grid. Capnogram display uses a fixed 0–60 mmHg range, while the adapter first scales its samples from 0–60. Pleth display declares a 0–1 range, while the adapter stretches each clip's observed min-to-max across the plot, making amplitude vary from clip to clip. `preserveAspectRatio="none"` lets the whole trace stretch to the panel dimensions. The paths are small in DOM count, but each panel rebuilds a long path string when its view model changes.

UC04 builds the ABP trace as an SVG path by sample index, maps values onto 0–150 mmHg, and overlays a cursor whose x-position comes from the much longer trend range. The strip has no per-sample timestamp or quality gap. UC01's compact traces and 60-minute charts are low-frequency observation trends, not high-frequency waveforms; their time-series semantics should remain unchanged. UC02 uses event timelines and evidence, not a waveform monitor. UC03's medication timeline is an event visualization and must remain separate.

## Pre-migration renderer comparison

| SafeAnes signal or view | Current SafeAnes renderer and data | Reference approach | Decision and adaptation | Main regression risk |
|---|---|---|---|---|
| UC05 capnogram | SVG path from a deterministic 25 Hz, eight-second scenario clip; 0–60 mmHg | Canvas 2D, bounded timestamped samples, per-sample gaps, DPR-aware backing store, clipped plot | Reimplement the renderer in shared Canvas 2D; preserve SafeAnes's scenario morphology and fixed 0–60 scale; crop strictly to case time and quality | Confusing a technical gap with the synthetic flat no-breath interval |
| UC05 pleth | SVG path from the same clip cadence; samples normalized clip-by-clip | Canvas 2D with source-provided scale when available, explicit channel availability | Reimplement with a stable 0–1 relative-amplitude scale, timestamp mapping, and quality breaks | An apparent amplitude change caused by scaling instead of the scenario |
| UC04 ABP | SVG path from clip index; 0–150 mmHg; trend cursor shares its x-position | Canvas 2D per channel; time-window sweep independent from numeric trend axes | Reuse the shared SafeAnes renderer, fixed 0–150 mmHg range, timestamp-based window; leave trend cursor behavior on MAP/HPI tracks | Showing a misleading cursor on a strip that represents a different time window |
| UC01 vital sparklines / trends | SVG paths over 30-second or longer observations | Reference Canvas is intended for dense high-rate waveform samples | Keep these SVG trend charts; they are not high-frequency signals and already represent canonical observations | Recasting trend points as monitor waveform samples |
| UC02 timeline / evidence | Event and claim timeline with evidence navigation | Reference monitor is a separate signal stack | Keep domain visualization; no waveform replacement needed | Losing claim/event semantics by substituting a monitor chart |
| UC03 medication timeline | Medication administration/infusion events | Reference monitor is a physiological signal stack | Keep event timeline; share only time formatting concepts if needed | Treating medication changes as physiological sample values |

## Prioritized issues

1. **P0 — Future samples can leak:** UC05 accepts a waveform segment by segment start and recorded time, then draws all samples in that segment. Sample timestamps extend eight seconds beyond the segment start.
2. **P0 — Stale trace shown as current:** the view model keeps an old clip for several minutes without a sample-time cursor or stale-data treatment.
3. **P1 — Quality is clip-level only in rendering:** the renderer cannot show the exact bad interval inside a visible time window. A full channel outage and a good physiological flat line need visibly different treatment.
4. **P1 — Pleth scale changes per clip:** the path generator normalizes each clip min/max even though the panel advertises a stable 0–1 scale.
5. **P1 — UC04 loses time alignment:** ABP x-coordinates are sample indexes; the trend cursor represents a different duration and is overlaid on the waveform strip.
6. **P2 — SVG path churn:** long paths are converted and handed to React SVG as strings; Canvas is a better fit for the refreshed, sample-dense traces.
7. **P2 — No reusable waveform layer:** UC04 and UC05 have separate plotting logic, with no common timestamp mapping, buffer, DPR setup, gap handling, or draw lifecycle.
8. **P3 — Duplicate legacy path generators:** `waveformGenerators.ts` contains hard-coded display paths not used by the simulation adapter; it risks becoming a second source of waveform morphology.

## Migration approach originally implemented

Keep the existing case clock and simulation data as the only time and physiology source. Add a deterministic sample-at-time API beside the existing scenario waveform generator; derive every displayed sample from the same seeded scenario trends and mark the presentation sample as derived. The waveform view maintains a small bounded ring covering the visible eight-second window, appends only samples whose acquisition and receipt times are no later than the canonical simulation time, and clears/rebuilds on backward seek, reset, or a quality timeline change. No second clock or event stream is introduced.

Use one shared Canvas renderer for ABP, capnogram, and pleth. It will map absolute sample timestamps and fixed signal ranges to pixels, scale the backing store for DPR, clip to its plot area, draw a restrained grid and antialiased trace, break at unavailable/invalid points, and schedule at most one paint frame per update or resize. A quality overlay will distinguish technical unavailability from a good-quality zero capnogram during the synthetic no-breath interval. Medication, event, and low-frequency trend charts stay with their current renderers.

## Compatibility and regression checks

- Preserve the simulation seed, case clock, sample rate, units, current signal colors, module workflows, and existing chart panel geometry.
- Never render a sample with `eventTime > simulationTime` or `receivedTime > simulationTime`.
- Treat `TECHNICAL_DROPOUT`, `EXPECTED_INTERMITTENT`, `STRUCTURAL_NOT_MONITORED`, `INVALIDATED_ARTIFACT`, and `UNKNOWN` as a path break, never as a numeric zero.
- Keep the synthetic no-breath interval as a good-quality, flat-baseline capnogram when its signal is available; do not reinterpret dropout as apnea.
- Keep source waveform segments in the canonical simulation for UC engines and record evidence; the new view window is a bounded presentation projection, not another clinical record.
- Validate coordinate mapping, deterministic sample generation, bounded ordering, backward seek reconstruction, sample receipt gating, and Canvas scheduling cleanup with node tests; then run the full project tests/build and render the SafeAnes routes where the browser is available.

## Shared subsystem before focused fidelity pass

`src/components/clinical-waveforms/` now contains one bounded stream/buffer, explicit time/value transforms, trace segmentation, a coalescing paint scheduler, and a shared Canvas renderer. The 25 Hz view samples are generated deterministically from the existing scenario seed and morphology function. Each renderer owns only an eight-second presentation window (202 points per signal at the configured rate), accepts the canonical simulation time and quality history, and clears/rebuilds on backward seek or quality-history changes. It has no independent case clock or continuous animation loop.

The renderer uses a DPR-scaled backing store, `ResizeObserver`, fixed clinical ranges, clipped plotting, a stable grid, and restrained antialiased line strokes. Acquisition and receipt time both gate visibility. It splits the path for technical dropout, intermittent data, artifact, and unavailable states; a good-quality synthetic no-breath interval remains a flat capnogram. UC05's adapter also gates unavailable device/signal state and shows a localized unavailable label. A localized waiting label is shown until enough samples arrive to draw a trace.

UC05 capnogram remains yellow at 0–60 mmHg and pleth remains cyan at 0–1 relative amplitude. Both now use the bounded timestamped stream rather than a minute-old SVG clip. UC04 ABP now uses the same Canvas stream at 0–150 mmHg; the MAP/HPI trend charts, cursor semantics, and prediction rendering remain separate. UC01 has no high-frequency waveform monitor to replace: its low-frequency canonical trend and acquisition-quality displays remain unchanged. UC02's claim/event timeline and UC03's medication event timeline remain domain-specific.

## Earlier migration verification (before this focused pass)

- `node --test tests/*.test.cjs`: **85 passed, 0 failed**. The coverage includes deterministic morphology, buffering, coordinate mapping, quality gaps, seek reconstruction, no-future-sample gating, scheduler cleanup, UC04/UC05 adapters, and the existing full simulation/replay suites.
- `npm run build`: **passed** with TypeScript/lint checks and route generation.
- Production SafeAnes was opened in Chrome. A fresh production load produced no browser console errors. UC05 was inspected in EN and VI; switching language preserved the current route and simulation time in production.
- UC05 was rendered at 1920×1080, 1600×900, 1440×900, and 1366×768. At each size, `documentElement.scrollWidth` and `body.scrollWidth` equaled the viewport width. The Canvas plot widths were 1226, 998, 883, and 831 CSS pixels respectively; no horizontal page overflow was observed.
- At 10:02:04, UC05 showed “Signal unavailable,” an EtCO₂ dash, and a blank capnogram plot during the technical dropout. At 10:52:20, the clean-signal no-breath interval showed a flat-baseline capnogram, RR 0, and the synthetic respiratory candidate. The dropout did not create a respiratory alert.
- At 60× in the production browser, the case advanced through about 7.5 simulated minutes; pausing held the waveform timestamp steady across a further 700 ms observation. Route and language changes retained the same case clock.
- A production CDP spot measurement during that playback recorded cumulative `TaskDuration` increasing from 0.609 s to 2.155 s, `ScriptDuration` from 0.310 s to 1.484 s, and `JSHeapUsedSize` at 10.8 MB at the end versus 13.3 MB before playback. This is a single browser/page measurement, not an isolated FPS benchmark; frame rate and worst-case paint latency were not measured.

## Initial browser limitation (superseded by rendered comparison below)

During the first migration audit, the reference frontend had no loaded case and its API was unavailable, so that initial pass could not compare populated traces. The focused pass below later started the reference API against its existing local backend and cached demo data, loaded case 5, and completed the actual rendered comparison. The later comparison supersedes the initial “not verified” result. No webui files were modified, and no reference source was copied because its project root contains no license/ownership notice.

The implementation deliberately adopts compatible rendering patterns rather than copying the reference component: bounded timestamped windows, DPR-aware Canvas, clipping, explicit scales, per-sample gaps, and one-shot resize/data paints. UC01 trends, UC02 evidence timelines, and UC03 medication events remain on their existing renderers.

## Focused rendered comparison and fidelity pass — 2026-10-08

The reference was rendered from the read-only Vite app using its local API and cached, de-identified VitalDB case 5. SafeAnes was rendered from a fresh production build. Both were inspected at **1280 × 720** in the browser. The source assets and inputs are materially different (recorded VitalDB channels versus deterministic synthetic demo signals), so this is a morphology/rendering comparison, not a point-for-point signal comparison. No source file in `webui` was changed or copied.

### Ten most noticeable differences and corrections

1. **Capnogram alveolar plateau was nearly flat.** The earlier synthetic trace rose only about 2 mmHg through expiration, unlike the visible plateau tilt in the rendered reference. The plateau now rises by a modest, legible amount while retaining a rapid expiratory upstroke and inspiratory return.
2. **Capnogram breath phase followed the instantaneous RR.** That moved phase when RR changed and could make cycles jump during deterioration. Breath phase now integrates the scenario RR trajectory across time knots; the 10:48 respiratory morphology change is retained.
3. **Pleth upstroke looked triangular.** A linear rise produced pointed, repetitive peaks. It now uses a smooth curved rise and a decelerating diastolic tail.
4. **Pleth lacked a readable late-cycle shoulder.** A deterministic, subtle notch/rebound and small seeded beat variation now add the pulse contour visible in the reference without random playback.
5. **ABP diastolic fall looked saw-toothed.** A linear fall was replaced with a decelerating exponential decline between the synthetic pressure bounds.
6. **ABP notch was an abrupt rectangular offset.** The trace now carries a restrained, smooth notch and rebound feature, aligned to integrated HR beat phase.
7. **Beat timing was computed as `time × current HR`.** This reset the implied phase as HR changed. ABP and pleth now use the same continuous integrated HR cycle count.
8. **The strip had a sparse 25 Hz / 8-second presentation window.** The reference timeline uses a denser timestamped 10-second view. SafeAnes now generates deterministic 100 Hz display samples over a bounded 10-second window, preserving acquisition/receipt-time gating.
9. **Fast playback could step between 50 ms provider updates.** At 60× that update interval can represent three simulated seconds. Canvas presentation now interpolates at requestAnimationFrame only between published canonical clock snapshots; pause, seek, reset, and reverse seeks snap to canonical time and rebuild the bounded buffer.
10. **UC04 ABP clicks used the long MAP/HPI trend time range.** Clicks now map into the visible ABP strip’s own 10-second time window, including midnight rollover. The waveform plot is also end-aligned to its current simulated time during initial playback, and its grid is subdued to keep the trace prominent.

### Post-fix quality and replay checks

- The rendered SafeAnes UC05 baseline at 1280 × 720 shows distinct capnogram phases and rounded pleth pulses; the reference's denser recorded pleth texture remains expected because its PPG source is 250 Hz, compared with the synthetic 100 Hz display stream.
- At 10:02, the capnogram stream remains unavailable during the 12-second technical dropout; missing samples are gaps, not zeros. At 10:52:30, the clean-signal synthetic no-breath interval is a flat capnogram baseline with EtCO₂ unavailable as a numeric value, RR reduced, and the high-priority demo alert visible. The earlier technical dropout does not remain active at that later time.
- Seeking backward reconstructs the requested window without future samples; the requestAnimationFrame presentation transition is bounded by the latest canonical snapshot and snaps on pause/seek. Existing quality-gap, deterministic-output, bounded-buffer, and renderer-cleanup tests continue to cover those invariants.
- The final Vietnamese render exposed a clipped `relative amplitude` pleth axis label. The waveform axis now has sufficient width for both words and retains the full unit in its title/accessibility label.
- Final verification: `node --test tests/*.test.cjs` — **92 passed, 0 failed**; `npm run build` — **passed** after the final morphology, grid, and axis-label changes.

The reference traces are recorded source data and SafeAnes traces are synthetic UI demonstrations. The SafeAnes output is not physiologically validated and is not intended for clinical use. Exact recorded microvariability, source noise, channel-specific sample rates, and the reference monitor's sweep presentation remain different by design.
