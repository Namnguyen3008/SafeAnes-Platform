# SafeAnes UI Refinement Audit

## Scope and inspected stack

The existing product is a Next.js 15.5.27 application using React 19, TypeScript 5.7, Tailwind CSS 3.4, and SafeAnes-owned shell and clinical components. The clinical header, navigation rail, workspace panels, replay controller, and waveform renderers were retained. No dashboard template or second design system was introduced. The current package does not include shadcn/ui or Radix dependencies.

The official Figma connector answered an authenticated-account check. The repository cache contained no approved Figma file URL or node ID, and the active Figma design-context and library tools require those identifiers. No Figma component, library, screenshot, or Code Connect mapping was inferred.

## Prioritized findings and changes

| Priority | Finding | Change |
| --- | --- | --- |
| P0 | The single-row header squeezed case context, OR/anesthesia metadata, replay status, and the quality strip. Vietnamese text wrapped or overflowed; the longer VitalDB controller label also exceeded its slot at 1280px. | Kept the compact single row on wider screens and introduced a two-row grid below 1640px with content-based minimum widths for the brand/controller, case fields, and quality strip. VitalDB identity now uses the `CASE` / `CA` label and omits a redundant “not recorded” suffix; unavailable OR, procedure, and anesthesia metadata remains explicit. |
| P1 | When a recorded waveform unit was absent, `NOT_RECORDED` wrapped inside the narrow waveform axis and split its final character onto another line. | The empty axis now shows an em dash. Its `title` and accessible label preserve `NOT_RECORDED`, while the waveform panel continues to show `SIGNAL UNAVAILABLE`. Recorded units and chart geometry are unchanged. |

## Reuse decisions

- Reused `GlobalClinicalHeader`, the existing SafeAnes shell, its shared localization, and the existing `WaveformAxis` component.
- No new generic UI primitive was needed. Existing SafeAnes components remain the source of the application’s interaction and visual patterns.
- No 21st MCP or shadcn/Radix component was adopted: no target primitive needed replacement, and adding a second component system would not address the observed layout defects.
- Clinical colors, measurements, waveform data, route contracts, simulation/replay state, and model output were not changed.

## Verification performed

- Rendered the actual application source locally and inspected the header in English and Vietnamese at 1920×1080, 1680×1050, 1600×900, 1440×900, 1366×768, and 1280×720. DOM measurements reported no header overflow or overflowing header fields at any tested size in either language.
- Visually inspected the VitalDB UC05 workspace at narrow and standard workstation widths, including unavailable waveform states and the corrected axis label.
- Used the application navigation to visit Overview and UC01–UC05 in VitalDB mode. Case 1 and replay time `00:00:00` remained selected across the route transitions. No browser console warnings or errors were reported during this route pass.
- `npm run build` completed successfully after the final component, localization, and CSS changes.
- Screenshots were viewed during the browser checks but were not added to the repository.

## Figma status and remaining work

Figma account authentication is reachable, but file-level design access is **blocked** until an approved, node-specific Figma design URL is supplied. Without a real file key and node ID, the available tools cannot enumerate that file’s libraries, retrieve design context or screenshots, or validate Code Connect mappings. No Figma-based change is claimed.

After the approved file/node is identified, the next design pass can inspect only the relevant existing shell or component nodes, map those nodes to current SafeAnes components, and compare a targeted rendered screen. The current implementation is limited to the verified header and unavailable-unit issues above; broader component/library refinements remain proposed rather than implemented.
