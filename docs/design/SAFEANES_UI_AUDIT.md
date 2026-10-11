# SafeAnes UI/UX Architecture Audit

**Audit type:** read-only visual, route, and component review  
**Application:** SafeAnes local frontend, Next.js 15.1.7 / React 19  
**Audited mode:** VitalDB retrospective replay, case 6388, paused at case time 00:17:05  
**Locales:** English and Vietnamese  
**Viewports:** 1920×1080, 1600×900, 1440×900, 1366×768  
**Code changes:** none. This deliverable records findings and recommendations only.

## Executive summary

The clinical workstation shell remains dense and recognizable across the requested desktop sizes. The rendered document had no page-level horizontal overflow in any of the 48 route × locale × viewport combinations measured. The principal defects are localized: UC04 truncates model and provenance labels inside narrow fixed slots; some real VitalDB values are presented with `NOT_RECORDED` units; the historical baseline captured conflicting model-readiness text between the case picker and model status; and modal keyboard semantics are inconsistent. The earlier replay/data-integrity source-context conflict is recorded below as a historical baseline; the current shared provider keeps VitalDB case/time/source context synchronized across the shell and all workspaces.

**Readiness note:** observations that mention `BLOCKED_CONTRACT_MISMATCH` below
refer to the earlier baseline capture. The current UC05 runtime is
`INTEGRATION_READY` under the strict exported schema; case eligibility and
per-window eligibility remain separate, and an ineligible window abstains.

No confirmed P0 issue was observed in the requested viewport matrix. The P1 items below should be resolved before treating this view as a coherent real-data workstation. The application was intentionally left unchanged.

## Scope and method

- Started from the existing local frontend at `http://localhost:3000` and inspected the rendered application rather than inferring all findings from CSS.
- Visually reviewed Overview and UC01–UC05 in EN and VI at 1440×900; captured 12 browser screenshots in the in-app browser output. Captured one additional Overview screenshot at 1920×1080 (EN).
- Visited all six primary workspaces at every requested viewport and both locales, measuring document width, main viewport dimensions, content scroll height, header height, nested scroll containers, and selected rendered text bounds. This covers 48 route/locale/viewport states.
- Inspected supporting routes `/data-integrity` and `/replay`, the global simulation/replay control, keyboard focus traversal, shared UI primitives, and UC02 evidence overlays.
- Checked the route source inventory. No `/settings` or standalone `/evidence` route exists under `src/app/safeanes`; evidence, dialogs, and drawers are embedded in module views.
- Browser screenshots are ephemeral tool output; the browser interface exposed no supported save-to-file operation. Screenshot keys and capture locations are listed in [VISUAL_BASELINES.md](./VISUAL_BASELINES.md). No disk paths are fabricated.

## Route inventory

| View | Route | Status |
|---|---|---|
| Overview | `/safeanes/case/demo` | Reviewed |
| UC01 Situation | `/safeanes/case/demo/situation` | Reviewed |
| UC02 Record | `/safeanes/case/demo/record` | Reviewed |
| UC03 Medication Safety | `/safeanes/case/demo/medications` | Reviewed |
| UC04 Hemodynamic Intelligence | `/safeanes/case/demo/hemodynamics` | Reviewed |
| UC05 Respiratory Intelligence | `/safeanes/case/demo/respiratory` | Reviewed |
| Data Integrity | `/safeanes/case/demo/data-integrity` | Supporting route reviewed |
| Replay | `/safeanes/case/demo/replay` | Supporting route reviewed |
| SafeAnes entry | `/safeanes` | Redirects to `/safeanes/case/demo/situation` |
| Settings / standalone Evidence | Not found | No route present in inspected route tree; embedded UI states were source-inspected |

## Prioritized issue backlog

Severity describes the observed UI risk, not clinical validation of any model or workflow.

| ID / priority | Route and baseline | Current component | Observed problem | Clinical importance | Recommended solution | Proposed reference/template type | Migration risk |
|---|---|---|---|---|---|---|---|
| UI-01 / P1 | UC04; `CUA-1440-EN-UC04`, `CUA-1440-VI-UC04`; same issue at 1366 | Model/provenance labels and fixed-width metric slots | Model task, source-quality, horizon, coverage, and recorded SBP/DBP labels are clipped. Examples include an 80px slot for `Model Output · 5 min` (about 111–124px required) and recorded-data provenance as narrow as 23px at 1366. A model score can remain visible while its meaning or source is hidden. | Provenance and measured-versus-predicted distinction can become ambiguous. | Rebalance the UC04 grid before reducing type size; allow key metadata to wrap across two lines or allocate a wider flexible label column. Keep numeric values and units together. Put ellipsis only on secondary descriptions with full accessible text. | Existing UC04 panel/header and metadata pattern; shared compact status/label primitive | Medium |
| UI-02 / P1 | UC04; `CUA-1440-EN-UC04`; all sizes checked | Hemodynamic center workspace container | A child has an 860px minimum inside a 956px center; its measured scroll width is 966px while the parent clips overflow. Roughly 10px of content is hidden at 1440 even though the page itself does not scroll horizontally. | Axis/series context can be cut off without an obvious page-level overflow signal. | Fix the grid/flex shrink chain (`min-width:0`) and use an intentional local horizontal scroller only for the visualization if its minimum plot width is required. Avoid clipping the whole workspace. | Existing domain visualization container with controlled plot scrolling | Medium |
| UI-03 / P1 | Overview and UC05; `CUA-1440-EN-Overview`, `CUA-1440-VI-Overview`, `CUA-1440-EN-UC05`, `CUA-1440-VI-UC05` | Recorded observation table and respiratory numeric tiles | Available values such as SpO₂ 100 and PR 62 are paired with `NOT_RECORDED` instead of a unit in some real-data states. The number remains prominent, so users can reasonably read it as a complete measurement. | Value-without-unit is clinically ambiguous. | Render the value only when its unit is known, or label the measurement as unit unavailable and visually distinguish that status from a complete observation. Preserve the raw source value and its data-quality provenance. | Existing observation/numeric-value component with explicit availability state | High (data-contract/UI boundary) |
| UI-04 / P1 — historical baseline | Global Simulation control; `CUA-1440-EN-UC04` and replay-control keyboard check | Case selector and model readiness badges | The baseline captured a case picker reporting UC05 eligible while the model status reported `BLOCKED_CONTRACT_MISMATCH` and 44% coverage. The current runtime reports `INTEGRATION_READY` under the strict gate; case, model, and window eligibility must still remain distinct. | A clinician/demo operator may mistake track eligibility for usable model inference. | Define and use separate labels for case track eligibility, valid-window eligibility, loaded-model readiness, and per-window abstention. Reuse the same status source in the selector and detail panel. | Existing compact case selector/status summary | High (status contract must be reconciled) |
| UI-05 / P1 — historical baseline | `/data-integrity`; `CUA-support-data-integrity` | Global case header plus UC01 telemetry route | The audit capture showed a VitalDB header beside synthetic source/device offsets such as `+8ms`. The current shared provider now derives the route and header from one active source mode; recorded mode exposes recorded track/source metadata and does not substitute synthetic device state. | The historical mismatch could have caused source/device quality to be mistaken for VitalDB metadata. | Retain source-aware status derivation and regression coverage when changing the shared provider. | Existing global source-mode banner and UC01 telemetry panel | High |
| UI-06 / P1 — historical baseline | `/replay`; `CUA-support-replay` | Global replay control and supporting replay route | The audit capture showed a VitalDB header beside a second synthetic clock and event batch. The current replay provider now shares one selected case, cursor, status, and source mode across the global header, Overview, UC01, UC02, UC03, UC04, and UC05. | Two simultaneous timebases and data sources would weaken replay integrity. | Preserve the shared replay controller and require an explicit mode transition when switching between synthetic and VitalDB replay. | Existing shared replay controller, mode-aware route template | High |
| UI-07 / P1 | Global Simulation control; `CUA-1440-EN-UC04` | `SimulationControlPopover` dialog | The control exposes `role=dialog`/`aria-modal=true` and closes on Escape, but keyboard focus can leave the dialog and reach language/navigation controls after Tab presses. | Keyboard users can operate background navigation while a modal interaction is open. | Add a tested focus trap, initial focus, and focus restoration; alternatively use non-modal popover semantics and remove `aria-modal` if background interaction is intended. | Existing shared dialog/popover primitive and focus-management hook | Low–Medium |
| UI-08 / P1 | UC02 Record; source review of `EvidenceInspector.tsx` | Edit/reject overlays and deep-inspection overlay | These overlays are absolute-positioned elements inside the panel but do not expose dialog semantics or use the shared focus trap. Their actual open state was not exercised in the real-data record view, so this finding is source-confirmed rather than screenshot-confirmed. | Review/edit/reject actions need predictable keyboard focus and assistive-technology context. | Route edit/reject through the existing `ClinicalModal`; use `EvidenceDrawer`/`ClinicalDrawer` for inspection. Preserve immutable evidence references and current workflow semantics. | Existing SafeAnes `ClinicalModal`, `ClinicalDrawer`, and `EvidenceDrawer` | Low–Medium |
| UI-09 / P1 | Overview; `CUA-1440-EN-Overview`, `CUA-1440-VI-Overview` | Recorded Case Signals loading/empty state | During initial load, the screen displays “No recorded samples available”; after roughly 700–900ms it shows eight current observations. Loading and true-empty are therefore visually identical for a noticeable interval. | A temporary loading state can be interpreted as an absent-data finding. | Use explicit loading/skeleton status until the case/observation request completes, then distinguish no samples, unavailable track, and fetch failure. | Existing status/empty-state primitive with loading and error variants | Medium |
| UI-10 / P2 | UC01 Situation; all 4 sizes and both locales | Situation workflow/context rails | One nested vertical scroller exists inside the main scroll container at every tested size. Long secondary strings (for example “Operating room preparation” and a not-recorded context description) are clipped/truncated in the narrower layouts. | Nested scrolling and hidden context slow situation review; the affected strings are secondary but should remain discoverable. | Keep one primary page scroll where possible; if a rail must scroll independently, label it and keep its scroll affordance visible. Permit headings to wrap and expose full secondary descriptions through accessible title text. | Existing UC01 rail and workflow-list pattern | Medium |
| UI-11 / P2 | All primary routes; especially UC05/UC04 at 1366×768 | `ModuleViewport` main scroll region | At 1366×768, main content is 686px high while route content measures 836px (Overview/Situation/Record/Medication), 886px (Hemodynamics), and 926px (Respiratory). At 1600×900 and 1440×900, main height is 818px with the same route content heights. Lower chart/table sections require scrolling; this is controlled vertical scrolling rather than document overflow. | Useful alarm-review and trend rows may remain below the initial fold. | Preserve workstation density, but prioritize waveform/trend height and keep alarm/table headers visible. Consider route-specific allocation or a compact summary above the fold; do not shrink charts to force all content into 768px. | Existing module workspace grid with sticky local section headers where appropriate | Medium |
| UI-12 / P2 | Overview, UC02, UC03 in real VitalDB state; 1440 captures | Sparse-data panels and empty states | With only a small number of recorded rows/events or no authoritative medication data, the main panel has large blank areas and explanatory content is concentrated in a side rail. The messages are honest, but the distribution looks unfinished. | Empty space is not itself unsafe, but it makes unavailable-versus-not-yet-loaded states harder to scan and reduces workstation utility. | Use a concise, mode-aware empty state with coverage/source metadata and a clear reason. Keep the current record boundary and do not create inferred administrations or narratives. | Existing clinical panel empty-state pattern; no generic dashboard cards | Low–Medium |
| UI-13 / P2 — historical baseline | UC04/UC05/Overview; EN and VI captures | Observation labels and model-result detail | Several provenance, model-contract, and small helper labels use fixed narrow spaces or tiny text. Vietnamese remains page-width-safe but secondary text can clip or become hard to scan. The baseline displayed UC05 output beside a blocked status; the current UI must keep strict-gate readiness and any per-window abstention equally visible beside numerical output. | Users may overread an output or miss the qualification attached to it. | Give readiness/quality state stronger hierarchy than a model value; wrap bilingual labels; keep numeric results tabular and retain explicit task/provenance text. | Shared quality/model-status badge plus domain-specific result header | Medium–High |
| UI-14 / P3 | Global shell and module panels; all screenshot baselines | Header, button, badge, and panel styling | The token layer sets a 4px radius, but module-local styles use 2px/3px/4px. Panel headings, button heights, small labels, and padding also vary between shared and bespoke implementations. | Primarily consistency and scan-speed impact. | Consolidate shared visual tokens and apply them to generic primitives in small batches; preserve semantic clinical colors and module-specific chart styling. | Existing SafeAnes design tokens and `ClinicalPanel`/`Button` primitives | Low–Medium |

## Module assessment

### Global shell and Overview

- Navigation is clear: the persistent rail exposes Overview and all five UCs, and the active route is recognizable in both locales.
- The global header fits at 1920×1080 in one 54px row. At 1600×900, 1440×900, and 1366×768 it reflows to about 82px, adding a second row to preserve the case/replay/language controls. This is an acceptable density trade-off, although labels are very small and the header consumes more of the short 768px viewport.
- VitalDB source and retrospective-replay context are visible. Patient/OR/procedure/anesthesia fields correctly show `NOT RECORDED`; no invented patient identity was observed.
- Overview’s sparse signal table is honest once loaded, but its initial empty-state copy is premature (UI-09). The right Replay Status panel contains readiness detail; align its model statuses with the case selector (UI-04).

### UC01 — Situation / Data Integrity

- Situation’s timeline/workflow hierarchy is dense and module-specific. Most items fit, but one nested vertical scroll region and clipped secondary bilingual descriptions reduce scanability at small workstation heights (UI-10).
- The real-data Situation route shows recorded observations and available signal/source information. Do not render synthetic device state in this context.
- The supporting Data Integrity route and the global header now derive source, case, replay time, and quality context from the shared provider. Synthetic device offsets remain confined to synthetic mode; recorded mode shows available VitalDB track/source metadata.

### UC02 — Anaesthesia Record / Evidence

- The real-data record view clearly marks the record unsigned and medication/procedure documentation `NOT_RECORDED`; no unsupported narrative was observed.
- Sparse records leave substantial unused panel area. A concise reasoned empty state is preferable to fabricated claims (UI-12).
- `EvidenceInspector` contains bespoke edit/reject overlays and a trace-inspection overlay. Source inspection found no dialog role or shared focus handling on these overlays (UI-08). Shared `ClinicalModal`, `ClinicalDrawer`, and `EvidenceDrawer` implementations already provide stronger semantics and focus behavior.
- The record, evidence, and timeline components should remain domain-specific; standardize interaction primitives, not claim semantics.

### UC03 — Medication Safety

- VitalDB mode explicitly states that no authoritative medication administration data is available for this case. This is the correct boundary; source rate/volume tracks are not converted into administrations.
- The main medication workspace is sparse in this mode, leaving a large blank area while context is relegated to the side panel (UI-12). Keep the empty state explicit and preserve `NOT_RECORDED` semantics.
- Medication timeline and alert/action semantics should remain domain-specific.

### UC04 — Hemodynamic Intelligence

- Recorded hemodynamic values and model predictions are visually separated by labels and color. The model output is identified as uncalibrated, and input coverage/quality are exposed.
- Several of the labels that establish source, task, horizon, and coverage are clipped by fixed-width slots (UI-01). The center container also clips its child by about 10px at 1440 (UI-02).
- Use measured-vs-predicted semantic grouping as the first sizing priority. Avoid making clinical numerics smaller to compensate for narrow labels.

### UC05 — Respiratory Intelligence

- Capnogram (yellow) and plethysmograph (cyan) have adequate plot width at 1440×900; EtCO₂, RR, SpO₂, PR, signal quality, trends, alarms, and tabular views remain recognizable in EN and VI.
- At 1366×768 and 900px-high viewports, lower trend/alarm/table content falls below the first viewport and requires main-page scrolling (UI-11). No document-level horizontal overflow was found.
- Some real observation units resolve to `NOT_RECORDED` while the numeric value remains prominent (UI-03). An unavailable or abstained UC05 state should visually govern any displayed model output (UI-13); runtime readiness is currently `INTEGRATION_READY` under the strict gate.

## Interaction and accessibility review

| Interaction | Result | Evidence / limit |
|---|---|---|
| Global navigation by keyboard | Pass in sampled traversal | Tab reached EN, VI, and Overview through Respiratory; visible focus was present. |
| Escape to close replay control | Pass | The open control closed on Escape. |
| Replay-control focus containment | Fail | Focus escaped the `aria-modal` dialog to language and navigation controls. |
| Shared `ClinicalModal` / `ClinicalDrawer` focus behavior | Source-confirmed support | Both use the shared focus-trap hook and dialog semantics. This does not prove every usage is sized or labelled correctly. |
| UC02 edit/reject/evidence overlays | Source-level concern | Not opened in the real VitalDB record state; inline overlays lack dialog roles/focus trap in source. |
| Empty/loading/error state distinction | Fail in Overview initial fetch | “No recorded samples” appears before the observations populate. Other route failure states were not force-injected. |
| Contrast / formal WCAG measurements | Not verified | Visual review only; no automated contrast scan or assistive-technology session was run. |

## Architecture recommendations (no changes made)

1. Keep the current SafeAnes shell, navigation rail, module routes, and clinical-domain visualizations.
2. Treat the real/synthetic data source as a shell-level context contract; every supporting route and badge should derive from it.
3. Standardize generic interaction primitives (dialog, drawer, tooltip, tabs, button, table wrapper) on the existing SafeAnes implementations before introducing a new library.
4. Rework UC04 layout constraints and label prioritization before touching plot geometry.
5. Make observation availability and unit completeness explicit in shared value rendering.
6. Model loading, unavailable, empty, and error states as separate states throughout overview and UC pages.
7. Keep clinical timelines, medication workflows, waveform displays, and model visualizations domain-specific.

## Limits

- This is a UI/UX architecture audit, not a clinical validation or model evaluation.
- No code, styles, configuration, tests, or runtime state were changed. The only deliverables are these audit documents.
- Screenshot images were available in the in-app browser tool output during this audit, but the available screenshot API did not provide a local file-save path. The exact route/view/language capture keys are documented in [VISUAL_BASELINES.md](./VISUAL_BASELINES.md).
- Focus and source inspection were completed for the global replay control and UC02 evidence overlays; every possible dialog/drawer state was not opened because several are reachable only from sparse or synthetic-only review data.
