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

const {
  resolveSafeAnesDistDir,
  SAFE_ANES_DIST_DIR_PATTERN,
  resolveSafeAnesTsconfigPath,
  SAFE_ANES_TSCONFIG_PATH_PATTERN,
} = require(
  path.join(__dirname, "..", "next-dist-dir.ts"),
);

test("unset launcher dist dir preserves the normal Next output directory", () => {
  assert.equal(resolveSafeAnesDistDir(undefined), ".next");
  assert.equal(resolveSafeAnesDistDir(""), ".next");
});

test("valid launcher dist dirs stay local and match the SafeAnes pattern", () => {
  for (const value of [
    ".next-safeanes-launcher-abc123",
    ".next-safeanes-test_01",
  ]) {
    assert.equal(SAFE_ANES_DIST_DIR_PATTERN.test(value), true);
    assert.equal(resolveSafeAnesDistDir(value), value);
  }
});

test("invalid launcher dist dirs are rejected before Next config is built", () => {
  for (const value of [
    ".next",
    "next-safeanes-test",
    ".next-safeanes-",
    ".next-safeanes-test/path",
    "C:\\temp\\.next-safeanes-test",
    ".next-safeanes-test with spaces",
    ".next-safeanes-" + "a".repeat(64),
  ]) {
    assert.throws(() => resolveSafeAnesDistDir(value), /SAFEANES_NEXT_DIST_DIR/);
  }
});

test("unset launcher tsconfig preserves the project TypeScript config", () => {
  assert.equal(resolveSafeAnesTsconfigPath(undefined), "tsconfig.json");
  assert.equal(resolveSafeAnesTsconfigPath(""), "tsconfig.json");
});

test("launcher tsconfig paths are constrained to an owned project-root filename", () => {
  const value = ".tsconfig-safeanes-launcher-abc123.json";
  assert.equal(SAFE_ANES_TSCONFIG_PATH_PATTERN.test(value), true);
  assert.equal(resolveSafeAnesTsconfigPath(value), value);
  for (const invalid of [
    "tsconfig.json/../outside.json",
    "C:\\temp\\tsconfig.json",
    ".tsconfig-safeanes-launcher-test.json/child",
    ".tsconfig-safeanes-launcher-.json",
  ]) {
    assert.throws(
      () => resolveSafeAnesTsconfigPath(invalid),
      /SAFEANES_TSCONFIG_PATH/,
    );
  }
});
