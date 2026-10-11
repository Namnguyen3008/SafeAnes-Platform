# SafeAnes Design System

**Status:** code-side token foundation implemented; domain screen migration not started.  
**Product:** SafeAnes high-density clinical workstation.  
**Framework:** Next.js 15 / React 19 / TypeScript / Tailwind CSS 3.4.  
**Design source:** the existing SafeAnes CSS and shared components.  
**Figma target:** [SafeAnes — Unified Clinical Workstation](https://www.figma.com/design/bAkYMkjbAddPKG70KRzi5K).

## Source of truth and scope

The frontend already had an established dark clinical palette, compact workstation geometry, tabular numerals, and custom SafeAnes primitives. This pass gives those existing values stable semantic names and exposes them to Tailwind while retaining the original `safe-*` utility API. Existing module layouts and clinical/domain components were not migrated.

No approved external Figma reference or variable collection was available for this implementation. Earlier library search results were generic research candidates without inspected component context or verified reuse terms. The requested Figma `get_variable_defs` and write operations could not run because the authenticated Figma MCP Starter plan had reached its tool-call limit. The linked file was not modified; no Figma variables or components were created.

## Color tokens

CSS custom properties are defined in `src/app/globals.css`. Colors below resolve through the pre-existing SafeAnes palette; domain colors retain their established meaning.

| Token | CSS property | Existing source / meaning |
|---|---|---|
| `background/default` | `--safe-background-default` | `--safe-bg`, application canvas `#02080C` |
| `background/surface` | `--safe-background-surface` | `--safe-surface`, panel surface `#07121A` |
| `background/elevated` | `--safe-background-elevated` | `--safe-surface-elevated`, `#0E1E2B` |
| `border/default` | `--safe-border-default` | Existing light border `rgba(45, 155, 215, 0.20)` |
| `border/strong` | `--safe-border-strong` | Existing standard clinical border `rgba(45, 155, 215, 0.38)` |
| `text/primary` | `--safe-text-primary` | Existing primary text `#F4F7F8` |
| `text/secondary` | `--safe-text-secondary` | Existing secondary text `#A6B2BA` |
| `text/muted` | `--safe-text-tertiary` | Existing dim text `#6C7A84` |
| `accent/cyan` | `--safe-accent-cyan` | Existing interaction accent `#00E5FF` |
| `accent/blue` | `--safe-accent-blue` | Existing blue/provenance-derived color `#2563EB` |
| `semantic/success` | `--safe-semantic-success` | Existing green `#2AD86A` |
| `semantic/info` | `--safe-semantic-info` | Existing cyan `#00E5FF` |
| `semantic/warning` | `--safe-semantic-warning` | Existing warning yellow `#FFD429` |
| `semantic/high` | `--safe-semantic-high` | Existing SafeAnes HIGH severity yellow `#FFD429` |
| `semantic/critical` | `--safe-semantic-critical` | Existing critical alert red `#FF334D` |
| `quality/good` | `--safe-quality-good` | Existing green |
| `quality/degraded` | `--safe-quality-degraded` | Existing warning yellow |
| `quality/unavailable` | `--safe-quality-unavailable` | Existing dim text color; status copy must remain explicit |
| `provenance/direct` | `--safe-provenance-direct` | Existing UC02 direct-evidence color |
| `provenance/derived` | `--safe-provenance-derived` | Existing UC02 derived-evidence color |
| `provenance/inferred` | `--safe-provenance-inferred` | Existing UC02 inferred-evidence color |
| `provenance/confirmed` | `--safe-provenance-confirmed` | Existing clinician-confirmed color |
| `provenance/rejected` | `--safe-provenance-rejected` | Existing rejected-evidence color |

The semantic names are aliases, not an instruction to recolor UC01–UC05. Tailwind retains existing `safe-*`, `clinical-*`, and `provenance-*` color utilities. New semantic utility families include `bg-background-*`, `text-primary` / `text-secondary` / `text-muted`, `border-default` / `border-strong`, `text-semantic-*`, `text-quality-*`, and `text-accent-*`.

## Typography

The font stack remains Inter / IBM Plex Sans with IBM Plex Mono for clinical numerics, timestamps, and identifiers. No external font dependency was added. Vietnamese text uses the same Unicode-capable stack; the semantic scale does not globally shrink typography for Vietnamese.

| Role | Token size / line height | Usage guidance |
|---|---:|---|
| App title | 16 / 20 px | Application identity and top-level context |
| Panel heading | 13 / 16 px | Existing uppercase panel title treatment |
| Section heading | 12 / 16 px | Nested section labels |
| Body | 13 / 18 px | Dense clinical content |
| Secondary label | 11 / 14 px | Supporting labels; preserve wrapping where needed |
| Table header | 10 / 12 px | Compact table labels; do not use for critical values |
| Table cell | 12 / 16 px | Default dense table content |
| Clinical numeric large | 34 / 36 px | Primary workstation numeric readout |
| Clinical numeric compact | 22 / 26 px | Secondary numeric readout |
| Timestamp | 10.5 / 14 px | Monospaced, tabular digits, no wrapping |
| Monospace identifier | 10 / 14 px | Case, event, model, and evidence identifiers |

The existing Tailwind `text-clinical-large` size remains 22px for compatibility; the explicit new `text-clinical-numeric-large` role is 34px. Existing `.text-clinical-xlarge` remains mapped to 34px. Global numeric rules continue to enable tabular numerals.

## Density, dimensions, and responsive tokens

| Token | Value | Status |
|---|---:|---|
| Global header height | 54 px | Existing; header reflows at the current 1640 px breakpoint |
| Navigation rail width | 84 px | Existing workstation rail |
| Panel gap | 8 px | Existing |
| Panel padding | 12 px | Existing default; compact panels may be tighter |
| Panel header target | 30 px | Existing token, content may wrap when required |
| Table row target | 32 px | Existing readable dense row target |
| Compact control height | 28 px | Existing |
| Button height | 28 px | Existing default workstation button size |
| Minimum readable control width | 80 px | New sizing contract for future shared controls; does not override icon buttons |
| Drawer width | 360 px minimum, 540 px preferred, 92vw maximum | New responsive sizing contract; current drawer defaults to 540px and maxes at 92vw |
| Workstation wide breakpoint | 1640 px | Matches existing shell reflow breakpoint |
| Workstation compact breakpoint | 1440 px | Token for future layout decisions |
| Workstation minimum target | 1280 px | Existing desktop minimum; no mobile layout introduced |

Spacing scale: `space-1` 4px, `space-2` 8px, `space-3` 12px, `space-4` 16px, `space-5` 20px, `space-6` 24px. These are density-aware workstation increments, not consumer-app whitespace defaults.

Radius scale: none 0px, compact 2px, tight 3px, default 4px, emphasis 6px. Existing Tailwind `rounded-sm`, `rounded-md`, and `rounded-lg` values remain compatible.

Tailwind screen helpers are available as `safe-wide` (1640px), `safe-compact` (1440px), and `safe-min` (1280px). CSS media queries continue to use explicit widths because custom properties are not supported in media-query conditions.

New token APIs are foundations for future component adoption. Numeric typography should be paired with `font-mono tabular-nums`; the existing `.text-clinical-large` and `.text-clinical-xlarge` styles already apply that treatment.

## Shared component inventory and Figma component plan

This section records verified React primitives and identifies the named Figma component set to create once Figma editing is available. It does not claim that Figma components exist.

| Requested component | Current React equivalent | Current status / design-system action |
|---|---|---|
| ClinicalPanel | `src/components/common/ClinicalPanel.tsx` | Existing reusable panel with title, subtitle, action, status, footer, min-height, and scroll behavior; reuse |
| ClinicalPanelHeader | Inline header in `ClinicalPanel` | Not a separate component; candidate for later extraction if shared behavior remains stable |
| ClinicalMetric / ClinicalMetricGroup | Domain-local metric displays | No generic shared primitive verified; retain domain-specific layouts for now |
| SeverityBadge | `src/components/common/SeverityBadge.tsx` | Existing semantic severity primitive; retain color mapping |
| QualityBadge | Module-local quality/status labels | No generic shared primitive verified; status vocabulary must preserve quality meaning |
| ProvenanceBadge | `src/components/common/ProvenanceBadge.tsx` | Existing UC02 provenance primitive; retain |
| ModelOutputBadge | UC04/UC05 local output/status labels | No generic shared primitive verified; model task and prediction status must remain explicit |
| ClinicalTable | `src/components/common/ClinicalTable.tsx` | Existing scrollable table shell with optional sticky header; retain and extend only when table migration begins |
| ClinicalTabs | Module-local tab controls | No shared generic primitive verified; future shared interaction must support EN/VI labels |
| ClinicalButton | `Button` in `src/components/ui/button.tsx` | Existing SafeAnes button primitive; retain current variants and action semantics |
| ClinicalToolbar | Module-local action/filter rows | No generic shared primitive verified |
| ClinicalTooltip | `Tooltip` in `src/components/ui/tooltip.tsx` | Existing accessible custom tooltip; retain as the current shared implementation |
| ClinicalDrawer | `src/components/ui/drawer.tsx` | Existing focus-managed drawer with bounded viewport width and scrolling; retain |
| ClinicalDialog | `ClinicalModal` in `src/components/ui/popover.tsx` | Existing focus-managed responsive modal; retain |
| ClinicalEmptyState / ClinicalUnavailableState | Local module states | No generic shared primitive verified; source availability must stay distinct from an empty result |
| ConnectionIndicator | Global header / device status views | Current indicators are context-specific; do not flatten device and replay statuses |
| TimeRangeControl | Domain-local timeline controls | Keep signal/event synchronization domain-aware |
| EvidenceReferenceChip | UC02 evidence references | No generic shared primitive verified; preserve evidence ID and provenance |

Recommended Figma component families are: panel/header, metric/value, severity/quality/provenance/model status, table, tabs, button, toolbar, tooltip, drawer/dialog, empty/unavailable state, connection status, time-range control, and evidence reference. Generic components should use Auto Layout and property variants only where the interaction/state is meaningful. UC01 device quality, UC02 claims/evidence, UC03 medication timeline, UC04 hemodynamic relationship/prediction, and UC05 waveforms remain domain-specific.

Keep component states limited to useful behavior: normal, hover, selected, focused, disabled, and loading for interactive controls; warning/error for relevant status surfaces. Avoid duplicating the same variants on static components or representing clinical severity with interaction states.

## Figma parity status

- Existing target file: [SafeAnes — Unified Clinical Workstation](https://www.figma.com/design/bAkYMkjbAddPKG70KRzi5K).
- Figma variables inspected in this pass: **No**. `get_variable_defs` was unavailable after the Starter-plan MCP call limit was reached.
- Figma variables/components created or changed: **No**. The MCP limit blocked authenticated write operations; the linked file remains unchanged.
- Approved library source: **None confirmed**. The earlier research document records generic candidates as unapproved until component context, screenshots, and reuse terms are verified.
- Code token implementation: available in `src/app/globals.css` and `tailwind.config.ts`; existing `safe-*` utility names remain supported.

## Adoption and migration boundary

This pass changes shared token definitions and adds semantic Tailwind aliases only. It does not replace module-specific chart, table, evidence, medication, or alert content. The next design-system phase can map these code tokens to verified Figma variables and create the component set, then migrate one shared primitive at a time with rendered comparison and functional checks.
