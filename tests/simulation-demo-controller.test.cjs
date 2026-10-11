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

const controller = require(path.join(__dirname, "..", "src", "simulation", "demoControllerModel.ts"));
const simulation = require(path.join(__dirname, "..", "src", "simulation", "index.ts"));

test("quick jumps are anchored to the shared case start and include all demo milestones", () => {
  const jumps = controller.getSimulationQuickJumps("2026-10-07T07:15:00+07:00");
  assert.deepEqual(jumps.map(({ id, elapsedMs }) => [id, elapsedMs]), [
    ["start", 0],
    ["induction", 50 * 60_000],
    ["data-quality", 119 * 60_000],
    ["medication-safety", 207 * 60_000],
    ["hemodynamic-warning", 194 * 60_000],
    ["low-map", 196 * 60_000],
    ["respiratory", 217 * 60_000],
    ["emergence", 270 * 60_000],
    ["pacu", 290 * 60_000],
  ]);
});

test("automatic demo milestones navigate to the five requested modules in timeline order", () => {
  const milestones = controller.getAutoDemoMilestones("2026-10-07T07:15:00+07:00", "demo");
  assert.deepEqual(milestones.map(({ id, elapsedMs, route, target }) => ({ id, elapsedMs, route, target })), [
    { id: "data-quality", elapsedMs: 119 * 60_000, route: "/safeanes/case/demo/situation", target: "uc01-quality" },
    { id: "hemodynamic-warning", elapsedMs: 194 * 60_000, route: "/safeanes/case/demo/hemodynamics", target: "uc04-risk" },
    { id: "medication-safety", elapsedMs: 207 * 60_000, route: "/safeanes/case/demo/medications", target: "uc03-medication" },
    { id: "respiratory", elapsedMs: 217 * 60_000, route: "/safeanes/case/demo/respiratory", target: "uc05-respiratory" },
    { id: "evidence-review", elapsedMs: 219 * 60_000, route: "/safeanes/case/demo/record?claim=claim-respiratory-no-breath&event=respiratory-no-breath-detected&time=10%3A54%3A00", target: "uc02-evidence" },
  ]);
});

test("clock-time conversion handles cases that cross midnight without locale timezone assumptions", () => {
  assert.equal(controller.caseClockTimeToElapsedMs("00:15", "2026-10-07T23:15:00+07:00"), 60 * 60_000);
});

test("reset returns the same stopped baseline state as a fresh case start", () => {
  const engine = new simulation.SimulationEngine(simulation.createFullCase());
  const initial = engine.seek(0).snapshot;
  engine.seek(194 * 60_000);

  const reset = engine.reset();
  assert.equal(reset.status, "STOPPED");
  assert.equal(reset.simulationTime, 0);
  assert.deepEqual(reset.events, initial.events);
  assert.deepEqual(reset.observations, initial.observations);
});
