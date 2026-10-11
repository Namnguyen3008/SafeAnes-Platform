# SafeAnes Figma Code Connect Map

**Status:** no Code Connect mappings published or activated.  
**Codebase:** Next.js / React / TypeScript.  
**Figma file under review:** [SafeAnes — Unified Clinical Workstation](https://www.figma.com/design/bAkYMkjbAddPKG70KRzi5K).  
**Review date:** 2026-10-10.

## Access and verification status

The authenticated Figma account is on the Starter plan. The Code Connect workflow guidance reports that Code Connect requires an Organization or Enterprise plan and components published to a team library. A file-level component inventory request was attempted using the available Figma MCP capability and was rejected with the Starter-plan MCP tool-call limit. The previous successful metadata inspection of this file reported a single empty `Page 1`; no published SafeAnes component node IDs were returned.

The MCP tool catalog exposes `get_code_connect_map`, `get_code_connect_suggestions`, and `get_context_for_code_connect`, but no valid component node ID is available. Those calls and any write operation were not made. The opaque asset keys from earlier library search results are not Figma node IDs and were not used as identifiers. No `.figma.ts` files or Figma mapping records were created.

**Result:** Code Connect is not complete. All rows below are code-side reuse candidates only; they are explicitly not Figma mappings.

## Code-side candidate inventory — not published mappings

The React paths and props below were checked in the target source. Figma properties and variant names remain unknown until a published Figma component can be inspected.

| Semantic role | Figma component / node ID | Verified React component | Code variants and props | Token styling | Interaction behavior | Published / activated |
|---|---|---|---|---|---|---|
| ClinicalPanel | Figma component not verified; node ID unavailable | `src/components/common/ClinicalPanel.tsx` | `variant`: `default`, `secondary`, `elevated`; `compact`; `title`, `subtitle`, `icon`, `action`, `status`, `footer`, `scrollBehavior`, `minHeight`, content/header classes | `bg-safe-surface*`, `border-safe-border`, `--safe-panel-padding`, `rounded-sm`, `text-panel-title`, `safe-border-subtle` | Header/action/status slots, optional footer, content scrolling, min-height | No |
| SeverityBadge | Figma component not verified; node ID unavailable | `src/components/common/SeverityBadge.tsx` | `severity` union (`CRITICAL`, `HIGH`, `WARNING`, `INFO`, review/result states); optional `label`, `size` (`xs`, `sm`), `showIcon`, `className` | SafeAnes severity colors, `font-mono`, compact border/radius | Static status label with optional icon; no action | No |
| ClinicalTable | Figma component not verified; node ID unavailable | `src/components/common/ClinicalTable.tsx` | `children`, `className`, optional `maxHeight`, `stickyHeader`; `ClinicalTableHeader` accepts `children` and `className` | `bg-safe-surface`, `border-safe-border`, `.clinical-table-scroll`, sticky header class | Horizontal scroll wrapper; optional bounded vertical scroll and sticky header | No |
| EvidenceDrawer shell | Figma component not verified; node ID unavailable | `src/components/common/EvidenceDrawer.tsx` | `isOpen`, `onClose`, `title`, `subtitle`, `children`, `isMaximized`, `onToggleMaximize` | Safe surface/border; default 640px or 92vw; focus-visible conventions | Focus trap, close action, maximize/restore, scrollable body | No |
| Button | Figma component not verified; node ID unavailable | `src/components/ui/button.tsx` | `variant`: `workstation`, `active`, `ghost`, `danger`, `success`, `outline`; `size`: `xs`, `sm`, `md`, `icon`, `icon-xs`; standard button props | Existing `safe-*` colors, radius, focus ring, dense size classes | Native button semantics, keyboard activation, disabled state and visible focus | No |
| ClinicalDrawer | Figma component not verified; node ID unavailable | `src/components/ui/drawer.tsx` | `isOpen`, `onClose`, `title`, `subtitle`, `children`, optional width class | `bg-safe-surface`, border, compact panel padding, bounded viewport width | Modal dialog, focus trap, Escape close, scrollable body | No |
| ClinicalDialog | Figma component not verified; node ID unavailable | `ClinicalModal` in `src/components/ui/popover.tsx` | `isOpen`, `onClose`, `title`, `subtitle`, `children`, optional width class | Safe surface/border, `max-height: 90vh`, scrollable content | Modal dialog, focus trap, Escape close | No |
| ClinicalTooltip | Figma component not verified; node ID unavailable | `src/components/ui/tooltip.tsx` | `children`, `content`, `position` (`top`, `bottom`, `left`, `right`), `delayMs` | `safe-tooltip-popover`, elevated surface, border, compact type | Hover/focus reveal, viewport-aware placement, portal rendering | No |
| Accordion | Figma component not verified; node ID unavailable | `src/components/ui/accordion.tsx` | `type` (`single`, `multiple`), `value` / `defaultValue`, `onValueChange`, `AccordionItem`, trigger/content children | Safe surface, border, compact spacing | Controlled or uncontrolled expand/collapse | No |
| ResizableWorkspace | No matching Figma or React primitive verified | No React candidate found; no resizable-panel dependency found in `package.json` | Not applicable | Not applicable | No user-resizable split-pane behavior verified | No |

## Domain-specific components excluded from generic mappings

These components have clinical or data semantics that should not be replaced by a generic component mapping: UC01 device quality and perioperative timeline, UC02 claims and evidence review, UC03 medication timeline and safety rules, UC04 hemodynamic relationship and prediction, UC05 capnogram and pleth waveforms. They may reuse generic shell mechanics only when the existing interaction and accessibility contracts match.

## Requirements before publishing mappings

1. Figma account plan and MCP access must support Code Connect.
2. Each target must be a published component in an accessible team library.
3. Retrieve its actual node ID and variant/property definitions through Figma MCP.
4. Compare those properties against the verified React props above; omit any unsupported mapping rather than inventing props.
5. Publish/activate only the reviewed node-to-source mapping, then read it back with `get_code_connect_map`.

Until these conditions are met, reuse is documented as an implementation plan only. There are no Figma node links to return for the candidate rows.
