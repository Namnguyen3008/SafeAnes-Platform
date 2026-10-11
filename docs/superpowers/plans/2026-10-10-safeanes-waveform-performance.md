# SafeAnes Waveform Performance and Replay Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure and protect waveform rendering smoothness during deterministic synthetic playback and real VitalDB replay at all supported playback speeds.

**Architecture:** Keep recorded sample time, simulation time, and browser presentation frames separate. Retain the existing shared Canvas renderer, bounded replay buffer, quality segmentation, and sweep erase bar. Add browser measurement and regression artifacts before changing waveform morphology or display geometry.

**Tech Stack:** TypeScript, Canvas 2D, React, Playwright, Node test runner, VitalDB replay API.

**Spec:** `docs/WAVEFORM_MIGRATION_AUDIT.md`; `docs/validation/REPLAY_VALIDATION.md`; `docs/validation/END_TO_END_REPORT.md`; `src/components/clinical-waveforms/waveformEngine.ts`; `src/components/clinical-waveforms/ClinicalWaveformCanvas.tsx`.

## Global Constraints

- Use the canonical SafeAnes replay cursor; waveform components do not create clocks.
- Preserve recorded VitalDB timestamps, units, original values, missing intervals, and source quality.
- Keep the existing sweep erase bar behavior and do not draw continuous traces through dropout or invalidated samples.
- Never generate normal-looking samples to fill real replay gaps.
- Keep physiological trends and model prediction plots semantically separate.
- Do not claim clinical waveform fidelity; all synthetic traces remain demo-only.
- Profile the rendered interface before applying additional performance optimizations.

---

### Task 1: Lock down waveform projection and sweep invariants

**Files:**
- Modify: `tests/clinical-waveforms.test.cjs`
- Modify: `tests/vitaldb-replay-engine.test.cjs`
- Read: `src/components/clinical-waveforms/waveformEngine.ts`
- Read: `src/components/clinical-waveforms/ClinicalWaveformCanvas.tsx`

**Interfaces:**
- `projectTraceSegments()` and `projectSweepTraceSegments()` retain timestamp-to-x and value-to-y mappings.
- Each projected segment stays within its per-pixel budget while retaining first/last and min/max samples.
- `WaveformStream` and replay adapters preserve missing samples and quality transitions.

- [x] **Step 1: Add tests for sample-to-pixel mapping at 62.5 Hz and 500 Hz with a fixed plot width.** Assert identical timestamps map to identical x coordinates and units/scales remain unchanged.
- [x] **Step 2: Add a sweep test that records the erase-bar gap around the playback head and confirms no line joins across that gap.**
- [x] **Step 3: Add tests for dropout, artifact, invalid sample, and GOOD-quality physiologic flat trace; assert only the GOOD flat trace remains connected.**
- [x] **Step 4: Add a backward-seek test that includes future waveform samples and quality intervals, then assert both are absent from the returned display window.**
- [x] **Step 5: Run the two targeted Node test files.**

Run: `node --test tests/clinical-waveforms.test.cjs tests/vitaldb-replay-engine.test.cjs`

---

### Task 2: Add a repeatable browser playback profile

**Files:**
- Create: `tests/visual/waveform-performance.spec.ts`
- Modify: `tests/visual/playwright.config.ts`
- Read: `src/components/modules/uc05/CapnogramPanel.tsx`
- Read: `src/components/modules/uc05/PlethysmographPanel.tsx`
- Read: `src/components/modules/uc04/MiniSignalTrendPanel.tsx`
- Read: `src/components/simulation/SimulationControlPopover.tsx`

**Interfaces:**
- Test profile reports replay source, route, viewport, selected speed, elapsed wall time, simulation-time advance, animation-frame intervals, visible canvas count, and browser console errors.
- It uses the existing accessible replay controls and leaves the app paused after each run.

- [ ] **Step 1: Add a test helper that records `requestAnimationFrame` intervals using a test-only `addInitScript`; do not add a production diagnostics panel.**
- [ ] **Step 2: For each speed `1`, `10`, `30`, and `60`, run a fixed 5-second wall-clock window on UC05, record the measured simulation-time advance, then pause.**
- [ ] **Step 3: Repeat on UC04 and verify the ABP mini-waveform still follows the shared cursor.**
- [ ] **Step 4: Collect p50, p95, and maximum frame interval per run and save JSON under `test-results/waveform-performance/`.**
- [ ] **Step 5: Do not add a numeric pass/fail FPS threshold until the Windows reference profile has been captured; initially fail only on stopped playback, a console error, an unbounded canvas buffer, missing trace, or incorrect clock-speed ratio.**
- [ ] **Step 6: Run the profile three times and report median values across runs.**

Run: `npx playwright test --config tests/visual/playwright.config.ts tests/visual/waveform-performance.spec.ts`

---

### Task 3: Check bounded buffer growth and redraw costs

**Files:**
- Modify: `tests/vitaldb-replay-engine.test.cjs`
- Modify: `tests/clinical-waveforms.test.cjs`
- Read: `src/adapters/vitalDbReplayBuffer.ts`
- Read: `src/components/clinical-waveforms/ClinicalWaveformCanvas.tsx`
- Read: `backend/app/api/routes/replay.py`

**Interfaces:**
- Replay samples remain time ordered, deduplicated, bounded to the requested display window, and bounded by the existing backend delta policy.
- Canvas point count is a function of physical viewport width and does not grow with case duration.

- [ ] **Step 1: Add a stress fixture containing 30 seconds of 500 Hz PPG plus 62.5 Hz capnogram samples and overlapping deltas.**
- [ ] **Step 2: Feed sequential and duplicate timestamp deltas and assert output sample count never exceeds the configured retention bound.**
- [ ] **Step 3: Assert the projected point count stays bounded by the Canvas physical-pixel budget while preserving each segment's extrema and quality gaps.**
- [ ] **Step 4: Add a deterministic 60x time-advance test that verifies no duplicate event IDs and no samples after the replay cursor.**
- [ ] **Step 5: Run targeted tests and record test data size and execution duration; do not present unit-test duration as browser FPS.**

Run: `node --test tests/clinical-waveforms.test.cjs tests/vitaldb-replay-engine.test.cjs tests/simulation-replay.test.cjs`

---

### Task 4: Compare the real rendered waveforms at workstation sizes

**Files:**
- Modify: `tests/visual/workspaces.spec.ts`
- Modify: `tests/visual/workstation-matrix.spec.ts`
- Create: `docs/validation/WAVEFORM_PERFORMANCE.md`
- Read: `docs/validation/CASE_VALIDATION.md`

**Interfaces:**
- Screenshots compare actual Canvas output and status labels at 1920×1080, 1600×900, 1440×900, 1366×768, and 1280×720.
- Real VitalDB screenshots use only locally cached cases with valid checksum manifests; synthetic screenshots remain labeled synthetic.

- [ ] **Step 1: Capture a paused waveform window and a running waveform window for UC05 capnogram and pleth.**
- [ ] **Step 2: Capture the UC04 ABP waveform at the same case-relative cursor before and after seek-back.**
- [ ] **Step 3: Verify no plotted peak is clipped, axes and units stay visible, trace gaps match quality intervals, and the erase bar does not cover the physiological trace longer than its configured 80 ms gap.**
- [ ] **Step 4: Compare screenshots at each viewport; change renderer geometry only when the screenshot shows a reproducible defect.**
- [ ] **Step 5: Write measured frame interval/memory results and list the exact browser, case, route, viewport, and playback speed in `WAVEFORM_PERFORMANCE.md`.**
- [ ] **Step 6: If a valid real waveform window is unavailable, mark that comparison `NOT_VERIFIED`; do not substitute a synthetic image under a VitalDB label.**

---

### Task 5: Validate route navigation, language switch, and cleanup under playback

**Files:**
- Create: `tests/visual/waveform-navigation.spec.ts`
- Modify: `tests/vitaldb-replay-engine.test.cjs`
- Modify: `src/components/clinical-waveforms/ClinicalWaveformCanvas.tsx` only if a leak is reproduced

- [ ] **Step 1: Start replay at 10x on UC05, navigate UC05 → Overview → UC04, and verify case time continues without creating an independent waveform clock.**
- [ ] **Step 2: Pause, switch EN/VI, and assert the simulation cursor and waveform window do not reset.**
- [ ] **Step 3: Navigate away and back ten times; count active animation callbacks before/after each mount and confirm cleanup returns to one active renderer per visible canvas.**
- [ ] **Step 4: Seek backward and verify stale future samples are removed before drawing resumes.**
- [ ] **Step 5: Run the visual and Node tests, then record measured limitations instead of claiming performance improvement without a before/after profile.**

