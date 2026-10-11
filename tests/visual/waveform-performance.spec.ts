import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

declare global {
  interface Window {
    __safeAnesWaveformProfile?: {
      intervals: number[];
      lastFrame: number | null;
    canvasPaints: Record<string, number[]>;
    };
  }
}

const CASE_ID = process.env.SAFEANES_PROFILE_CASE_ID ?? "6388";
const START_TIME_SECONDS = 1_025;
const WALL_WINDOW_MS = 5_000;
const SPEEDS = [1, 10, 30, 60] as const;
const REPEATS = 3;

type FrameSummary = {
  count: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

type CanvasSummary = {
  signal: string;
  cssWidth: number;
  cssHeight: number;
  coloredPixels: number;
  recordedSampleCount: number;
  firstRecordedTimeMs: number | null;
  lastRecordedTimeMs: number | null;
  simulationTimeMs: number;
};

type RunMeasurement = {
  caseId: string;
  module: "UC04" | "UC05";
  route: string;
  viewport: { width: number; height: number };
  speed: number;
  wallElapsedMs: number;
  simulationAdvanceSeconds: number;
  observedSpeedRatio: number;
  rafCallbackIntervals: FrameSummary;
  canvasPaints: Record<string, FrameSummary>;
  canvases: CanvasSummary[];
  abpApi?: {
    status: number;
    sampleCount: number;
    validSampleCount: number;
    firstTimestamp: number | null;
    lastTimestamp: number | null;
    sampleRateHz: number | null;
    quality: string | null;
  };
  consoleErrors: string[];
};

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

async function configureRecordedReplay(page: Page, route: string) {
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window);
    const canvasPrototype = CanvasRenderingContext2D.prototype;
    const originalFillRect = canvasPrototype.fillRect;
    window.__safeAnesWaveformProfile = { intervals: [], lastFrame: null, canvasPaints: {} };
    canvasPrototype.fillRect = function (x, y, width, height) {
      const canvas = this.canvas;
      const host = canvas.closest<HTMLElement>("[data-waveform-signal]");
      const profile = window.__safeAnesWaveformProfile;
      if (host && profile && x === 0 && y === 0 &&
          width >= canvas.clientWidth - 1 && height >= canvas.clientHeight - 1) {
        const signal = host.dataset.waveformSignal ?? "UNKNOWN";
        const samples = profile.canvasPaints[signal] ?? (profile.canvasPaints[signal] = []);
        if (samples.length < 10_000) samples.push(performance.now());
      }
      return originalFillRect.call(this, x, y, width, height);
    };
    window.requestAnimationFrame = (callback) => original((timestamp) => {
      const profile = window.__safeAnesWaveformProfile;
      if (profile) {
        if (profile.lastFrame !== null && profile.intervals.length < 10_000) {
          profile.intervals.push(timestamp - profile.lastFrame);
        }
        profile.lastFrame = timestamp;
      }
      callback(timestamp);
    });
  });
  await page.goto(`/safeanes/case/demo/${route}`);
  await page.locator("header button[aria-controls='safeanes-simulation-control']").click();
  const source = page.locator("#safeanes-replay-source");
  await expect(source).toBeEnabled({ timeout: 60_000 });
  await source.selectOption("VITALDB_REPLAY");
  const caseSelector = page.locator("#safeanes-vitaldb-case");
  await expect(caseSelector.locator(`option[value="${CASE_ID}"]`)).toHaveCount(1, { timeout: 60_000 });
  if (await caseSelector.inputValue() !== CASE_ID) await caseSelector.selectOption(CASE_ID);
  await expect(caseSelector).toHaveValue(CASE_ID, { timeout: 60_000 });
  await expect(page.locator("#safeanes-vitaldb-scrubber")).toBeEnabled({ timeout: 60_000 });

  const scrubber = page.locator("#safeanes-vitaldb-scrubber");
  await scrubber.evaluate((element, time) => {
    const input = element as HTMLInputElement;
    const trackedInput = input as HTMLInputElement & {
      _valueTracker?: { setValue: (value: string) => void };
    };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Native replay slider setter unavailable");
    const previousValue = input.value;
    setter.call(input, String(time));
    // React tracks form-control values. Resetting its tracker to the previous
    // value makes this browser-level input event equivalent to a user edit.
    trackedInput._valueTracker?.setValue(previousValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, START_TIME_SECONDS);
  await expect(scrubber).toHaveAttribute("aria-valuetext", /^00:17:05\s*\//);
  await scrubber.dispatchEvent("pointerup");
  await expect(page.locator("header .safe-header-clock")).toContainText("00:17:05");
  await expect(page.locator("[data-waveform-signal]").first()).toBeVisible({ timeout: 30_000 });
}

async function readCanvasSummary(page: Page): Promise<CanvasSummary[]> {
  return page.locator("[data-waveform-signal]").evaluateAll((hosts) => hosts.flatMap((host) => {
    const canvas = host.querySelector("canvas");
    if (!canvas) return [];
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || canvas.width === 0 || canvas.height === 0) return [];
    const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const signal = host.getAttribute("data-waveform-signal") ?? "UNKNOWN";
    let coloredPixels = 0;
    for (let index = 0; index < image.length; index += 4) {
      const red = image[index];
      const green = image[index + 1];
      const blue = image[index + 2];
      const isSignalColor = signal === "CAPNOGRAM"
        ? red > 170 && green > 130 && blue < 100
        : signal === "PLETH"
          ? red < 100 && green > 100 && blue > 150
          : signal === "ABP"
            ? red > 150 && green < 130 && blue < 150
            : false;
      if (isSignalColor) coloredPixels += 1;
    }
    return [{
      signal,
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      coloredPixels,
      recordedSampleCount: Number(host.getAttribute("data-waveform-sample-count") ?? 0),
      firstRecordedTimeMs: Number.isFinite(Number(host.getAttribute("data-waveform-sample-first-time")))
        ? Number(host.getAttribute("data-waveform-sample-first-time")) : null,
      lastRecordedTimeMs: Number.isFinite(Number(host.getAttribute("data-waveform-sample-last-time")))
        ? Number(host.getAttribute("data-waveform-sample-last-time")) : null,
      simulationTimeMs: Number(host.getAttribute("data-waveform-time") ?? 0),
    }];
  }));
}

async function measureRun(
  page: Page,
  module: "UC04" | "UC05",
  route: string,
  speed: number,
  repeat: number,
  consoleErrors: string[],
): Promise<RunMeasurement> {
  const dialog = page.locator("#safeanes-simulation-control");
  const speedSelect = page.locator("#safeanes-vitaldb-speed");
  await speedSelect.selectOption(String(speed));
  await page.evaluate(() => {
    const profile = window.__safeAnesWaveformProfile;
    if (profile) {
      profile.intervals.length = 0;
      profile.lastFrame = null;
      profile.canvasPaints = {};
    }
  });
  const startTime = Number(await page.locator("#safeanes-vitaldb-scrubber").inputValue());
  const startWall = performance.now();
  await dialog.getByRole("button", { name: /^(Play|Resume)$/ }).click();
  await expect(dialog.getByText("PLAYING", { exact: true })).toBeVisible();
  await page.waitForTimeout(WALL_WINDOW_MS);
  const wallElapsedMs = performance.now() - startWall;
  const endTimeBeforePause = Number(await page.locator("#safeanes-vitaldb-scrubber").inputValue());
  await dialog.getByRole("button", { name: /^Pause$/ }).click();
  await expect(dialog.getByText("PAUSED", { exact: true })).toBeVisible();
  const endTime = Number(await page.locator("#safeanes-vitaldb-scrubber").inputValue());
  const simulationAdvanceSeconds = Math.max(0, endTime - startTime, endTimeBeforePause - startTime);
  const observedSpeedRatio = simulationAdvanceSeconds / Math.max(0.001, wallElapsedMs / 1_000);
  const frameIntervals = await page.evaluate(() => [...(window.__safeAnesWaveformProfile?.intervals ?? [])]);
  const canvasPaintIntervals = await page.evaluate(() => {
    const paints = window.__safeAnesWaveformProfile?.canvasPaints ?? {};
    return Object.fromEntries(Object.entries(paints).map(([signal, times]) => [
      signal,
      times.slice(1).map((time, index) => time - times[index]),
    ]));
  });
  const canvases = await readCanvasSummary(page);
  const abpApi = module === "UC04" ? await readAbpApiSummary(page) : undefined;
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };

  expect(simulationAdvanceSeconds, `${module} ${speed}x repeat ${repeat} did not advance replay`).toBeGreaterThan(0);
  expect(observedSpeedRatio, `${module} ${speed}x repeat ${repeat} speed ratio`).toBeGreaterThan(speed * 0.35);
  expect(observedSpeedRatio, `${module} ${speed}x repeat ${repeat} speed ratio`).toBeLessThan(speed * 1.8 + 1);
  expect(frameIntervals.length, `${module} ${speed}x repeat ${repeat} recorded no animation frames`).toBeGreaterThan(0);
  expect(canvases.length, `${module} ${speed}x repeat ${repeat} has no waveform Canvas`).toBeGreaterThan(0);
  expect(canvases.every((canvas) => canvas.cssWidth > 0 && canvas.cssHeight > 0)).toBe(true);
  const requiredSignals = module === "UC05" ? ["CAPNOGRAM", "PLETH"] : ["ABP"];
  for (const signal of requiredSignals) {
    const canvas = canvases.find((item) => item.signal === signal);
    expect(canvas, `${module} must expose ${signal}`).toBeDefined();
    if (canvas!.coloredPixels <= 0) {
      console.log(`${module} ${signal} trace unavailable at profile cursor: ${JSON.stringify({
        canvas: canvas!, abpApi,
      })}`);
    }
    expect(canvas!.coloredPixels, `${module} ${signal} recorded trace must remain visible`).toBeGreaterThan(0);
  }

  return {
    caseId: CASE_ID,
    module,
    route,
    viewport,
    speed,
    wallElapsedMs,
    simulationAdvanceSeconds,
    observedSpeedRatio,
    rafCallbackIntervals: {
      count: frameIntervals.length,
      p50Ms: percentile(frameIntervals, 0.5),
      p95Ms: percentile(frameIntervals, 0.95),
      maxMs: frameIntervals.length ? Math.max(...frameIntervals) : null,
    },
    canvasPaints: Object.fromEntries(Object.entries(canvasPaintIntervals).map(([signal, intervals]) => [signal, {
      count: intervals.length,
      p50Ms: percentile(intervals, 0.5),
      p95Ms: percentile(intervals, 0.95),
      maxMs: intervals.length ? Math.max(...intervals) : null,
    }])),
    canvases,
    abpApi,
    consoleErrors: [...consoleErrors],
  };
}

async function readAbpApiSummary(page: Page): Promise<NonNullable<RunMeasurement["abpApi"]>> {
  const response = await page.request.get(
    `/api/backend/v1/cases/${encodeURIComponent(CASE_ID)}/uc04-view?as_of_s=${START_TIME_SECONDS}&window_seconds=1800`,
  );
  const body = await response.json() as {
    abp_waveform?: {
      timestamps?: number[];
      values?: Array<number | null>;
      sample_rate_hz?: number;
      quality?: string;
    } | null;
  };
  const waveform = body.abp_waveform;
  const timestamps = waveform?.timestamps ?? [];
  const values = waveform?.values ?? [];
  return {
    status: response.status(),
    sampleCount: Math.min(timestamps.length, values.length),
    validSampleCount: values.filter((value) => typeof value === "number" && Number.isFinite(value)).length,
    firstTimestamp: timestamps[0] ?? null,
    lastTimestamp: timestamps[timestamps.length - 1] ?? null,
    sampleRateHz: waveform?.sample_rate_hz ?? null,
    quality: waveform?.quality ?? null,
  };
}

async function profileModule(page: Page, module: "UC04" | "UC05", route: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await configureRecordedReplay(page, route);
  const runs: RunMeasurement[] = [];
  for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
    for (const speed of SPEEDS) {
      runs.push(await measureRun(page, module, route, speed, repeat, errors));
    }
  }
  expect(errors, `${module} emitted browser console errors`).toEqual([]);

  const summary = SPEEDS.map((speed) => {
    const matching = runs.filter((run) => run.speed === speed);
    const medians = (field: "simulationAdvanceSeconds" | "observedSpeedRatio") =>
      percentile(matching.map((run) => run[field]), 0.5);
    const signalNames = [...new Set(matching.flatMap((run) => Object.keys(run.canvasPaints)))];
    return {
      speed,
      repeats: matching.length,
      medianSimulationAdvanceSeconds: medians("simulationAdvanceSeconds"),
      medianObservedSpeedRatio: medians("observedSpeedRatio"),
      canvasPaints: signalNames.map((signal) => {
        const signalRuns = matching.map((run) => run.canvasPaints[signal]).filter(Boolean) as FrameSummary[];
        return {
          signal,
          repeats: signalRuns.length,
          medianIntervalP50Ms: percentile(signalRuns.map((run) => run.p50Ms ?? 0), 0.5),
          medianIntervalP95Ms: percentile(signalRuns.map((run) => run.p95Ms ?? 0), 0.5),
          medianIntervalMaxMs: percentile(signalRuns.map((run) => run.maxMs ?? 0), 0.5),
        };
      }),
    };
  });
  const outputDirectory = path.resolve(process.cwd(), "test-results", "waveform-performance");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const filePath = path.join(outputDirectory, `${module.toLowerCase()}-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    measuredAt: new Date().toISOString(),
    environment: { browser: "Chromium", source: "VITALDB_REPLAY", caseId: CASE_ID, viewport: page.viewportSize() },
    windowSeconds: WALL_WINDOW_MS / 1_000,
    repeats: REPEATS,
    runs,
    summary,
    limitations: ["Engineering rendering profile only; not clinical validation."],
  }, null, 2));
  test.info().annotations.push({ type: "profile-artifact", description: path.relative(process.cwd(), filePath) });
  console.log(`${module} waveform profile: ${JSON.stringify(summary)}`);
}

test("UC05 capnogram and pleth replay profile at 1x/10x/30x/60x", async ({ page }) => {
  await profileModule(page, "UC05", "respiratory");
});

test("UC04 ABP replay profile at 1x/10x/30x/60x", async ({ page }) => {
  await profileModule(page, "UC04", "hemodynamics");
});
