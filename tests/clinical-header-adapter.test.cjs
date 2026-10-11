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

const { resolveHeaderCaseContext } = require(
  path.join(__dirname, "..", "src", "adapters", "clinicalHeaderAdapter.ts")
);

test("VitalDB header stays on the selected recorded case across every module route", () => {
  const routes = [
    "/safeanes/case/demo",
    "/safeanes/case/demo/situation",
    "/safeanes/case/demo/record",
    "/safeanes/case/demo/medications",
    "/safeanes/case/demo/hemodynamics",
    "/safeanes/case/demo/respiratory",
    "/safeanes/case/demo/data-integrity",
    "/safeanes/case/demo/replay",
  ];

  for (const pathname of routes) {
    const header = resolveHeaderCaseContext({
      mode: "VITALDB_REPLAY",
      pathname,
      caseId: "1",
      simulation: {
        patientAgeYears: 67,
        patientSex: "Female",
        operatingRoom: "OR 2",
        procedure: "Left Total Hip Arthroplasty",
        anesthesia: "General",
      },
    });

    assert.deepEqual(header, {
      source: "VITALDB_REPLAY",
      caseId: "1",
      ageYears: null,
      sex: null,
      operatingRoom: null,
      procedure: null,
      anesthesia: null,
    }, `header source for ${pathname}`);
  }
});

test("simulation mode continues to show synthetic case context", () => {
  const header = resolveHeaderCaseContext({
    mode: "SYNTHETIC_DEMO",
    pathname: "/safeanes/case/demo/situation",
    caseId: "1",
    simulation: {
      patientAgeYears: 67,
      patientSex: "Female",
      operatingRoom: "OR 2",
      procedure: "Left Total Hip Arthroplasty",
      anesthesia: "General",
    },
  });

  assert.deepEqual(header, {
    source: "SYNTHETIC_DEMO",
    caseId: null,
    ageYears: 67,
    sex: "Female",
    operatingRoom: "OR 2",
    procedure: "Left Total Hip Arthroplasty",
    anesthesia: "General",
  });
});
