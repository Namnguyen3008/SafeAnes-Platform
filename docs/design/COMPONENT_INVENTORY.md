# SafeAnes Component Inventory

**Purpose:** inventory generic and domain-specific frontend components for the read-only UI/UX audit.  
**Classification key:** `REUSE_AS_IS`, `REFINE`, `REPLACE_WITH_STANDARD_COMPONENT`, `KEEP_DOMAIN_SPECIFIC`, `REMOVE_DUPLICATE`.  
**Audit status:** inventory only; no components were changed or removed.

## Architecture snapshot

- Framework: Next.js 15.1.7 App Router, React 19, TypeScript 5.7.3, Tailwind CSS 3.4.17.
- Shell composition: `SafeAnesAppShell` → global clinical header, navigation rail, and module viewport; case-scoped replay/case/data providers wrap the route shell.
- Shared primitives live primarily in `src/components/common` and `src/components/ui`; route-specific workspaces live under `src/components/modules/uc01` through `uc05`.
- Existing shared primitives are SafeAnes-owned and custom. The frontend package does not currently include shadcn/ui or Radix packages. No external component was adopted during this audit.
- Layout tokens include a 54px header, 84px navigation rail, 8px panel gap, 12px panel padding, 32px table row target, and 4px radius. Module-local styles also use 2px and 3px radii and varied type/padding values.

## Generic and shell components

| Family / current implementation | Classification | Evidence and issue | Recommendation / reference type | Migration risk |
|---|---|---|---|---|
| Global header — `src/components/shell/GlobalClinicalHeader.tsx` | `REFINE` | Good global context and replay controls. Reflows from 54px to about 82px below the wide breakpoint; status labels become compact. Readiness terminology conflicts in the case selector and model status. | Preserve the existing shell; unify case/data-source/model-status contract and maintain a deliberate two-row workstation layout. | Medium–High |
| Navigation rail — `ClinicalNavigationRail.tsx` | `REUSE_AS_IS` | Overview and five module destinations remain visible in EN/VI at tested desktop widths; active route and keyboard focus are apparent. | Retain rail behavior and route contracts. | Low |
| Module viewport — `ModuleViewport.tsx` and shell layout | `REFINE` | Provides the single primary content scroll, but UC01 adds nested vertical scroll. Lower UC05/UC04 content extends below short viewports. | Keep the shell-level scroll owner explicit; add nested scroll only for independently useful panes. | Medium |
| Case/global data context — `CaseContext`, replay and data providers | `REFINE` | The earlier audit captured a Real VitalDB header coexisting with synthetic content/time on `/replay` and `/data-integrity`; the current shared provider derives the selected source, case, cursor, and status for every route. | Preserve the shared active-source contract and keep every route banner/status derived from it. | High (cross-cutting state) |
| Generic panel — `src/components/common/ClinicalPanel.tsx` | `REUSE_AS_IS` | Supports title, subtitle, icon, action, status, scrolling, min-height, and footer; includes shrink constraints. | Continue using for generic panel chrome; keep domain panel content module-specific. | Low |
| Button primitive — `src/components/ui/button.tsx` | `REFINE` | Shared variants exist, but many module buttons use custom inline Tailwind with varying heights and small labels. | Migrate generic buttons incrementally to shared variants, preserving action priority, focus visibility, and clinical color semantics. | Low–Medium |
| Badge/status primitives — `src/components/common` | `REFINE` | Provenance, severity, source, and readiness labels recur; some narrow UC04 slots clip their text. | Reuse visual treatment but improve content-aware width/wrapping and status hierarchy. Keep each status vocabulary explicit. | Medium |
| Tooltip — `src/components/ui/tooltip.tsx` | `REFINE` | SafeAnes has a custom tooltip; module-specific popovers also carry explanatory content. Full keyboard/overflow coverage was not exhaustively verified. | Consolidate generic tooltip behavior onto the existing primitive; use it for secondary truncated copy only, not critical labels. | Low–Medium |
| Accordion — `src/components/ui/accordion.tsx` | `REUSE_AS_IS` | Existing custom primitive available for collapsible detail; no global failure observed in sampled routes. | Preserve unless future keyboard/state testing identifies a defect. | Low |
| Popover/modal — `src/components/ui/popover.tsx` (`ClinicalModal`) | `REFINE` | The file contains a modal primitive with responsive max-height/body scroll and shared focus handling; naming obscures its modal role. Replay popover semantics are inconsistent. | Clarify primitive naming/API and distinguish modal dialog from non-modal popover. Reuse shared focus behavior. | Low–Medium |
| Drawer — `src/components/ui/drawer.tsx` (`ClinicalDrawer`) | `REUSE_AS_IS` | Shared responsive drawer uses focus management; UC01 and UC05 also have domain drawers. | Use for generic drawer mechanics; do not replace clinical evidence content. | Low |
| Evidence drawer — `src/components/common/EvidenceDrawer.tsx` | `REUSE_AS_IS` | Exposes dialog semantics and shared focus trap; suitable generic wrapper for evidence inspection. | Prefer it over local slide-over overlays where the content contract matches. | Low |
| Replay controller — `SimulationControlPopover` | `REFINE` | Compact control fits at 1440×900 and Escape closes it, but focus escapes an `aria-modal` dialog. Case eligibility/readiness messages conflict. | Preserve compact workstation control; correct modal semantics and use canonical replay/model status. | Medium |
| Select and form controls | `REFINE` | Shared/native controls and module-local inputs coexist; Vietnamese labels and modal space are material to form usability. | Reuse existing control styles; ensure labels, associated accessible names, and wrapping at dialog widths. | Medium |
| Scroll wrappers | `REFINE` | Shell, panel, table, evidence, and rail scrolls are layered. Page width remains stable, but Situation has nested vertical scrolling and UC04 has hidden local overflow. | Define scroll ownership per layout region; audit `overflow-hidden` and min-width interactions. | Medium |

## Tables, charts, and domain components

| Family / current implementation | Classification | Evidence and issue | Recommendation / reference type | Migration risk |
|---|---|---|---|---|
| Shared `ClinicalTable` — `src/components/common/ClinicalTable.tsx` | `REFINE` | Provides a generic scroll wrapper, but many route tables use direct local markup. Real-data observation tables can include a value with `NOT_RECORDED` unit. | Use a shared table shell for consistent row/header/scroll behavior; keep each module’s column priorities and semantics. | Medium |
| UC01 workflow timeline/checklist | `KEEP_DOMAIN_SPECIFIC` | Workflow phases, quality events, and source integrity are domain-specific; nested scroll/clipped secondary labels need refinement. | Preserve clinical workflow semantics and adjust the rail’s sizing/wrapping. | Medium |
| UC02 clinical timeline and claims/evidence | `KEEP_DOMAIN_SPECIFIC` | Event graph, provenance, review status, and evidence links are UC02 semantics. Inline overlay mechanics duplicate generic dialog/drawer behavior. | Keep claims/timeline; reuse shared `ClinicalModal`, `ClinicalDrawer`, and evidence wrapper for interaction. | Low–Medium |
| UC03 medication timeline, administration table, safety alert/actions | `KEEP_DOMAIN_SPECIFIC` | Must preserve proposed vs administered/infusing/stopped distinctions and safety workflow. VitalDB empty state correctly says no authoritative administration data. | Retain domain components; improve the source-aware empty state and shared table chrome. | Medium |
| UC04 HPI/model predictions, hemodynamic trends, ABP/relationship display | `KEEP_DOMAIN_SPECIFIC` | Measured values and model outputs are distinct, but provenance/task/horizon labels are clipped and center layout has a local overflow mismatch. | Preserve chart meaning and model semantics; repair parent/child geometry, then validate the full label set. | Medium–High |
| UC05 capnogram, pleth, respiratory trend, alarm review, tabular trend | `KEEP_DOMAIN_SPECIFIC` | Waveforms remain recognizable and colored by signal; vertical content extends below the fold. Some values lack recorded units; model readiness and per-window abstention state should dominate output when present. | Preserve waveform renderer and approved colors; improve availability/unit presentation and route height allocation. | Medium–High |
| Shared Canvas waveform renderer and domain waveform panels | `KEEP_DOMAIN_SPECIFIC` | UC05 capnogram and pleth have useful plot width in the audited screenshots. No reason to replace approved clinical waveforms for generic chart components. | Keep renderer and signal-specific panels; generic table/chart libraries should not replace clinical morphology. | High if redesigned |
| Overview recorded signals and replay status | `REFINE` | Useful summary and source labels; initial loading looks like no data, and sparse cases leave blank panel area. | Keep overview structure; distinguish loading/empty/error and give source coverage a compact treatment. | Low–Medium |
| UC02 `EvidenceInspector.tsx` inline edit/reject overlays and deep inspection | `REPLACE_WITH_STANDARD_COMPONENT` for overlay mechanics; retain evidence body | Source inspection shows absolute overlays without dialog role/focus management; a shared evidence drawer and modal exist. | Move mechanics to the current SafeAnes dialog/drawer primitives; preserve claim editing, rejection, and immutable evidence logic. | Low–Medium |

## Duplicate or standardization candidates

| Candidate | Classification | Reason | Recommended action |
|---|---|---|---|
| Local modal-like overlays in UC02 vs `ClinicalModal` | `REMOVE_DUPLICATE` after migration | Duplicate overlay/focus behavior, not duplicate clinical content. | Replace only the shell/interaction layer, then remove the inline overlay implementation after behavior is verified. |
| Local drawer overlays in UC02 vs `EvidenceDrawer` / `ClinicalDrawer` | `REMOVE_DUPLICATE` after migration | Similar slide-over mechanics are already shared. | Reuse generic mechanics; keep evidence-specific content and cross-module links. |
| Direct module tables vs shared `ClinicalTable` | `REFINE` | Header, row, numeric alignment, and overflow rules are repeated. | Adopt the shared table shell selectively; do not force identical clinical columns or widths. |
| Module-specific chart containers | `KEEP_DOMAIN_SPECIFIC` | Chart geometry encodes different clinical signals and event semantics. | Standardize only panel frame, source/quality labels, time cursor utilities, and scroll ownership. |
| Domain badges and alert colors | `KEEP_DOMAIN_SPECIFIC` | Severity/provenance/model semantics are not interchangeable. | Reuse base typography and spacing tokens while retaining approved semantic color mappings. |

## Reference/template policy

No template or third-party primitive was imported during this audit. The inspected frontend does not currently depend on shadcn/ui or Radix, and the task was read-only. Recommended sequence for a later implementation is: existing SafeAnes primitive → existing shared UI primitive → standard accessible primitive only when a concrete gap remains. Specialized waveforms, evidence, medication, and prediction semantics stay SafeAnes-owned.
