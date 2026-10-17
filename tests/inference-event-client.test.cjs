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

const { isCurrentReplayEvent, isStaleReplaySessionUpdate, parseInferenceEvent } = require(
  path.join(__dirname, "..", "src", "services", "inferenceEventClient.ts"),
);

const resultPayload = {
  session_id: "session-1",
  generation: 4,
  case_id: "1",
  model_id: "SafeAnes-UC04-HypoFormer",
  prediction_time: 125.5,
  predictions: [{ horizon_minutes_or_null: 5, raw_output: 0.72 }],
  source: "LIVE_INFERENCE",
  coverage: 0.98,
  missing_features: [],
  latency_ms: 42.1,
};

test("parses_live_inference_result_with_source", () => {
  const parsed = parseInferenceEvent("inference_result", JSON.stringify(resultPayload));

  assert.equal(parsed.event, "inference_result");
  assert.equal(parsed.source, "LIVE_INFERENCE");
  assert.equal(parsed.session_id, "session-1");
  assert.equal(parsed.predictions[0].raw_output, 0.72);
});

test("parses_safe_inference_error", () => {
  const payload = {
    session_id: "session-1",
    generation: 4,
    case_id: "1",
    model_id: "UNKNOWN",
    prediction_time: 125.5,
    code: "LIVE_INFERENCE_FAILED",
  };
  const parsed = parseInferenceEvent("inference_error", JSON.stringify(payload));

  assert.deepEqual(parsed, { event: "inference_error", ...payload });
});

test("rejects_malformed_or_unknown_inference_event", () => {
  assert.equal(parseInferenceEvent("update", JSON.stringify(resultPayload)), null);
  assert.equal(parseInferenceEvent("inference_result", "not-json"), null);
  assert.equal(parseInferenceEvent("inference_result", JSON.stringify({
    ...resultPayload,
    source: "OFFLINE_CACHE",
  })), null);
  assert.equal(parseInferenceEvent("inference_error", JSON.stringify({
    ...resultPayload,
    code: "private details are not a code",
  })), null);
});

test("rejects_events_for_another_session_case_or_generation", () => {
  const parsed = parseInferenceEvent("inference_result", JSON.stringify(resultPayload));
  const session = { session_id: "session-1", case_id: "1", generation: 4 };

  assert.equal(isCurrentReplayEvent(parsed, session), true);
  assert.equal(isCurrentReplayEvent(parsed, null), false);
  assert.equal(isCurrentReplayEvent(parsed, { ...session, session_id: "session-2" }), false);
  assert.equal(isCurrentReplayEvent(parsed, { ...session, case_id: "2" }), false);
  assert.equal(isCurrentReplayEvent(parsed, { ...session, generation: 5 }), false);
  assert.equal(isCurrentReplayEvent(parsed, { session_id: "session-1", case_id: "1" }), false);
});


test("rejects_stale_replay_session_snapshots_after_seek_or_reset", () => {
  const current = { session_id: "session-1", case_id: "1", generation: 5 };

  assert.equal(isStaleReplaySessionUpdate({ ...current, generation: 4 }, current), true);
  assert.equal(isStaleReplaySessionUpdate({ ...current, generation: 5 }, current), false);
  assert.equal(isStaleReplaySessionUpdate({ ...current, generation: 6 }, current), false);
  assert.equal(isStaleReplaySessionUpdate({ ...current, session_id: "session-2", generation: 1 }, current), false);
  assert.equal(isStaleReplaySessionUpdate({ ...current, case_id: "2", generation: 1 }, current), false);
  assert.equal(isStaleReplaySessionUpdate({ ...current, generation: 4 }, null), false);
});
