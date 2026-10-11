# SafeAnes approved UI improvements

## Goal

Apply the approved workstation design specifications to the existing Next.js frontend while preserving route contracts, clinical domain behavior, simulation/replay state, VitalDB data, model outputs, waveforms, and EN/VI localization.

## Evidence boundary

The approved design specifications and source audit are available under `docs/design/`. The authenticated Figma MCP currently rejects requests because the Starter-plan tool-call limit has been reached. No frame IDs, screenshots, or node context will be inferred. Code changes will use the approved written specifications and verified SafeAnes components; Figma comparison remains blocked until the account quota permits read access.

## Execution stages

1. Shell: make the persistent shell shrink-safe and preserve workstation minimum width without document overflow.
2. Navigation and patient context: improve global hierarchy and bilingual sizing using existing header/rail components.
3. Shared primitives: normalize panel, table, badge, drawer, and control behavior by refining existing components only.
4. UC01: correct the situation/data-integrity workspace geometry and scrolling.
5. UC02: protect clinical timeline, record, and evidence inspector widths and review actions.
6. UC03: separate proposed and administered medication presentation and preserve alert/evidence/action readability.
7. UC04: correct measured/model output width and trend/relationship panel allocation without changing semantics.
8. UC05: preserve large waveform viewports while stabilizing numerics, alarms, and trend/table regions.

## Per-stage verification

- Run `npx tsc --noEmit`, `npm run build`, and the relevant Node tests after each stage.
- Render affected routes at workstation viewport sizes and inspect EN/VI, overflow, alignment, chart dimensions, and interactions.
- Preserve all tests and restore no data stores or domain state as part of styling work.
- If a regression appears, fix it before moving to the next stage.

## Completion evidence

Record changed/reused/new components, exact Figma availability, route/locale/viewport visual checks, tests, build status, and any remaining limitations in the final response.
