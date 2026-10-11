# SafeAnes Workspace Annotated Comparisons

**Status:** text-based design comparison; no AFTER screenshots or Figma frames were rendered.  
**Evidence:** prior rendered audit and browser capture manifest in [VISUAL_BASELINES.md](./VISUAL_BASELINES.md).  
**Proposed layouts:** [SAFEANES_WORKSPACE_DESIGN_PROPOSALS.md](./SAFEANES_WORKSPACE_DESIGN_PROPOSALS.md).

## Screenshot reference policy

The BEFORE references below are the audit's ephemeral CUA capture keys, not screenshot files. The earlier audit captured the six primary workspaces in EN and VI at 1440×900 and Overview EN at 1920×1080; other requested states were measured/reviewed in the browser but the screenshot tool did not expose a supported file-save operation. There are no AFTER screenshots because Figma write access was unavailable. No image path or Figma frame URL is fabricated.

## Global shell

**BEFORE**

- 1920×1080: compact 54px one-row header.
- 1600×900, 1440×900, 1366×768: header reflows to about 82px/two rows.
- Case eligibility and model readiness can disagree in the case selector versus model status; source/time context was also inconsistent on synthetic supporting routes under a VitalDB header.
- Baseline observations: `CUA-1920x1080-EN-Overview`, `CUA-1440-EN-Overview`, `CUA-1440-VI-Overview`.

**AFTER — proposal, not rendered**

Keep the two existing header heights and the 84px rail. Put case identity, explicit source mode, current replay/simulation time and state, alert count, and locale in the primary scan order. Place recorded procedure/OR fields and separate track/case eligibility from loaded-model readiness in the second row at compact widths. Keep all status values source-aware and use concise EN/VI labels with wrap only for secondary context.

**WHY**

Operators can identify which case and data source they are viewing before interpreting a signal or model result. Separate eligibility and readiness to prevent track presence from appearing to mean inference is available.

**COMPONENTS REUSED**

`SafeAnesAppShell`, `GlobalClinicalHeader`, `ClinicalNavigationRail`, current replay/case controls, shared semantic tokens, and existing status badges.

**RISKS**

Header capacity is limited at 1280px. A third row or hidden critical status would increase context switching; values not recorded by VitalDB must remain explicit.

**IMPLEMENTATION IMPACT**

Medium. Mostly information ordering and shared status-contract alignment; no change to route contracts proposed.

## Overview

**BEFORE**

- Initial load displays “No recorded samples available” before observations arrive; the audited request later populates eight observations after roughly 700–900ms.
- Sparse real-data panels leave blank areas and put some explanatory context in a side rail.
- Numeric observations may be prominent while their unit reads `NOT_RECORDED`.
- Baseline references: `CUA-1920x1080-EN-Overview`, `CUA-1440-EN-Overview`, `CUA-1440-VI-Overview`.

**AFTER — proposal, not rendered**

Keep the existing physiology strip, module summary grid, recent events, and global alert rail. Show a loading state until data resolves; then distinguish true empty, unavailable track, and request failure. Display values only as complete measurements when units are known; otherwise visibly qualify the value/unit state. Use sparse area for a compact source/coverage/reason summary inside its existing panel.

**WHY**

Prevents a transient request state or incomplete value from being misread as a clinical absence or a complete measurement.

**COMPONENTS REUSED**

`PhysiologicStatusStrip`, `GlobalAlertRail`, `ModuleSummaryGrid`, `CaseCommandSummary`, `ClinicalPanel`, `SeverityBadge`, existing observation table/row patterns.

**RISKS**

Coverage and unit availability must come from the real-data contract. Do not fill the extra space with generated events or an invented patient summary.

**IMPLEMENTATION IMPACT**

Medium–High. Requires explicit loading/empty/error states and consistent unit availability at the observation display boundary.

## UC01 — Situation / Data Integrity

**BEFORE**

- One nested vertical scroller appears inside the main route scroll region at all tested sizes.
- Long secondary context and workflow strings are clipped/truncated in narrower layouts, including Vietnamese.
- The supporting Data Integrity route can show synthetic device/clock information while global context identifies a VitalDB case.
- Baseline references: `CUA-1440-EN-UC01`, `CUA-1440-VI-UC01`; other sizes were measured, not persisted as images.

**AFTER — proposal, not rendered**

Use flexible patient/OR, central workflow/timeline, and right situation/quality regions with minimum widths of about 240px, 520px, and 290px. Keep one main vertical scroll where possible. Make workflow completion, recorded numeric measurements, data-quality state, and alerts separate labeled groups. Open data integrity as a sufficiently wide inspector with source/track, quality events, and raw-versus-derived detail. VitalDB mode lists only observed source metadata; synthetic telemetry remains in the synthetic mode.

**WHY**

The current scroll/clipping slows situation review, while separate groups prevent quality or workflow status from being mistaken for measured physiology.

**COMPONENTS REUSED**

`UC01Workspace`, `PerioperativeTimeline`, `WorkflowChecklistPanel`, patient/OR context panels, `SituationAwarenessPanel`, `DataIntegrityDrawer`, shared `ClinicalDrawer`, `ClinicalPanel`, `SeverityBadge`, `Tooltip`.

**RISKS**

Do not claim devices or clock offsets absent from a VitalDB record. Keep timeline chronology and quality-gap semantics unchanged. The right rail must retain a readable minimum width.

**IMPLEMENTATION IMPACT**

Medium. Primarily grid constraints, scroll ownership, bilingual wrapping, and source-aware data-integrity presentation.

## UC02 — Record / Evidence

**BEFORE**

- Sparse VitalDB records leave unused panel area, but their `NOT_RECORDED` boundaries are honest.
- `EvidenceInspector` uses local edit/reject/deep-inspection overlays without dialog semantics/focus trapping in the audited source.
- Baseline references: `CUA-1440-EN-UC02`, `CUA-1440-VI-UC02`.

**AFTER — proposal, not rendered**

Arrange Clinical Timeline → Structured Record → Evidence Inspector in three flexible panes. Keep 220–260px for the timeline, at least 520px for claims/record, and 380–440px for evidence at wide workstations. At 1366px/1280px, present the inspector as a dismissible drawer while retaining the selected claim and synchronized time cursor. Pin selected claim identity and Accept/Edit/Reject in stable positions; keep provenance, exact source times/measurements, derivation, and validation together. `REQUIRES REVIEW` and inferred claims remain visually distinct from recorded facts.

**WHY**

Supports the review sequence—select claim, inspect evidence, verify provenance, make an explicit review decision—without compressing the claim list or conflating inference with source documentation.

**COMPONENTS REUSED**

`ClinicalTimeline`, `StructuredAnaesthesiaRecord`, `ClaimReviewTable`, `ClinicalClaimRow`, `EvidenceInspector`, `ReviewRail`, `ProvenanceBadge`, `SeverityBadge`, shared `ClinicalDrawer` / `ClinicalModal` mechanics.

**RISKS**

Do not auto-accept or sign. Evidence references and immutability must survive pane changes. A drawer must not hide the selected claim or timeline context.

**IMPLEMENTATION IMPACT**

Medium. Overlay mechanics and flexible pane sizing; review state/data contract remains unchanged.

## UC03 — Medication Safety

**BEFORE**

- VitalDB mode correctly says no authoritative medication administration data is available for the audited case.
- Sparse data leaves a large open medication workspace while contextual explanation is concentrated in the side rail.
- The synthetic demo contains proposed and administered state concepts that must remain visually separate.
- Baseline references: `CUA-1440-EN-UC03`, `CUA-1440-VI-UC03`.

**AFTER — proposal, not rendered**

Separate Administered/Infusing from Proposed/Ordered sections and mark lifecycle changes on one full-width medication timeline. Place active safety alert, patient factors, dose comparison, synthetic rule/evidence, and actions in one review region. Keep Modify, Override, and Continue without decision as explicit interactive actions; do not preselect one. In VitalDB with absent structured medication events, keep the explicit unavailable empty state and do not evaluate invented exposure.

**WHY**

Prevents an order/proposal from looking like actual administration, and keeps the alert’s rationale and input data available at decision time.

**COMPONENTS REUSED**

`MedicationSafetyWorkspace`, `ActiveMedicationPanel`, `CurrentMedicationAlert`, `PatientSpecificFactors`, medication evidence/knowledge panels, `MedicationTimelinePanel`, existing medication override dialogs, `SeverityBadge`, existing drawer/dialog mechanics.

**RISKS**

No drug-dosing recommendations may be introduced as aesthetic content. The synthetic rule remains explicitly demo-only. Keep administration, infusion, rate-change, stopped, and proposal event semantics intact.

**IMPLEMENTATION IMPACT**

Medium. Section hierarchy and empty-state layout; potential shell reuse for the existing domain evidence drawer after behavior parity review.

## UC04 — Hemodynamic Intelligence

**BEFORE**

- Model output and recorded trends are visually separated, but task/provenance/horizon/coverage labels are clipped in narrow fixed slots.
- A child visualization with an 860px minimum overflows a 956px parent by about 10px and is clipped.
- The current HPI/result label and any synthetic fallback need to reflect the active verified model task in real-data mode.
- Baseline references: `CUA-1440-EN-UC04`, `CUA-1440-VI-UC04`; clipping also observed at 1366px.

**AFTER — proposal, not rendered**

Give the main trend/ABP canvas flexible space and keep a minimum 320px right rail for model status, active event, and recent events. Group recorded MAP/CI/SV/SVV/SVR/HR values with units and source separately from a model-output panel labeled by the verified task contract. Put coverage, quality, availability, and only supported horizons next to the output. Fix the parent shrink/overflow chain before changing plot geometry. Keep relationship labels temporal (`OVERLAPS`) unless source evidence supports stronger semantics.

**WHY**

The model’s task and data qualification must remain readable alongside its output; plot context and evidence should not disappear because the container clips locally.

**COMPONENTS REUSED**

`HemodynamicTrendPanel`, verified ABP renderer, `HemodynamicRelationshipPanel`, `PredictedHpiPanel` or its task-labeled equivalent, `HemodynamicEventsTable`, `RightClinicalSummaryRail`, `SeverityBadge` adapter, existing UC04 time scales.

**RISKS**

Do not label output HPI unless the active contract says HPI/equivalent. Do not create unsupported horizons, confidence, calibration, or unavailable CI/SV/SVV/SVR values. Keep measured and predicted data visually distinct.

**IMPLEMENTATION IMPACT**

Medium–High. Grid/flex minimum sizing and task-aware labels; no prediction or relationship logic changes proposed.

## UC05 — Respiratory Intelligence

**BEFORE**

- Capnogram and pleth remain readable and retain adequate width at 1440×900.
- Lower trends/alarm/table regions fall below the initial viewport, especially at 1366×768.
- Some numeric observations show `NOT_RECORDED` units; the blocked model status is visually quieter than a displayed output.
- Baseline references: `CUA-1440-EN-UC05`, `CUA-1440-VI-UC05`.

**AFTER — proposal, not rendered**

Keep capnogram and pleth as dominant aligned waveform regions with synchronized time cursor; do not shrink them for decorative cards. Keep EtCO₂/RR/SpO₂/PR numerics with units and quality in a compact strip. Put trend, alarm review, and tabular trend below the waveform canvas with legible headers and predictable scroll. Put model output and readiness in a separate panel using the exact verified task label. On missing/degraded signals, show a gap and quality state; no-breath markers require valid signal evidence.

**WHY**

Preserves the waveform fidelity already judged successful while making downstream review and model qualification easier to scan.

**COMPONENTS REUSED**

`CapnogramPanel`, `PlethysmographPanel`, `ClinicalVisualizationColumn`, `TrendWorkspace`, `AlarmReviewTable`, `TabularTrendTable`, `ClinicalSummaryRail`, shared badge/table and panel tokens.

**RISKS**

Avoid changing waveform scale, morphology, acquisition semantics, or time synchronization. Do not treat dropout as apnea. Do not expose a blocked or failed model score as available output.

**IMPLEMENTATION IMPACT**

Medium. Mostly vertical space allocation, scroll/header behavior, unit-state presentation, and model-status hierarchy; renderers remain unchanged.

## Cross-workspace unavailability states

**BEFORE:** loading, true-empty, no-track, insufficient history, degraded signal, and model/runtime failures are not yet represented consistently across all panels; Overview specifically showed empty copy before the request finished.

**AFTER — proposal, not rendered:** use explicit in-panel labels for `DATA LOADING`, `NO TRACK AVAILABLE`, `INSUFFICIENT HISTORY`, `SIGNAL DEGRADED`, `MODEL WARMING UP`, `MODEL UNAVAILABLE`, `MODEL INFERENCE FAILED`, and `VITALDB CASE INELIGIBLE`. Each state describes the actual reason and retains case/source context. Do not fill any state with zero values, stale predictions, or synthetic placeholders.

**WHY:** clear state semantics prevent temporary or partial availability from looking like a clinical fact.

**COMPONENTS REUSED:** existing `ClinicalPanel`, status badges, `ClinicalTable`, model/source metadata, drawers for detail.

**RISKS:** state labels must be driven by backend/API status and not inferred from presentation. `SIGNAL DEGRADED` is scoped to the affected signal.

**IMPLEMENTATION IMPACT:** Medium–High, cross-route status contract and localization work.

## Approval and implementation boundary

This document provides design intent and annotated BEFORE/AFTER notes only. It contains no generated screenshots, no Figma frame URLs, and no claim that an AFTER state was visually verified. React implementation remains untouched. The Figma handoff is blocked by the current MCP Starter-plan call limit and the absence of a verifiable editable baseline/component inventory; once access returns, use `SAFEANES_WORKSPACE_DESIGN_PROPOSALS.md` as the source for duplicated proposed frames.
