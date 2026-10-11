# SafeAnes Visual Layout Stabilization Implementation Plan

> **For agentic workers:** Execute this plan in order and verify each route in the browser before closing the task.

**Goal:** Stabilize the unified SafeAnes workstation across the required desktop resolutions and EN/VI while preserving clinical meaning and information density.

**Architecture:** Keep the existing Next.js App Router, shared shell, clinical modules, and domain visualizations. Make the application viewport the controlled scroll boundary, give dense workspaces explicit minimum dimensions, and improve shared panel, table, button, tooltip, drawer, and dialog behavior without introducing a second UI system.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 3, existing Lucide icons, Playwright browser inspection.

**Spec:** User request in this conversation, including route inventory, viewport matrix, language support, and acceptance criteria.

## Global Constraints

- Preserve SafeAnes clinical hierarchy, severity colors, provenance, units, terminology, and module workflows.
- Keep the workstation dense and desktop-oriented; do not replace clinical views with mobile cards.
- Preserve plot minimum widths and use controlled scrolling when the viewport cannot display them.
- Do not truncate critical clinical values, alert titles, medication names, event times, or units.
- Support EN and VI without globally shrinking typography.
- Use existing project dependencies; no 21st MCP or shadcn package is available in this workspace.
- Validate with `npm run build` and rendered browser review; no test script is configured.

---

### Task 1: Shared workstation shell and tokens

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/shell/SafeAnesAppShell.tsx`
- Modify: `src/components/shell/ModuleViewport.tsx`
- Modify: `src/components/shell/GlobalClinicalHeader.tsx`
- Modify: `src/context/LocalizationContext.tsx`

- [x] Capture the initial rendered state and confirm the shell overflow and header clipping at the minimum viewport.
- [ ] Make the module viewport the single application-level horizontal and vertical scroll boundary while preserving fixed header and navigation.
- [ ] Keep header-critical status and language controls visible; let procedure detail use flexible width and secondary-text ellipsis.
- [ ] Update the document language when the locale changes.
- [ ] Verify shell geometry at 1280×720, 1440×900, and 1920×1080 in EN and VI.

### Task 2: Shared clinical UI primitives

**Files:**
- Modify: `src/components/common/ClinicalPanel.tsx`
- Modify: `src/components/common/ClinicalTable.tsx`
- Modify: `src/components/common/EvidenceDrawer.tsx`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/components/ui/popover.tsx`
- Modify: `src/components/ui/drawer.tsx`
- Modify: `src/components/ui/accordion.tsx`

- [ ] Give panel headers wrapping-safe titles, flexible content, optional status, minimum height, and explicit scroll behavior.
- [ ] Give tables a bounded horizontal scroll surface, stable numeric cells, and sticky-header support without adding nested vertical scroll by default.
- [ ] Keep action labels readable and controls keyboard-focusable at compact workstation sizes.
- [ ] Make tooltip content wrap within the viewport and remain available to keyboard users.
- [ ] Give modal and drawer bodies responsive width, maximum height, scrollable content, dialog semantics, and focus handling.
- [ ] Keep accordion content inside its width without clipping wrapped clinical text.

### Task 3: UC01 Situation and UC02 Record Review

**Files:**
- Modify: `src/components/modules/uc01/UC01Workspace.tsx`
- Modify: `src/components/modules/uc01/MainWorkspace.tsx`
- Modify: `src/components/modules/uc01/PerioperativeTimeline.tsx`
- Modify: `src/components/modules/uc02/UC02Workspace.tsx`
- Modify: `src/components/modules/uc02/MainWorkspace.tsx`
- Modify: `src/components/modules/uc02/CaseReviewSummary.tsx`
- Modify: `src/components/modules/uc02/ClinicalTimeline.tsx`
- Modify: `src/components/modules/uc02/ReviewTable.tsx`
- Modify: `src/components/modules/uc02/ReviewRail/ClinicianReviewRail.tsx`

- [ ] Keep UC01 context and alert rails at readable minimum widths; allow the workstation canvas to scroll when required.
- [ ] Preserve UC02 timeline width and the 410px record/evidence column; prevent KPI cards and the review rail from compressing each other.
- [ ] Ensure lower context, review, and approval content can be reached at 720px and 768px viewport heights.
- [ ] Verify `/safeanes/case/demo/situation` and `/safeanes/case/demo/record` in EN and VI.

### Task 4: UC03 Medication Safety and UC04 Hemodynamic Intelligence

**Files:**
- Modify: `src/components/modules/uc03/MedicationSafetyWorkspace.tsx`
- Modify: `src/components/modules/uc03/UpperWorkspace.tsx`
- Modify: `src/components/modules/uc03/MedicationTimelinePanel.tsx`
- Modify: `src/components/modules/uc03/RecentAlertsOverridesTable.tsx`
- Modify: `src/components/modules/uc03/RecentMedicationValuesTable.tsx`
- Modify: `src/components/modules/uc03/ClinicalOverrideModal.tsx`
- Modify: `src/components/modules/uc04/HemodynamicIntelligenceWorkspace.tsx`
- Modify: `src/components/modules/uc04/MainClinicalWorkspace.tsx`
- Modify: `src/components/modules/uc04/RightClinicalSummaryRail.tsx`
- Modify: `src/components/modules/uc04/HemodynamicEventsTable.tsx`

- [ ] Rebalance UC03 row minima so medication review, timeline, and both recent-value tables remain usable at short viewport heights.
- [ ] Keep UC03 medication, patient-context, and review columns at practical minimum widths; permit controlled horizontal scrolling.
- [ ] Keep UC04 chart rows and summary-rail tiles from flex-shrinking below their clinical value dimensions.
- [ ] Preserve value-unit pairing and make the UC03 override dialog readable at constrained heights.
- [ ] Verify both routes in EN and VI.

### Task 5: UC05 Respiratory Intelligence and supporting routes

**Files:**
- Modify: `src/components/modules/uc05/RespiratoryIntelligenceWorkspace.tsx`
- Modify: `src/components/modules/uc05/ClinicalVisualizationColumn.tsx`
- Modify: `src/components/modules/uc05/ClinicalSummaryRail.tsx`
- Modify: `src/components/modules/uc05/AlarmReviewTable.tsx`
- Modify: `src/components/modules/uc05/TabularTrendTable.tsx`
- Modify: `src/components/modules/uc05/BottomReviewGrid.tsx`
- Modify: `src/components/modules/uc05/ui/AlertDetailDrawer.tsx`
- Modify: `src/components/modules/uc05/ui/AlarmDetailPopover.tsx`
- Modify: `src/components/modules/uc05/ui/RiskModelInfoPopover.tsx`
- Modify: `src/app/safeanes/case/[caseId]/page.tsx`
- Modify: `src/app/safeanes/case/[caseId]/data-integrity/page.tsx`
- Modify: `src/app/safeanes/case/[caseId]/replay/page.tsx`

- [ ] Preserve minimum waveform and trend plot area while allocating at least 320px to the clinical summary rail.
- [ ] Allow the full respiratory rail and review tables to remain reachable at 720px and 768px heights.
- [ ] Keep alarm and trend numeric cells on one line and permit horizontal scrolling only inside dense tables when needed.
- [ ] Make the alert drawer and model detail overlays fit Vietnamese content and remain scrollable.
- [ ] Verify overview, data integrity, replay, and all five module routes in EN and VI.

### Task 6: Final workstation verification

**Files:**
- Review: all files changed by Tasks 1–5.

- [ ] Inspect every required route at 1920×1080, 1680×1050, 1600×900, 1440×900, 1366×768, and 1280×720.
- [ ] Inspect every module in both EN and VI at the primary and minimum target sizes; verify supporting routes and open evidence, dialog, and drawer surfaces.
- [ ] Check rendered text clipping, document overflow, table scroll behavior, chart sizing, right-rail widths, and browser console output.
- [ ] Run `npm run build` after stopping the dev server so production and development builds do not share `.next` concurrently.
- [ ] Report remaining limitations only when they are confirmed.
