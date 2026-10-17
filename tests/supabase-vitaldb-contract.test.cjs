const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const clientPath = path.join(root, "src/lib/api/supabaseVitalDbClient.ts");
const ingestPath = path.join(root, "scripts/ingest_vitaldb_to_supabase.py");
const migrationPath = path.join(root, "supabase/migrations/20261017085710_safeanes_vitaldb_contract.sql");
const clientSource = fs.readFileSync(clientPath, "utf8");
const ingestSource = fs.readFileSync(ingestPath, "utf8");
const migrationSource = fs.readFileSync(migrationPath, "utf8");
const clientAst = ts.createSourceFile(clientPath, clientSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const rowContracts = [
  ["SupabaseCaseRow", "safeanes_cases", ["id", "dataset_id", "subject_id", "age", "sex", "height", "weight", "bmi", "asa", "op_name", "department", "duration_s", "track_count", "has_waveforms", "review_status", "metadata"]],
  ["SupabaseTrackRow", "safeanes_tracks", ["id", "case_id", "signal_code", "signal_name", "device", "sample_rate_hz", "unit", "duration_s", "metadata"]],
  ["SupabaseEventRow", "safeanes_events", ["id", "case_id", "timestamp_s", "event_type", "name", "value", "unit", "source_system", "provenance_ref"]],
  ["SupabaseSignalWindowRow", "safeanes_signal_windows", ["id", "case_id", "window_start_s", "window_end_s", "observations", "waveforms", "predictions_uc04", "predictions_uc05"]],
];

function findInterface(name) {
  return clientAst.statements.find(
    (statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === name,
  );
}

function interfacePropertyNames(name) {
  const declaration = findInterface(name);
  assert.ok(declaration, `missing client interface ${name}`);
  return declaration.members
    .filter((member) => ts.isPropertySignature(member) && member.name)
    .map((member) => member.name.getText(clientAst).replace(/^['"]|['"]$/g, ""));
}

function migrationCreateBlock(tableName) {
  const match = migrationSource.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${tableName}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"),
  );
  assert.ok(match, `migration does not create ${tableName}`);
  return match[1];
}

function migrationColumnNames(tableName) {
  const block = migrationCreateBlock(tableName);
  return new Set(
    [...block.matchAll(/^\s*([a-z][a-z0-9_]*)\s+(?:text|numeric|integer|boolean|jsonb|timestamptz)\b/gim)]
      .map((match) => match[1]),
  );
}

test("migration_defines_every_client_table_and_field", () => {
  for (const [interfaceName, tableName, requiredFields] of rowContracts) {
    assert.match(clientSource, new RegExp(`safeanes_${tableName.replace("safeanes_", "")}`));
    const clientFields = interfacePropertyNames(interfaceName);
    for (const field of requiredFields) {
      assert.ok(clientFields.includes(field), `${interfaceName} is missing contract field ${field}`);
    }
    const migrationColumns = migrationColumnNames(tableName);
    for (const field of clientFields) {
      assert.ok(migrationColumns.has(field), `${tableName} migration is missing client field ${field}`);
    }
    assert.match(ingestSource, new RegExp(`safeanes_${tableName.replace("safeanes_", "")}`));
  }
});

test("signal_window_query_uses_overlap_bounds", () => {
  assert.match(clientSource, /window_start_s=lte\.\$\{endSeconds\}/);
  assert.match(clientSource, /window_end_s=gte\.\$\{startSeconds\}/);
});

test("client_does_not_use_write_credential", () => {
  assert.match(clientSource, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(clientSource, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});
