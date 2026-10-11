# SafeAnes Layout Hardening QA

## Scope

Visual QA covered the Overview, Situation (UC01), Record (UC02), Medication (UC03), Hemodynamics (UC04), and Respiratory (UC05) routes in English and Vietnamese at 1920×1080, 1600×900, 1440×900, 1366×768, and 1280×720. Synthetic demo data was used. The Medication Add dialog and the active synthetic medication-warning action menu were also inspected at 1280×720.

## Issues fixed

| Priority | Route / region | Observed defect | Fix |
|---|---|---|---|
| P1 | UC04 workspace | A fixed 870 px workspace floor and rigid rows pushed content below the available workstation height. | Replaced the fixed floor with a grid-based workspace, bounded rail widths, flexible chart rows, and readable minimum heights. Active hypotension alerts now precede secondary metrics in the right rail. |
| P1 | UC05 workspace | A fixed 910 px floor compressed or pushed waveforms, trends, and review tables on shorter displays. | Rebalanced the workspace and summary rail with controlled minimums; kept the capnogram and pleth plot areas intact and placed active alerts first. |
| P1 | UC05 graphical trend | The cursor-time badge covered the first x-axis tick. The trend body also exceeded its 1600×900 panel by 6 px in one measured layout. | Kept the synchronized timestamp in the panel header, removed the duplicate axis badge, scaled the three signal lanes to viewport height, and let the flex body shrink with `min-h-0`. The trend panel now has zero internal overflow at all tested sizes. |
| P1 | UC02 timeline | 15-minute tick labels initially collided before the resize observer adjusted their spacing. | Start with a conservative 45-minute tick interval, then adapt to available plot width. Tick labels do not overlap at any tested size. |
| P1 | UC02 workspace | Its 1180 px minimum exceeded the available module width at 1280 px, causing an 8 px horizontal overflow. | Reduced the minimum to 1160 px while retaining the workstation layout. |
| P2 | UC03 active-medication header | The Vietnamese Add Medication action wrapped in the compact header. | Kept the full action label on one line and let the panel title wrap instead. |

## Final viewport results

The complete 60-combination route/language/viewport scan found:

- 0 px document horizontal overflow on all 60 combinations.
- 0 px module horizontal overflow on all 60 combinations.
- No clipped buttons or `h1`–`h3` headings in the DOM geometry checks.
- Expected module-level vertical scrolling only at compact heights. At 1366×768 the longest module overflow was 50 px; at 1280×720 it was 98 px. The Overview fit without module scrolling at both sizes.
- UC02 timeline tick-label overlap: 0 across both languages and all five tested sizes.
- UC05 trend panel internal overflow: 0 across both languages and all five tested sizes.

The compact-height scroll is deliberate: it keeps the dense workstation panels readable and reachable without reducing clinical text or chart dimensions to fit a single screen. The module viewport is the scroll region.

## Screenshot review

Rendered browser screenshots were captured and visually inspected during QA for:

- VI at 1280×720: Overview, UC01, UC02, UC03, UC04, and UC05.
- VI at 1440×900: UC02, UC03, UC04, and UC05.
- VI at 1280×720: Medication Add dialog, active synthetic warning, and its action menu.
- VI at 1600×900: UC05 trend after the overflow fix.
- EN at 1280×720: UC02 and UC05 compact layouts.

The browser capture tool returned screenshots for direct inspection but did not provide a repository file path for exporting those images. No unresolved defect remains within the requested matrix. The below-minimum 1159×668 shell-width limitation is documented below and was captured in the browser.

## Remaining behavior

At 1366×768 and 1280×720, Situation, Record, Medication, Hemodynamics, and Respiratory require a small amount of vertical module scrolling. Critical values, units, status, and actions remain visible within their panels; lower content is reachable through the module viewport. No uncontrolled horizontal scrolling or chart-label collision remains in the tested states.

After restoring the user's in-app browser viewport, its actual size was 1159×668, below the requested 1280×720 minimum. At 1159 px, the workstation shell keeps its minimum clinical content width and the rightmost content is reached by horizontal scrolling; that below-minimum viewport is not included in the pass matrix. The 1159×668 screenshot was captured and inspected in the browser, but no export path was available from the capture tool.

## Verification

The layout regression tests are in `tests/workstation-layout.test.cjs`.

- `node --test tests/workstation-layout.test.cjs`: 12 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Next.js compiled, checked types, generated all 5 static pages, and completed production traces for the Overview and UC01–UC05 routes.
