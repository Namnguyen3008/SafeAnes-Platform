# SafeAnes Workspace Design Proposals

**Status:** workstation design specification; no Figma frames or React code changed.  
**Date:** 2026-10-10.  
**Base template:** existing SafeAnes shell and five clinical workspaces.  
**Design system:** [SAFEANES_DESIGN_SYSTEM.md](./SAFEANES_DESIGN_SYSTEM.md).  
**Research:** [SAFEANES_UI_AUDIT.md](./SAFEANES_UI_AUDIT.md), [VISUAL_BASELINES.md](./VISUAL_BASELINES.md), [TEMPLATE_DISCOVERY.md](./TEMPLATE_DISCOVERY.md).

## Figma status and evidence boundary

The authenticated Figma MCP Starter plan returned a tool-call-limit error on the latest file inventory request. The last successful metadata inspection recorded a single empty `Page 1`; a fresh check is blocked, so current file contents cannot be re-verified. The earlier screenshot captures were viewed in the browser tool but were not persisted as local image files. No screenshots, editable frames, node links, library components, or Auto Layout structures were created in this pass.

The visual work below is a design proposal grounded in the prior rendered audit and source inventory. “After” means the proposed arrangement and state behavior; it is not an implemented or rendered Figma result. Existing SafeAnes is the base template because the discovered Material 3 and Simple Design System assets were not inspected or approved for reuse. No external component is represented as approved.

## Design intent

- Retain the existing workstation shell, persistent navigation, dense clinical hierarchy, clinical colors, five specialized workflows, and verified waveforms.
- Spend space on evidence, alarms, time-series plots, and context that establishes the meaning of values.
- Keep case/source/time context global and unambiguous. Track eligibility, inference readiness, and model availability are separate states.
- Keep recorded measurements, source quality, workflow completion, provenance, and model output in visually distinct groups.
- Let English and Vietnamese labels wrap in secondary areas; reserve single-line layouts for values, units, case time, and compact status codes.
- At workstation widths, use flexible CSS-grid proportions and 0-minimum shrink constraints. Use controlled application or plot scrolling where content has a meaningful minimum width; never clip it to preserve a fixed card grid.

## Shared layout and token contract

Use existing shared components and the current token foundation. No new template system is proposed.

| Area | Proposed treatment |
|---|---|
| Shell header | Keep the current 54px single row at wide viewports and deliberate two-row reflow below the existing 1640px breakpoint. Do not add a third row. |
| Navigation | Keep the current 84px persistent rail and route order; active route remains visible in EN and VI. |
| Panel chrome | Reuse `ClinicalPanel` where the content fits its title/status/action/footer contract. Keep module-specific panel composition where it does not. |
| Surfaces | `background/default`, `background/surface`, and `background/elevated` from the shared token system. |
| Text | Primary for values and critical copy; secondary/muted for support copy. Never use muted copy as the only signal of unavailable data. |
| Semantics | Preserve current severity, quality, provenance, waveform, and model-output colors. A status label accompanies every semantic color. |
| Spacing | Existing 8px panel gap and 12px default panel padding; the 4–24px workstation spacing scale is available for component adoption. |
| Typography | Keep current type sizes and IBM Plex Mono/tabular numerals for clinical values, units, timestamps, IDs, and model outputs. |
| Tables | Reuse `ClinicalTable` wrapper where compatible; keep module-specific columns and priority rules. Numeric values and units stay on one line. |
| Overlays | Reuse existing `ClinicalDrawer` / `ClinicalModal` mechanics when their focus, dismissal, width, and footer behavior match. Keep the domain evidence and alert content. |

## Global shell and Overview

### Global shell information order

**Primary context:** SafeAnes identity and active case, source mode (`VITALDB RECORDED CASE` or `SYNTHETIC DEMO`), current case-relative/simulation time, replay state, active alert count, and EN/VI control. Keep this compact and visually aligned as one global context.

**Secondary context:** recorded patient/procedure/OR/anesthesia fields and separate UC04/UC05 case eligibility and model readiness. Fields absent from VitalDB remain `NOT RECORDED`; never use synthetic patient, OR, device, or case-time values in VitalDB mode. At narrower widths this context moves to the second header row and wraps labels; it does not get hidden behind a generic overflow menu.

Eligibility and readiness use separate labels: `TRACKS PRESENT` / `CASE ELIGIBLE` describes data validation; `MODEL READY` describes loaded model state. Show coverage and blocking reason beside model readiness. This resolves the observed UC05 eligibility-versus-contract mismatch without promoting track presence to inference readiness.

### Overview workspace

Retain the Overview status strip, module summary grid, recent events, and global alert rail. Make the loading state precede the empty state. Each numeric tile shows a value only with its actual unit; if the unit is missing, show the value with an explicit unit-unavailable qualifier rather than presenting a complete-looking measurement. When a case has sparse data, use the free space for a compact availability summary (source, available signals, time coverage, and reason) inside the existing panel, not additional decorative cards.

Keep active/high alerts in the first scan region and model status next to the corresponding output. Overview summaries link to their owning module and synchronize case time when the destination supports it.

## UC01 — Situation / Data Integrity

### Proposed workstation composition

Use three flexible zones: patient/OR context at left (`minmax(240px, 0.8fr)`), perioperative workflow and timeline in the center (`minmax(520px, 1.8fr)`), and situation/quality summary at right (`minmax(290px, 1fr)`). Keep the timeline and workflow checklist as one central clinical sequence. Use the remaining vertical room for observed physiologic summary and recent events, without nesting an independent vertical scroller inside the page where avoidable.

Group visible information into four labeled types:

1. **Recorded measurements:** numeric observation plus unit, time, source, and quality.
2. **Data integrity:** source/device metadata only when present in the active mode; missingness and quality events remain explicit.
3. **Workflow:** phase and checklist completion.
4. **Alerts:** active clinical or system alerts with their source and status.

Do not place predicted risk in the measured physiology group. Do not let checklist completion color or device connectivity imply physiologic normality.

### Data Integrity inspector

Use the existing drawer-sized overlay for four sections: summary; source/track inventory; quality events by case time; raw versus derived/imputed observations. For VitalDB, show real track/source metadata and mark unsupported device concepts `NOT RECORDED`. For synthetic mode, retain the synthetic boundary label. In both modes, technical dropout is a visible gap/unavailable state, not a zero value.

## UC02 — Anaesthesia Record / Evidence

### Three-region review workspace

At wide widths, organize the clinical timeline, structured record, and evidence inspector in that order. Reserve roughly 220–260px for the event timeline, at least 520px for the record/claim list, and 380–440px for the evidence inspector. Use flexible center sizing and `min-width: 0`; the inspector can widen within its range without shrinking the claim text or numeric/time columns into unreadable slots.

At 1366px/1280px widths, let the inspector become a dismissible right drawer while preserving the selected claim in the record. Do not reduce the claim row to a compressed mobile card. Keep the selected-claim context visible in the drawer header while reviewing.

### Review sequence

1. Select a claim by pointer or keyboard; mark the row as selected and move the synchronized timeline cursor to its `clinicalTime`.
2. The evidence inspector shows the exact source event/observation, timestamp(s), unit, source, provenance, derivation/rule, and validation results.
3. Render `DIRECT`, `DERIVED`, `INFERRED`, `CLINICIAN CONFIRMED`, and `REQUIRES REVIEW` distinctly using existing provenance/status treatments. An inferred or unsupported claim never looks like a recorded fact.
4. Keep Accept, Edit, and Reject actions together in a stable footer. Accept never signs the record; signing remains a separate explicit workflow action.

Use the current record structure and evidence IDs. For sparse VitalDB cases, show why a claim/evidence section is empty; do not synthesize record narratives, medication administrations, or procedures.

## UC03 — Medication Safety

### Medication state hierarchy

Separate actual medication lifecycle from proposals at the section level:

- **Administered / infusing:** source-recorded or synthetic canonical administration events, with event time and source.
- **Proposed / ordered:** visually distinct outlined/hatched proposal row with an explicit `PROPOSED` label; it must not share the visual treatment used for administration.
- **Stopped / changed:** timeline transitions attached to the same medication identity and timestamped.

In VitalDB mode with no authoritative medication records, show the explicit unavailable message and source reason. Do not run medication rules against invented exposure.

### Safety review arrangement

Give the active safety alert the primary attention region, with severity, reason, triggering patient factors, versioned synthetic rule/evidence, and decision state visible without scrolling. Keep patient-specific factors adjacent to the explanation and dose comparison so the rule’s inputs can be reviewed together. Keep the medication timeline across the full available lower workspace rather than squeezing it into a narrow rail.

For the synthetic demo rule, retain the `DEMO ONLY — NOT CLINICALLY VALIDATED` boundary. Group `Modify`, `Override`, and `Continue without decision` as explicit clinician actions; pin the action row at the end of the alert content. Never preselect or execute a decision automatically. Do not add real dosing advice as template copy.

## UC04 — Hemodynamic Intelligence

### Measurement, model output, and event organization

Keep the primary canvas for hemodynamic trends and verified ABP waveform rendering; allocate a right clinical rail with a meaningful 320px minimum for model status, active alert, and recent events. Correct the current grid/flex shrink chain before resizing the chart. Apply overflow only at a visualization that has a documented minimum plot width; never clip the overall center workspace.

Organize content as separate, labeled bands:

1. **Recorded measurements:** MAP and available CI/SV/SVV/SVR/HR values with units and source; absent values read `DATA NOT AVAILABLE`, never `0`.
2. **Model output:** the actual task label from the verified model contract, output semantics, supported horizon(s), coverage, quality, and readiness. Use `HPI` only if the active model contract explicitly defines HPI or an equivalent task.
3. **Trends and relationship:** measured signal tracks and the temporal relationship view stay separate from the prediction plot. A temporal overlap remains `OVERLAPS`; it does not become treatment causality.
4. **Alert/events:** one event-level alert is updated with risk/lead-time state; repeated predictions do not become repeated event rows.

Use a flexible center-and-rail grid (`minmax(0, 1fr)` plus `minmax(320px, 0.8fr)`) and allow model/provenance labels to wrap. Keep numeric values and units together. Do not display unsupported prediction horizons or confidence/calibration language.

## UC05 — Respiratory Intelligence

### Waveform-first monitor canvas

Preserve the existing capnogram (yellow) and pleth (cyan) renderers, sampling semantics, plot timebase, and morphology. Keep the waveforms as the largest visual regions. Place compact EtCO₂, RR, SpO₂, and PR numerics with units and signal quality above or beside the plots; model status and output remain a separate labeled area.

At high workstation widths, use two wide waveform lanes with aligned case-time cursors. At 1366px/1280px, allow each plot to retain its minimum useful width and scroll only the plot/workspace surface when required. Do not shrink waveform panels to enlarge summaries or decorative headings. Keep graphical trend, alarm review, and tabular trend below the waveform canvas with their headers visible while scrolling.

### Signal and model status

Represent signal gap, degraded quality, and no-breath detection as visibly different states. A missing capnogram displays `SIGNAL UNAVAILABLE`/quality status and a gap; it cannot create a physiologic no-breath marker. A model output is labeled by the exact verified model task and timestamp. If the model is blocked or unavailable, the status dominates the panel and no stale/fake score is displayed.

## Real-data and model availability states

| State | Presentation | Required meaning |
|---|---|---|
| `DATA LOADING` | Neutral progress line/skeleton within the existing panel; retain panel structure | Request is pending; no conclusion about absence is implied |
| `NO TRACK AVAILABLE` | Explicit unavailable label with requested signal/track and case ID | Track is not in the recorded case |
| `INSUFFICIENT HISTORY` | Neutral state with current coverage and additional history required if known | Data exists, but not enough valid time has accumulated |
| `SIGNAL DEGRADED` | Quality badge/overlay on the affected signal only | Observations remain visible with quality qualification; no normal interpolation through invalid gaps |
| `MODEL WARMING UP` | Model status next to its output area; no numeric placeholder | Runtime is initializing; predictions are not ready yet |
| `MODEL UNAVAILABLE` | Explicit reason/status, no score or green success treatment | Model cannot serve output in the current deployment/case |
| `MODEL INFERENCE FAILED` | Error state with request/window context and retryable operational detail | Inference failed; do not substitute a synthetic or zero-risk result |
| `VITALDB CASE INELIGIBLE` | Case-level explanation naming missing/invalid requirements | Case selection is retained only if supported; affected inference remains unavailable |

All states use existing status and panel patterns. Missing, invalid, insufficient, failed, and empty are not interchangeable.

## Workstation variants

These are design constraints for later Figma frame duplication, not created frames.

| Target | Shell and workspace behavior |
|---|---|
| 1920×1080 | One-row header at 54px; full flexible columns and 320–440px clinical rails; show more event/table rows without increasing decorative whitespace. |
| 1600×900 | Use existing two-row header reflow; maintain three-region UC01/UC02 composition when minimum columns fit; preserve chart minimum width. |
| 1440×900 | Keep two-row shell. UC04 measured/model labels receive flexible width; UC02 evidence region remains usable. Existing baseline screenshot keys are available for all six routes in both languages at this size. |
| 1366×768 | Keep workstation rail and two-row header. Preserve high-priority content above the fold; keep one predictable primary vertical scroll; do not compress waveforms or hide the right rail. |
| 1280×720 | No mobile cards. Keep critical labels, actions, clinical values, and source status visible; controlled workspace/plot scrolling may be used where the minimum canvas is required. |

For EN/VI, all headings can wrap except compact numeric/time/control values. Use concise Vietnamese labels where approved by localization; do not solve overflow by shrinking all text.

## Planned Figma naming

If Figma editing becomes available, duplicate verified existing baseline frames into the requested `04 — Proposed Improvements` page and name them semantically, for example:

- `SafeAnes/Overview/Desktop/1440/EN`
- `SafeAnes/UC01/Situation/Desktop/1440/VI`
- `SafeAnes/UC02/Record-Review/Desktop/1440/EN`
- `SafeAnes/UC03/Medication-Safety/Desktop/1440/VI`
- `SafeAnes/UC04/Hemodynamics/Desktop/1440/EN`
- `SafeAnes/UC05/Respiratory/Desktop/1440/VI`

Use Auto Layout for reusable shell, panel, table, status, and action components. Do not use Auto Layout to replace domain chart geometry or waveform rendering semantics. Only add actual frames after the current file/page and baseline nodes can be verified through Figma MCP.
