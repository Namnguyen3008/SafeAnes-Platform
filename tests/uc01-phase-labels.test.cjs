const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const { getPerioperativePhaseLabel } = require(path.join(
  __dirname,
  "..",
  "src",
  "components",
  "modules",
  "uc01",
  "phaseLabel.ts"
));

function loadDictionary(language) {
  const filePath = path.join(__dirname, "..", "src", "messages", language, "uc01.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function translate(dictionary, key) {
  return key.split(".").reduce((value, segment) => value?.[segment], dictionary) ?? key;
}

test("perioperative phase labels use localized EN and VI strings", () => {
  const cases = [
    ["preoperative", "Pre-op Holding", "Khu chờ tiền mê"],
    ["or-preparation", "Operating room preparation", "Chuẩn bị phòng mổ"],
    ["induction", "Induction", "Khởi mê"],
    ["maintenance", "Maintenance", "Duy trì mê"],
    ["surgery", "Surgery", "Phẫu thuật"],
    ["closure", "Closure", "Đóng vết mổ"],
    ["emergence", "Emergence", "Thoát mê"],
    ["transfer-pacu", "Transfer / PACU", "Chuyển / Hồi tỉnh"],
    ["completed", "Case complete", "Hoàn tất ca mổ"],
  ];

  for (const [phaseId, fallback, expectedVietnamese] of cases) {
    const english = loadDictionary("en");
    const vietnamese = loadDictionary("vi");
    assert.equal(getPerioperativePhaseLabel(phaseId, fallback, (key) => translate(english, key)), fallback);
    assert.equal(getPerioperativePhaseLabel(phaseId, fallback, (key) => translate(vietnamese, key)), expectedVietnamese);
  }
});

test("unknown phases retain their source label", () => {
  assert.equal(getPerioperativePhaseLabel("new-phase", "Source phase", () => "translation"), "Source phase");
});
