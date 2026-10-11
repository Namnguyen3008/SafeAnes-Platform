import { defineConfig, devices } from "@playwright/test";

function localUrl(raw: string, label: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${label} must be a valid local test-owned HTTP URL`); }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must be a local test-owned HTTP URL without credentials`);
  }
  return url.toString().replace(/\/+$/, "");
}
const uiBaseUrl = localUrl(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100", "PLAYWRIGHT_BASE_URL");
const apiBaseUrl = localUrl(process.env.SAFEANES_API_BASE_URL ?? "http://127.0.0.1:8100/api/v1", "SAFEANES_API_BASE_URL");
if (new URL(uiBaseUrl).origin === new URL(apiBaseUrl).origin) throw new Error("Integration frontend and backend must use distinct test-owned origins");

export default defineConfig({
  testDir: ".", testMatch: "vitaldb-replay.spec.ts", timeout: 120_000,
  fullyParallel: false, workers: 1, forbidOnly: Boolean(process.env.CI), retries: 0,
  reporter: "list", outputDir: "../../test-results/integration",
  use: { ...devices["Desktop Chrome"], baseURL: uiBaseUrl, browserName: "chromium",
    viewport: { width: 1440, height: 900 }, locale: "en-US", screenshot: "only-on-failure", trace: "retain-on-failure" },
  expect: { timeout: 15_000 },
  metadata: { safeanesUiBaseUrl: uiBaseUrl, safeanesApiBaseUrl: apiBaseUrl },
});
