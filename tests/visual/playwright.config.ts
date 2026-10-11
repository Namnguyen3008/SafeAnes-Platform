import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 120_000,
  fullyParallel: false,
  // Keep browser capture pressure bounded against the single local Next.js dev server.
  workers: process.env.CI ? 1 : 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  outputDir: "../../test-results/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
    },
  },
  projects: [
    {
      name: "baseline-1440x900",
      testMatch: ["workspaces.spec.ts", "uc03-accessibility.spec.ts"],
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "matrix-1920x1080",
      testMatch: "workstation-matrix.spec.ts",
      use: { viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "matrix-1680x1050",
      testMatch: "workstation-matrix.spec.ts",
      use: { viewport: { width: 1680, height: 1050 } },
    },
    {
      name: "matrix-1600x900",
      testMatch: "workstation-matrix.spec.ts",
      use: { viewport: { width: 1600, height: 900 } },
    },
    {
      name: "matrix-1440x900",
      testMatch: "workstation-matrix.spec.ts",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "matrix-1366x768",
      testMatch: "workstation-matrix.spec.ts",
      use: { viewport: { width: 1366, height: 768 } },
    },
    {
      name: "matrix-1280x720",
      testMatch: "workstation-matrix.spec.ts",
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
});
