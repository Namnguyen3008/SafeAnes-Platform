# Clinical Waveform Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution to complete these steps in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale SVG ABP, capnogram, and pleth strips with a shared, bounded Canvas renderer synchronized to the canonical SafeAnes simulation clock and signal quality.

**Architecture:** Keep scenario morphology in the simulation generator. Build a deterministic sample-at-time API and a tested bounded playback buffer. Render timestamped samples through one DPR-aware Canvas component; UC04 and UC05 supply simulation time and quality from their existing shared contexts. Leave UC01/UC02 trends and UC03 medication events on their domain-specific renderers.

**Tech Stack:** Next.js 15, React 19, TypeScript, Canvas 2D, ResizeObserver, requestAnimationFrame, Node's built-in test runner with the existing TypeScript transpile hook.

**Spec:** `docs/WAVEFORM_MIGRATION_AUDIT.md` and the user's waveform migration requirements.

## Global Constraints

- The `webui` reference directory is read-only and has no visible license metadata; do not copy its source.
- The canonical SafeAnes simulation timestamp is the only case clock.
- Do not display a waveform sample before its event and received timestamps.
- Bad or missing signal quality breaks the trace and never becomes normal physiology.
- Preserve synthetic-demo labeling, module semantics, existing colors, and approved panel geometry.
- Do not add a rendering/chart dependency.

---

### Task 1: Deterministic Sample Model and Window Buffer

**Files:**
- Modify: `src/simulation/generators/clinicalWaveforms.ts`
- Create: `src/components/clinical-waveforms/waveformEngine.ts`
- Create: `tests/clinical-waveforms.test.cjs`

**Interfaces:**
- `sampleClinicalWaveform(seed, signal, timeMs)` returns deterministic ABP/capnogram/pleth morphology derived from the existing shared trend generator.
- `WaveformBuffer(capacity).insert(point)`, `.readWindow(start, end)`, and `.clear()` provide bounded time-ordered storage.
- `WaveformStream.updateTo(simulationTime, qualityStates)` returns only samples with acquisition and receipt times no later than `simulationTime`; backward seeks rebuild the last window.
- `timeToX` and `valueToY` map explicit time/value ranges to plot coordinates.

- [x] Write behavior tests for deterministic morphology, buffer ordering/capacity/reset, scale mapping, dropout gaps, and backward seek.
- [x] Run the focused tests red before implementing the waveform APIs.
- [x] Implement the pure model and bounded stream that passes those tests.
- [x] Re-run focused and UC04/UC05 simulation suites.

### Task 2: Shared Canvas Renderer

**Files:**
- Create: `src/components/clinical-waveforms/ClinicalWaveformCanvas.tsx`
- Create: `src/components/clinical-waveforms/index.ts`
- Modify: `src/types/uc05.ts`
- Modify: `tests/clinical-waveforms.test.cjs`

**Interfaces:**
- `ClinicalWaveformCanvas` accepts signal type, seed, simulation time, source device, quality history, unit, fixed y-range, color, and accessible label.
- Its Canvas is DPR-aware, clipped, and uses a one-shot RAF paint scheduler coalesced across data and resize updates.
- Non-drawable quality produces a trace break and localized unavailable overlay; valid flat-baseline samples remain drawable.

- [x] Test draw scheduling coalesces frames and cancels a queued frame during cleanup.
- [x] Test trace projection skips invalid samples and never maps non-finite values.
- [x] Run focused renderer tests and verify missing-sample behavior.
- [x] Implement Canvas setup, stable grid, explicit scales, timestamp mapping, gaps, resize handling, and cleanup.
- [x] Run renderer tests and TypeScript build.

### Task 3: UC05 and UC04 Integration

**Files:**
- Modify: `src/adapters/uc05Adapter.ts`
- Modify: `src/types/uc05.ts`
- Modify: `src/components/modules/uc05/CapnogramPanel.tsx`
- Modify: `src/components/modules/uc05/PlethysmographPanel.tsx`
- Modify: `src/components/modules/uc04/MiniSignalTrendPanel.tsx`
- Modify: `src/adapters/uc04Adapter.ts`
- Modify: `src/context/HemodynamicContext.tsx`
- Modify: `src/components/modules/uc05/visualization/index.ts`
- Delete only after confirming no consumers: `src/components/modules/uc05/visualization/waveformGenerators.ts`

**Interfaces:**
- UC05 waveform descriptors carry the canonical seed, simulation time, device/source, and quality timeline; the renderer owns only a bounded view window.
- UC04 supplies the same canonical source properties for ABP; MAP/HPI trend SVGs and trend selection remain untouched.

- [x] Add tests for UC05 quality state at 10:02 versus good-quality no-breath at 10:52 and for UC04 ABP source time.
- [x] Run focused integration tests against the old static path behavior.
- [x] Replace UC05 SVG traces and UC04 ABP path with shared Canvas while preserving panels, labels, units, and workflows.
- [x] Remove the verified-unused hard-coded path generator and export.
- [x] Run UC04/UC05 tests and the full project tests.

### Task 4: Final Verification

**Files:**
- Modify: `docs/WAVEFORM_MIGRATION_AUDIT.md`

- [x] Run all node tests with `node --test tests/*.test.cjs`.
- [x] Run `npm run build`.
- [x] Review SafeAnes in EN and VI at 1920×1080, 1600×900, 1440×900, and 1366×768.
- [x] Confirm pause, reset, route changes, and language changes preserve the canonical simulation time; seek reconstruction is covered by tests and direct UI jumps.
- [x] Record measured verification and mark loaded-reference screenshot comparison NOT VERIFIED because the reference API/model prerequisites are unavailable.
