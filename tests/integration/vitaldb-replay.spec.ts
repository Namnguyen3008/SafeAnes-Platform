import { expect, test, type Page, type Locator } from "@playwright/test";
import { createSafeAnesClient, type UC04ViewResponse, type UC05ViewResponse } from "../../src/lib/api/safeanesClient";

const CASE = "6388", SECOND_CASE = "3300", TIME = 1025;
const SESSION_KEY = "safeanes.uc04.vitaldb.replay";
const apiRoot = (process.env.SAFEANES_API_BASE_URL ?? "http://127.0.0.1:8100/api/v1").replace(/\/+$/, "");
const normalizedApiRoot = apiRoot.endsWith("/api/v1") ? apiRoot : `${apiRoot}/api/v1`;
const client = createSafeAnesClient((input, init) => {
  const url = new URL(String(input), "http://client.invalid");
  const headers = new Headers(init?.headers);
  if (process.env.SAFEANES_API_TOKEN) headers.set("Authorization", `Bearer ${process.env.SAFEANES_API_TOKEN}`);
  return fetch(`${normalizedApiRoot}${url.pathname.replace(/^\/api\/backend\/v1/, "")}${url.search}`, { ...init, headers, signal: AbortSignal.timeout(15_000) });
});
function clock(seconds: number) {
  const whole = Math.floor(seconds);
  return [Math.floor(whole / 3600), Math.floor(whole % 3600 / 60), whole % 60].map(value => String(value).padStart(2, "0")).join(":");
}
function output(value: number) {
  expect(Number.isFinite(value)).toBe(true);
  return value === 0 ? "0" : value.toPrecision(4).replace(/(\.\d*?[1-9])0+(e[+-]?\d+)?$/i, "$1$2").replace(/\.0+(e[+-]?\d+)?$/i, "$1");
}
function assertAsOf(view: UC04ViewResponse | UC05ViewResponse, time: number) {
  expect(view.as_of_s).toBe(time);
  expect(view.window_end_s).toBeLessThanOrEqual(time);
  const invalidSignal = view.signals.find((series) => series.observations.some((item) =>
    item.case_id !== view.case_id || item.timestamp > time,
  ));
  expect(invalidSignal).toBeUndefined();
  const waves = "abp_waveform" in view ? [view.abp_waveform] : Object.values(view.waveforms);
  const validWaveforms = waves.every((wave) => !wave ||
    wave.timestamps.length === wave.values.length && wave.timestamps.every((timestamp) => timestamp <= time),
  );
  expect(validWaveforms).toBe(true);
  const events = "events" in view ? view.events : [...view.recorded_events, ...view.derived_events];
  const eventsAreAsOf = events.every((event) =>
    Number(event.available_at_s ?? event.timestamp ?? ("start_time_s" in event ? event.start_time_s : undefined)) <= time,
  );
  expect(eventsAreAsOf).toBe(true);
  const predictionsAreValid = (view.predictions?.predictions ?? []).every((row) =>
    row.case_id === view.case_id && row.prediction_time <= time &&
    row.input_window.end_time_s <= row.prediction_time && /^[a-f0-9]{64}$/i.test(row.artifact_hash),
  );
  expect(predictionsAreValid).toBe(true);
}
async function controls(page: Page) {
  const trigger = page.locator("header button[aria-controls='safeanes-simulation-control']");
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  return page.locator("#safeanes-simulation-control");
}
async function openReplay(page: Page) {
  await page.goto("/safeanes/case/demo");
  await controls(page);
  const source = page.locator("#safeanes-replay-source");
  await expect(source).toBeEnabled({ timeout: 60_000 });
  await source.selectOption("VITALDB_REPLAY");
  await expect(page.locator("#safeanes-vitaldb-case")).toHaveValue(CASE, { timeout: 60_000 });
  await expect(page.locator("#safeanes-vitaldb-scrubber")).toBeEnabled({ timeout: 60_000 });
}
async function session(page: Page) {
  const stored = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null") as { sessionId: string } | null, SESSION_KEY);
  expect(stored?.sessionId).toBeTruthy();
  return client.getReplaySession(stored!.sessionId);
}
async function assertCursor(page: Page, caseId = CASE, seconds = TIME) {
  await expect(page.locator("header .safe-header-clock")).toContainText(clock(seconds));
  await expect(page.locator("header .safe-header-patient")).toContainText(caseId);
  await expect(page.locator("header button[aria-controls='safeanes-simulation-control']")).toContainText(/VITALDB|CA VITALDB/);
  const state = await session(page);
  expect(state.case_id).toBe(caseId);
  expect(state.current_time_s).toBe(seconds);
  return state;
}
async function setScrubber(page: Page, time: number) {
  const scrubber = page.locator("#safeanes-vitaldb-scrubber");
  await scrubber.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Native range input setter unavailable");
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, time);
  // Wait for React's controlled range state before pointerup commits the seek.
  await expect(scrubber).toHaveAttribute("aria-valuetext", new RegExp(`^${clock(time)} /`));
  await scrubber.dispatchEvent("pointerup");
}
async function seek(page: Page, time: number) {
  await controls(page);
  const response = page.waitForResponse(item => item.url().endsWith("/seek") && item.request().method() === "POST");
  await setScrubber(page, time);
  expect((await response).ok()).toBe(true);
  await expect(page.locator("header .safe-header-clock")).toContainText(clock(time));
}
async function navigate(page: Page, route: string) {
  await page.keyboard.press("Escape");
  await page.locator(`a[href='/safeanes/case/demo${route}']`).first().click();
  await expect(page).toHaveURL(new RegExp(`/safeanes/case/demo${route}$`));
}
async function assertWaveformCursor(page: Page, required: boolean, seconds = TIME) {
  const waveforms = page.locator("[data-waveform-time]");
  if (required) await expect(waveforms.first()).toBeVisible();
  await expect.poll(async () => waveforms.evaluateAll(elements => elements.map(element => Number(element.getAttribute("data-waveform-time"))))).toEqual(Array(await waveforms.count()).fill(seconds * 1000));
  const times = await waveforms.evaluateAll(elements => elements.map(element => Number(element.getAttribute("data-waveform-time"))));
  for (const time of times) expect(time).toBe(seconds * 1000);
}
type ObservedReset = { case_id: string; as_of_s: number; uc04_view: UC04ViewResponse; uc05_view: UC05ViewResponse };
async function assertBrowserReset(page: Page, time: number) {
  await expect.poll(async () => page.evaluate(() => (globalThis as unknown as { __safeanesObservedReset?: ObservedReset }).__safeanesObservedReset?.as_of_s)).toBe(time);
  const frame = await page.evaluate(() => (globalThis as unknown as { __safeanesObservedReset: ObservedReset }).__safeanesObservedReset);
  expect(frame.case_id).toBe(CASE);
  // These are actual EventSource reset payloads received by this browser, not
  // a separate direct API request. All waveform points and evidence are bounded.
  assertAsOf(frame.uc04_view, time); assertAsOf(frame.uc05_view, time);
}
async function assertRenderedEventBounds(page: Page, time: number) {
  const panel = page.locator(".uc04-events-panel");
  const rows = panel.locator("tr[role='button']");
  await expect(rows.first().or(panel.getByText("No recorded annotations in this time window.", { exact: true })).first()).toBeVisible();
  const expected = await client.getUC04View(CASE, time);
  await expect(rows).toHaveCount(expected.events.length);
  const times = await rows.locator("td:first-child").allTextContents();
  for (const label of times) {
    const parts = label.trim().split(":").map(Number);
    expect(parts).toHaveLength(3);
    expect(parts[0] * 3600 + parts[1] * 60 + parts[2]).toBeLessThanOrEqual(time);
  }
}
async function assertOutputs(panel: Locator, view: UC04ViewResponse | UC05ViewResponse) {
  const primary = (view.predictions?.predictions ?? []).filter(row => row.horizon_if_applicable !== null);
  const latestTime = Math.max(-1, ...primary.map(row => row.prediction_time));
  const latest = primary.filter(row => row.prediction_time === latestTime);
  if (!latest.length) {
    test.info().annotations.push({ type: "prediction-parity-not-verified", description: `${view.case_id}: API supplied no eligible output at cursor` });
    await expect(panel).toContainText(/NOT READY|ABSTAINED|No eligible|INFERENCE FAILED/);
    await expect(panel.locator(".grid > div")).toHaveCount(0);
    return;
  }
  await expect(panel.locator(".grid > div")).toHaveCount(latest.length);
  for (const row of latest) {
    const horizon = panel.locator(".grid > div").filter({ has: panel.page().getByText(`${row.horizon_if_applicable} min`, { exact: true }) });
    await expect(horizon.getByText(output(Number(row.interpreted_output?.value ?? row.output.value)), { exact: true })).toBeVisible();
    await expect(panel).toContainText(row.task);
  }
}

// Fault injection reuses real recorded observations. Only availability is
// modified; it never invents patient tracks, events, or model predictions.
async function injectUnavailableOutput(page: Page, fault: "BLOCKED" | "ABSTAINED") {
  await page.route("**/api/backend/v1/models", async route => {
    const payload = await client.listModels();
    await route.fulfill({ json: { ...payload, models: payload.models.map(model => fault === "BLOCKED" ? { ...model, loaded: false, inference_ready: false, readiness_status: "MODEL_NOT_READY" } : model) } });
  });
  if (fault === "ABSTAINED") await page.route("**/api/backend/v1/cases", async route => {
    const payload = await client.listCases();
    await route.fulfill({ json: { ...payload, cases: payload.cases.map(item => item.case_id === CASE ? { ...item, uc04_eligible: false, uc05_eligible: false } : item) } });
  });
  await page.route("**/api/backend/v1/replay/sessions/*/stream", async route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2)!;
    const replay = await client.getReplaySession(id);
    const [uc04, uc05, tracks] = await Promise.all([client.getUC04View(replay.case_id, replay.current_time_s), client.getUC05View(replay.case_id, replay.current_time_s), client.listTracks(replay.case_id)]);
    const withoutOutput = (view: UC04ViewResponse | UC05ViewResponse) => ({ ...view,
      model: { ...view.model, readiness_status: fault === "BLOCKED" ? "MODEL_NOT_READY" : "INTEGRATION_READY" },
      prediction_cache_status: "READY", predictions: { ...view.predictions, case_id: replay.case_id, predictions: [], cache_status: "READY", window_eligibility: fault === "BLOCKED" ? "UNKNOWN" : "ABSTAINED" },
      prediction_cache: { ...view.prediction_cache, window_eligibility: fault === "BLOCKED" ? "UNKNOWN" : "ABSTAINED" } });
    const frame = { case_id: replay.case_id, as_of_s: replay.current_time_s, duration_seconds: replay.duration_seconds, available_tracks: tracks.tracks.map(item => item.track_name), track_metadata: tracks.tracks, medication_tracks: [], uc04_view: withoutOutput(uc04), uc05_view: withoutOutput(uc05) };
    await route.fulfill({ contentType: "text/event-stream", body: `event: snapshot\ndata: ${JSON.stringify(replay)}\n\nevent: reset\ndata: ${JSON.stringify(frame)}\n\n` });
  });
}

test.describe("test-owned VitalDB replay parity", () => {
  test.beforeEach(async ({ page, request, baseURL }) => {
    const health = await client.healthLive();
    expect(health.service_name).toBe("safeanes-backend");
    expect(health.build_id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/);
    if (process.env.SAFEANES_EXPECTED_BUILD_ID) expect(health.build_id).toBe(process.env.SAFEANES_EXPECTED_BUILD_ID);
    const proxy = await request.get(`${baseURL}/api/backend/v1/health/live`);
    expect(proxy.ok()).toBe(true);
    expect((await proxy.json()).build_id).toBe(health.build_id);
    await page.addInitScript(() => {
      const NativeEventSource = EventSource;
      class ObservedEventSource extends NativeEventSource {
        constructor(url: string | URL, options?: EventSourceInit) {
          super(url, options);
          if (String(url).includes("/replay/sessions/")) this.addEventListener("reset", event => {
            (globalThis as unknown as { __safeanesObservedReset: unknown }).__safeanesObservedReset = JSON.parse((event as MessageEvent<string>).data);
          });
        }
      }
      globalThis.EventSource = ObservedEventSource;
    });
    await page.addInitScript(({ key, caseId }) => { localStorage.setItem("safeanes_locale", "en"); sessionStorage.setItem(key, JSON.stringify({ caseId })); }, { key: SESSION_KEY, caseId: CASE });
  });
  test("case-source mode stays disabled until the VitalDB catalog is ready", async ({ page }) => {
    await page.route("**/api/backend/v1/cases", async route => {
      await page.waitForTimeout(750);
      await route.fulfill({ json: await client.listCases() });
    });
    await page.goto("/safeanes/case/demo"); await controls(page);
    const source = page.locator("#safeanes-replay-source");
    await expect(source).toBeDisabled();
    await expect(source).toBeEnabled({ timeout: 15_000 });
    await source.selectOption("VITALDB_REPLAY");
    await expect(page.locator("#safeanes-vitaldb-case")).toHaveValue(CASE, { timeout: 60_000 });
  });
  test("6388 at 1025s matches API outputs and survives routes/locales", async ({ page }) => {
    const [uc04, uc05] = await Promise.all([client.getUC04View(CASE, TIME), client.getUC05View(CASE, TIME)]);
    assertAsOf(uc04, TIME); assertAsOf(uc05, TIME);
    await openReplay(page); await seek(page, TIME);
    const original = await assertCursor(page);
    for (const route of ["", "/situation", "/record", "/medications", "/hemodynamics", "/respiratory"]) {
      await navigate(page, route);
      expect((await assertCursor(page)).session_id).toBe(original.session_id);
      if (route === "/hemodynamics") { await assertOutputs(page.locator(".uc04-forecast-panel"), uc04); await assertWaveformCursor(page, Boolean(uc04.abp_waveform)); }
      if (route === "/respiratory") { await assertOutputs(page.locator(".uc05-risk-card"), uc05); await assertWaveformCursor(page, Object.values(uc05.waveforms).some(Boolean)); }
    }
    // Exercise real browser seek reconstruction, including a backward reset.
    // Require the browser-delivered snapshot and rendered horizons to agree at
    // 900s before moving forward, so stale 1025s data cannot satisfy the check.
    for (const time of [900, TIME]) {
      await seek(page, time); await assertCursor(page, CASE, time);
      await assertBrowserReset(page, time);
      const [at04, at05] = await Promise.all([client.getUC04View(CASE, time), client.getUC05View(CASE, time)]);
      assertAsOf(at04, time); assertAsOf(at05, time);
      await navigate(page, "/hemodynamics");
      await assertOutputs(page.locator(".uc04-forecast-panel"), at04);
      await assertRenderedEventBounds(page, time);
      await assertWaveformCursor(page, Boolean(at04.abp_waveform), time);
      await navigate(page, "/respiratory");
      await assertOutputs(page.locator(".uc05-risk-card"), at05);
      await assertWaveformCursor(page, Object.values(at05.waveforms).some(Boolean), time);
    }
    await page.getByRole("button", { name: "VI", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");
    expect((await assertCursor(page)).session_id).toBe(original.session_id);
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect((await assertCursor(page)).session_id).toBe(original.session_id);
  });
  test("case switch clears previous cursor, selected event, and output", async ({ page }) => {
    expect((await client.listCases()).cases.some(item => item.case_id === SECOND_CASE)).toBe(true);
    await openReplay(page); await seek(page, TIME); await navigate(page, "/hemodynamics");
    await assertBrowserReset(page, TIME);
    await assertRenderedEventBounds(page, TIME);
    const previousSession = await session(page);
    const rows = page.locator(".uc04-events-panel tr[role='button']");
    if (await rows.count()) { await rows.first().click(); await expect(rows.first()).toHaveAttribute("aria-pressed", "true"); }
    else test.info().annotations.push({ type: "event-selection-not-verified", description: "No authoritative event available at tested cursor" });
    await controls(page); await page.locator("#safeanes-vitaldb-case").selectOption(SECOND_CASE);
    await expect.poll(async () => page.evaluate(key => {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as { sessionId?: string; caseId?: string } | null;
      return { caseId: saved?.caseId, sessionId: saved?.sessionId };
    }, SESSION_KEY)).toEqual({ caseId: SECOND_CASE, sessionId: expect.any(String) });
    await expect.poll(async () => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null")?.sessionId, SESSION_KEY)).not.toBe(previousSession.session_id);
    await expect.poll(async () => {
      const state = await session(page);
      return { changed: state.session_id !== previousSession.session_id, caseId: state.case_id, time: state.current_time_s };
    }).toEqual({ changed: true, caseId: SECOND_CASE, time: 0 });
    await expect(page.locator("header .safe-header-clock")).toContainText("00:00:00");
    await assertCursor(page, SECOND_CASE, 0);
    await expect(page.locator(".uc04-events-panel tr[aria-pressed='true']")).toHaveCount(0);
    await expect(page.locator(".uc04-risk-value")).toHaveText("—");
    const atStart = await client.getUC04View(SECOND_CASE, 0); assertAsOf(atStart, 0);
    expect(atStart.predictions?.predictions ?? []).toHaveLength(0);
    await navigate(page, "/respiratory"); await assertCursor(page, SECOND_CASE, 0);
    await expect(page.locator(".uc05-risk-card .grid > div")).toHaveCount(0);
  });
  test("network interruption retains recorded mode with visible failure", async ({ page }) => {
    await openReplay(page); await seek(page, TIME);
    await page.route("**/api/backend/v1/**", route => route.abort("failed"));
    await controls(page);
    await setScrubber(page, 1000);
    await expect(page.locator("#safeanes-simulation-control [role='status']")).toContainText(/BACKEND_UNAVAILABLE|Failed|fetch/i);
    await expect(page.locator("#safeanes-replay-source")).toHaveValue("VITALDB_REPLAY");
    await expect(page.locator("header .safe-header-clock")).toContainText(clock(TIME));
    await expect(page.locator("header")).not.toContainText("SYNTHETIC DEMO");
  });
  for (const fault of ["BLOCKED", "ABSTAINED"] as const) test(`${fault}: no invented model output`, async ({ page }) => {
    await injectUnavailableOutput(page, fault);
    await openReplay(page); await navigate(page, "/hemodynamics");
    await expect(page.locator(".uc04-forecast-panel")).toContainText(fault === "BLOCKED" ? /MODEL NOT READY/ : /ABSTAINED/);
    await expect(page.locator(".uc04-risk-value")).toHaveText("—");
    await expect(page.locator(".uc04-forecast-panel .grid > div")).toHaveCount(0);
    await navigate(page, "/respiratory");
    await expect(page.locator(".uc05-risk-card")).toContainText(fault === "BLOCKED" ? /MODEL NOT READY/ : /ABSTAINED/);
    await expect(page.locator(".uc05-risk-card .grid > div")).toHaveCount(0);
    await controls(page); await expect(page.locator("#safeanes-replay-source")).toHaveValue("VITALDB_REPLAY");
    if (fault === "ABSTAINED") await expect(page.locator("#safeanes-vitaldb-case option:checked")).toContainText("UC04 unavailable · UC05 unavailable");
  });
});
