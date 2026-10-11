# SafeAnes Product Reliability Improvement Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve SafeAnes reliability by making real model status truthful, ensuring the UI is connected to the intended backend, measuring waveform playback performance, and expanding reproducible VitalDB validation.

**Architecture:** Keep the current Next.js workstation, FastAPI backend, canonical replay session, model services, and Canvas waveform system. Implement the work as four separate plans so model readiness, replay integration, waveform performance, and dataset validation can be tested and reviewed independently.

**Tech Stack:** Next.js 15, React 19, TypeScript, FastAPI, Pydantic, Python 3.12, PyTorch CPU runtime, VitalDB 1.7.2, Playwright, Node test runner, pytest.

**Spec:** `docs/validation/END_TO_END_REPORT.md`; `docs/validation/INFERENCE_VALIDATION.md`; `docs/validation/REPLAY_VALIDATION.md`; `docs/validation/CASE_VALIDATION.md`; `docs/design/FINAL_FIGMA_UI_QA.md`; `docs/integration/UC04_MODEL_CONTRACT.md`; `docs/integration/UC05_MODEL_CONTRACT.md`.

## Global Constraints

- SafeAnes VitalDB mode is retrospective replay, not a live patient monitor.
- Never replace real model outputs, recorded observations, or missing data with synthetic values in `VITALDB_REPLAY`.
- Keep `SYNTHETIC_DEMO` and `VITALDB_REPLAY` isolated.
- Do not retrain, overwrite, or change the bytes of the audited UC04 or UC05 checkpoints.
- UC05 windows require valid SpO₂, capnogram, AWP, and PPG under the current strict production gate; unsupported or missing required input must abstain.
- Preserve original VitalDB samples, units, timestamps, quality gaps, and source checksums.
- At replay time `t`, do not expose observations or predictions later than `t`, or use later samples as model input.
- Do not relabel model outputs as measured physiology, HPI, or calibrated confidence unless the verified contract supports that exact meaning.
- Preserve the existing clinical layouts, module routes, and EN/VI language support.
- The checked project folder has no `.git` directory; these plans do not assume or create repository history.

## Verified Baseline

- The frontend is Next.js 15.5.27 with React 19. The backend is FastAPI and the model runtime is CPU PyTorch in the validated Windows environment.
- The current model code and `docs/MODELS.md` report UC04 and UC05 technical readiness after artifact and sidecar verification. Earlier validation and design snapshots described UC05 as `BLOCKED_CONTRACT_MISMATCH`; active documentation has since been reconciled to the running SafeAnes backend. Any retained occurrence is explicitly historical or part of a test-plan fixture, not a current runtime status.
- UC04 and UC05 case eligibility is separate from model readiness. `docs/design/SAFEANES_UI_AUDIT.md` identifies this as a source of confusing status in the case selector.
- Three VitalDB cases (`1`, `6388`, `3300`) were fully revalidated out of 6,330 indexed candidates. Training split membership is unknown and no frozen training-output golden fixture was supplied.
- Final UI QA reports all six workspaces rendered in EN/VI at five workstation sizes. The committed Playwright screenshot suite currently compares its main baselines at 1440×900; exact Figma frame comparison remains unavailable because no usable frame context was returned.
- Waveform tests cover pixel-bounded projection, gap preservation, replay seek, and incremental sample reuse. Browser FPS, memory use, and waveform smoothness at all playback speeds have not been profiled.

## Priority Order

| Priority | Workstream | Plan | Exit condition |
|---|---|---|---|
| P0 | Reconcile model readiness, case eligibility, and visible model output | `2026-10-10-safeanes-model-readiness-and-output.md` | One runtime-derived readiness state is used in health, model status, inference API, and UI; UC05 remains gated unless its verified contract passes. |
| P0 | Prove the browser is connected to the SafeAnes backend and model/data artifacts under test | `2026-10-10-safeanes-fullstack-provenance-and-replay-qa.md` | Automated smoke test launches this checkout's backend and frontend, verifies build identity, case/time, model provenance, and as-of outputs. |
| P1 | Measure and protect real waveform playback performance | `2026-10-10-safeanes-waveform-performance.md` | Reproducible browser measurements exist for 1×/10×/30×/60×, with waveform gaps and sweep erase-bar behavior preserved. |
| P1 | Expand VitalDB case and model-input validation without inventing results | `2026-10-10-safeanes-vitaldb-coverage-and-parity.md` | Catalog/report record actual inspected cases and exclusions; independent model parity remains explicitly unverified until a source golden fixture exists. |

## Execution Order

1. Execute the model-readiness plan first because every real-output display depends on trustworthy model status.
2. Execute full-stack provenance and replay QA against the same repository checkout and selected local artifacts.
3. Execute waveform profiling while replaying a validated local case; keep the last known good renderer and compare measurements before changing draw behavior.
4. Expand case inspection after the current contract and inference gates are stable. Do not rank cases by model output.
5. Refresh validation documentation from commands and API responses produced by the implementation. Keep older results clearly marked as superseded rather than silently rewriting history.

## Cross-Plan Release Gate

- In PowerShell, set `$env:SAFEANES_RUN_VITALDB_SMOKE='1'`, then run `.\.venv\Scripts\python.exe -m pytest backend/tests -q` with the configured local model artifacts and cache.
- `node --test tests/*.test.cjs` passes.
- `npm run test:visual` and `npm run build` pass.
- A controlled real replay verifies the API and browser show the same selected case, case-relative time, model ID/version/hash, prediction horizon, output semantics, coverage, and quality.
- No report claims clinical validation, independent generalization, or Figma pixel parity without corresponding external evidence.

## Progress Record — 2026-10-10

| Plan | Status | Evidence / remaining limits |
|---|---|---|
| Model readiness and output consistency | COMPLETE | Runtime readiness and per-case/window eligibility are distinct; UC04/UC05 model displays match real API output for case 1 at 600 s. Configured backend 135 passed, Node 151 passed, visual 3 passed at 1440×900, TypeScript/build passed. Independent documentation review reconciled historical readiness and replay claims. |
| Full-stack provenance and replay QA | COMPLETE | Current release smoke: backend 152 passed/0 skipped, Node 172 passed, PowerShell 24 passed on PS 5.1 and 7.6, Playwright visual 9 passed, Playwright replay integration 6 passed, typecheck and isolated production build passed. Both real models reported `INTEGRATION_READY`; case 6388 API/UI replay parity and case switch to 3300 were verified. |
| Waveform performance | IN PROGRESS — renderer invariants covered; browser profiling pending | Unit coverage confirms bounded projection, preserved extrema/gaps, erase-bar timing, seek cleanup, scheduler cleanup, and deterministic sample handling. Browser FPS/memory and all-speed visual profiling remain unmeasured. |
| VitalDB coverage and parity | NOT STARTED | Golden training-output parity and frozen split membership remain unverified. |

Exact Figma-frame comparison, GPU/Linux execution, frozen training splits, browser waveform FPS/memory, and clinical performance remain `NOT_VERIFIED`. The test-owned workstation matrix passes at all six configured viewport sizes in EN/VI.
