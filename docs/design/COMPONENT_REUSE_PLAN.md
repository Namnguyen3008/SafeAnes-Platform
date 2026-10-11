# SafeAnes Component Reuse Plan

**Status:** source audit and reuse plan only; no module layouts or components changed.  
**Implementation:** Next.js / React / TypeScript / Tailwind CSS.  
**Related mapping record:** [FIGMA_CODE_CONNECT_MAP.md](./FIGMA_CODE_CONNECT_MAP.md).

## Audit scope and repository structure

Inspected `src/components/ui`, `src/components/common`, `src/components/shell`, the module indexes and component files under `src/components/modules/uc01` through `uc05`, plus package dependencies and Figma Code Connect configuration locations.

- `src/components/safeanes` does not exist.
- The implementation directories are `src/components/modules/uc01`, `uc02`, `uc03`, `uc04`, and `uc05`.
- `src/components/modules/situation`, `record`, `medications`, `hemodynamics`, and `respiratory` are thin re-export entry points. They do not define second module implementations.
- No `figma.config.json` or `.figma.ts` / `.figma.tsx` Code Connect templates were found.
- `package.json` includes no shadcn/ui, Radix, or resizable-panel package. Existing primitives are SafeAnes-owned React components.
- No resizable workspace or split-panel primitive/dependency was found in source or package dependencies.

## Reuse source policy

| Priority | Source | Decision for this codebase |
|---|---|---|
| 1 | Existing SafeAnes components | Use and maintain these as the default source for generic shell, status, table, button, dialog, drawer, tooltip, and accordion roles. |
| 2 | Approved Figma library components | No component is approved for production reuse yet. Previous search results provided opaque asset keys, not node IDs or verified reuse terms; the current Figma MCP call was blocked by the Starter-plan limit. |
| 3 | shadcn/ui / Radix | Not installed. Do not add a second primitive system while existing controls cover the needed roles. Reassess only when a specific accessibility or interaction gap is demonstrated. |
| 4 | 21st MCP | Not used. No verified gap currently justifies adding an external generic component. |
| 5 | Custom clinical components | Keep for waveform morphology, clinical event/evidence semantics, medication state, and model-specific reasoning. |

## Existing shared implementation inventory

| Role | Existing implementation | Current reuse evidence | Recommendation |
|---|---|---|---|
| Global shell | `src/components/shell/SafeAnesAppShell.tsx`, `GlobalClinicalHeader.tsx`, `ClinicalNavigationRail.tsx`, `ModuleViewport.tsx` | Shared across route workspaces | Maintain one shell and one navigation implementation. |
| Clinical panel | `src/components/common/ClinicalPanel.tsx` | Used in replay workspace; not broadly adopted by UC01–UC05 | Use as the default generic panel chrome where layout contracts fit; keep domain content in the module. |
| Clinical table wrapper | `src/components/common/ClinicalTable.tsx` | Component exists; direct module search did not show adoption | Reuse as a wrapper for future table migrations; preserve UC-specific columns, row meaning, and width priorities. |
| Severity badge | `src/components/common/SeverityBadge.tsx` | Used by Overview and UC02, UC03, UC05; UC04 `ui/Badge.tsx` delegates high/medium/info to it | Keep this as the single shared severity implementation. Preserve domain severity mapping. |
| Provenance badge | `src/components/common/ProvenanceBadge.tsx` | Used by UC02 claims and evidence | Keep UC02 provenance labels and colors; do not merge provenance into generic severity. |
| Evidence drawer shell | `src/components/common/EvidenceDrawer.tsx` | Generic focus-managed shell exists; no common-shell adoption was found | Candidate for generic evidence-drawer mechanics after the Figma role and caller contract are verified. |
| Button | `src/components/ui/button.tsx` (`Button`) | Used in simulation controls and UC01; other routes still use local button markup | Reuse for future generic actions; preserve route-specific action ordering and clinical emphasis. |
| Drawer | `src/components/ui/drawer.tsx` (`ClinicalDrawer`) | Used by UC01 alert and data-integrity flows | Reuse the shared focus, close, viewport, and scrolling contract when it fits the module. |
| Dialog | `src/components/ui/popover.tsx` (`ClinicalModal`) | Used by UC01 workflows and summary details | Reuse for generic modal mechanics. The filename is historical; component semantics are a modal dialog. |
| Tooltip | `src/components/ui/tooltip.tsx` (`Tooltip`) | Used by UC01 perioperative timeline | Reuse for element-anchored generic tooltip behavior. Keep coordinate-anchored chart inspection domain-local. |
| Accordion | `src/components/ui/accordion.tsx` | Generic primitive exists | Reuse when expandable grouped content is needed; do not add a second accordion primitive. |
| Time axis / cursor | `src/components/common/SharedTimeAxis.tsx`, `TimeCursor.tsx` | Shared utilities exist for synchronized time displays | Reuse time mechanics only when the consuming visualization has the same time contract; retain each waveform/trend renderer. |

## UC component inventory

All items in this section are module-specific unless marked as a shared primitive consumer. Their behavior must remain specialized.

| Module | Verified code area and representative reusable components | Reuse boundary |
|---|---|---|
| UC01 — Situation / Data Integrity | `src/components/modules/uc01`: `UC01Workspace`, `MainWorkspace`, `PerioperativeTimeline`, `DataIntegrityDrawer`, `SituationAwarenessPanel`, `ActiveAlertsPanel`, `WorkflowChecklistPanel`, `RecentEventsPanel`, patient/OR/context and physiologic summary panels | Keep acquisition, device quality, missingness, and phase semantics in UC01. Existing shared `ClinicalDrawer`, `ClinicalModal`, `Button`, `Tooltip`, and status badges may provide generic mechanics. |
| UC02 — Record / Evidence | `src/components/modules/uc02`: `UC02Workspace`, `ClinicalTimeline`, `StructuredAnaesthesiaRecord`, `ClinicalClaimRow`, `ClaimReviewTable`, `ReviewTable`, `EvidenceInspector`, `ReviewRail` | Keep claim/evidence/provenance/review behavior in UC02. Continue using `SeverityBadge` and `ProvenanceBadge`; consider shared dialog/drawer shells for local overlays without changing review behavior. |
| UC03 — Medication Safety | `src/components/modules/uc03`: `MedicationSafetyWorkspace`, `MedicationTimeline`, `MedicationTimelinePanel`, `CurrentMedicationAlert`, `AlertExplanation`, medication evidence/knowledge/context panels, override and administration dialogs | Keep proposed/administered/infusing distinctions, synthetic rule logic, and audit history in UC03. The domain `EvidenceDrawer` is separate from the generic `common/EvidenceDrawer`; only its outer interaction shell is a future consolidation candidate. |
| UC04 — Hemodynamic Intelligence | `src/components/modules/uc04`: `HemodynamicIntelligenceWorkspace`, `HemodynamicTrendPanel`, `HemodynamicRelationshipPanel`, `HemodynamicEventsTable`, `HemodynamicGauge`, `PredictedHpiPanel`, risk/summary tiles, `visualization/*`, `ui/Badge`, `ui/Dialog`, `ui/Popover`, `ui/Tooltip` | Keep measured-versus-predicted distinction, relationship semantics, trend scales, alert logic, and chart hover behavior domain-specific. The local `Badge` already reuses `SeverityBadge`; retain that adapter rather than adding a second severity system. |
| UC05 — Respiratory Intelligence | `src/components/modules/uc05`: `CapnogramPanel`, `PlethysmographPanel`, `TrendWorkspace`, `AlarmReviewTable`, `TabularTrendTable`, summary rail, `ui/AlertDetailDrawer`, `ui/TimeRangeDropdown`, `ui/RiskModelInfoPopover`, `visualization/*` | Keep waveform generation/rendering, respiratory quality gating, alarm state, and signal-time synchronization specialized. Do not map capnogram or pleth to a generic chart component. |

`src/components/modules/overview` contains the global alert rail, physiology strip, case summary, and module summary grid. These consume shared status primitives where already present and should continue to use the common severity badge.

## Reuse candidates and duplicate mechanics

The findings below are planning items, not code changes.

1. **Panel chrome:** `ClinicalPanel` already provides title, subtitle, action, status, footer, and scrolling. Prefer this for generic panels in later module work instead of adding `PanelNew` or route-local panel shells. Do not force it onto a chart whose layout needs a different domain contract.
2. **Table shell:** `ClinicalTable` is available but currently underused. Future adoption should centralize only the border, overflow, and sticky-header mechanics; tables retain distinct clinical columns and data semantics.
3. **Severity:** UC04's `ui/Badge` is a thin adapter over `SeverityBadge` for high/medium/info. Preserve that delegation. Do not create additional severity badge implementations.
4. **Evidence drawer:** UC03's `src/components/modules/uc03/EvidenceDrawer.tsx` owns synthetic medication evidence content and its overlay shell. `src/components/common/EvidenceDrawer.tsx` is a generic shell with maximize behavior. They are not interchangeable as-is. If consolidated later, retain UC03 content and state in UC03 and reuse/extend the shared shell only after verifying width, scrim, close, maximize, and focus contracts.
5. **Dialog and alert surfaces:** UC01 uses `ClinicalModal`; UC04 has a separate alert `ui/Dialog.tsx`; UC02 has local edit/reject overlays in `EvidenceInspector`; UC05 has an alert detail drawer. Reuse shared modal/drawer mechanics only when their focus, dismissal, size, and action-footer behavior match. Keep alert severity and clinical content local.
6. **Tooltip behavior:** the shared tooltip is element-anchored; UC04 `TrackTooltip` is coordinate-anchored to chart inspection. Keep both behaviors until they can be represented by one accessible API without losing chart synchronization.
7. **Resizable workspace:** no current implementation exists. Do not map a Figma resizable pane to fixed CSS columns or add a dependency without an approved workflow requirement.

## Code Connect mapping status

The semantic reuse candidates and exact source paths are listed in [FIGMA_CODE_CONNECT_MAP.md](./FIGMA_CODE_CONNECT_MAP.md). No Figma component node IDs, published components, or property definitions were available; therefore no mapping was published or activated. The React prop names above are source facts, not asserted Figma variant/prop correspondences.

## Recommended implementation sequence for a later migration

1. Once Figma MCP access and a published component library are available, inspect actual nodes and properties, then publish/read back mappings for the matching shared primitives first: panel, severity badge, table, button, generic drawer/dialog, and tooltip.
2. Migrate shared chrome one primitive at a time, starting with components already used by several routes. Keep a compatibility layer for existing variant/prop contracts.
3. Reuse only generic interaction mechanics for UC02/UC03/UC04/UC05 evidence and alert surfaces; retain their content and clinical state.
4. Keep all five domain visualization families specialized. Do not introduce a generic clinical chart or reasoning component.
5. Verify each migration against current EN/VI screens and route behavior before removing any older shell implementation.
