import type {
  ClinicalAlert,
  ClinicalEvent,
  DataIntegrityState,
  PerioperativeCaseState,
  PerioperativePhase,
  PhysiologicObservation,
  SignalProvenance,
  SignalQualityStatus,
} from "@/types/uc01";
import type { SimulationSnapshot } from "../types/replay";
import type { ClinicalSignal, Observation } from "../types/observations";
import type { SimulationDevice } from "../types/devices";
import { formatCaseTime } from "../formatTime";
import { runUc01Engine, type UC01SignalState } from "../engines/uc01";

const VITALS = ["MAP", "HR", "SPO2", "ETCO2"] as const;
const INTEGRITY_SIGNALS: readonly ClinicalSignal[] = ["BIS", "MAP", "HR", "SPO2", "ETCO2", "RR"];
const MAX_TREND_AGE_MS = 60 * 60 * 1_000;
const MAX_CONTINUOUS_GAP_MS = 45_000;

const signalPresentation: Record<typeof VITALS[number], { label: string; unit: string; high: number; low: number }> = {
  MAP: { label: "MAP", unit: "mmHg", high: 120, low: 40 },
  HR: { label: "HR", unit: "bpm", high: 140, low: 40 },
  SPO2: { label: "SpO₂", unit: "%", high: 100, low: 90 },
  ETCO2: { label: "EtCO₂", unit: "mmHg", high: 60, low: 20 },
};

/** Workflow projection over the shared case; it does not own separate demo state. */
export function adaptUc01(simulationCase: import("../types/case").SafeAnesSimulationCase) {
  return {
    caseId: simulationCase.encounter.caseId,
    patient: simulationCase.patient,
    encounter: simulationCase.encounter,
    procedure: simulationCase.procedure,
    simulationTime: simulationCase.simulationTime,
    phases: simulationCase.perioperativePhases,
    events: simulationCase.events,
    episodes: simulationCase.episodes,
    activeAlerts: simulationCase.alerts.filter((alert) => alert.status === "ACTIVE"),
  };
}

/** Binds a replay snapshot to the existing UC01 view model without changing its workflow UI. */
export function adaptUc01Snapshot(
  snapshot: SimulationSnapshot,
  baseState: PerioperativeCaseState = createBaseState(snapshot),
): PerioperativeCaseState {
  const uc01 = runUc01Engine(snapshot);
  const time = formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime);
  const phases = mapPhases(uc01.perioperativePhases, snapshot.encounter.startedAt);
  const currentPhase = [...phases].reverse().find((phase) => phase.status === "CURRENT");
  const latestPrediction = [...snapshot.predictions].sort((left, right) => right.timestamp - left.timestamp)[0];
  const observations = VITALS.map((signal) =>
    toPhysiologicObservation(uc01.signals.find((item) => item.signal === signal)!, snapshot, uc01.devices)
  );
  const dataIntegrity = buildDataIntegrity(snapshot, uc01.signals, uc01.devices);
  const recentEvents = mapRecentEvents(snapshot.events, snapshot.encounter.startedAt, uc01.devices);
  const alerts = mapAlerts(snapshot);
  const latestMap = uc01.signals.find((item) => item.signal === "MAP");
  const latestBis = uc01.signals.find((item) => item.signal === "BIS");
  const lowMapEpisode = snapshot.episodes.some((episode) => episode.type === "HYPOTENSION" && episode.status === "ACTIVE");

  return {
    ...baseState,
    patient: {
      ...baseState.patient,
      id: snapshot.patient.patientId,
      name: "Synthetic Demo Patient",
      mrn: snapshot.patient.patientId,
      ageYears: snapshot.patient.ageYears,
      sex: snapshot.patient.sex === "Unknown" ? "Other" : snapshot.patient.sex,
      weightKg: snapshot.patient.weightKg,
      bmi: null,
      asaStatus: `ASA ${snapshot.patient.asa}`,
      procedureName: snapshot.procedure.name,
      anesthesiaPlan: snapshot.procedure.anesthesia,
      allergies: snapshot.patient.allergies.map((allergy) => ({
        allergen: allergy.substance,
        reaction: allergy.reaction,
        severity: allergy.severity,
      })),
    },
    caseContext: {
      ...baseState.caseContext,
      caseId: snapshot.encounter.caseId,
      patientId: snapshot.patient.patientId,
      orRoom: snapshot.procedure.operatingRoom,
      scheduledStartTime: toAmPm(formatCaseTime(snapshot.encounter.startedAt, 0)),
      estimatedDuration: `${Math.floor(snapshot.encounter.scheduledDurationMs / 3_600_000)} h ${String(Math.floor(snapshot.encounter.scheduledDurationMs / 60_000) % 60).padStart(2, "0")} min`,
    },
    checklistSections: baseState.checklistSections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        let label = item.label
          .replaceAll("Eleanor Vance", "Synthetic Demo Patient")
          .replaceAll("PT-94821", snapshot.patient.patientId)
          .replaceAll("94821034", snapshot.patient.patientId);
        const allergyMention = /allerg|penicillin/i.test(label);
        if (allergyMention && snapshot.patient.allergies.length === 0) {
          return {
            ...item,
            label: "Allergy information not supplied in this synthetic case",
            status: "PENDING" as const,
            timestamp: undefined,
            completedBy: undefined,
            details: "The shared synthetic patient model contains no allergy observation.",
          };
        }
        if (allergyMention && snapshot.patient.allergies.length > 0) {
          label = label.replace(/Penicillin \(Anaphylaxis\)/i, snapshot.patient.allergies.map((allergy) => `${allergy.substance} (${allergy.reaction})`).join(", "));
        }
        return { ...item, label };
      }),
    })),
    simulationTime: snapshot.simulationTime,
    deviceStatus: {
      ...baseState.deviceStatus,
      networkConnected: uc01.devices.every((device) => device.status !== "DISCONNECTED"),
      telemetrySynced: dataIntegrity.clockSync.clockStatus === "Synchronized",
      systemTime: toAmPm(time),
      systemDate: snapshot.encounter.startedAt.slice(0, 10),
    },
    phases,
    activePhaseId: currentPhase?.id ?? baseState.activePhaseId,
    estimatedEndTime: formatCaseTime(snapshot.encounter.startedAt, snapshot.encounter.scheduledDurationMs),
    observations,
    alerts,
    recentEvents,
    dataIntegrity,
    situationAwareness: {
      ...baseState.situationAwareness,
      hemodynamicStatus: {
        status: lowMapEpisode ? "Unstable" : latestMap?.quality === "UNKNOWN" ? "Guarded" : "Stable",
        details: lowMapEpisode
          ? "Synthetic low-MAP episode is active; review the displayed measurements and evidence."
          : latestMap?.value === null
            ? "MAP is not currently available as a fresh, valid observation."
            : "Status reflects the current synthetic MAP observation stream.",
      },
      anesthesiaDepth: {
        ...baseState.situationAwareness.anesthesiaDepth,
        ...(latestBis?.value !== null && latestBis?.value !== undefined ? { bisValue: latestBis.value } : {}),
      },
      surgicalProgress: {
        ...baseState.situationAwareness.surgicalProgress,
        phaseDetail: currentPhase
          ? `${currentPhase.label} is active on the synthetic workflow timeline.`
          : "No active phase is recorded at this simulation time.",
      },
      predictedRisk: {
        ...baseState.situationAwareness.predictedRisk,
        available: Boolean(latestPrediction),
        riskLevel: latestPrediction
          ? latestPrediction.probability >= 0.75 ? "High" : latestPrediction.probability >= 0.4 ? "Moderate" : "Low"
          : "Unavailable",
        primaryRisk: latestPrediction
          ? `${latestPrediction.task} · synthetic demo estimate`
          : "No synthetic model estimate is available at this simulation time.",
        modelName: latestPrediction?.modelId ?? "No estimate available",
        horizonMinutes: latestPrediction?.horizonMinutes ?? 0,
        probabilityPercent: latestPrediction ? Math.round(latestPrediction.probability * 100) : 0,
        confidence: latestPrediction
          ? latestPrediction.confidence >= 0.75 ? "High" : latestPrediction.confidence >= 0.45 ? "Medium" : "Low"
          : "Low",
        dataCoveragePercent: latestPrediction ? Math.round(latestPrediction.dataCoverage * 100) : 0,
        missingSignals: latestPrediction?.missingModalities ?? [],
        isModelEstimate: true,
      },
    },
  };
}

function createBaseState(snapshot: SimulationSnapshot): PerioperativeCaseState {
  const startTime = formatCaseTime(snapshot.encounter.startedAt, 0);
  const estimatedEndTime = formatCaseTime(snapshot.encounter.startedAt, snapshot.encounter.scheduledDurationMs);
  const phases = mapPhases(snapshot.perioperativePhases, snapshot.encounter.startedAt);
  const currentPhase = [...phases].reverse().find((phase) => phase.status === "CURRENT");
  const batteryValues = snapshot.devices
    .map((device) => device.batteryPercent)
    .filter((value): value is number => value !== undefined);
  const patient: PerioperativeCaseState["patient"] = {
    id: snapshot.patient.patientId,
    name: "Synthetic Demo Patient",
    mrn: snapshot.patient.patientId,
    ageYears: snapshot.patient.ageYears,
    sex: snapshot.patient.sex === "Unknown" ? "Other" : snapshot.patient.sex,
    weightKg: snapshot.patient.weightKg,
    bmi: null,
    asaStatus: `ASA ${snapshot.patient.asa}`,
    procedureName: snapshot.procedure.name,
    primarySurgeon: snapshot.procedure.surgeon ?? "Not recorded in this synthetic case",
    anesthesiaPlan: snapshot.procedure.anesthesia,
    allergies: snapshot.patient.allergies.map((allergy) => ({
      allergen: allergy.substance,
      reaction: allergy.reaction,
      severity: allergy.severity,
    })),
  };
  const eventAt = (eventType: string, payloadKey?: string, payloadValue?: string) =>
    snapshot.events.find((event) => event.eventType === eventType &&
      (payloadKey === undefined || (event.payload as Record<string, unknown>)[payloadKey] === payloadValue));
  const checklistItem = (
    id: string,
    sectionId: string,
    label: string,
    event: typeof snapshot.events[number] | undefined,
  ) => ({
    id,
    sectionId,
    label,
    status: event ? "COMPLETED" as const : "PENDING" as const,
    timestamp: event ? formatCaseTime(snapshot.encounter.startedAt, event.eventTime).slice(0, 5) : undefined,
    source: event ? "Canonical simulation event" : undefined,
    provenance: event?.provenance,
    details: event ? `Recorded from ${event.source}.` : "No completion event is recorded yet.",
  });
  const workflowEvents = [
    checklistItem("patient-entered-or", "pre-induction", "Patient entered operating room", eventAt("PATIENT_ENTERED_OR")),
    checklistItem("induction-started", "pre-induction", "Induction started", eventAt("PHASE_STARTED", "phaseId", "induction")),
    checklistItem("airway-secured", "pre-induction", "Airway secured", eventAt("AIRWAY_SECURED")),
    checklistItem("maintenance-started", "intraoperative", "Maintenance started", eventAt("PHASE_STARTED", "phaseId", "maintenance")),
    checklistItem("procedure-started", "intraoperative", "Surgery started", eventAt("PROCEDURE_STARTED")),
    checklistItem("closure-started", "intraoperative", "Closure started", eventAt("PHASE_STARTED", "phaseId", "closure")),
    checklistItem("emergence-started", "emergence", "Emergence started", eventAt("PHASE_STARTED", "phaseId", "emergence")),
    checklistItem("patient-transferred", "postoperative", "Patient transferred to PACU", eventAt("PATIENT_TRANSFERRED")),
    checklistItem("case-completed", "postoperative", "Case completed", eventAt("CASE_COMPLETED")),
  ];
  const section = (id: string, title: string, phaseTab: "Pre-induction" | "Intraoperative" | "Emergence" | "Postoperative") => ({
    id,
    title,
    phaseTab,
    items: workflowEvents.filter((item) => item.sectionId === id),
  });

  return {
    patient,
    caseContext: {
      caseId: snapshot.encounter.caseId,
      patientId: snapshot.patient.patientId,
      orRoom: snapshot.procedure.operatingRoom,
      scheduledStartTime: startTime,
      estimatedDuration: `${Math.floor(snapshot.encounter.scheduledDurationMs / 3_600_000)} h ${String(Math.floor(snapshot.encounter.scheduledDurationMs / 60_000) % 60).padStart(2, "0")} min`,
      surgicalTeam: {
        leadSurgeon: snapshot.procedure.surgeon ?? "Not recorded in this synthetic case",
        service: snapshot.procedure.service ?? "Not recorded in this synthetic case",
      },
      anesthesiaTeam: {
        attending: "Not recorded in this synthetic case",
        crna: "Not recorded in this synthetic case",
      },
      patientPosition: "Not recorded in this synthetic case",
      specialEquipment: [],
      bloodLossRisk: "Not assessed",
      bloodProducts: "Not recorded in this synthetic case",
      antibioticProphylaxis: {
        medication: "Not recorded in this synthetic case",
        timing: "Not recorded in this synthetic case",
      },
    },
    deviceStatus: {
      ...(batteryValues.length ? {
        batteryPercent: Math.round(batteryValues.reduce((sum, value) => sum + value, 0) / batteryValues.length),
        batterySegments: Math.round(batteryValues.reduce((sum, value) => sum + value, 0) / batteryValues.length / 25),
      } : {}),
      networkConnected: snapshot.devices.every((device) => device.status !== "DISCONNECTED"),
      telemetrySynced: snapshot.devices.every((device) => Math.abs(device.clockOffsetMs) <= 100),
      systemTime: startTime,
      systemDate: snapshot.encounter.startedAt.slice(0, 10),
    },
    phases,
    activePhaseId: currentPhase?.id ?? phases[0]?.id ?? "preoperative",
    estimatedEndTime,
    checklistSections: [
      section("pre-induction", "Pre-induction", "Pre-induction"),
      section("intraoperative", "Intraoperative", "Intraoperative"),
      section("emergence", "Emergence", "Emergence"),
      section("postoperative", "Postoperative", "Postoperative"),
    ],
    observations: [],
    dataIntegrity: buildDataIntegrity(snapshot, runUc01Engine(snapshot).signals, runUc01Engine(snapshot).devices),
    situationAwareness: {
      hemodynamicStatus: { status: "Guarded", details: "No current MAP assessment is available." },
      anesthesiaDepth: { status: "Adequate", bisValue: 0, targetRange: "Not supplied" },
      surgicalProgress: { status: "On track", phaseDetail: "No active phase is recorded." },
      predictedRisk: {
        riskLevel: "Unavailable", primaryRisk: "No estimate available", modelName: "No estimate available",
        horizonMinutes: 0, probabilityPercent: 0, confidence: "Low", dataCoveragePercent: 0,
        missingSignals: [], isModelEstimate: true, available: false,
      },
    },
    alerts: [],
    recentEvents: [],
  };
}

function mapPhases(
  phases: SimulationSnapshot["perioperativePhases"],
  startedAt: string
): PerioperativePhase[] {
  return phases.map((phase) => ({
    id: phase.id,
    label: phase.label,
    startTime: formatCaseTime(startedAt, phase.startTime).slice(0, 5),
    status: phase.status,
    source: "Simulation event stream",
    details: phase.endTime !== undefined ? `Synthetic phase interval ending ${formatCaseTime(startedAt, phase.endTime).slice(0, 5)}.` : undefined,
  }));
}

function toPhysiologicObservation(
  signalState: UC01SignalState,
  snapshot: SimulationSnapshot,
  devices: SimulationDevice[]
): PhysiologicObservation {
  const parameter = signalState.signal as typeof VITALS[number];
  const presentation = signalPresentation[parameter];
  const rawHistory = snapshot.observations.filter((observation) =>
    observation.signal === parameter &&
    observation.eventTime <= snapshot.simulationTime &&
    snapshot.simulationTime - observation.eventTime <= MAX_TREND_AGE_MS &&
    !observation.imputed &&
    observation.quality.status !== "INVALIDATED_ARTIFACT" &&
    typeof observation.value === "number"
  );
  const values = rawHistory.map((observation) => observation.value as number);
  const source = sourceDeviceName(signalState.sourceDevice, devices);

  return {
    id: `uc01-${parameter.toLowerCase()}`,
    parameter,
    label: presentation.label,
    value: signalState.value,
    unit: presentation.unit,
    timestamp: formatCaseTime(snapshot.encounter.startedAt, signalState.eventTime ?? snapshot.simulationTime),
    source,
    quality: normalizeUiQuality(signalState.quality),
    highLimit: presentation.high,
    lowLimit: presentation.low,
    sparklinePoints: buildTrendPath(rawHistory, 100, 20, snapshot.simulationTime),
    fullTrendPoints: buildTrendPath(rawHistory, 280, 60, snapshot.simulationTime),
    meanValue: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 1) : undefined,
    minValue: values.length ? Math.min(...values) : undefined,
    maxValue: values.length ? Math.max(...values) : undefined,
  };
}

function buildDataIntegrity(
  snapshot: SimulationSnapshot,
  signalStates: UC01SignalState[],
  devices: SimulationDevice[]
): DataIntegrityState {
  const deviceSources = devices.map((device) => ({
    id: device.id,
    name: device.name,
    model: "Synthetic OR source",
    status: device.status,
    latencyMs: device.latencyMs,
    clockOffsetMs: device.clockOffsetMs,
    lastMessageAt: device.lastMessageAt === null
      ? "No message received"
      : formatCaseTime(snapshot.encounter.startedAt, device.lastMessageAt),
  }));
  const signals: SignalProvenance[] = INTEGRITY_SIGNALS.map((signal) => {
    const state = signalStates.find((candidate) => candidate.signal === signal)!;
    const device = devices.find((candidate) => candidate.id === state.sourceDevice || candidate.sourceIds.includes(state.sourceDevice));
    return {
      signalId: `sig-${signal.toLowerCase()}`,
      signalName: signalLabel(signal),
      sourceDevice: device?.name ?? (state.sourceDevice || "No source recorded"),
      nativeSamplingRate: signal === "ETCO2" || signal === "RR" ? "1 sample / 30 s" : "1 sample / 30 s",
      eventTime: state.eventTime === null ? "—" : formatCaseTime(snapshot.encounter.startedAt, state.eventTime),
      receivedTime: state.receivedTime === null ? "—" : formatCaseTime(snapshot.encounter.startedAt, state.receivedTime),
      clockUncertainty: device ? formatOffset(device.clockOffsetMs) : "Unknown",
      qualityState: normalizeUiQuality(state.quality),
      transformationStatus: state.provenance === "DIRECT" || state.provenance === null ? "RAW" : "DERIVED",
      isImputed: state.imputed,
      provenance: state.provenance ?? undefined,
      qualityNotes: state.reason,
    };
  });

  const monitor = devices.find((device) => device.kind === "PATIENT_MONITOR");
  const anesthesiaMachine = devices.find((device) => device.kind === "ANESTHESIA_MACHINE");
  const pump = devices.find((device) => device.kind === "INFUSION_PUMP_GATEWAY");
  const maxOffset = Math.max(...devices.map((device) => Math.abs(device.clockOffsetMs)));
  const hasDisconnectedDevice = devices.some((device) => device.status === "DISCONNECTED");
  return {
    deviceSources,
    signals,
    clockSync: {
      referenceClock: "Simulation clock · case-relative",
      clockStatus: hasDisconnectedDevice ? "Unsynchronized" : maxOffset > 100 ? "Drifting" : "Synchronized",
      monitorOffset: monitor ? formatOffset(monitor.clockOffsetMs) : "Unknown",
      anesthesiaMachineOffset: anesthesiaMachine ? formatOffset(anesthesiaMachine.clockOffsetMs) : "Unknown",
      pumpGatewayOffset: pump ? formatOffset(pump.clockOffsetMs) : "Unknown",
    },
  };
}

function mapRecentEvents(
  events: SimulationSnapshot["events"],
  startedAt: string,
  devices: SimulationDevice[]
): ClinicalEvent[] {
  const relevant = events.filter((event) => [
    "CASE_STARTED", "PHASE_STARTED", "PATIENT_ENTERED_OR", "AIRWAY_SECURED", "PROCEDURE_STARTED", "PATIENT_TRANSFERRED", "CASE_COMPLETED",
    "SIGNAL_QUALITY_CHANGED", "SIGNAL_QUALITY_RESTORED", "DEVICE_LATENCY_INCREASED", "DEVICE_LATENCY_RECOVERED",
    "EPISODE_DETECTED", "EPISODE_RESOLVED", "MEDICATION_ADMINISTERED", "MEDICATION_INFUSION_STARTED",
  ].includes(event.eventType));
  return relevant.slice(-12).reverse().map((event) => {
    const payload = recordPayload(event.payload);
    const signal = typeof payload.signal === "string" ? payload.signal : undefined;
    const quality = typeof payload.quality === "string" ? payload.quality : undefined;
    const title = eventTitle(event.eventType, payload);
    const latency = typeof payload.latencyMs === "number" ? `Latency ${payload.latencyMs} ms.` : undefined;
    const reason = typeof payload.reason === "string" ? payload.reason : undefined;
    const detailParts = [signal, quality, latency, reason].filter((part): part is string => Boolean(part));
    return {
      id: event.id,
      time: formatCaseTime(startedAt, event.eventTime).slice(0, 5),
      event: title,
      source: sourceDeviceName(event.source, devices),
      details: detailParts.join(" · ") || event.eventType.replaceAll("_", " "),
    };
  });
}

function mapAlerts(snapshot: SimulationSnapshot): ClinicalAlert[] {
  return snapshot.alerts.map((alert) => ({
    id: alert.id,
    severity: alert.severity === "HIGH" ? "HIGH" : alert.severity === "MEDIUM" ? "ADVISORY" : "INFO",
    title: alert.title,
    details: alert.message,
    timestamp: formatCaseTime(snapshot.encounter.startedAt, alert.eventTime),
    firstTriggerTime: formatCaseTime(snapshot.encounter.startedAt, alert.eventTime),
    sourceType: alert.ruleId ? "RULE" : "MODEL",
    patientData: `${snapshot.patient.ageYears} y · ${snapshot.patient.sex} · ${snapshot.patient.weightKg} kg · ASA ${snapshot.patient.asa}`,
    source: alert.sourceModule,
    provenance: alert.provenance,
    ruleOrModel: alert.ruleLabel ?? alert.ruleId ?? alert.sourceModule,
    currentStatus: alert.status,
  }));
}

function buildTrendPath(observations: Observation[], width: number, height: number, simulationTime: number): string {
  if (observations.length < 2) return "";
  const values = observations.map((item) => item.value as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = max === min ? Math.max(1, Math.abs(max) * 0.05) : (max - min) * 0.12;
  const low = min - padding;
  const range = max - min + padding * 2;
  const start = Math.max(0, simulationTime - MAX_TREND_AGE_MS);
  const end = simulationTime;
  let previous: Observation | undefined;
  let path = "";
  for (const observation of observations) {
    const x = end === start ? width : ((observation.eventTime - start) / (end - start)) * width;
    const y = height - ((observation.value as number - low) / range) * height;
    const command = !previous || observation.eventTime - previous.eventTime > MAX_CONTINUOUS_GAP_MS ? "M" : "L";
    path += `${command} ${x.toFixed(1)} ${y.toFixed(1)} `;
    previous = observation;
  }
  return path.trim();
}

function eventTitle(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case "SIGNAL_QUALITY_CHANGED": {
      const signal = displayEventSignal(payload.signal);
      const quality = String(payload.quality ?? "changed");
      if (quality === "INVALIDATED_ARTIFACT") return `${signal} artifact`;
      if (quality === "TECHNICAL_DROPOUT") return `${signal} dropout`;
      if (quality === "EXPECTED_INTERMITTENT") return `${signal} intermittent`;
      return `${signal} degraded`;
    }
    case "SIGNAL_QUALITY_RESTORED": return `${displayEventSignal(payload.signal)} restored`;
    case "DEVICE_LATENCY_INCREASED": return "Pump latency high";
    case "DEVICE_LATENCY_RECOVERED": return "Pump latency normal";
    case "EPISODE_DETECTED": return String(payload.type ?? "Clinical episode") + " detected";
    case "EPISODE_RESOLVED": return "Clinical episode resolved";
    case "MEDICATION_ADMINISTERED": return `${String(payload.name ?? "Medication")} administered`;
    case "MEDICATION_INFUSION_STARTED": return `${String(payload.name ?? "Medication")} infusion started`;
    case "PHASE_STARTED": return `${String(payload.label ?? "Perioperative phase")} started`;
    case "PATIENT_ENTERED_OR": return "Patient entered OR";
    case "AIRWAY_SECURED": return "Airway secured";
    case "PROCEDURE_STARTED": return "Surgery started";
    case "PATIENT_TRANSFERRED": return `Transfer to ${String(payload.destination ?? "PACU")}`;
    case "CASE_COMPLETED": return "Case completed";
    case "CASE_STARTED": return "Case started";
    default: return eventType.replaceAll("_", " ");
  }
}

function displayEventSignal(signal: unknown): string {
  if (signal === "ETCO2") return "EtCO₂";
  return typeof signal === "string" ? signal : "Signal";
}

function signalLabel(signal: ClinicalSignal): string {
  const labels: Partial<Record<ClinicalSignal, string>> = { SPO2: "SpO₂", ETCO2: "EtCO₂", CAPNOGRAM: "Capnogram" };
  return labels[signal] ?? signal;
}

function sourceDeviceName(sourceId: string, devices: SimulationDevice[]): string {
  return devices.find((device) => device.id === sourceId || device.sourceIds.includes(sourceId))?.name ?? (sourceId || "—");
}

function normalizeUiQuality(status: string): SignalQualityStatus {
  return status === "UNAVAILABLE" ? "UNKNOWN" : status as SignalQualityStatus;
}

function formatOffset(offset: number): string {
  return `${offset > 0 ? "+" : offset < 0 ? "−" : "±"}${Math.abs(offset)} ms`;
}

function toAmPm(time: string): string {
  const [hours = "00", minutes = "00", seconds = "00"] = time.split(":");
  const numericHour = Number(hours);
  return `${String(numericHour % 12 || 12).padStart(2, "0")}:${minutes}:${seconds} ${numericHour >= 12 ? "PM" : "AM"}`;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function recordPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
