import { expect, test, type Page } from "@playwright/test";

const workspaces = [
  ["overview", "/safeanes/case/demo"],
  ["uc01-situation", "/safeanes/case/demo/situation"],
  ["uc02-record", "/safeanes/case/demo/record"],
  ["uc03-medications", "/safeanes/case/demo/medications"],
  ["uc04-hemodynamics", "/safeanes/case/demo/hemodynamics"],
  ["uc05-respiratory", "/safeanes/case/demo/respiratory"],
] as const;

async function prepareSyntheticCase(page: Page, locale: "en" | "vi") {
  await page.goto("/safeanes/case/demo");
  await page.locator("header button[aria-haspopup='dialog']").click();
  await page.locator("#safeanes-replay-source").selectOption("SYNTHETIC_DEMO");
  await page.getByRole("button", { name: /reset case|đặt lại ca/i }).click();
  await page.keyboard.press("Escape");

  const currentLocale = await page.locator("html").getAttribute("lang");
  if (currentLocale !== locale) {
    await page.getByRole("button", { name: locale.toUpperCase(), exact: true }).click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("header")).toContainText("07:15:00");
}

async function hideNextDevTools(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

async function setReplayTime(page: Page, elapsedMs: number) {
  const slider = page.locator("#safeanes-simulation-control input[type='range']");
  await expect(slider).toBeVisible();
  await slider.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, elapsedMs);
}

async function navigateToWorkspace(page: Page, route: string, locale: "en" | "vi") {
  const currentPath = new URL(page.url()).pathname.replace(/\/$/, "");
  const expectedPath = route.replace(/\/$/, "");
  if (currentPath !== expectedPath) await page.goto(route);
  await expect.poll(() => new URL(page.url()).pathname.replace(/\/$/, "")).toBe(expectedPath);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

test("all workspaces match the 1440x900 EN and VI workstation baselines", async ({ page }) => {
  await prepareSyntheticCase(page, "en");

  for (const [name, route] of workspaces) {
    await navigateToWorkspace(page, route, "en");
    await expect(page.locator("header")).toContainText("07:15:00");
    await hideNextDevTools(page);
    await expect(page).toHaveScreenshot(`${name}-en.png`);
  }

  await page.getByRole("button", { name: "VI", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.locator("header")).toContainText("07:15:00");

  for (const [name, route] of workspaces) {
    await navigateToWorkspace(page, route, "vi");
    await expect(page.locator("header")).toContainText("07:15:00");
    await hideNextDevTools(page);
    await expect(page).toHaveScreenshot(`${name}-vi.png`);
  }
});

test("UC03 high alert and UC05 respiratory alarm remain visually distinct", async ({ page }) => {
  await prepareSyntheticCase(page, "en");

  await page.goto("/safeanes/case/demo/medications");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.locator("header button[aria-haspopup='dialog']").click();
  await setReplayTime(page, 12421000);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("main").first()).toContainText("DEMO-MED-001");
  await expect(page.getByRole("main").first()).toContainText("Ketorolac");
  await expect(page.getByRole("main").first()).toContainText("PROPOSED");
  await hideNextDevTools(page);
  await expect(page).toHaveScreenshot("uc03-high-demo-alert-en.png");

  await page.goto("/safeanes/case/demo/respiratory");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.locator("header button[aria-haspopup='dialog']").click();
  await setReplayTime(page, 13041000);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("main").first()).toContainText("No Breath Detected");
  await expect(page.getByRole("main").first()).toContainText("HIGH");
  await expect(page.getByRole("main").first()).toContainText("10:52:20");
  await hideNextDevTools(page);
  await expect(page).toHaveScreenshot("uc05-respiratory-alert-en.png");
});
