import { expect, test } from "@playwright/test";

test("UC03 medication tables expose headers and keyboard-selectable rows", async ({ page }) => {
  await page.goto("/safeanes/case/demo/medications");
  await page.waitForTimeout(300);
  await page.locator("header button[aria-haspopup='dialog']").click();
  await page.locator("#safeanes-replay-source").waitFor();
  await page.locator("input[type='range']").fill("12421000");
  await page.keyboard.press("Escape");
  await expect(page.getByText("DEMO-MED-001", { exact: true }).first()).toBeVisible();

  const activeTable = page.getByRole("table", { name: "Active Medications" });
  await expect(activeTable).toHaveCount(1);
  await expect(activeTable.getByRole("columnheader")).toHaveCount(3);

  const proposedMedication = activeTable.getByRole("row").filter({ hasText: "Ketorolac" });
  await expect(proposedMedication).toBeVisible();
  await proposedMedication.focus();
  await page.keyboard.press("Enter");
  await expect(proposedMedication).toHaveAttribute("aria-selected", "true");
});
