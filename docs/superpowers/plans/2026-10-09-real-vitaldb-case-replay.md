# Real VitalDB Case Replay Engine Implementation Plan

> **For agentic workers:** Execute this plan inline in the current task. Each task ends with targeted verification before moving on.

**Goal:** Replay checksum-verified VitalDB recordings through one backend session, one case-relative clock, and the existing SafeAnes global controller.

**Architecture:** Extend the process-local FastAPI `ReplayManager` with canonical session metadata and complete controls. Extend its existing SSE route to send bounded as-of snapshots on connect/rewind and incremental original-sample chunks during forward playback. Keep `UC04VitalDbProvider` as the single browser-side replay state and make the existing global simulation popover dispatch to that session when recorded-data mode is active. UC01/02/03 receive an honest recorded-data surface; UC04/05 continue using their existing model and waveform adapters.

**Tech Stack:** FastAPI, Pydantic, VitalDB repository and SignalService, SSE/EventSource, React context, existing canvas waveform renderer, Node test runner, pytest, Next.js build.

**Spec:** User request dated 2026-10-09, “Now create the REAL VitalDB Case Replay Engine.”

## Global Constraints

- Use `seconds_since_case_start` for every replay and signal timestamp.
- Replay is retrospective recorded data and must never be called a live patient monitor.
- Deliver only observations and predictions with timestamps at or before the session cursor.
- Keep waveform samples raw and bounded; never synthesize signal values over missing intervals.
- Keep clinical claims, medication administrations, allergies, and alarms unavailable unless an authoritative recorded source exists.
- Reuse the existing frontend controller and selected-case context; do not add another replay clock.
- Keep route and language changes from resetting the selected VitalDB session.

---

### Task 1: Canonical replay session lifecycle

**Files:**
- Modify: `backend/app/services/replay/manager.py`
- Modify: `backend/app/schemas/api.py`
- Modify: `backend/app/api/routes/replay.py`
- Test: `backend/tests/test_api_backend.py`

**Interfaces:** Add `started_at`, `updated_at`, UC04/UC05 model readiness fields, canonical `current_time_seconds`, and reset/resume operations while retaining the existing `_s` response alias for compatibility.

- [ ] Add tests proving session timestamps/status update, resume continues from paused cursor, reset returns to zero, and invalid speed/time is rejected.
- [ ] Run the replay API test and confirm the new assertions fail on the current implementation.
- [ ] Implement session metadata, explicit reset/resume endpoints, and pass current model statuses at creation.
- [ ] Run the focused backend test and existing API suite.

### Task 2: As-of SSE snapshots and bounded event chunks

**Files:**
- Create: `backend/app/services/replay/stream.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/routes/replay.py`
- Test: `backend/tests/test_api_backend.py`

**Interfaces:** `ReplayStreamService.snapshot(case_id, as_of_s)` returns bounded UC04/UC05 views, case track metadata, and recorded medication-source tracks. `ReplayStreamService.delta(case_id, start_s, end_s)` returns original numeric/waveform observations, event/provenance rows, medication-source tracks, and cached model outputs only within that range.

- [ ] Add tests asserting the connect/rewind snapshot contains no values or predictions after `as_of_s`, and deltas contain only their requested case-relative interval.
- [ ] Run those tests and confirm they fail because the current stream emits only session snapshots.
- [ ] Implement connect/rewind snapshots, forward-only bounded chunks, and `data` SSE events; split waveform chunks at the configured maximum range.
- [ ] Verify high-speed cursor advances do not drop intervals and disconnect exits the stream.

### Task 3: One browser replay state and one controller

**Files:**
- Modify: `src/context/UC04VitalDbContext.tsx`
- Modify: `src/components/simulation/SimulationControlPopover.tsx`
- Modify: `src/components/modules/uc04/UC04VitalDbSourceControl.tsx`
- Modify: `src/components/shell/GlobalClinicalHeader.tsx`
- Test: `tests/vitaldb-replay-engine.test.cjs`

**Interfaces:** `UC04VitalDbContext` consumes session, reset, and data SSE events and stores only bounded signal/waveform windows. The existing `SimulationControlPopover` dispatches controls based on source mode, offers one VitalDB case selector, and marks the mode as retrospective. The UC04-local control selects source only.

- [ ] Add adapter tests for delta merge, deduplication by timestamp, window bounds, backward reset clearing future data, and predictions filtered at cursor time.
- [ ] Run the tests and confirm they fail before the merge adapter exists.
- [ ] Implement the bounded replay buffer and update the existing global controls to use the VitalDB session when selected.
- [ ] Verify switching source/case, route, or locale preserves the correct one session and that case switch clears prior views and selections.

### Task 4: Truthful UC01–UC03 recorded-data surfaces

**Files:**
- Create: `src/components/modules/replay/VitalDBReplayWorkspace.tsx`
- Modify: `src/components/modules/uc01/UC01Workspace.tsx`
- Modify: `src/components/modules/uc02/UC02Workspace.tsx`
- Modify: `src/components/modules/uc03/MedicationSafetyWorkspace.tsx`
- Modify: localization files under `messages/`
- Test: `tests/vitaldb-replay-engine.test.cjs`

**Interfaces:** UC01 shows recorded signal/source/quality at the shared replay cursor. UC02 shows source event annotations and only supported evidence-linked derived observations; selecting one seeks the shared clock. UC03 shows recorded pump tracks as raw device records and never invents administrations, orders, allergies, or interventions.

- [ ] Add tests that missing fields remain `NOT_RECORDED`, event selection resolves to the shared cursor, and absent medication records do not create medication events.
- [ ] Run the tests and confirm unsupported fields currently have no recorded-mode projection.
- [ ] Implement the three route boundaries without changing the approved SafeAnes shell; add EN/VI labels for retrospective replay and unavailable fields.
- [ ] Verify UC04/UC05 data and existing chart components remain unchanged in layout and continue using the same cursor.

### Task 5: End-to-end verification

**Files:**
- Modify only files required by failing checks.
- Test: backend replay, frontend replay adapters, browser route/sync checks.

- [ ] Run replay controls at 1x, 10x, 30x, and 60x; verify current time and sample windows remain ordered and bounded.
- [ ] Verify seek backward clears future data, seek forward restores the requested window, and case switch clears selected event/cache state.
- [ ] Verify UC01–UC05 route navigation and EN/VI switch preserve VitalDB case/time/status.
- [ ] Run full backend tests, frontend tests, and `npm run build`; report unavailable authoritative data and any readiness blockers exactly.
