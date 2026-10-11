# Final SafeAnes UI/UX QA

**Date:** 2026-10-10  
**Target:** running SafeAnes frontend at `http://127.0.0.1:3000`  
**Overall:** **PARTIAL** — the current frontend/model evidence is coherent for the verified real-data path, and the six-size workstation matrix has now passed. Exact Figma frame comparison remains unverified. Both model services are technically integration-ready under their audited contracts.

## Reference and evidence boundary

Approved file referenced by the design documents: [SafeAnes — Unified Clinical Workstation](https://www.figma.com/design/bAkYMkjbAddPKG70KRzi5K). The authenticated Figma MCP Starter plan rejected file inventory/context requests at its tool-call limit. The last successful metadata read found one empty `Page 1`; no approved frame node IDs or usable frame screenshots are available. **Pixel comparison against Figma is NOT VERIFIED.** This report compares the actual running frontend with browser captures of its current design, not with an invented Figma frame.

The screenshots below are real Chromium captures. The current model-readiness
evidence is stored under
`C:\Users\Namdr\AppData\Local\Temp\safeanes-sdd\model-readiness\task-4\visual\`
(UC04 EN/VI and UC05 VI). An earlier Playwright baseline run used the synthetic case
at `1440x900`. VitalDB captures use
recorded case data, with source labels visible in the UI. The latest
test-owned visual run passed 9/9 tests, including the complete workstation
matrix; its output is recorded under `test-results/visual/`.

## Current visual/model verification — 2026-10-10

| Surface | Viewport / language | Result | Evidence boundary |
|---|---|---|---|
| UC04 real model output | Local real-mode capture, EN | PASS | Model task, horizon, coverage, uncalibrated semantics, and output are visible. |
| UC04 real model output | Local real-mode capture, VI | PASS | Vietnamese route navigation and shared replay cursor remain intact. |
| UC05 real model output | Local real-mode capture, VI | PASS | Strict-gate readiness, actual hypoxemia task, saved calibration semantics, and no fabricated confidence are visible. |
| Synthetic visual regression | baseline `1440x900` plus six-size matrix | PASS — 9 tests | Application screenshot/DOM checks only; not a Figma comparison. |
| Figma screenshot comparison | Approved frame dimensions | NOT VERIFIED | Figma frame screenshots/node context were unavailable in the authenticated session. |
| Larger workstation matrix | `1920x1080`, `1680x1050`, `1600x900`, `1440x900`, `1366x768`, `1280x720`; EN/VI | PASS — 6 viewport projects | Six routes/workspaces and both locales were captured per viewport using the test-owned frontend; no horizontal document overflow was reported. |

## Automated workstation matrix — 2026-10-10

The visual Playwright configuration now defines named projects for the six
supported workstation sizes:

- `matrix-1920x1080`
- `matrix-1680x1050`
- `matrix-1600x900`
- `matrix-1440x900`
- `matrix-1366x768`
- `matrix-1280x720`

Each project captures Overview and UC01–UC05 in EN and VI using the synthetic
fixture, asserts document scroll width does not exceed the viewport, and writes
controlled PNG artifacts under `test-results/visual/` without accepting or
updating approved screenshot baselines. The matrix also checks the UC02
evidence inspector, UC03 alert actions, UC04 measured/model separation, and
UC05 waveform plot width at 1280×720.

The test-owned browser matrix ran through
`scripts/verify-local-fullstack.ps1 -RunVisualTests` and passed all 9 tests. Each of the six matrix projects covered
Overview and UC01–UC05 in EN and VI, producing 72 route/locale/viewport checks.
The screenshot baseline suite also passed and no baseline was changed by this
matrix run. The user's active `:3000` server was not used.

Figma frame comparison remains **NOT VERIFIED**: the authenticated Figma
session did not provide approved frame node context or screenshots. The
automated matrix is an application layout check, not a Figma comparison.

At case 1 and replay time `600s`, the UC04 API value `.439917` rendered as
`.4399`; UC05 API values `.0012186/.006614/.01198` at 1/3/5 minutes rendered
as `.001219/.006614/.01198`. EN/VI navigation retained `00:10:00`.

## Historical visual baseline matrix

The following matrix records an earlier browser sweep and is retained as a
historical baseline, not as current re-verification of the full viewport
matrix.

All six routes were rendered in EN and VI at every requested viewport: **60 route/language/viewport combinations**. The browser sweep found **no horizontal document overflow and no page, console, or HTTP 5xx errors**.

| Route | 1920×1080 | 1600×900 | 1440×900 | 1366×768 | 1280×720 | EN/VI screenshot evidence |
|---|---|---|---|---|---|---|
| Overview | PASS | PASS | PASS | PASS | PASS | [VitalDB EN](evidence/2026-10-10-overview-vitaldb-1440-en.png) · [VI](evidence/2026-10-10-overview-vitaldb-1440-vi.png); [synthetic EN baseline](../../tests/visual/__screenshots__/workspaces.spec.ts/overview-en.png) · [VI](../../tests/visual/__screenshots__/workspaces.spec.ts/overview-vi.png) |
| UC01 Situation / Data Integrity | PASS | PASS | PASS | PASS | PASS | [VitalDB EN](evidence/2026-10-10-uc01-vitaldb-1440-en.png) · [VI](evidence/2026-10-10-uc01-vitaldb-1440-vi.png); [synthetic EN baseline](../../tests/visual/__screenshots__/workspaces.spec.ts/uc01-situation-en.png) · [VI](../../tests/visual/__screenshots__/workspaces.spec.ts/uc01-situation-vi.png) |
| UC02 Record / Evidence | PASS | PASS | PASS | PASS | PASS | [VitalDB EN](evidence/2026-10-10-uc02-vitaldb-1440-en.png) · [VI](evidence/2026-10-10-uc02-vitaldb-1440-vi.png); [synthetic EN baseline](../../tests/visual/__screenshots__/workspaces.spec.ts/uc02-record-en.png) · [VI](../../tests/visual/__screenshots__/workspaces.spec.ts/uc02-record-vi.png) |
| UC03 Medication Safety | PASS | PASS | PASS | PASS | PASS | [VitalDB EN](evidence/2026-10-10-uc03-vitaldb-1440-en.png) · [VI](evidence/2026-10-10-uc03-vitaldb-1440-vi.png); [synthetic EN baseline](../../tests/visual/__screenshots__/workspaces.spec.ts/uc03-medications-en.png) · [VI](../../tests/visual/__screenshots__/workspaces.spec.ts/uc03-medications-vi.png) |
| UC04 Hemodynamics | PASS | PASS | PASS | PASS | PASS | [VitalDB EN](evidence/2026-10-10-uc04-vitaldb-1440-en.png) · [VI](evidence/2026-10-10-uc04-vitaldb-1440-vi.png); [synthetic EN baseline](../../tests/visual/__screenshots__/workspaces.spec.ts/uc04-hemodynamics-en.png) · [VI](../../tests/visual/__screenshots__/workspaces.spec.ts/uc04-hemodynamics-vi.png) |
| UC05 Respiratory | PASS | PASS | PASS | PASS | PASS | [VitalDB EN](evidence/2026-10-10-uc05-vitaldb-1440-en.png) · [VI](evidence/2026-10-10-uc05-vitaldb-1440-vi.png); [synthetic EN baseline](../../tests/visual/__screenshots__/workspaces.spec.ts/uc05-respiratory-en.png) · [VI](../../tests/visual/__screenshots__/workspaces.spec.ts/uc05-respiratory-vi.png) |

At 1280×720, UC05 continues vertically to keep its waveform, trend, alarm, and table regions readable; the page has no horizontal overflow. This is controlled vertical scrolling rather than a compressed mobile layout.

The visual baseline suite compared 14 screenshots at 1440×900: all six routes in EN and VI, plus synthetic high-alert states in UC03 and UC05. It passed without screenshot diffs beyond the configured 1% tolerance. These are application baselines, not Figma exports.

## Interaction and clinical display checks

| Area | Result | Observed behavior and evidence |
|---|---|---|
| Global shell / Overview | PASS | Source mode, case context, time, alert count, and module navigation remain visible. Cross-route time is shared. Synthetic baseline: [Overview EN](../../tests/visual/__screenshots__/workspaces.spec.ts/overview-en.png). |
| UC01 quality | PASS | At 09:14 BIS shows `DEGRADED`; at 10:02 EtCO₂ is unavailable (`--`) with `TECHNICAL_DROPOUT`, not a zero. The integrity drawer shows source and timing metadata. [BIS quality](evidence/2026-10-10-uc01-synthetic-1440-vi-bis-quality.png) · [EtCO₂ dropout](evidence/2026-10-10-uc01-synthetic-1440-vi-etco2-dropout.png). |
| UC02 claim → time → evidence | PASS | Selecting the derived respiratory claim moves the shared cursor to 10:53, opens its source evidence and shows validation/provenance. The inferred post-phenylephrine claim remains `REQUIRES REVIEW`; no automatic acceptance or sign-off occurs. [Selected event/evidence](evidence/2026-10-10-uc02-vitaldb-1440-vi-selected-event.png). |
| UC03 medication → alert → override | PASS | The 10:42 Ketorolac record is `PROPOSED`, distinct from administrations. `DEMO-MED-001` is visibly synthetic and not clinically validated. The UI override dialog accepted a required reason and retained `OVERRIDDEN`, timestamp, and reason in history; the medication stayed proposed. [High alert](evidence/2026-10-10-uc03-synthetic-1440-vi-high-alert.png). |
| UC04 trends / model details | PASS for verified output semantics | Synthetic risk remains separate from measured values. VitalDB UI reports the actual model task, horizon, coverage, quality, and uncalibrated score without inventing confidence. [VitalDB 10-minute EN](evidence/2026-10-10-uc04-vitaldb-1440-900-en-10m.png). |
| UC05 alarm → trend → table | PASS | The synthetic clean-signal no-breath event at 10:52:20 selects the synchronized trend/table time; EtCO₂ is unavailable during the interval. The earlier technical dropout does not become an apnea event. Alarm detail dialog keyboard focus was trapped, Escape closed it, and focus returned to the selected alarm. [Respiratory alert EN](evidence/2026-10-10-uc05-synthetic-1440-en-respiratory-alert.png) · [VI dialog](evidence/2026-10-10-uc05-synthetic-1440-vi-respiratory-alert.png) · [dropout](evidence/2026-10-10-uc05-synthetic-1440-vi-etco2-dropout.png). |

Cross-UC identity and as-of event/prediction behavior are covered by the canonical simulation tests. In the real replay UI, VitalDB case 1 was sought to 00:10:00; the cursor remained at that time across Hemodynamics → Respiratory navigation and an EN→VI switch. Switching to case 6388 reset case time to 00:00:00.

## Replay and source-mode verification

| Check | Result | Evidence |
|---|---|---|
| Synthetic replay determinism and event order | PASS | Seed 20261007 replayed identically; canonical tests exercised 1×, 10×, 30×, and 60× and checked no future state leakage. |
| Synthetic Play / Pause / Reset / Seek | PASS | Browser smoke advanced at 10×, settled and stayed paused, sought to the respiratory event, then reset to 07:15:00. |
| VitalDB Play / Pause / Reset / Seek | PASS | Case 1 advanced at 10×, paused, sought to 00:10:00 using pointer release, and reset to 00:00:00. Session endpoints returned successful responses. |
| VitalDB speed selection | PASS | 1×, 2×, 5×, 10×, 30×, and 60× selections each received HTTP 200 from the replay speed endpoint. |
| Case switching | PASS | Switching from case 1 to 6388 changed the selected recorded case and reset the replay cursor. |
| VitalDB UC03 availability | PASS | Case 1 has no authoritative medication administration record in the displayed source; the UI does not synthesize medication history in VitalDB mode. |

## Accessibility and usability checks

- **PASS:** six-route scan found no unnamed buttons or unlabeled form controls in the rendered EN pages; screen-reader table semantics were checked after the UC03 fix below.
- **PASS:** UC05 alarm dialog focus trap, Escape dismissal, and focus return were exercised.
- **PASS:** focus-visible styles are present on interactive clinical controls; keyboard activation of UC03 medication rows now selects the row with Enter or Space.
- **PASS:** tables retain numeric/time content and clinical labels at the tested widths; screen capture inspection showed no chart/header overlap.
- **NOT VERIFIED:** a full automated WCAG contrast audit and exhaustive keyboard traversal of every route/dialog were not run. Visual contrast was reviewed in captured screens.
- **NOT VERIFIED:** Figma typography, colors, border metrics, and component dimensions cannot be certified without accessible frame screenshots/node context.

## Defect fixed during QA

1. **UC01/Overview stale artifact status:** sample-level fallback quality had no expiry, so an arterial artifact could remain in the Overview quality summary after the artifact interval ended. The fallback now ends at the observation timestamp; the interval event continues to represent the actual degraded window. Regression coverage verifies quality returns after 09:42:15. Live Overview showed `GOOD` at 10:52:21. [Overview after quality fix](evidence/2026-10-10-overview-synthetic-1440-en-10-52-after-quality-fix.png).
2. **UC03 table accessibility:** medication grids were visually tabular but exposed no table roles or column headers. Both Active Medications and Recent Medication Values now expose table/row/header/cell semantics; selectable rows support keyboard activation. A Playwright test was observed failing before the change and passing afterward. No visual layout change was detected.

## Remaining issues and verification limits

| Priority | Status | Issue / impact | Required follow-up |
|---|---|---|---|
| P1 | NOT VERIFIED | Figma MCP could not provide approved frame node IDs/screenshots due the authenticated Starter-plan tool-call limit; local design notes report the last successful metadata page was empty. Exact Figma-vs-render comparison is unavailable. | Restore Figma file/frame access, then capture and compare the approved nodes. |
| P1 | PASS for current model-output path | The current model-readiness evidence verified API/UI output agreement at case 1, `t=600s`; model IDs, task labels, readiness, and calibration semantics are preserved. | Keep the backend artifact registry and frontend provenance checks in the release test path. |
| P1 | RESOLVED for current model contract | A superseded snapshot reported `BLOCKED_CONTRACT_MISMATCH` for UC05. The current strict exported schema is authoritative; both model services report `INTEGRATION_READY`, with per-window abstention for missing required signals. | Keep strict-gate status and per-window quality visible; do not interpret readiness as clinical validation. |
| P1 | REVIEW | Early VitalDB values include unusual raw values (including negative arterial pressure samples and an EtCO₂ zero) while source quality is `UNKNOWN`. The UI preserves those recorded values and marks quality unknown; no verified source sentinel definition was available to classify them as invalid. | Confirm source encoding/quality metadata and add a verified invalid-sample mapping if applicable. Do not silently rewrite raw observations. |
| P2 | NOT VERIFIED | Formal contrast-ratio automation and exhaustive screen-reader/keyboard testing were not performed. | Run a full WCAG audit after Figma frame access is restored. |
| P2 | NOT VERIFIED | The current evidence set does not include a complete injected-outage browser run or an exhaustive WCAG contrast audit. | Run those checks when the relevant harness and approved Figma context are available. |

## Test and build results

| Command | Result |
|---|---|
| `npm run test:visual` | PASS — current run 3 tests at `1440x900`; Figma comparison not included. |
| `node --test tests/*.test.cjs` | PASS — 151 passed, 0 failed. |
| `npx tsc --noEmit` | PASS — exit 0. |
| Configured backend suite with VitalDB/model smoke enabled | PASS — 135 passed, 0 skipped, 13 warnings. |
| Focused backend API/cache regression suite | PASS — 45 passed, 1 skipped. |
| Real checkpoint smoke suite | PASS — included in the configured backend run; 8 smoke tests passed. |
| `npm run build` | PASS — Next.js 15.5.27 production build; lint/type validation and route generation completed. |
| Browser route sweep | PASS — 60 combinations; no horizontal overflow, browser errors, or HTTP 5xx responses. |
| Local frontend after build | PASS — restarted at `http://127.0.0.1:3000`; Overview and UC05 returned HTTP 200. |
