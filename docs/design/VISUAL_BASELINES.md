# SafeAnes Visual Baselines

**Purpose:** record the visual baseline used by `SAFEANES_UI_AUDIT.md`.  
**Mode:** VitalDB retrospective replay, case 6388, paused at 00:17:05.  
**Languages:** EN and VI.  
**Application changes:** none.

## Screenshot persistence

Browser screenshots were captured and reviewed through the in-app browser’s CUA screenshot output. That API returned ephemeral image data and exposed no supported local save operation. Therefore:

- `Capture key` identifies a screenshot visible in the CUA tool output for this audit turn.
- `Filesystem location` is **Not persisted** for each key; there is no honest local path to cite.
- Do not treat these keys as files or fabricate a path under `docs/design`.
- 13 visual captures were made: the six primary routes in EN and VI at 1440×900 (12), plus Overview EN at 1920×1080 (1). The other 35 matrix states were reviewed and measured in the rendered browser but not retained as screenshot images.

## Screenshot manifest

| Capture key | Route | Locale | Viewport | Filesystem location |
|---|---|---:|---:|---|
| `CUA-1920x1080-EN-Overview` | `/safeanes/case/demo` | EN | 1920×1080 | Not persisted; image in CUA tool output |
| `CUA-1440-EN-Overview` | `/safeanes/case/demo` | EN | 1440×900 | Not persisted; image in CUA tool output |
| `CUA-1440-VI-Overview` | `/safeanes/case/demo` | VI | 1440×900 | Not persisted; image in CUA tool output |
| `CUA-1440-EN-UC01` | `/safeanes/case/demo/situation` | EN | 1440×900 | Not persisted; image in CUA tool output |
| `CUA-1440-VI-UC01` | `/safeanes/case/demo/situation` | VI | 1440×900 | Not persisted; image in CUA tool output |
| `CUA-1440-EN-UC02` | `/safeanes/case/demo/record` | EN | 1440×900 | Not persisted; image in CUA tool output |
| `CUA-1440-VI-UC02` | `/safeanes/case/demo/record` | VI | 1440×900 | Not persisted; image in CUA tool output |
| `CUA-1440-EN-UC03` | `/safeanes/case/demo/medications` | EN | 1440×900 | Not persisted; image in CUA tool output |
| `CUA-1440-VI-UC03` | `/safeanes/case/demo/medications` | VI | 1440×900 | Not persisted; image in CUA tool output |
| `CUA-1440-EN-UC04` | `/safeanes/case/demo/hemodynamics` | EN | 1440×900 | Not persisted; image in CUA tool output |
| `CUA-1440-VI-UC04` | `/safeanes/case/demo/hemodynamics` | VI | 1440×900 | Not persisted; image in CUA tool output |
| `CUA-1440-EN-UC05` | `/safeanes/case/demo/respiratory` | EN | 1440×900 | Not persisted; image in CUA tool output |
| `CUA-1440-VI-UC05` | `/safeanes/case/demo/respiratory` | VI | 1440×900 | Not persisted; image in CUA tool output |

Supporting route observations (`/data-integrity`, `/replay`) and keyboard interaction checks were inspected in the browser. Those states were not saved as additional screenshot files.

## Viewport and route measurements

All six primary routes were visited in both languages at all four target viewports: **48 rendered route/locale/viewport states**. The following summarizes stable DOM measurements after route content settled. “Content scroll height” is the main route content extent; a value greater than main client height means the user must scroll vertically.

| Viewport | Header height | Main client area | Main content scroll height | Page horizontal overflow | Notable detail |
|---|---:|---:|---|---|---|
| 1920×1080 | 54px | 1828×1026 | Not retained per-route | None observed | Single-row global header. Overview screenshot captured. |
| 1600×900 | 82px | 1508×818 | 836px Overview/Situation/Record/Medication; 886px Hemodynamics; 926px Respiratory | None in all routes/locales | Header uses a second row; main content extends below viewport by 18–108px. |
| 1440×900 | 82px | 1348×818 | 836px Overview/Situation/Record/Medication; 886px Hemodynamics; 926px Respiratory | None in all routes/locales | Same header reflow; detailed screenshot baseline available for all six routes and both locales. |
| 1366×768 | 82px | 1274×686 | 836px Overview/Situation/Record/Medication; 886px Hemodynamics; 926px Respiratory | None in all routes/locales | Main content extends below initial viewport by 150–240px. UC04 metadata is most constrained. |

`scrollWidth === innerWidth` for all 48 primary-screen states. This excludes local child clipping: UC04’s center workspace measured 966px scroll width inside a 956px parent with hidden overflow. A nested vertical descendant was measured on UC01 Situation at all sizes/locales in addition to the main scroll container.

## Per-route baseline notes

| Route / view | Baseline capture(s) | Rendered baseline | Observable concern |
|---|---|---|---|
| Overview | `CUA-1920x1080-EN-Overview`; `CUA-1440-EN-Overview`; `CUA-1440-VI-Overview` | Recorded Case Signals table plus Replay Status rail; sparse real-data state has 8 observations after load. | Initial “No recorded samples available” copy appears before those observations arrive. Sparse data leaves substantial open panel area. Some value rows show unit `NOT_RECORDED`. |
| UC01 Situation | `CUA-1440-EN-UC01`; `CUA-1440-VI-UC01` | Timeline/workflow plus current observations and source/context rails. | Nested vertical scroll; long secondary labels/descriptions clip or truncate in narrow rails. Supporting Data Integrity route is synthetic under a VitalDB shell. |
| UC02 Record | `CUA-1440-EN-UC02`; `CUA-1440-VI-UC02` | Recorded events/evidence list; unsigned state and missing authoritative medication/procedure documentation are explicit. | Sparse list leaves open space. Edit/reject/trace overlay semantics are source-inspected but not opened in this real-data state. |
| UC03 Medication | `CUA-1440-EN-UC03`; `CUA-1440-VI-UC03` | Explicit no-authoritative-medication empty state; source infusion tracks do not become administration events. | Large unused panel space; preserve explicit no-data state and improve its coverage explanation rather than creating mock content. |
| UC04 Hemodynamics | `CUA-1440-EN-UC04`; `CUA-1440-VI-UC04` | Dense measured signals, model output, horizons, coverage/quality, trends, relationship and recent events. | Multiple source/task/horizon/coverage labels clip; one center workspace clips 10px; 1366 has the narrowest provenance region. |
| UC05 Respiratory | `CUA-1440-EN-UC05`; `CUA-1440-VI-UC05` | Yellow capnogram and cyan pleth, respiratory numerics, trends, alarms/table and right rail. | Full content requires vertical scrolling at smaller heights; some unit fields show `NOT_RECORDED`; model readiness or per-window abstention status must remain visually prominent beside output. |

## Supporting route and interaction baselines

| Surface | Capture/reference | Observation |
|---|---|---|
| `/safeanes` | Source route inspection | Redirects to `/safeanes/case/demo/situation`, not Overview. |
| `/safeanes/case/demo/data-integrity` | `CUA-support-data-integrity` (ephemeral observation) | VitalDB global header is paired with simulated source/clock-offset content. The route’s simulation label is visible but the source context is inconsistent. |
| `/safeanes/case/demo/replay` | `CUA-support-replay` (ephemeral observation) | VitalDB header/time is paired with synthetic demo banner, 07:15:00 clock and synthetic event list. Two timebases are visible. |
| Simulation/replay control | 1440×900 keyboard test | Compact panel fits viewport and closes on Escape. `aria-modal` is set, but focus can tab outside. Case-picker UC05 eligibility conflicts with model status. |
| UC02 EvidenceInspector overlays | Source-only review | Edit/reject/trace surfaces are absolute overlays without dialog role or shared focus handling. Not visually exercised from the current sparse real-data page. |

## EN/VI comparison notes

- Across all 48 primary states, neither locale caused page-level horizontal overflow.
- The 1440 screenshots show the main navigation labels remain legible in EN and VI.
- Vietnamese consumes more space in secondary workflow and provenance descriptions. The observed failures are local fixed slots/truncation (not global font sizing): UC04 metadata, long UC01 rail descriptions, and source/readiness summaries.
- No evidence supported a global reduction of Vietnamese font size. The recommended response is flexible width, selective wrapping, and a tooltip only for secondary explanatory copy.

## Capture and verification limitation

Visual review is supported by the ephemeral CUA images and browser measurements, but this audit does not include image files checked into the repository. The external Chrome DevTools surfaces could not bind the active localhost browser tab, and the in-app screenshot surface had no save-to-file API. Accordingly, screenshot persistence is **NOT VERIFIED / unavailable**, while the rendered screenshots themselves were viewed during this audit. No build or tests were run because no application code was modified and the requested deliverable was an audit only.
