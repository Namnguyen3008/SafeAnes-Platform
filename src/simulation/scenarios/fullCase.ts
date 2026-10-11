import type { SimulationAlert } from "../types/alerts";
import type { RecordClaim } from "../types/claims";
import type { PerioperativePhase, SafeAnesSimulationCase } from "../types/case";
import type { SimulationEvent } from "../types/events";
import type { SimulationEpisode } from "../types/episodes";
import type { MedicationRecord } from "../types/medications";
import type { PredictionEvent } from "../types/predictions";
import type { SafeAnesScenarioManifest } from "../types/scenarioManifest";
import type { SignalQualityState } from "../types/quality";
import { generateFullCaseWaveforms } from "../generators/clinicalWaveforms";
import { generateFullCaseObservations } from "../generators/fullCaseSignals";

export const DEFAULT_SIMULATION_SEED = 20261007;
export const SIMULATION_MODE = true;

export const simulationMetadata = Object.freeze({
  synthetic: true,
  clinicalUse: false,
  purpose: "SafeAnes UI and workflow demonstration",
} as const);

export const FULL_CASE_SCENARIO_ID = "SAFEANES_FULL_UC_DEMO_V1";
export const FULL_CASE_ID = "SAFE-DEMO-001";
export const FULL_CASE_PATIENT_ID = "DEMO-PATIENT-001";
export const FULL_CASE_START = "2026-10-07T07:15:00+07:00";
export const FULL_CASE_DURATION_MS = 5 * 60 * 60 * 1_000;

const MINUTE = 60_000;
const CASE_END = FULL_CASE_DURATION_MS;

function createScenarioManifest(): SafeAnesScenarioManifest {
  return {
    hemodynamics: {
      demoOnly: true,
      clinicalUse: false,
      modelId: "SAFEANES-DEMO-HPI",
      modelVersion: "0.1-demo",
      evaluationIntervalMs: 60_000,
      horizonsMinutes: [1, 5, 10, 15],
      hypotensionThresholdMmHg: 65,
      hypotensionThresholdLabel: "DEMO ONLY — synthetic scenario threshold; not clinical guidance.",
      hypotensionEpisodeStartTime: at(10, 31),
      alertTriggerProbability: 0.2,
      alertResolveProbability: 0.15,
      riskCurve: [
        { time: 0, probability: 0.08 },
        { time: at(10, 22), probability: 0.08 },
        { time: at(10, 23), probability: 0.22 },
        { time: at(10, 25), probability: 0.38 },
        { time: at(10, 27), probability: 0.57 },
        { time: at(10, 29), probability: 0.76 },
        { time: at(10, 31), probability: 0.88 },
        { time: at(10, 32), probability: 0.9 },
        { time: at(10, 34), probability: 0.61 },
        { time: at(10, 37), probability: 0.36 },
        { time: at(10, 42), probability: 0.22 },
        { time: at(10, 48), probability: 0.08 },
        { time: CASE_END, probability: 0.06 },
      ],
    },
    respiratory: {
      demoOnly: true,
      clinicalUse: false,
      modelId: "SAFEANES-DEMO-RESP-v0.1",
      modelVersion: "0.1-demo",
      evaluationIntervalMs: MINUTE,
      horizonMinutes: 5,
      eventStartTime: at(10, 52),
      eventEndTime: at(10, 53),
      alertTriggerTime: at(10, 52, 20),
      riskCurve: [
        { time: 0, probability: 0.08 },
        { time: at(10, 47), probability: 0.08 },
        { time: at(10, 48), probability: 0.12 },
        { time: at(10, 49), probability: 0.19 },
        { time: at(10, 50), probability: 0.38 },
        { time: at(10, 51), probability: 0.68 },
        { time: at(10, 52), probability: 0.92 },
        { time: at(10, 53), probability: 0.72 },
        { time: at(10, 54), probability: 0.48 },
        { time: at(10, 55), probability: 0.3 },
        { time: at(10, 57), probability: 0.14 },
        { time: at(11, 0), probability: 0.08 },
        { time: CASE_END, probability: 0.08 },
      ],
    },
  };
}

function at(hour: number, minute: number, second = 0): number {
  return ((hour * 60 + minute) - (7 * 60 + 15)) * MINUTE + second * 1_000;
}

/** Creates one deterministic synthetic perioperative case shared by UC01–UC05. */
export function createFullCase(seed = DEFAULT_SIMULATION_SEED): SafeAnesSimulationCase {
  if (!Number.isFinite(seed)) throw new TypeError("Simulation seed must be finite.");
  const normalizedSeed = Math.trunc(seed);
  const observations = generateFullCaseObservations(normalizedSeed, CASE_END);
  const waveforms = generateFullCaseWaveforms(normalizedSeed, CASE_END);
  const scenarioManifest = createScenarioManifest();
  const events: SimulationEvent[] = [];
  const addEvent = <TPayload>(event: SimulationEvent<TPayload>) => events.push(event as SimulationEvent);

  const addTimelineEvents = () => {
    addEvent(makeEvent("case-started", at(7, 15), "workflow", "SYSTEM", "CASE_STARTED", {
      caseId: FULL_CASE_ID,
      label: "Pre-op Holding",
      synthetic: true,
    }, "DIRECT"));
    addEvent(makeEvent("patient-entered-or", at(7, 45), "workflow", "MANUAL", "PATIENT_ENTERED_OR", {
      caseId: FULL_CASE_ID,
      location: "OR 2",
    }, "CLINICIAN_CONFIRMED"));
    addEvent(makeEvent("phase-induction", at(8, 5), "workflow", "MANUAL", "PHASE_STARTED", {
      phaseId: "induction",
      label: "Induction",
    }, "CLINICIAN_CONFIRMED"));
    addEvent(makeEvent("airway-secured", at(8, 15), "anesthesia-record", "MANUAL", "AIRWAY_SECURED", {
      status: "SECURED",
      sourceRecord: "authoritative synthetic airway event",
      synthetic: true,
    }, "CLINICIAN_CONFIRMED"));
    addEvent(makeEvent("phase-maintenance", at(8, 25), "workflow", "MANUAL", "PHASE_STARTED", {
      phaseId: "maintenance",
      label: "Maintenance",
    }, "CLINICIAN_CONFIRMED"));
    addEvent(makeEvent("surgery-started", at(9, 10), "workflow", "MANUAL", "PROCEDURE_STARTED", {
      procedure: "Left Total Hip Arthroplasty",
      operatingRoom: "OR 2",
    }, "CLINICIAN_CONFIRMED"));
    addEvent(makeEvent("phase-closure", at(11, 20), "workflow", "MANUAL", "PHASE_STARTED", {
      phaseId: "closure",
      label: "Closure",
    }, "CLINICIAN_CONFIRMED"));
    addEvent(makeEvent("phase-emergence", at(11, 45), "workflow", "MANUAL", "PHASE_STARTED", {
      phaseId: "emergence",
      label: "Emergence",
    }, "CLINICIAN_CONFIRMED"));
    addEvent(makeEvent("patient-transferred-pacu", at(12, 5), "workflow", "MANUAL", "PATIENT_TRANSFERRED", {
      destination: "PACU",
    }, "CLINICIAN_CONFIRMED"));
    addEvent(makeEvent("case-completed", at(12, 15), "workflow", "SYSTEM", "CASE_COMPLETED", {
      caseId: FULL_CASE_ID,
      status: "COMPLETED",
      synthetic: true,
    }, "DERIVED"));
  };

  const medications = createMedicationRecords();
  const addMedicationEvents = () => {
    addEvent(makeEvent("medication-propofol-bolus", at(8, 5), "anesthesia-record", "MANUAL", "MEDICATION_ADMINISTERED", {
      medicationId: "med-propofol-bolus",
      name: "Propofol",
      dose: 120,
      doseUnit: "mg",
      route: "IV",
      synthetic: true,
    }, "CLINICIAN_CONFIRMED", { recordedTime: at(8, 5) + 180 }));
    addEvent(makeEvent("medication-rocuronium-administered", at(8, 6), "anesthesia-record", "MANUAL", "MEDICATION_ADMINISTERED", {
      medicationId: "med-rocuronium",
      name: "Rocuronium",
      dose: 40,
      doseUnit: "mg",
      route: "IV",
      synthetic: true,
    }, "CLINICIAN_CONFIRMED", { recordedTime: at(8, 6) + 180 }));
    addEvent(makeEvent("medication-remifentanil-infusion-started", at(8, 8), "infusion-pump-or2", "DEVICE", "MEDICATION_INFUSION_STARTED", {
      medicationId: "med-remifentanil-infusion",
      name: "Remifentanil",
      rate: 0.1,
      rateUnit: "mcg/kg/min",
      synthetic: true,
    }, "DIRECT", { recordedTime: at(8, 8) + 160 }));
    addEvent(makeEvent("medication-propofol-infusion-started", at(8, 25), "infusion-pump-or2", "DEVICE", "MEDICATION_INFUSION_STARTED", {
      medicationId: "med-propofol-infusion",
      name: "Propofol",
      rate: 90,
      rateUnit: "mg/h",
      synthetic: true,
    }, "DIRECT", { recordedTime: at(8, 25) + 160 }));
    addEvent(makeEvent("medication-phenylephrine-rescue", at(10, 33), "anesthesia-record", "MANUAL", "MEDICATION_ADMINISTERED", {
      medicationId: "med-phenylephrine",
      name: "Phenylephrine",
      dose: 100,
      doseUnit: "mcg",
      route: "IV",
      synthetic: true,
      temporalRelation: {
        relatedEventId: "episode-hemodynamic-low-map-detected",
        relationship: "OVERLAPS",
      },
    }, "CLINICIAN_CONFIRMED", {
      recordedTime: at(10, 33) + 250,
      relatedEventIds: ["episode-hemodynamic-low-map-detected"],
    }));
    addEvent(makeEvent("medication-ketorolac-proposed", at(10, 42), "medication-safety-demo-rule", "RULE", "MEDICATION_PROPOSED", {
      medicationId: "med-ketorolac-proposal",
      name: "Ketorolac",
      dose: 30,
      doseUnit: "mg",
      route: "IV",
      synthetic: true,
      proposalOnly: true,
      demoReviewRequired: true,
      exposureId: "med-ketorolac-proposal",
    }, "INFERRED", { recordedTime: at(10, 42) + 100 }));
  };

  const qualityStates = createQualityStates();
  const addQualityEvents = () => {
    addQualityInterval(addEvent, "quality-bis-degraded", "quality-bis-restored", at(9, 14), 45_000,
      "BIS", "bis-monitor-or2", "DEGRADED", "Synthetic BIS signal quality degradation.");
    addQualityInterval(addEvent, "quality-arterial-artifact", "quality-arterial-restored", at(9, 42), 15_000,
      "MAP", "arterial-line-or2", "INVALIDATED_ARTIFACT", "Synthetic brief arterial-line artifact; raw values are retained but invalidated for display.");
    addQualityInterval(addEvent, "quality-etco2-technical-dropout", "quality-etco2-restored", at(10, 2), 12_000,
      "ETCO2", "capnograph-or2", "TECHNICAL_DROPOUT", "Synthetic technical data dropout; no EtCO2 value is imputed.");
    addQualityInterval(addEvent, "quality-pump-gateway-latency", "quality-pump-gateway-recovered", at(10, 18), 30_000,
      "PUMP_GATEWAY_LATENCY", "infusion-pump-or2", "DEGRADED", "Synthetic pump gateway latency increase.", {
        eventType: "DEVICE_LATENCY_INCREASED",
        startPayload: { metric: "gateway latency", latencyMs: 750 },
        endEventType: "DEVICE_LATENCY_RECOVERED",
        endPayload: { metric: "gateway latency", latencyMs: 80 },
      });
  };

  const predictions = createPredictions();
  const episodes = createEpisodes();
  const alerts = createAlerts();
  const recordClaims = createClaims(scenarioManifest);

  addTimelineEvents();
  addDeviceHeartbeatEvents(addEvent);
  addMedicationEvents();
  addQualityEvents();
  addEvent(makeEvent("hemodynamic-trend-deterioration-begins", at(10, 23), "arterial-line-or2", "DEVICE", "HEMODYNAMIC_TREND_CHANGED", {
    signal: "MAP",
    trend: "DOWNWARD",
    synthetic: true,
  }, "DERIVED", { recordedTime: at(10, 23) + 100 }));
  addEvent(makeEvent("episode-hemodynamic-low-map-detected", at(10, 31), "arterial-line-or2", "DEVICE", "EPISODE_DETECTED", {
    episodeId: "episode-hemodynamic-low-map",
    type: "HYPOTENSION",
    mapMmHg: 62,
    demoThresholdMmHg: scenarioManifest.hemodynamics.hypotensionThresholdMmHg,
    thresholdLabel: scenarioManifest.hemodynamics.hypotensionThresholdLabel,
    synthetic: true,
  }, "DERIVED", { recordedTime: at(10, 31) + 100, quality: { status: "GOOD" } }));
  addEvent(makeEvent("hemodynamic-major-episode-marker", at(10, 32), "demo-hemodynamic-risk", "MODEL", "DEMO_HEMODYNAMIC_EVENT", {
    type: "HYPOTENSION",
    episodeId: "episode-hemodynamic-low-map",
    displayPriority: "HIGH",
    synthetic: true,
    clinicalUse: false,
  }, "INFERRED", {
    recordedTime: at(10, 32) + 100,
    relatedEventIds: ["episode-hemodynamic-low-map-detected"],
  }));
  addEvent(makeEvent("episode-hemodynamic-low-map-resolved", at(10, 34), "arterial-line-or2", "DEVICE", "EPISODE_RESOLVED", {
    episodeId: "episode-hemodynamic-low-map",
    mapMmHg: 68,
    synthetic: true,
  }, "DERIVED", { recordedTime: at(10, 34) + 100 }));
  addEvent(makeEvent("respiratory-morphology-changed", at(10, 48), "capnograph-or2", "DEVICE", "RESPIRATORY_MORPHOLOGY_CHANGED", {
    signal: "CAPNOGRAM",
    observation: "synthetic morphology change candidate",
  }, "DERIVED", { recordedTime: at(10, 48) + 100 }));
  addEvent(makeEvent("respiratory-rate-decreased", at(10, 50), "capnograph-or2", "DEVICE", "RESPIRATORY_RATE_TREND_CHANGED", {
    signal: "RR",
    observation: "synthetic respiratory-rate decrease",
  }, "DERIVED", { recordedTime: at(10, 50) + 100 }));
  addEvent(makeEvent("respiratory-no-breath-detected", at(10, 52), "capnograph-or2", "DEVICE", "EPISODE_DETECTED", {
    episodeId: "episode-respiratory-deterioration-candidate",
    type: "RESPIRATORY_DETERIORATION_CANDIDATE",
    intervalStart: at(10, 52),
    cause: null,
    diagnosis: null,
    synthetic: true,
  }, "DERIVED", { recordedTime: at(10, 52) + 100, quality: { status: "GOOD" } }));
  addEvent(makeEvent("respiratory-no-breath-resolved", at(10, 53), "capnograph-or2", "DEVICE", "EPISODE_RESOLVED", {
    episodeId: "episode-respiratory-deterioration-candidate",
    intervalEnd: at(10, 53),
    signalReturnedTowardBaseline: true,
    synthetic: true,
  }, "DERIVED", { recordedTime: at(10, 53) }));

  for (const prediction of predictions) {
    addEvent(makeEvent(`event-${prediction.id}`, prediction.timestamp, prediction.modelId, "MODEL", "PREDICTION_CREATED", {
      predictionId: prediction.id,
      task: prediction.task,
      probability: prediction.probability,
      horizonMinutes: prediction.horizonMinutes,
      synthetic: true,
      clinicalUse: false,
    }, "INFERRED", { recordedTime: prediction.timestamp + 80 }));
  }
  addEvent(makeEvent("event-alert-respiratory-no-breath", at(10, 52, 20), "respiratory-demo-rule", "RULE", "ALERT_RAISED", {
    alertId: "alert-respiratory-no-breath",
    code: "DEMO-RESP-02",
    severity: "HIGH",
    sourceModule: "UC05",
    synthetic: true,
    clinicalUse: false,
  }, "DERIVED", {
    recordedTime: at(10, 52, 20) + 100,
    relatedEventIds: ["respiratory-no-breath-detected"],
  }));

  const observationsByTime = new Map<number, typeof observations>();
  for (const reading of observations) {
    const batch = observationsByTime.get(reading.eventTime) ?? [];
    batch.push(reading);
    observationsByTime.set(reading.eventTime, batch);
  }
  for (const [eventTime, batch] of observationsByTime) {
    addEvent(makeEvent(`event-observation-batch-${eventTime}`, eventTime, "simulation-acquisition", "SYSTEM", "OBSERVATION_BATCH_RECORDED", {
      observationIds: batch.map((reading) => reading.id),
      signals: [...new Set(batch.map((reading) => reading.signal))],
      sourceDevices: [...new Set(batch.map((reading) => reading.sourceDevice))],
      sampleCount: batch.length,
      synthetic: true,
    }, "DIRECT", { recordedTime: Math.max(...batch.map((reading) => reading.receivedTime)) }));
  }
  for (const waveform of waveforms) {
    addEvent(makeEvent(`event-${waveform.id}`, waveform.eventTime, waveform.sourceDevice, "DEVICE", "WAVEFORM_SEGMENT_RECORDED", {
      waveformId: waveform.id,
      signal: waveform.signal,
      sampleCount: waveform.samples.length,
    }, waveform.provenance, { recordedTime: waveform.recordedTime }));
  }

  return {
    scenarioId: FULL_CASE_SCENARIO_ID,
    seed: normalizedSeed,
    simulationMetadata,
    scenarioManifest,
    simulationTime: 0,
    patient: {
      patientId: FULL_CASE_PATIENT_ID,
      ageYears: 67,
      sex: "Female",
      weightKg: 58,
      asa: "III",
      allergies: [],
      comorbidities: [],
      syntheticFactors: { demoPatient: "true", clinicalUse: "false" },
    },
    encounter: {
      caseId: FULL_CASE_ID,
      patientId: FULL_CASE_PATIENT_ID,
      startedAt: FULL_CASE_START,
      scheduledDurationMs: CASE_END,
      status: "IN_PROGRESS",
    },
    procedure: {
      name: "Left Total Hip Arthroplasty",
      operatingRoom: "OR 2",
      anesthesia: "General",
      service: "Orthopaedics",
    },
    perioperativePhases: createPhases(),
    devices: createDevices(),
    observations,
    waveforms,
    medications,
    events: events.sort((left, right) =>
      left.eventTime - right.eventTime ||
      (left.recordedTime ?? left.eventTime) - (right.recordedTime ?? right.eventTime) ||
      left.id.localeCompare(right.id)
    ),
    episodes,
    predictions,
    alerts,
    recordClaims,
    qualityStates,
  };
}

function createPhases(): PerioperativePhase[] {
  return [
    { id: "preoperative", label: "Pre-op Holding", startTime: at(7, 15), endTime: at(7, 45), status: "CURRENT" },
    { id: "or-preparation", label: "Operating room preparation", startTime: at(7, 45), endTime: at(8, 5), status: "FUTURE" },
    { id: "induction", label: "Induction", startTime: at(8, 5), endTime: at(8, 25), status: "FUTURE" },
    { id: "maintenance", label: "Maintenance", startTime: at(8, 25), endTime: at(11, 45), status: "FUTURE" },
    { id: "surgery", label: "Surgery", startTime: at(9, 10), endTime: at(11, 20), status: "FUTURE" },
    { id: "closure", label: "Closure", startTime: at(11, 20), endTime: at(11, 45), status: "FUTURE" },
    { id: "emergence", label: "Emergence", startTime: at(11, 45), endTime: at(12, 5), status: "FUTURE" },
    { id: "transfer-pacu", label: "Transfer / PACU", startTime: at(12, 5), endTime: CASE_END, status: "FUTURE" },
    { id: "completed", label: "Case complete", startTime: CASE_END, endTime: CASE_END, status: "FUTURE" },
  ];
}

function createDevices(): import("../types/devices").SimulationDevice[] {
  return [
    { id: "patient-monitor-or2", name: "Patient Monitor", kind: "PATIENT_MONITOR", sourceIds: ["monitor-or2", "arterial-line-or2", "pulse-ox-or2", "hemodynamic-monitor-or2"], status: "CONNECTED", signalQuality: "GOOD", latencyMs: 80, clockOffsetMs: 8, lastMessageAt: 0 },
    { id: "anesthesia-machine-or2", name: "Anesthesia Machine", kind: "ANESTHESIA_MACHINE", sourceIds: ["anesthesia-machine-or2"], status: "CONNECTED", signalQuality: "GOOD", latencyMs: 80, clockOffsetMs: -19, lastMessageAt: 0 },
    { id: "bis-monitor-or2", name: "BIS Monitor", kind: "BIS_MONITOR", sourceIds: ["bis-monitor-or2"], status: "CONNECTED", signalQuality: "GOOD", latencyMs: 80, clockOffsetMs: 8, lastMessageAt: 0 },
    { id: "infusion-pump-or2", name: "Infusion Pump Gateway", kind: "INFUSION_PUMP_GATEWAY", sourceIds: ["infusion-pump-or2"], status: "CONNECTED", signalQuality: "GOOD", latencyMs: 80, clockOffsetMs: 42, lastMessageAt: 0 },
    { id: "ventilator-or2", name: "Ventilator", kind: "VENTILATOR", sourceIds: ["capnograph-or2"], status: "CONNECTED", signalQuality: "GOOD", latencyMs: 80, clockOffsetMs: -19, lastMessageAt: 0 },
  ];
}

function addDeviceHeartbeatEvents(addEvent: <TPayload>(event: SimulationEvent<TPayload>) => void): void {
  for (let time = 5 * MINUTE; time <= CASE_END; time += 5 * MINUTE) {
    addEvent(makeEvent(`heartbeat-anesthesia-machine-${time}`, time, "anesthesia-machine-or2", "DEVICE", "DEVICE_HEARTBEAT", {
      deviceId: "anesthesia-machine-or2",
      status: "CONNECTED",
      synthetic: true,
    }, "DIRECT"));
  }
}

function createMedicationRecords(): MedicationRecord[] {
  return [
    { id: "med-propofol-bolus", name: "Propofol", indication: "Synthetic recorded induction bolus", dose: 120, doseUnit: "mg", route: "IV", status: "ADMINISTERED", eventTime: at(8, 5), source: "anesthesia-record", synthetic: true, clinicalUse: false },
    { id: "med-rocuronium", name: "Rocuronium", indication: "Synthetic recorded administration", dose: 40, doseUnit: "mg", route: "IV", status: "ADMINISTERED", eventTime: at(8, 6), source: "anesthesia-record", synthetic: true, clinicalUse: false },
    { id: "med-remifentanil-infusion", name: "Remifentanil", indication: "Synthetic recorded infusion", dose: 0.1, doseUnit: "mcg/kg/min", route: "IV", status: "INFUSING", eventTime: at(8, 8), source: "infusion-pump-or2", rate: 0.1, rateUnit: "mcg/kg/min", synthetic: true, clinicalUse: false },
    { id: "med-propofol-infusion", name: "Propofol", indication: "Synthetic recorded maintenance infusion", dose: 90, doseUnit: "mg/h", route: "IV", status: "INFUSING", eventTime: at(8, 25), source: "infusion-pump-or2", rate: 90, rateUnit: "mg/h", synthetic: true, clinicalUse: false },
    { id: "med-phenylephrine", name: "Phenylephrine", indication: "Synthetic recorded administration", dose: 100, doseUnit: "mcg", route: "IV", status: "ADMINISTERED", eventTime: at(10, 33), source: "anesthesia-record", synthetic: true, clinicalUse: false },
    { id: "med-ketorolac-proposal", name: "Ketorolac", indication: "Synthetic proposal for demo review only", dose: 30, doseUnit: "mg", route: "IV", status: "PROPOSED", eventTime: at(10, 42), source: "medication-safety-demo-rule", synthetic: true, clinicalUse: false },
  ];
}

function createPredictions(): PredictionEvent[] {
  // UC05 estimates are emitted by the deterministic replay engine as due data
  // arrives. Keeping them out of the scenario definition prevents future leakage.
  return [];
}

function createEpisodes(): SimulationEpisode[] {
  return [
    {
      id: "episode-hemodynamic-low-map",
      type: "HYPOTENSION",
      startTime: at(10, 31),
      endTime: at(10, 34),
      status: "RESOLVED",
      relatedEventIds: ["episode-hemodynamic-low-map-detected", "episode-hemodynamic-low-map-resolved"],
      summary: "Synthetic low-MAP episode below the configured demo threshold; medication overlap is not a causal finding.",
    },
  ];
}

function createAlerts(): SimulationAlert[] {
  // The high-priority UC05 alert is emitted only when the replay reaches its
  // canonical trigger event, never preloaded into the case snapshot.
  return [];
}

function createClaims(manifest: SafeAnesScenarioManifest): RecordClaim[] {
  return [
    {
      id: "claim-phenylephrine-administration",
      section: "MEDICATIONS",
      text: "Phenylephrine 100 µg IV administered at 10:33.",
      localizedText: { vi: "Phenylephrine 100 µg đường tĩnh mạch được dùng lúc 10:33." },
      eventTime: at(10, 33),
      clinicalTime: { start: at(10, 33) },
      eventRefs: ["medication-phenylephrine-rescue"],
      conceptId: "MEDICATION_ADMINISTRATION",
      entityId: "PHENYLEPHRINE",
      derivation: {
        method: "DIRECT_EVENT_TEMPLATE",
        description: "Template claim projected from the canonical synthetic medication-administration event.",
        sourceEventTypes: ["MEDICATION_ADMINISTERED"],
      },
      evidenceRefs: [{
        id: "evidence-phenylephrine-administration",
        source: "anesthesia-record",
        sourceType: "MANUAL",
        eventTime: at(10, 33),
        value: "Phenylephrine 100 mcg IV",
        relatedEventIds: ["medication-phenylephrine-rescue"],
      }],
      provenance: "DIRECT",
      reviewStatus: "UNREVIEWED",
    },
    {
      id: "claim-low-map-episode",
      section: "HEMODYNAMICS",
      text: "MAP remained below the configured demo threshold (65 mmHg) from 10:31 to 10:34.",
      localizedText: { vi: "MAP duy trì dưới ngưỡng mô phỏng cấu hình (65 mmHg) từ 10:31 đến 10:34." },
      eventTime: at(10, 31),
      endTime: at(10, 34),
      clinicalTime: { start: at(10, 31), end: at(10, 34) },
      eventRefs: ["episode-hemodynamic-low-map-detected", "episode-hemodynamic-low-map-resolved"],
      conceptId: "HEMODYNAMIC_LOW_MAP_EPISODE",
      entityId: "MAP",
      derivation: {
        method: "THRESHOLD_INTERVAL",
        description: "Synthetic MAP interval compared with the scenario-configured demonstration threshold.",
        sourceEventTypes: ["EPISODE_DETECTED", "EPISODE_RESOLVED"],
        threshold: {
          value: manifest.hemodynamics.hypotensionThresholdMmHg,
          unit: "mmHg",
          label: manifest.hemodynamics.hypotensionThresholdLabel,
        },
      },
      evidenceRefs: [{
        id: "evidence-low-map-observation",
        source: "arterial-line-or2",
        sourceType: "DEVICE",
        eventTime: at(10, 31),
        value: `Synthetic MAP trend; demo threshold ${manifest.hemodynamics.hypotensionThresholdMmHg} mmHg`,
        relatedEventIds: ["episode-hemodynamic-low-map-detected"],
      }],
      provenance: "DERIVED",
      reviewStatus: "UNREVIEWED",
    },
    {
      id: "claim-respiratory-no-breath",
      section: "VENTILATION",
      text: "A no-breath interval was detected at 10:52 (10:52–10:53); no cause or diagnosis is assigned.",
      localizedText: { vi: "Phát hiện khoảng không có nhịp thở từ 10:52 đến 10:53; không quy kết nguyên nhân hoặc chẩn đoán." },
      eventTime: at(10, 52),
      endTime: at(10, 53),
      clinicalTime: { start: at(10, 52), end: at(10, 53) },
      eventRefs: ["respiratory-no-breath-detected", "respiratory-no-breath-resolved"],
      conceptId: "RESPIRATORY_NO_BREATH_INTERVAL",
      entityId: "NO_BREATH_CANDIDATE",
      derivation: {
        method: "EVENT_INTERVAL",
        description: "Synthetic no-breath candidate interval derived from the canonical respiratory episode boundaries.",
        sourceEventTypes: ["EPISODE_DETECTED", "EPISODE_RESOLVED"],
      },
      evidenceRefs: [{
        id: "evidence-respiratory-candidate",
        source: "capnograph-or2",
        sourceType: "DEVICE",
        eventTime: at(10, 52),
        value: "Synthetic no-breath interval candidate",
        relatedEventIds: ["respiratory-no-breath-detected"],
      }],
      provenance: "DERIVED",
      reviewStatus: "UNREVIEWED",
    },
    {
      id: "claim-hemodynamic-improvement-after-phenylephrine",
      section: "HEMODYNAMICS",
      text: "Hemodynamic instability improved after phenylephrine. Temporal overlap only; causality not established. Requires review.",
      localizedText: { vi: "Tình trạng huyết động cải thiện sau khi dùng phenylephrine. Chỉ ghi nhận trùng lặp thời gian; chưa xác lập quan hệ nhân quả. Cần xem xét." },
      eventTime: at(10, 33),
      endTime: at(10, 34),
      clinicalTime: { start: at(10, 33), end: at(10, 34) },
      eventRefs: [
        "medication-phenylephrine-rescue",
        "episode-hemodynamic-low-map-detected",
        "episode-hemodynamic-low-map-resolved",
      ],
      conceptId: "HEMODYNAMIC_RESPONSE_ASSOCIATION",
      entityId: "HEMODYNAMIC_INSTABILITY",
      derivation: {
        method: "TEMPORAL_ASSOCIATION_REQUIRES_REVIEW",
        description: "Template inference based only on temporal overlap and subsequent observation; a response or causal effect is not established.",
        sourceEventTypes: ["MEDICATION_ADMINISTERED", "EPISODE_DETECTED", "EPISODE_RESOLVED"],
      },
      evidenceRefs: [{
        id: "evidence-hemodynamic-temporal-association",
        source: "simulation-event-stream",
        sourceType: "SYSTEM",
        eventTime: at(10, 33),
        value: "Overlapping synthetic events; temporal association does not establish a treatment effect",
        relatedEventIds: ["medication-phenylephrine-rescue", "episode-hemodynamic-low-map-detected"],
      }],
      provenance: "INFERRED",
      reviewStatus: "REQUIRES_REVIEW",
      interpretationLimit: "Temporal overlap and subsequent recovery do not establish medication effect or causality; clinician review is required.",
    },
  ];
}

function createQualityStates(): SignalQualityState[] {
  return [
    qualityState("quality-state-bis", "BIS", "bis-monitor-or2", at(9, 14), 45_000, "DEGRADED", "Synthetic BIS signal quality degradation."),
    qualityState("quality-state-arterial", "MAP", "arterial-line-or2", at(9, 42), 15_000, "INVALIDATED_ARTIFACT", "Synthetic brief arterial-line artifact; raw observation retained."),
    qualityState("quality-state-etco2", "ETCO2", "capnograph-or2", at(10, 2), 12_000, "TECHNICAL_DROPOUT", "Synthetic technical data dropout; no EtCO2 value is imputed."),
    qualityState("quality-state-pump-gateway", "PUMP_GATEWAY_LATENCY", "infusion-pump-or2", at(10, 18), 30_000, "DEGRADED", "Synthetic pump gateway latency increase."),
  ];
}

function qualityState(
  id: string,
  signal: string,
  sourceDevice: string,
  eventTime: number,
  durationMs: number,
  status: SignalQualityState["status"],
  reason: string
): SignalQualityState {
  return { id, signal, sourceDevice, eventTime, recordedTime: eventTime + 100, validUntilTime: eventTime + durationMs, status, reason };
}

function addQualityInterval(
  addEvent: <TPayload>(event: SimulationEvent<TPayload>) => void,
  startId: string,
  endId: string,
  startTime: number,
  durationMs: number,
  signal: string,
  source: string,
  status: SignalQualityState["status"],
  reason: string,
  options: {
    eventType?: string;
    startPayload?: Record<string, unknown>;
    endEventType?: string;
    endPayload?: Record<string, unknown>;
  } = {}
): void {
  addEvent(makeEvent(startId, startTime, source, "DEVICE", options.eventType ?? "SIGNAL_QUALITY_CHANGED", {
    signal,
    quality: status,
    durationMs,
    reason,
    ...options.startPayload,
  }, "DIRECT", { recordedTime: startTime + 100, quality: { status, reason } }));
  addEvent(makeEvent(endId, startTime + durationMs, source, "DEVICE", options.endEventType ?? "SIGNAL_QUALITY_RESTORED", {
    signal,
    quality: "GOOD",
    ...options.endPayload,
  }, "DIRECT", { recordedTime: startTime + durationMs + 100, quality: { status: "GOOD" } }));
}

function makeEvent<TPayload>(
  id: string,
  eventTime: number,
  source: string,
  sourceType: SimulationEvent["sourceType"],
  eventType: string,
  payload: TPayload,
  provenance: SimulationEvent["provenance"],
  options: Pick<SimulationEvent, "recordedTime" | "relatedEventIds" | "quality"> = {}
): SimulationEvent<TPayload> {
  return { id, eventTime, source, sourceType, eventType, payload, provenance, ...options };
}
