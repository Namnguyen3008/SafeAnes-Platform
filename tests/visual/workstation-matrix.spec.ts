import { expect, test, type Page, type TestInfo } from "@playwright/test";

const workspaces = [
  ["overview", "/safeanes/case/demo"],
  ["uc01-situation", "/safeanes/case/demo/situation"],
  ["uc02-record", "/safeanes/case/demo/record"],
  ["uc03-medications", "/safeanes/case/demo/medications"],
  ["uc04-hemodynamics", "/safeanes/case/demo/hemodynamics"],
  ["uc05-respiratory", "/safeanes/case/demo/respiratory"],
] as const;

const locales = ["en", "vi"] as const;

type ScrollEvidence = {
  selector: string;
  overflowY: string;
  before: number;
  after: number;
  maxScroll: number;
  moved: boolean;
  atBottom: boolean;
};

type LowerContentEvidence = {
  moduleViewport: ScrollEvidence | null;
  nested: ScrollEvidence[];
  visiblePanels: PanelVisibilityEvidence[];
};

type PanelVisibilityEvidence = {
  selector: string;
  width: number;
  height: number;
  intersectionWidth: number;
  intersectionHeight: number;
  visibleRatio: number;
  anchorText: string;
  anchorVisible: boolean;
  intersectsViewport: boolean;
};

async function hideNextDevTools(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

async function prepareSyntheticCase(page: Page) {
  await page.goto("/safeanes/case/demo");
  await page.locator("header button[aria-haspopup='dialog']").click();
  await page.locator("#safeanes-replay-source").selectOption("SYNTHETIC_DEMO");
  await page.getByRole("button", { name: /reset case|đặt lại ca/i }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("header")).toContainText("07:15:00");
}

async function navigateToWorkspace(page: Page, route: string, locale: (typeof locales)[number]) {
  const currentPath = new URL(page.url()).pathname.replace(/\/$/, "");
  const expectedPath = route.replace(/\/$/, "");
  if (currentPath !== expectedPath) await page.goto(route);
  await expect.poll(() => new URL(page.url()).pathname.replace(/\/$/, "")).toBe(expectedPath);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

/**
 * React controls the replay range input. Setting the native value first and
 * dispatching both events keeps this helper reliable across Chromium versions
 * without relying on a non-semantic test-only selector.
 */
async function setSyntheticReplayTime(page: Page, elapsedMs: number) {
  await page.locator("header button[aria-haspopup='dialog']").click();
  const slider = page.locator("#safeanes-simulation-control input[type='range']");
  await expect(slider).toBeVisible();
  await slider.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, elapsedMs);
  await page.keyboard.press("Escape");
  await expect(page.locator("header")).toContainText("10:42:01");
}

async function resetSyntheticReplay(page: Page) {
  await page.locator("header button[aria-haspopup='dialog']").click();
  await page.getByRole("button", { name: /reset case|đặt lại ca/i }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("header")).toContainText("07:15:00");
}

async function assertNoHorizontalOverflow(page: Page, viewportWidth: number) {
  const dimensions = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const scrollWidth = Math.max(dimensions.bodyScrollWidth, dimensions.documentScrollWidth);
  expect(scrollWidth, `document overflow at ${viewportWidth}px: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(viewportWidth + 1);
}

/**
 * Check only critical content roots whose overflow is not a deliberate
 * waveform/table viewport.  The application intentionally clips canvas plots,
 * shell regions, and scrollable tables, so a document-wide scrollWidth check
 * would report those valid behaviors as failures.
 */
async function assertNoUnexpectedInternalClipping(page: Page) {
  const findings = await page.evaluate(() => {
    const selectors = [
      '[data-simulation-demo-target="uc02-evidence"]',
      '[data-simulation-demo-target="uc03-medication"]',
      '.uc04-risk-card',
      '.uc04-current-alert',
      '.uc05-risk-card',
      '.uc05-current-alert',
    ];
    const clipped: Array<Record<string, string | number>> = [];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        const style = getComputedStyle(element);
        const hiddenX = style.overflowX === "hidden" || style.overflowX === "clip";
        const hiddenY = style.overflowY === "hidden" || style.overflowY === "clip";
        const clippedX = hiddenX && element.scrollWidth > element.clientWidth + 1;
        const clippedY = hiddenY && element.scrollHeight > element.clientHeight + 1;
        if (clippedX || clippedY) {
          clipped.push({
            selector,
            className: String(element.className),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
          });
        }
      }
    }

    return clipped;
  });

  expect(findings, "unexpected internal clipping in critical clinical content").toEqual([]);
}

/**
 * At the two short workstation heights, check the UC04/UC05 layout roots and
 * their hidden layout containers using geometry rather than scrollWidth alone.
 * The module viewport is intentionally a scroll surface, so it is the stop
 * boundary for this walk; only descendants clipped by an overflow-hidden
 * clinical container are reported.
 */
async function assertNoWorkspaceRootClipping(page: Page, workspace: string, viewportWidth: number, viewportHeight: number) {
  if ((workspace !== "uc04-hemodynamics" && workspace !== "uc05-respiratory") || viewportHeight > 768 || viewportWidth > 1366) {
    return;
  }

  const findings = await page.evaluate((workspaceName) => {
    const rootSelector = workspaceName === "uc04-hemodynamics" ? ".uc04-workspace-layout" : ".uc05-workspace-layout";
    const root = document.querySelector<HTMLElement>(rootSelector);
    if (!root) return [{ rootSelector, reason: "workspace root is missing" }];

    const isHidden = (value: string) => value === "hidden" || value === "clip";
    const isScrollSurface = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return [style.overflowX, style.overflowY].some((value) => value === "auto" || value === "scroll");
    };
    const clipRect = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.left + element.clientWidth,
        bottom: rect.top + element.clientHeight,
      };
    };
    const findings: Array<Record<string, string | number>> = [];
    const tolerance = 1.5;

    const inspectAgainstHiddenAncestors = (element: HTMLElement, label: string) => {
      const rect = element.getBoundingClientRect();
      let ancestor = element.parentElement;
      while (ancestor) {
        if (isScrollSurface(ancestor)) break;
        const style = getComputedStyle(ancestor);
        const hiddenX = isHidden(style.overflowX);
        const hiddenY = isHidden(style.overflowY);
        if (hiddenX || hiddenY) {
          const clip = clipRect(ancestor);
          const clippedX = hiddenX && (rect.left < clip.left - tolerance || rect.right > clip.right + tolerance);
          const clippedY = hiddenY && (rect.top < clip.top - tolerance || rect.bottom > clip.bottom + tolerance);
          if (clippedX || clippedY) {
            findings.push({
              rootSelector,
              label,
              ancestorClass: String(ancestor.className),
              elementClass: String(element.className),
              elementLeft: Math.round(rect.left),
              elementTop: Math.round(rect.top),
              elementRight: Math.round(rect.right),
              elementBottom: Math.round(rect.bottom),
              clipLeft: Math.round(clip.left),
              clipTop: Math.round(clip.top),
              clipRight: Math.round(clip.right),
              clipBottom: Math.round(clip.bottom),
            });
          }
        }
        ancestor = ancestor.parentElement;
      }
    };

    inspectAgainstHiddenAncestors(root, "workspace-root");

    const hiddenLayoutContainers = [
      root,
      ...Array.from(root.querySelectorAll<HTMLElement>("main, .uc04-main-workspace, .uc05-visualization-column")),
    ];
    for (const container of hiddenLayoutContainers) {
      const style = getComputedStyle(container);
      if (!isHidden(style.overflowX) && !isHidden(style.overflowY)) continue;
      for (const child of Array.from(container.children)) {
        const element = child as HTMLElement;
        const childStyle = getComputedStyle(element);
        if (childStyle.position === "absolute" || childStyle.position === "fixed") continue;
        inspectAgainstHiddenAncestors(element, `child-of:${container.className || container.tagName.toLowerCase()}`);
      }
    }

    return findings;
  }, workspace);

  expect(findings, `UC04/UC05 hidden-ancestor clipping at ${viewportWidth}x${viewportHeight}`).toEqual([]);
}

/**
 * Short workstation heights expose lower clinical rows inside nested panels,
 * while the shell itself intentionally stays fixed.  Move only deliberate
 * scroll regions to their lower content before the screenshot; do not scroll
 * hidden shell/workspace containers or waveform canvases.
 */
async function exposeLowerClinicalContent(page: Page, workspace: string, viewportHeight: number) {
  if (viewportHeight > 768) return { moduleViewport: null, nested: [], visiblePanels: [] } satisfies LowerContentEvidence;

  const moduleViewport = page.locator(".clinical-module-viewport").first();
  await expect(moduleViewport, "module viewport is required for short-height evidence").toBeVisible();
  const moduleViewportEvidence = await moduleViewport.evaluate((element) => {
    const node = element as HTMLElement;
    const style = getComputedStyle(node);
    const before = node.scrollTop;
    const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);
    if (maxScroll > 1) node.scrollTop = maxScroll;
    const after = node.scrollTop;
    return {
      selector: ".clinical-module-viewport",
      overflowY: style.overflowY,
      before,
      after,
      maxScroll,
      moved: after > before + 1,
      atBottom: after >= maxScroll - 1,
    } satisfies ScrollEvidence;
  });

  if (workspace === "uc04-hemodynamics" || workspace === "uc05-respiratory") {
    expect(
      ["auto", "scroll"].includes(moduleViewportEvidence.overflowY),
      "short UC04/UC05 module viewport must expose vertical scrolling",
    ).toBe(true);
    expect(
      moduleViewportEvidence.maxScroll,
      "short UC04/UC05 workspace must have lower content in the module viewport",
    ).toBeGreaterThan(1);
    expect(moduleViewportEvidence.atBottom, "module viewport did not reach lower UC04/UC05 content").toBe(true);
    expect(
      moduleViewportEvidence.moved || moduleViewportEvidence.before >= moduleViewportEvidence.maxScroll - 1,
      "module viewport scroll position did not change",
    ).toBe(true);
  }

  const selectorsByWorkspace: Record<string, string[]> = {
    overview: [".clinical-table-scroll"],
    "uc01-situation": [".clinical-table-scroll"],
    "uc02-record": [
      ".uc02-review-record .clinical-table-scroll",
      ".uc02-review-record [class*='overflow-y-auto']",
      ".uc02-review-evidence [class*='overflow-y-auto']",
      ".uc02-review-timeline [class*='overflow-y-auto']",
    ],
    "uc03-medications": [
      '[data-simulation-demo-target="uc03-medication"] [class*="overflow-y-auto"]',
      ".clinical-table-scroll",
    ],
    "uc04-hemodynamics": [
      ".uc04-events-panel .clinical-table-scroll",
      ".clinical-table-scroll",
    ],
    "uc05-respiratory": [
      ".uc05-trend-workspace .clinical-table-scroll",
      ".uc05-trend-workspace [class*='overflow-auto']",
      ".clinical-table-scroll",
    ],
  };

  const observations = await page.evaluate((selectors) => {
    const result: ScrollEvidence[] = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        const style = getComputedStyle(element);
        const scrollable = style.overflowY === "auto" || style.overflowY === "scroll";
        const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
        if (!scrollable || maxScroll <= 1) continue;
        const before = element.scrollTop;
        element.scrollTop = maxScroll;
        const after = element.scrollTop;
        result.push({
          selector,
          overflowY: style.overflowY,
          before,
          after,
          maxScroll,
          moved: after > before + 1,
          atBottom: after >= maxScroll - 1,
        });
      }
    }
    return result;
  }, selectorsByWorkspace[workspace] ?? [".clinical-table-scroll"]);

  for (const observation of observations) {
    expect(observation.atBottom, `lower content did not reach the end of ${observation.selector}`).toBe(true);
    expect(
      observation.moved || observation.before >= observation.maxScroll - 1,
      `lower content scroll position did not change for ${observation.selector}`,
    ).toBe(true);
  }
  return {
    moduleViewport: moduleViewportEvidence,
    nested: observations,
    visiblePanels: [],
  } satisfies LowerContentEvidence;
}

/**
 * A max scrollTop value alone does not prove that the lower clinical panels
 * are visible.  Check their actual rectangles against the visible module
 * viewport after the outer scroll has been applied.
 */
async function assertLowerClinicalPanelsVisible(page: Page, workspace: string, viewportHeight: number) {
  if (viewportHeight > 768) return [] satisfies PanelVisibilityEvidence[];

  const selectors = workspace === "uc04-hemodynamics"
    ? [".uc04-events-panel"]
    : workspace === "uc05-respiratory"
      ? [
          ".uc05-bottom-review > div:nth-child(1) > section",
          ".uc05-bottom-review > div:nth-child(2) > section",
        ]
      : [];

  if (selectors.length === 0) return [] satisfies PanelVisibilityEvidence[];

  const evidence = await page.evaluate((panelSelectors) => {
    const viewport = document.querySelector<HTMLElement>(".clinical-module-viewport");
    const emptyEvidence = (selector: string) => ({
      selector,
      width: 0,
      height: 0,
      intersectionWidth: 0,
      intersectionHeight: 0,
      visibleRatio: 0,
      anchorText: "",
      anchorVisible: false,
      intersectsViewport: false,
    });
    if (!viewport) return panelSelectors.map(emptyEvidence);

    const viewportRect = viewport.getBoundingClientRect();
    const viewportStyle = getComputedStyle(viewport);
    const paddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
    const paddingTop = Number.parseFloat(viewportStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(viewportStyle.paddingBottom) || 0;
    const contentRect = {
      left: viewportRect.left + viewport.clientLeft + paddingLeft,
      top: viewportRect.top + viewport.clientTop + paddingTop,
      right: viewportRect.left + viewport.clientLeft + viewport.clientWidth - paddingRight,
      bottom: viewportRect.top + viewport.clientTop + viewport.clientHeight - paddingBottom,
    };

    const intersection = (rect: DOMRect, clip: typeof contentRect) => ({
      width: Math.max(0, Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left)),
      height: Math.max(0, Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top)),
    });

    return panelSelectors.map((selector) => {
      const panel = document.querySelector<HTMLElement>(selector);
      if (!panel) return emptyEvidence(selector);

      const rect = panel.getBoundingClientRect();
      const panelIntersection = intersection(rect, contentRect);
      const panelArea = Math.max(1, rect.width * rect.height);
      const visibleRatio = (panelIntersection.width * panelIntersection.height) / panelArea;
      const anchor = panel.querySelector<HTMLElement>("h2, thead, th");
      const anchorText = anchor?.textContent?.trim() ?? "";
      const anchorIntersection = anchor ? intersection(anchor.getBoundingClientRect(), contentRect) : { width: 0, height: 0 };
      const anchorVisible = Boolean(anchor && anchorText && anchorIntersection.width > 0 && anchorIntersection.height > 0);
      const meaningfulVisible = panelIntersection.width >= 100 && panelIntersection.height >= 60 && visibleRatio >= 0.25;
      return {
        selector,
        width: rect.width,
        height: rect.height,
        intersectionWidth: panelIntersection.width,
        intersectionHeight: panelIntersection.height,
        visibleRatio,
        anchorText,
        anchorVisible,
        intersectsViewport: meaningfulVisible && anchorVisible,
      };
    });
  }, selectors);

  for (const panel of evidence) {
    expect(panel.width, `${panel.selector} has no layout width`).toBeGreaterThan(0);
    expect(panel.height, `${panel.selector} has no layout height`).toBeGreaterThan(0);
    expect(panel.intersectionWidth, `${panel.selector} has less than 100px visible width`).toBeGreaterThanOrEqual(100);
    expect(panel.intersectionHeight, `${panel.selector} has less than 60px visible height`).toBeGreaterThanOrEqual(60);
    expect(panel.visibleRatio, `${panel.selector} has less than 25% visible area`).toBeGreaterThanOrEqual(0.25);
    expect(panel.anchorText, `${panel.selector} has no readable title/table anchor`).toMatch(/\S/);
    expect(panel.anchorVisible, `${panel.selector} title/table anchor is not visible`).toBe(true);
    expect(panel.intersectsViewport, `${panel.selector} is not meaningfully visible after lower-content scroll`).toBe(true);
  }
  return evidence;
}

async function assertTargetedWorkspaceChecks(page: Page, workspace: string, viewportWidth: number) {
  const main = page.getByRole("main").first();

  if (workspace === "uc02-record") {
    const inspector = page.locator('[data-simulation-demo-target="uc02-evidence"]');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText(
      /Select a claim from the record or table to inspect provenance\.|Chọn một nhận định từ hồ sơ hoặc bảng để kiểm tra nguồn gốc dữ liệu\./i,
    );
  }

  if (workspace === "uc03-medications") {
    await setSyntheticReplayTime(page, 12_421_000);
    await expect(main).toContainText(/Modify Dose|Chỉnh liều/i);
    await expect(main).toContainText(/Override|Ghi đè/i);
    await resetSyntheticReplay(page);
  }

  if (workspace === "uc04-hemodynamics") {
    await expect(main).toContainText(/\bHPI\b|HPI mô phỏng/i);
    await expect(main).toContainText(/\bMAP\b/i);
    await expect(main).not.toContainText("Recorded VitalDB Data");
  }

  if (workspace === "uc05-respiratory" && viewportWidth === 1280) {
    const waveformPlots = page.locator(
      ".uc05-capnogram-panel [data-waveform-signal], .uc05-pleth-panel [data-waveform-signal]",
    );
    await expect(waveformPlots).toHaveCount(2);
    for (let index = 0; index < await waveformPlots.count(); index += 1) {
      const box = await waveformPlots.nth(index).boundingBox();
      expect(box, `waveform ${index} is not laid out`).not.toBeNull();
      expect(box?.width ?? 0, `waveform ${index} is too narrow at 1280px`).toBeGreaterThanOrEqual(360);
    }
  }
}

async function captureWorkspace(
  page: Page,
  testInfo: TestInfo,
  fixtureId: string,
  workspace: string,
  locale: string,
  lowerContentEvidence: LowerContentEvidence,
  capturePhase: "top" | "bottom" | "regular",
) {
  await hideNextDevTools(page);
  const phaseSuffix = capturePhase === "top" ? "__top" : "";
  const screenshotName = `${fixtureId}__${workspace}__${locale}${phaseSuffix}.png`;

  // Baselines are intentionally opt-in.  Reviewers can render and inspect
  // the matrix before creating any approved baseline files.
  if (process.env.SAFEANES_MATRIX_COMPARE === "1") {
    await expect(page).toHaveScreenshot(screenshotName);
  }

  const path = testInfo.outputPath("matrix-screenshots", `${fixtureId}__${workspace}__${locale}.png`);
  const artifactPath = capturePhase === "top"
    ? testInfo.outputPath("matrix-screenshots", `${fixtureId}__${workspace}__${locale}__top.png`)
    : path;
  await page.screenshot({ path: artifactPath, animations: "disabled", fullPage: false });
  await testInfo.attach(`${fixtureId}-${workspace}-${locale}-${capturePhase}`, { path: artifactPath, contentType: "image/png" });
  if (lowerContentEvidence.moduleViewport || lowerContentEvidence.nested.length > 0 || lowerContentEvidence.visiblePanels.length > 0) {
    await testInfo.attach(`${fixtureId}-${workspace}-${locale}-${capturePhase}-lower-content`, {
      body: JSON.stringify({ capturePhase, ...lowerContentEvidence }, null, 2),
      contentType: "application/json",
    });
  }
}

test("workstation matrix captures every workspace and locale without horizontal overflow", async ({ page }, testInfo) => {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Playwright viewport is not configured");
  const fixtureId = testInfo.project.name.replace(/^matrix-/, "");

  await prepareSyntheticCase(page);

  for (const locale of locales) {
    if (locale === "vi") {
      await page.getByRole("button", { name: "VI", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "vi");
    }

    for (const [workspace, route] of workspaces) {
      await navigateToWorkspace(page, route, locale);
      await expect(page.locator("header")).toContainText("07:15:00");
      await assertNoHorizontalOverflow(page, viewport.width);
      await assertTargetedWorkspaceChecks(page, workspace, viewport.width);
      await assertNoUnexpectedInternalClipping(page);
      await assertNoWorkspaceRootClipping(page, workspace, viewport.width, viewport.height);
      const shortViewport = viewport.height <= 768;
      if (shortViewport) {
        await captureWorkspace(page, testInfo, fixtureId, workspace, locale, {
          moduleViewport: null,
          nested: [],
          visiblePanels: [],
        }, "top");
      }
      const lowerContentObservations = await exposeLowerClinicalContent(page, workspace, viewport.height);
      const lowerPanelEvidence = await assertLowerClinicalPanelsVisible(page, workspace, viewport.height);
      const lowerContentEvidence: LowerContentEvidence = {
        ...lowerContentObservations,
        visiblePanels: lowerPanelEvidence,
      };
      await assertNoWorkspaceRootClipping(page, workspace, viewport.width, viewport.height);
      await captureWorkspace(
        page,
        testInfo,
        fixtureId,
        workspace,
        locale,
        lowerContentEvidence,
        shortViewport ? "bottom" : "regular",
      );
      await assertNoUnexpectedInternalClipping(page);
      await assertNoHorizontalOverflow(page, viewport.width);
    }
  }
});
