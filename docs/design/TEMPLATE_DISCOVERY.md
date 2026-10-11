# SafeAnes Template Discovery

**Status:** research only; no Figma design or application code was changed.  
**Product:** SafeAnes unified clinical workstation.  
**Figma target previously created:** [SafeAnes — Unified Clinical Workstation](https://www.figma.com/design/bAkYMkjbAddPKG70KRzi5K).  
**Research date:** 2026-10-10.

## Executive result

Use the current approved SafeAnes shell and its five specialized clinical workspaces as the base template. The authenticated Figma account’s last successful library query found general-purpose Material 3 and Simple Design System libraries plus platform-specific Apple libraries; it did not surface a SafeAnes library or a complete dense clinical-workstation template. The previously returned generic library assets are component-level candidates only. None is approved for reuse in SafeAnes production because the account’s Starter-plan MCP call limit prevented a fresh inspection of component context, rendered screenshots, and license details in this research turn.

This is **not** evidence that no usable external template exists anywhere in Figma Community. Search is limited to resources available through the authenticated account and connected libraries, and the requested broad search could not be completed.

## Access and evidence boundary

- Prior successful `figma_whoami` verified an authenticated Figma account with one Starter plan.
- Prior successful `get_libraries` for file key `bAkYMkjbAddPKG70KRzi5K` returned eight libraries already added to that file and an empty `libraries_available_to_add` list. They were Material 3 Design Kit, Simple Design System, iOS and iPadOS 26, watchOS 26, visionOS 26, macOS 26, iOS and iPadOS 27, and macOS 27.
- The previous `get_metadata` call reported one empty `Page 1` (`0:1`, no children). No SafeAnes design frames or template references were present in that file at the time of inspection.
- Prior `search_design_system` results in this conversation covered Button, Tabs, Data table, Dialog, Badge, `surface` and `spacing` variables, and `body` text styles. The exact asset keys returned are catalog identifiers, **not node IDs** or file URLs.
- A new `get_libraries` call on 2026-10-10 was rejected with `You've reached the Figma MCP tool call limit on the Starter plan`. No further Figma MCP queries were attempted after that response.
- `get_design_context` and `get_screenshot` were not run for the candidate library assets. No visual or accessibility claims about those assets are inferred from their names alone.
- No library license text or reuse terms were retrieved. Figma library visibility is not treated as proof of production redistribution rights.
- Frontend source inspection confirms Next.js 15.1.7 / React 19, SafeAnes-owned shared components, custom SafeAnes tokens, Inter/IBM Plex Sans text and IBM Plex Mono numeric/data text. The frontend dependencies do not include shadcn/ui or Radix packages, and source search found no Code Connect mapping files.

## Search coverage

| Requested search intent | Evidence available | Status |
|---|---|---|
| Dense desktop application shell | No search result from the prior query batch | NOT SEARCHED in this turn; blocked by MCP call limit |
| Enterprise sidebar | No search result from the prior query batch | NOT SEARCHED |
| Compact application header | No search result from the prior query batch | NOT SEARCHED |
| Resizable workspace panels | No search result from the prior query batch | NOT SEARCHED |
| Dense data table | Prior `Data table` component query returned a Simple Design System `Table` asset; no screenshot/context | PARTIAL |
| Clinical metric display | No matching query result | NOT SEARCHED |
| Alarm/status components | Prior `Badge` query returned a Material 3 `Badges` asset; this is not verified as an alarm/status pattern | PARTIAL |
| Compact tab navigation | Prior `Tabs` query returned Material 3 and Simple Design System tab assets; no screenshot/context | PARTIAL |
| Details drawer | No matching query result | NOT SEARCHED |
| Evidence inspector layout | No matching query result | NOT SEARCHED |
| Form review panel | No matching query result | NOT SEARCHED |
| Filter toolbar | No matching query result | NOT SEARCHED |
| Timeline controls | No matching query result | NOT SEARCHED |
| Command palette | No matching query result | NOT SEARCHED |
| Multi-pane review workspace | No matching query result | NOT SEARCHED |

## Accessible library candidates

Figma search returned component keys but no Figma file URLs or node IDs. They are recorded below as search identifiers only. Do not turn a component key into a guessed URL.

| Component or layout | Source | Figma URL / node ID | Returned library asset identifier | Existing SafeAnes equivalent | Reuse decision | Clinical constraints | Implementation cost | License status |
|---|---|---|---|---|---|---|---|---|
| Generic button | Simple Design System | Not returned | Component key `cc8b558dc7d9684011b6b99ce8e6509399bc836b` | `src/components/ui/button.tsx` plus module-local clinical actions | A. EXISTING_SAFEANES. Simple DS remains a reference candidate, not selected. | Do not replace severity/clinical action colors or shrink critical action labels. | Low to retain existing implementation; adapting a second system is not justified. | Not verified for production reuse. |
| Generic button | Material 3 Design Kit | Not returned | Component set key `ab924dce8b851fd820bd0d56da24a9c489311ae6` | Same SafeAnes button primitive | A. EXISTING_SAFEANES. M3 not selected. | SafeAnes uses compact, dense controls and a custom dark semantic palette. | Medium/high adaptation; no Code Connect mapping. | Not verified. |
| Tabs | Simple Design System | Not returned | Component key `b839f8a495ef7b0ef0a47ad1aefd6e05438825b5` | Existing module tab controls, including UC05 trend/alarm views | A. EXISTING_SAFEANES. Simple DS is reference-only. | Keep module navigation and data selection semantics distinct; EN/VI labels must fit. | Low to retain; medium to adapt. | Not verified. |
| Tabs | Material 3 Design Kit | Not returned | Component set key `c4816e9ba31977046bf2fdeb5c45bfb7ea217ae5` | Existing module tab controls | A. EXISTING_SAFEANES. M3 not selected. | Do not import mobile/consumer spacing or alter chart navigation. | Medium adaptation; no Code Connect mapping. | Not verified. |
| Table | Simple Design System | Not returned | Component set key `9a2c2128f440a2fbaa7244f08553fbdcf83f458f` | `src/components/common/ClinicalTable.tsx` plus UC-local tables | A. EXISTING_SAFEANES. Figma table is a reference candidate only. | Preserve UC-specific columns, numeric alignment, unit attachment, status priority, and controlled horizontal scroll. | Low to refine SafeAnes table shell; high to build a second table system. | Not verified. |
| Dialog / dialog body | Simple Design System | Not returned | Dialog component key `050bf5b28eb08c43b117646b3e4b00c9db55c540`; Dialog Body component set key `629a55849475c74b3aeea85d7de846e271cf504f` | `ClinicalModal` in `src/components/ui/popover.tsx`; shared focus behavior | A. EXISTING_SAFEANES. Simple DS is reference-only. | Dialogs need focus containment, responsive bounds, and scrollable long bilingual content. | Low to use the existing primitive; medium/high to adapt a second visual system. | Not verified. |
| Badge | Material 3 Design Kit | Not returned | Component set key `53751157f5709329944123f4b22b0f91a3b93278` | SafeAnes severity, provenance, quality, and model-status badges | A. EXISTING_SAFEANES. M3 badge is not selected. | Clinical severity and provenance are domain semantics; do not map them to generic notification counts. | Low to keep current domain badges; high risk to substitute semantics. | Not verified. |
| Dense desktop clinical shell | None found in prior returned results | Not available | No file/node/asset returned | `SafeAnesAppShell`, `GlobalClinicalHeader`, `ClinicalNavigationRail`, `ModuleViewport` | A. EXISTING_SAFEANES | Preserve the dense workstation hierarchy, source context, replay clock, and all five module routes. | Lowest cost: already implemented. | Internal SafeAnes reuse is authorized by this task; formal external redistribution terms were not assessed. |

## Candidate scoring

Scale: **1–5, higher is more favorable**. `N/V` means not verified from available evidence. For React implementation and maintenance cost, a higher score means lower cost. License/reuse is reported as a status rather than scored where terms were not retrieved.

| Candidate | Clinical density | Readability | Keyboard access | Resizable behavior | Desktop suitability | Vietnamese accommodation | Component quality | Token compatibility | React implementation cost | Maintenance cost | License / reuse rights |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Current SafeAnes shell/workspaces | 5 | 3 | 3 | 3 | 5 | 3 | 4 | 5 | 5 | 4 | Internal product reuse authorized; formal external license not reviewed |
| Simple Design System library | N/V | N/V | N/V | N/V | N/V | N/V | N/V | N/V | 2* | 2* | Not verified; do not ship/adapt until terms are confirmed |
| Material 3 Design Kit | N/V | N/V | N/V | N/V | N/V | N/V | N/V | N/V | 2* | 2* | Not verified; do not ship/adapt until terms are confirmed |
| iOS/iPadOS/watchOS/visionOS/macOS kits | N/V | N/V | N/V | N/V | N/V | N/V | N/V | N/V | 1* | 1* | Not verified; not evaluated for this desktop web product |

The SafeAnes scores reflect the prior rendered UI audit: strong desktop density and shell fit; localized clipped UC04 metadata, Vietnamese secondary-text truncation, a modal focus-containment failure, and duplicated overlay mechanics. “Resizable behavior” scores responsive behavior across workstation widths; no meaningful user-resizable split panel was confirmed. Asterisks on Figma library costs are rough engineering estimates from the absence of Code Connect mappings and the need to adapt a second design system, not measured estimates. No score implies accessibility or clinical validation.

## Functional reference selection

| SafeAnes area | Selected source | Current equivalent to preserve | Figma library alternative | Clinical guardrails |
|---|---|---|---|---|
| Global shell | A. EXISTING_SAFEANES | `SafeAnesAppShell`, `GlobalClinicalHeader`, `ClinicalNavigationRail`, `ModuleViewport` | No matching workstation shell surfaced | One patient/case/time/source context; retain dense navigation and retrospective/synthetic mode distinction. |
| UC01 monitoring + data quality | A. EXISTING_SAFEANES | UC01 situation workspace, data-integrity views, quality/source badges | No monitoring workspace result verified | Missing/invalid/artifact signals must not be drawn or labeled as normal observations. |
| UC02 document review + evidence inspector | A. EXISTING_SAFEANES | Claims, clinical timeline, `EvidenceDrawer`, review rail, shared modal/drawer primitives | Simple DS Dialog is generic and not inspected visually | Keep atomic claims, evidence IDs, provenance, review status, and no-auto-sign behavior. |
| UC03 medication review + rule evidence | A. EXISTING_SAFEANES | Medication timeline, alert/rule evidence, review actions | Generic table/dialog assets are not replacements | Preserve proposed-versus-administered state, synthetic-rule boundary, and audit history. |
| UC04 analytical workspace + trends | A. EXISTING_SAFEANES | Hemodynamic trend, event, relationship, and prediction components | No clinical metric/trend layout result verified | Keep measured values separate from model output; do not import generic dashboard charts. |
| UC05 monitor waveform + alarm review | A. EXISTING_SAFEANES | Capnogram, pleth, graphical trend, alarm review, tabular trend | No waveform/alarm workspace result verified | Preserve actual signal morphology, colors, timebase, quality gaps, and prediction/fact distinction. |
| Generic tabs/buttons/tables/dialog mechanics | A. EXISTING_SAFEANES | Existing SafeAnes UI primitives | B. FIGMA_LIBRARY only as a future behavior/reference candidate if visual context and reuse terms are verified | A Figma component is not approved merely because it is accessible in the file. |

No element currently warrants C. SHADCN_RADIX or D. 21ST_MCP. The React package has neither shadcn/Radix dependencies nor a demonstrated gap that requires introducing them. E. CUSTOM_CLINICAL is unnecessary because the specialized clinical content already exists and should remain domain-specific.

## Reuse decision

**Base template: the existing SafeAnes application.** Continue with its shell, panel structure, shared primitives, and UC-specific workspaces. Use the Simple Design System and Material 3 results only as unapproved research references for generic interaction behavior. Do not import their visual styles or components until a fresh `get_design_context`/`get_screenshot` comparison and license/reuse review are possible.

## Remaining discovery blockers

1. The Figma MCP Starter-plan call limit blocked the requested fresh library search batch. The categories marked `NOT SEARCHED` above are unknown, not negative search results.
2. Figma component context and screenshots were not available for the matched library assets; keyboard behavior, responsive geometry, and bilingual text behavior remain unverified.
3. No Figma file URL/node ID was returned for the library assets; only opaque component keys were returned.
4. Reuse/license terms for community libraries were not fetched. No external component is approved for production reuse.

No application code was changed and no new design system was introduced.
