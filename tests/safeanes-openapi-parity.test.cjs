const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const openapi = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backend", "openapi.json"), "utf8"));
const clientSource = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "api", "safeanesClient.ts"), "utf8");

const schemaToType = {
  HealthResponse: "HealthResponse",
  ModelStatusResponse: "ModelStatusResponse",
  ModelsResponse: "ModelsResponse",
  CaseSummary: "VitalDbCaseSummary",
  CasesResponse: "CasesResponse",
  CaseDetailResponse: "CaseDetailResponse",
  TrackMetadata: "TrackMetadata",
  TracksResponse: "TracksResponse",
  Observation: "Observation",
  SignalsResponse: "SignalsResponse",
  WaveformWindowResponse: "WaveformWindowResponse",
  CaseEvent: "CaseEvent",
  EventsResponse: "EventsResponse",
  InputWindowResponse: "InputWindowResponse",
  PredictionItemResponse: "PredictionItemResponse",
  PredictionsResponse: "PredictionsResponse",
  ReplaySessionResponse: "ReplaySessionResponse",
};

function interfaceBody(name) {
  const expression = new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const match = clientSource.match(expression);
  assert.ok(match, `TypeScript contract ${name} exists`);
  return match[1];
}

test("typed frontend response contracts contain all fields from the backend OpenAPI snapshot", () => {
  for (const [schemaName, typeName] of Object.entries(schemaToType)) {
    const schema = openapi.components.schemas[schemaName];
    assert.ok(schema, `backend OpenAPI schema ${schemaName} exists`);
    const body = interfaceBody(typeName);
    for (const propertyName of Object.keys(schema.properties ?? {})) {
      assert.match(body, new RegExp(`^\\s*${propertyName}\\??\\s*:`, "m"),
        `${typeName} mirrors backend field ${propertyName}`);
    }
    for (const requiredName of schema.required ?? []) {
      assert.match(body, new RegExp(`^\\s*${requiredName}\\s*:`, "m"),
        `${typeName}.${requiredName} remains required as defined by OpenAPI`);
    }
  }
});

test("typed frontend client exposes every required backend route family", () => {
  const requiredPaths = [
    "/health/live", "/health/ready", "/models", "/cases", "/tracks", "/signals", "/waveforms",
    "/events", "/predictions/uc04", "/predictions/uc05", "/replay/sessions",
  ];
  const clientMethodSource = clientSource.slice(clientSource.indexOf("return {"), clientSource.indexOf("\n  };", clientSource.indexOf("return {")));
  for (const pathFragment of requiredPaths) {
    assert.ok(clientMethodSource.includes(pathFragment), `client maps route ${pathFragment}`);
  }
  for (const [pathName, methods] of Object.entries(openapi.paths)) {
    if (!pathName.startsWith("/api/v1/")) continue;
    const normalizedPath = pathName.replace("/api/v1", "");
    if (normalizedPath.includes("{case_id}") || normalizedPath.includes("{session_id}")) continue;
    assert.ok(requiredPaths.some((fragment) => normalizedPath.includes(fragment)),
      `non-parameterized backend route ${pathName} is included in client contract coverage`);
  }
});
