const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const en = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "messages", "en", "uc05.json"), "utf8"));
const vi = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "messages", "vi", "uc05.json"), "utf8"));

test("VitalDB model copy describes recorded data and avoids calling real outputs synthetic", () => {
  for (const messages of [en, vi]) {
    const text = messages.vitalDb.modelUseDisclaimer;
    assert.equal(typeof text, "string");
    assert.match(text, /VitalDB/i);
    assert.match(text, /clinical|lâm sàng/i);
    assert.doesNotMatch(text, /synthetic|mô phỏng/i);
  }
});

test("synthetic demo copy remains explicitly distinct from VitalDB model copy", () => {
  assert.match(en.simulation.demoDisclaimer, /synthetic/i);
  assert.match(vi.simulation.demoDisclaimer, /mô phỏng/i);
});

test("recorded model status copy covers every truthful output state in both locales", () => {
  for (const messages of [en, vi]) {
    for (const key of ["modelLoading", "modelNotReady", "modelAbstained", "modelInferenceFailed", "noModelOutput", "uncalibratedOutput"]) {
      assert.equal(typeof messages.vitalDb[key], "string", `missing vitalDb.${key}`);
    }
    assert.notEqual(messages.vitalDb.temperatureScaledOutput, messages.vitalDb.uncalibratedOutput);
  }
});

test("recorded UC05 copy does not label uncalibrated rows as temperature scaled", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "modules", "uc05", "ClinicalSummaryRail.tsx"), "utf8");
  assert.match(source, /row\.calibrated\s*\?/);
});
