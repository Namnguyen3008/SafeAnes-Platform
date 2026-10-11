const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const { createSafeAnesClient, SafeAnesApiError } = require(
  path.join(__dirname, "..", "src", "lib", "api", "safeanesClient.ts"),
);

test("VitalDB replay client uses typed backend routes and encodes track query values", async () => {
  const requests = [];
  const client = createSafeAnesClient(async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ case_id: "1", tracks: [] }), { status: 200 });
  });

  const result = await client.listTracks("case/1");

  assert.deepEqual(result, { case_id: "1", tracks: [] });
  assert.equal(requests[0].url, "/api/backend/v1/cases/case%2F1/tracks");
  assert.equal(requests[0].init.cache, "no-store");
});

test("replay API requests preserve explicit case-relative time parameters", async () => {
  const requests = [];
  const client = createSafeAnesClient(async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ session_id: "session-1" }), { status: 200 });
  });

  await client.seekReplay("session-1", 638.25);

  assert.equal(requests[0].url, "/api/backend/v1/replay/sessions/session-1/seek");
  assert.deepEqual(JSON.parse(requests[0].init.body), { time_s: 638.25 });
});

test("typed UC04 and UC05 view requests preserve replay as-of and window parameters", async () => {
  const requests = [];
  const client = createSafeAnesClient(async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({
      case_id: "6388",
      dataset: "VitalDB",
      dataset_version: "local",
      as_of_s: 1025,
      window_start_s: 0,
      window_end_s: 1025,
      time_basis: "seconds_since_case_start",
      available_tracks: [],
      signals: [],
      waveforms: {},
      abp_waveform: null,
      events: [],
      recorded_events: [],
      derived_events: [],
      predictions: null,
      prediction_cache_status: "NOT_READY",
      prediction_cache: null,
      model: {},
    }), { status: 200 });
  });

  await client.getUC04View("6388", 1025, 900);
  await client.getUC05View("6388", 1025, 900);

  assert.equal(requests[0].url, "/api/backend/v1/cases/6388/uc04-view?as_of_s=1025&window_seconds=900");
  assert.equal(requests[1].url, "/api/backend/v1/cases/6388/uc05-view?as_of_s=1025&window_seconds=900");
});

test("structured backend failures retain machine-readable error details", async () => {
  const client = createSafeAnesClient(async () => new Response(JSON.stringify({
    error: {
      code: "INPUT_NOT_ELIGIBLE",
      message: "Required track is unavailable",
      request_id: "req-123",
      details: { track_name: "Primus/AWP" },
    },
  }), { status: 422 }));

  await assert.rejects(client.getCase("1"), (error) => {
    assert.ok(error instanceof SafeAnesApiError);
    assert.equal(error.code, "INPUT_NOT_ELIGIBLE");
    assert.equal(error.status, 422);
    assert.equal(error.requestId, "req-123");
    assert.deepEqual(error.details, { track_name: "Primus/AWP" });
    return true;
  });
});

test("VitalDB cases stay selectable when one model is blocked or case-level inference is unavailable", () => {
  const client = createSafeAnesClient(async () => new Response("{}", { status: 200 }));
  const caseRow = {
    case_id: "1",
    duration_seconds: 100,
    available_signals: ["Primus/ETCO2"],
    uc04_eligible: true,
    uc05_eligible: false,
    coverage_summary: { uc04: 0.7, uc05: 0.2 },
    number_of_valid_windows: { uc04: 4, uc05: 0 },
    inference_readiness: { uc04: "INTEGRATION_READY", uc05: "BLOCKED_CONTRACT_MISMATCH" },
    cache_status: "READY",
  };

  assert.equal(client.isCaseSelectable(caseRow), true);
  assert.equal(client.getDataAvailabilityStatus(false, false), "NOT_RECORDED");
  assert.equal(client.getModelAvailabilityStatus({ inference_ready: false }), "MODEL_NOT_READY");
});


test("health client retains path-free service and build identity", async () => {
  const payload = { service_name: "safeanes-backend", build_id: "release-17", status: "alive", ready: null, components: { api: "UP" } };
  let requested;
  const client = createSafeAnesClient(async (input) => {
    requested = String(input);
    return new Response(JSON.stringify(payload), { status: 200 });
  });
  assert.deepEqual(await client.healthLive(), payload);
  assert.equal(requested, "/api/backend/v1/health/live");
});

test("TypeScript health contract requires backend identity fields", () => {
  const file = path.join(__dirname, "..", "src", "lib", "api", "safeanesClient.ts");
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const health = source.statements.find((item) => ts.isInterfaceDeclaration(item) && item.name.text === "HealthResponse");
  for (const name of ["service_name", "build_id"]) {
    const property = health.members.find((member) => member.name?.getText(source) === name);
    assert.ok(property, `missing ${name}`);
    assert.equal(property.questionToken, undefined, `${name} must be required`);
  }
  assert.equal(health.members.find((item) => item.name?.getText(source) === "service_name").type.getText(source), '"safeanes-backend"');
  assert.equal(health.members.find((item) => item.name?.getText(source) === "build_id").type.getText(source), "string");
});
