import type {
  CaseAlert,
  DeviceStatus,
  ForecastHorizon,
  HemodynamicEvent,
  HemodynamicPrediction,
  HemodynamicRelationshipState,
  HemodynamicTrendSample,
  HemodynamicVitals,
  PatientContext,
} from "@/types/uc04";
import { adaptUc04 } from "@/simulation/adapters/uc04Adapter";
import { formatCaseTime } from "@/simulation/formatTime";
import { runUc01Engine } from "@/simulation/engines/uc01";
import type { ClinicalSignal, Observation } from "@/simulation/types/observations";
import type { SimulationSnapshot } from "@/simulation/types/replay";
import type { WaveformSegment } from "@/simulation/types/waveforms";
import type { WaveformRenderSource } from "@/simulation/types/waveforms";
import { createClinicalWaveformSource } from "@/simulation/adapters/waveformAdapter";
import type { UC04VitalDbProjection, VitalDbPrediction } from "@/adapters/uc04VitalDbAdapter";

export interface UC04CaseViewModel {
  patientContext: PatientContext;
  deviceStatus: DeviceStatus;
  vitals: HemodynamicVitals;
  trendSamples: HemodynamicTrendSample[];
  prediction: HemodynamicPrediction;
  forecastHorizons: ForecastHorizon[];
  relationship: HemodynamicRelationshipState;
  events: HemodynamicEvent[];
  activeAlert: CaseAlert | null;
  simulationTimeMs: number | null;
  trendWindow: { start: string; end: string };
  abpWaveform: WaveformSegment | null;
  abpWaveformSource: WaveformRenderSource;
  abpWaveformTimestamp: string | null;
  medicationOverlap: { timestamp: string; medicationName: string } | null;
  riskAlertThresholdPercent: number | null;
}

/** Projects the shared, replay-gated case state into the existing UC04 UI. */
export function getUC04SimulationViewModel(snapshot: SimulationSnapshot): UC04CaseViewModel {
  const projection = adaptUc04(snapshot);
  const acquisition = runUc01Engine(snapshot);
  const config = projection.scenarioManifest.hemodynamics;
  const latestPredictionTime = projection.predictions.reduce(
    (latest, prediction) => Math.max(latest, prediction.timestamp),
    -1
  );
  const currentPredictions = projection.predictions.filter((prediction) => prediction.timestamp === latestPredictionTime);
  const latestFiveMinute = currentPredictions.find((prediction) => prediction.horizonMinutes === 5);
  const currentRiskPercent = latestFiveMinute ? Math.round(latestFiveMinute.probability * 100) : null;
  const simulationTimeMs = snapshot.simulationTime;
  const windowStartMs = Math.max(0, simulationTimeMs - 30 * 60_000);
  const windowEndMs = Math.max(30 * 60_000, windowStartMs + 30 * 60_000);
  const trendSamples = buildTrendSamples(snapshot, windowStartMs, simulationTimeMs);
  const latestSignal = (signal: ClinicalSignal) => acquisition.signals.find((item) => item.signal === signal);
  const map = latestSignal("MAP")?.value ?? null;
  const sv = latestSignal("SV")?.value ?? null;
  const svv = latestSignal("SVV")?.value ?? null;
  const ci = latestSignal("CI")?.value ?? null;
  const svr = latestSignal("SVR")?.value ?? null;
  const vitals: HemodynamicVitals = {
    map: roundNullable(map, 0),
    ci: roundNullable(ci, 1),
    sv: roundNullable(sv, 0),
    svv: roundNullable(svv, 0),
    svr: roundNullable(svr, 0),
    hpi: currentRiskPercent,
    timestamp: formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime),
  };
  const forecastHorizons = config.horizonsMinutes.map((minute): ForecastHorizon => {
    const prediction = currentPredictions.find((item) => item.horizonMinutes === minute);
    const riskPercent = prediction ? Math.round(prediction.probability * 100) : null;
    return { minute, riskPercent, riskLevel: riskLevel(riskPercent) };
  });
  const prediction: HemodynamicPrediction = {
    timestamp: vitals.timestamp,
    horizonMinutes: latestFiveMinute?.horizonMinutes ?? 5,
    available: latestFiveMinute !== undefined,
    hpiRisk: currentRiskPercent,
    confidence: confidenceLabel(latestFiveMinute?.confidence),
    dataCoverage: latestFiveMinute ? Math.round(latestFiveMinute.dataCoverage * 100) : null,
    missingSignals: latestFiveMinute?.missingModalities ?? ["MAP", "ABP", "HR", "SV", "SVV", "CI", "SVR"],
    modelId: latestFiveMinute?.modelId ?? config.modelId,
    modelVersion: latestFiveMinute?.modelVersion ?? config.modelVersion,
    synthetic: true,
    clinicalUse: false,
    riskPercent: currentRiskPercent,
    thresholdMmHg: config.hypotensionThresholdMmHg,
  };

  const relationship = relationshipState({ map, sv, svv, ci, svr, trendSamples });
  const latestAlert = projection.alerts
    .filter((item) => item.code === "DEMO-HPI-01")
    .sort((left, right) => (right.lastEvaluatedTime ?? right.eventTime) - (left.lastEvaluatedTime ?? left.eventTime))[0];
  const activeAlert: CaseAlert | null = latestAlert ? {
    id: latestAlert.id,
    priority: alertPriority(latestAlert.severity),
    title: latestAlert.title,
    subtitle: latestAlert.message,
    timestamp: formatCaseTime(snapshot.encounter.startedAt, latestAlert.firstTriggerTime ?? latestAlert.eventTime),
    recommendedActions: [],
    demoOnly: true,
    clinicalUse: false,
    riskPercent: latestAlert.riskProbability === undefined ? null : Math.round(latestAlert.riskProbability * 100),
    leadTimeMinutes: latestAlert.leadTimeMinutes,
    thresholdMmHg: latestAlert.thresholdMmHg,
    modelId: latestAlert.modelId,
    modelVersion: latestAlert.modelVersion,
    ageMinutes: Math.max(0, Math.floor((snapshot.simulationTime - (latestAlert.firstTriggerTime ?? latestAlert.eventTime)) / 60_000)),
    status: latestAlert.status === "RESOLVED" ? "RESOLVED" : "ACTIVE",
    confidencePercent: latestFiveMinute ? Math.round(latestFiveMinute.confidence * 100) : null,
    dataCoveragePercent: latestFiveMinute ? Math.round(latestFiveMinute.dataCoverage * 100) : null,
    missingSignals: latestFiveMinute?.missingModalities ?? ["MAP", "ABP", "HR", "SV", "SVV", "CI", "SVR"],
  } : null;

  const events = buildEvents(snapshot);
  const medicationOverlap = findPhenylephrineOverlap(snapshot);
  const abpWaveform = latestAbpWaveform(snapshot);
  const abpWaveformSource = createClinicalWaveformSource(
    snapshot,
    "ABP",
    "arterial-line-or2",
    "MAP",
    "mmHg",
    0,
    150
  );
  const signalsAreDegraded = acquisition.devices.some((device) => device.status === "DEGRADED") ||
    acquisition.activeQualityStates.some((quality) => quality.status === "DEGRADED" || quality.status === "INVALIDATED_ARTIFACT");

  return {
    patientContext: {
      ageGroup: `${snapshot.patient.ageYears}y ${snapshot.patient.sex}`,
      orRoom: snapshot.procedure.operatingRoom,
      anesthesiaType: snapshot.procedure.anesthesia,
    },
    deviceStatus: {
      telemetryOnline: acquisition.devices.some((device) => device.status !== "DISCONNECTED"),
      linkActive: acquisition.devices.every((device) => device.status !== "DISCONNECTED"),
      signalQuality: signalsAreDegraded ? "DEGRADED" : "OPTIMAL",
    },
    vitals,
    trendSamples,
    prediction,
    forecastHorizons,
    relationship,
    events,
    activeAlert,
    simulationTimeMs,
    trendWindow: {
      start: formatCaseTime(snapshot.encounter.startedAt, windowStartMs),
      end: formatCaseTime(snapshot.encounter.startedAt, windowEndMs),
    },
    abpWaveform,
    abpWaveformSource,
    abpWaveformTimestamp: formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime),
    medicationOverlap,
    riskAlertThresholdPercent: config.alertTriggerProbability * 100,
  };
}

/** Projects real VitalDB recordings without mapping an uncalibrated score to HPI/risk. */
export function getUC04VitalDbWorkspaceViewModel(
  view: UC04VitalDbProjection | null,
  displayTimeSeconds: number,
  modelReadinessStatus = "MODEL_NOT_READY"
): UC04CaseViewModel {
  if (!view) {
    return getUC04VitalDbWorkspaceViewModel({
      case_id: "",
      dataset: "VitalDB",
      dataset_version: "NOT_RECORDED",
      as_of_s: displayTimeSeconds,
      window_start_s: Math.max(0, displayTimeSeconds - 1800),
      window_end_s: displayTimeSeconds,
      available_tracks: [],
      signals: [],
      abp_waveform: null,
      events: [],
      prediction_cache_status: "NOT_READY",
      asOfSeconds: displayTimeSeconds,
      latestBySignal: {},
      predictions: [],
      latestPredictions: [],
      predictionCacheStatus: "NOT_READY",
      abstainedWindowCount: null,
      inferenceWindowCount: null,
      predictionCount: null,
      windowEligibility: "UNKNOWN",
      windowReason: null,
      windowPredictionTimeSeconds: null,
      windowStartSeconds: null,
      windowEndSeconds: null,
      model: {
        model_id: "SafeAnes-UC04-HypoFormer",
        model_version: "NOT_RECORDED",
        artifact_sha256: "NOT_RECORDED",
        task: "NOT_RECORDED",
        output_semantics: "NOT_RECORDED",
        calibration_status: "NOT_RECORDED",
        horizons_minutes: [],
        readiness_status: modelReadinessStatus,
        inference_contract_mode: "VERIFIED_MODEL_CONTRACT",
        clinical_use: false,
      },
    }, displayTimeSeconds);
  }
  const latestValue = (signal: string) => {
    const sample = view.latestBySignal[signal];
    return sample && !sample.is_missing && typeof sample.value === "number" && Number.isFinite(sample.value)
      ? sample.value
      : null;
  };
  const fiveMinute = [...view.latestPredictions]
    .filter((item) => item.horizon_minutes_or_null === 5)
    .sort((left, right) => right.prediction_time - left.prediction_time)[0];
  const primaryOutput = fiveMinute ?? [...view.latestPredictions]
    .filter((item) => item.horizon_minutes_or_null !== null)
    .sort((left, right) => Number(left.horizon_minutes_or_null) - Number(right.horizon_minutes_or_null))[0];
  const modelMetadata = view.model ?? {
    model_id: "NOT_RECORDED",
    model_version: "NOT_RECORDED",
    artifact_sha256: "NOT_RECORDED",
    task: "NOT_RECORDED",
    output_semantics: "NOT_RECORDED",
    calibration_status: "NOT_RECORDED",
    horizons_minutes: [],
    readiness_status: modelReadinessStatus,
    inference_contract_mode: "VERIFIED_MODEL_CONTRACT",
    clinical_use: false as const,
  };
  const score = primaryOutput?.interpreted_output.value ?? null;
  const timeKeys = new Set<number>();
  for (const series of view.signals) {
    for (const observation of series.observations) timeKeys.add(observation.timestamp);
  }
  for (const item of view.predictions) {
    if (item.horizon_minutes_or_null === 5) timeKeys.add(item.prediction_time);
  }
  const sampleAt = (signal: string, time: number) => {
    const observation = view.signals.find((series) => series.signal === signal)?.observations
      .find((sample) => sample.timestamp === time);
    return observation && !observation.is_missing && typeof observation.value === "number"
      ? observation.value
      : null;
  };
  const scoreAt = (time: number) => view.predictions.find((item) =>
    item.prediction_time === time && item.horizon_minutes_or_null === 5
  )?.interpreted_output.value ?? null;
  const trendSamples: HemodynamicTrendSample[] = [...timeKeys].sort((a, b) => a - b).map((time) => ({
    timestamp: formatRelativeTime(time),
    map: sampleAt("MAP", time),
    sbp: sampleAt("SBP", time),
    dbp: sampleAt("DBP", time),
    hr: sampleAt("HR", time),
    ci: sampleAt("CI", time),
    sv: sampleAt("SV", time),
    svv: sampleAt("SVV", time),
    svr: sampleAt("SVR", time),
    modelOutputScore: scoreAt(time),
  }));

  const asOfTime = formatRelativeTime(view.asOfSeconds);
  const numericVitals: Record<string, number | null> = {
    map: latestValue("MAP"),
    ci: latestValue("CI"),
    sv: latestValue("SV"),
    svv: latestValue("SVV"),
    svr: latestValue("SVR"),
  };
  const prediction: HemodynamicPrediction = {
    timestamp: asOfTime,
    horizonMinutes: primaryOutput?.horizon_minutes_or_null ?? null,
    available: primaryOutput !== undefined,
    hpiRisk: null,
    confidence: "unavailable",
    dataCoverage: primaryOutput ? Math.round(primaryOutput.data_coverage * 100) : null,
    missingSignals: primaryOutput?.missing_features ?? [],
    modelId: primaryOutput?.model_id ?? modelMetadata.model_id,
    modelVersion: primaryOutput?.model_version ?? modelMetadata.model_version,
    outputValue: score,
    outputSemantics: primaryOutput?.interpreted_output.kind ?? modelMetadata.output_semantics,
    calibrated: primaryOutput?.calibrated_or_not ?? null,
    task: primaryOutput?.task ?? modelMetadata.task,
    qualityStatus: primaryOutput?.quality ?? "UNKNOWN",
    readinessStatus: modelMetadata.readiness_status ?? modelReadinessStatus,
    predictionCacheStatus: view.predictionCacheStatus,
    windowEligibility: view.windowEligibility,
    windowReason: view.windowReason,
    windowPredictionTimeSeconds: view.windowPredictionTimeSeconds,
    windowStartSeconds: view.windowStartSeconds,
    windowEndSeconds: view.windowEndSeconds,
    abstainedWindowCount: view.abstainedWindowCount,
  };
  const forecastHorizons: ForecastHorizon[] = view.latestPredictions
    .filter((item) => item.horizon_minutes_or_null !== null)
    .sort((a, b) => Number(a.horizon_minutes_or_null) - Number(b.horizon_minutes_or_null))
    .map((item) => ({
      minute: Number(item.horizon_minutes_or_null),
      riskPercent: null,
      riskLevel: "unavailable",
      outputValue: item.interpreted_output.value,
    }));

  const events: HemodynamicEvent[] = view.events.map((event, index) => ({
    id: `vitaldb-event-${event.timestamp}-${index}`,
    timestamp: formatRelativeTime(event.timestamp),
    simulationTime: event.timestamp * 1_000,
    priority: "INFO",
    type: "VITALDB_ANNOTATION",
    details: event.description,
    action: event.source ?? "VitalDB",
  }));
  const map = numericVitals.map;
  const pillar = (
    title: string,
    label1: string,
    value1: number | null,
    unit1: string,
    label2: string,
    value2: number | null,
    unit2: string,
  ) => ({
    title,
    metric1: { label: label1, value: value1, unit: unit1, changePercent: null,
      trend: trendSamples.map((sample) => sample[label1.toLowerCase() as keyof HemodynamicTrendSample] as number | null) },
    metric2: { label: label2, value: value2, unit: unit2, changePercent: null },
    footerSubtitle: "VitalDB recorded values",
    footerTitle: "No causal interpretation",
  });

  return {
    patientContext: { ageGroup: "NOT_RECORDED", orRoom: "NOT_RECORDED", anesthesiaType: "NOT_RECORDED" },
    deviceStatus: { telemetryOnline: false, linkActive: false, signalQuality: "NO_SIGNAL" },
    vitals: {
      map: numericVitals.map,
      ci: numericVitals.ci,
      sv: numericVitals.sv,
      svv: numericVitals.svv,
      svr: numericVitals.svr,
      hpi: null,
      modelOutputScore: score,
      timestamp: asOfTime,
    },
    trendSamples,
    prediction,
    forecastHorizons,
    relationship: {
      map: { value: map, changePercent: null, unit: "mmHg" },
      preload: pillar("PRELOAD", "SVV", numericVitals.svv, "%", "SV", numericVitals.sv, "mL/beat"),
      contractility: pillar("CONTRACTILITY", "CI", numericVitals.ci, "L/min/m²", "dP/dt", null, "mmHg/s"),
      afterload: pillar("AFTERLOAD", "SVR", numericVitals.svr, "dyn·s/cm⁵", "Eadyn", null, ""),
    },
    events,
    activeAlert: null,
    simulationTimeMs: displayTimeSeconds * 1_000,
    trendWindow: {
      start: formatRelativeTime(Math.max(0, displayTimeSeconds - 1_800)),
      end: formatRelativeTime(displayTimeSeconds),
    },
    abpWaveform: null,
    abpWaveformSource: {
      seed: 1,
      signal: "ABP",
      sourceDevice: "VitalDB",
      qualitySignal: "ABP",
      sampleRateHz: 100,
      windowMs: 30_000,
      receiptDelayMs: 0,
      simulationTimeMs: displayTimeSeconds * 1_000,
      playbackStatus: "PAUSED",
      playbackSpeed: 1,
      qualityStates: [],
      unit: "mmHg",
      yMin: 0,
      yMax: 200,
    },
    abpWaveformTimestamp: asOfTime,
    medicationOverlap: null,
    riskAlertThresholdPercent: null,
  };
}

function formatRelativeTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((value % 3_600) / 60).toString().padStart(2, "0");
  const remainder = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remainder}`;
}

function buildTrendSamples(
  snapshot: SimulationSnapshot,
  startTime: number,
  endTime: number
): HemodynamicTrendSample[] {
  const observationsByTime = new Map<number, Map<ClinicalSignal, Observation>>();
  for (const observation of snapshot.observations) {
    if (observation.eventTime < startTime || observation.eventTime > endTime) continue;
    const atTime = observationsByTime.get(observation.eventTime) ?? new Map<ClinicalSignal, Observation>();
    atTime.set(observation.signal, observation);
    observationsByTime.set(observation.eventTime, atTime);
  }
  const waveforms = snapshot.waveforms
    .filter((item) => item.signal === "ABP" && item.recordedTime <= snapshot.simulationTime)
    .sort((left, right) => left.eventTime - right.eventTime);
  let waveformIndex = 0;
  let currentWaveform: WaveformSegment | undefined;

  return [...observationsByTime.keys()]
    .filter((time) => observationsByTime.get(time)?.has("MAP"))
    .sort((left, right) => left - right)
    .map((sampleTime) => {
      while (waveformIndex < waveforms.length && waveforms[waveformIndex].eventTime <= sampleTime) {
        currentWaveform = waveforms[waveformIndex];
        waveformIndex += 1;
      }
      const prediction = snapshot.predictions
        .filter((item) => item.modelId === "SAFEANES-DEMO-HPI" && item.horizonMinutes === 5 &&
          item.timestamp >= sampleTime && item.timestamp <= sampleTime + 2_000)
        .sort((left, right) => right.timestamp - left.timestamp)[0];
      return {
        timestamp: formatCaseTime(snapshot.encounter.startedAt, sampleTime),
        map: observationValueAt(snapshot, "MAP", sampleTime, observationsByTime),
        abp: waveformMeanAt(currentWaveform, sampleTime),
        hpi: prediction ? Math.round(prediction.probability * 100) : null,
        sv: observationValueAt(snapshot, "SV", sampleTime, observationsByTime),
        svv: observationValueAt(snapshot, "SVV", sampleTime, observationsByTime),
        svr: observationValueAt(snapshot, "SVR", sampleTime, observationsByTime),
        ci: observationValueAt(snapshot, "CI", sampleTime, observationsByTime),
      };
    });
}

function observationValueAt(
  snapshot: SimulationSnapshot,
  signal: ClinicalSignal,
  time: number,
  observationsByTime: Map<number, Map<ClinicalSignal, Observation>>
): number | null {
  const observation = observationsByTime.get(time)?.get(signal);
  if (!observation || observation.imputed || isUnavailable(observation.quality.status)) return null;
  const quality = snapshot.qualityStates
    .filter((item) => item.signal === signal && item.sourceDevice === observation.sourceDevice &&
      item.eventTime <= time && (item.validUntilTime === undefined || time < item.validUntilTime))
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  return quality && isUnavailable(quality.status) ? null : observation.value;
}

function waveformMeanAt(waveform: WaveformSegment | undefined, time: number): number | null {
  if (!waveform || time - waveform.eventTime > 5 * 60_000 || isUnavailable(waveform.quality.status)) return null;
  return waveform ? roundNullable(waveform.samples.reduce((sum, value) => sum + value, 0) / waveform.samples.length, 1) : null;
}

function latestAbpWaveform(snapshot: SimulationSnapshot): WaveformSegment | null {
  return snapshot.waveforms
    .filter((item) => item.signal === "ABP" && item.eventTime <= snapshot.simulationTime &&
      item.recordedTime <= snapshot.simulationTime && snapshot.simulationTime - item.eventTime <= 5 * 60_000 + 8_000 &&
      !isUnavailable(item.quality.status))
    .sort((left, right) => right.eventTime - left.eventTime)[0] ?? null;
}

function relationshipState(input: {
  map: number | null;
  sv: number | null;
  svv: number | null;
  ci: number | null;
  svr: number | null;
  trendSamples: HemodynamicTrendSample[];
}): HemodynamicRelationshipState {
  const first = (key: keyof HemodynamicTrendSample) =>
    input.trendSamples.find((sample) => typeof sample[key] === "number")?.[key] as number | undefined;
  const current = (value: number | null) => value ?? null;
  const percent = (value: number | null, baseline: number | undefined) => relativePercent(value, baseline);
  const mapBaseline = first("map");
  const svvBaseline = first("svv");
  const svBaseline = first("sv");
  const ciBaseline = first("ci");
  const svrBaseline = first("svr");
  const pillar = (
    title: string,
    metric1: { label: string; value: number | null; unit: string; changePercent: number | null; trend?: Array<number | null> },
    metric2: { label: string; value: number | null; unit: string; changePercent: number | null; trend?: Array<number | null> },
    footerSubtitle: string,
    footerTitle: string
  ) => ({ title, metric1, metric2, footerSubtitle, footerTitle });

  return {
    map: { value: current(input.map), changePercent: percent(input.map, mapBaseline), unit: "mmHg" },
    preload: pillar("PRELOAD",
      { label: "SVV", value: current(input.svv), unit: "%", changePercent: percent(input.svv, svvBaseline), trend: input.trendSamples.map((sample) => sample.svv ?? null) },
      { label: "SV", value: current(input.sv), unit: "mL/beat", changePercent: percent(input.sv, svBaseline), trend: input.trendSamples.map((sample) => sample.sv ?? null) },
      "Stroke Volume Variation", "Preload Status"),
    contractility: pillar("CONTRACTILITY",
      { label: "CI", value: current(input.ci), unit: "L/min/m²", changePercent: percent(input.ci, ciBaseline), trend: input.trendSamples.map((sample) => sample.ci ?? null) },
      { label: "dP/dt", value: null, unit: "mmHg/s", changePercent: null, trend: [] },
      "Systolic Slope", "Contractility"),
    afterload: pillar("AFTERLOAD",
      { label: "SVR", value: current(input.svr), unit: "dyn·s/cm⁵", changePercent: percent(input.svr, svrBaseline), trend: input.trendSamples.map((sample) => sample.svr ?? null) },
      { label: "Eadyn", value: null, unit: "", changePercent: null, trend: [] },
      "Dynamic Arterial Elastance", "Afterload"),
  };
}

function buildEvents(snapshot: SimulationSnapshot): HemodynamicEvent[] {
  const events: HemodynamicEvent[] = [];
  const riskAlert = snapshot.alerts.find((alert) => alert.id === "alert-uc04-impending-hypotension-demo");
  if (riskAlert) {
    events.push({
      id: riskAlert.id,
      timestamp: formatCaseTime(snapshot.encounter.startedAt, riskAlert.firstTriggerTime ?? riskAlert.eventTime),
      simulationTime: riskAlert.firstTriggerTime ?? riskAlert.eventTime,
      priority: alertPriority(riskAlert.severity),
      type: "HYPOTENSION_RISK_RISING",
      details: riskAlert.message,
      riskPercent: riskAlert.riskProbability === undefined ? undefined : Math.round(riskAlert.riskProbability * 100),
      leadTimeMinutes: riskAlert.leadTimeMinutes,
      duration: riskAlert.status === "ACTIVE" ? "ongoing" : "resolved",
      action: "DEMO ONLY",
    });
  }

  const lowMapEpisode = snapshot.episodes.find((episode) => episode.id === "episode-hemodynamic-low-map");
  if (lowMapEpisode && lowMapEpisode.startTime <= snapshot.simulationTime) {
    const detection = snapshot.events.find((event) => event.id === "episode-hemodynamic-low-map-detected");
    const payload = recordPayload(detection?.payload);
    events.push({
      id: lowMapEpisode.id,
      timestamp: formatCaseTime(snapshot.encounter.startedAt, lowMapEpisode.startTime),
      simulationTime: lowMapEpisode.startTime,
      priority: "MEDIUM",
      type: "HYPOTENSION_EPISODE",
      details: "Synthetic low-MAP scenario episode.",
      mapValue: typeof payload.mapMmHg === "number" ? payload.mapMmHg : null,
      thresholdMmHg: typeof payload.demoThresholdMmHg === "number" ? payload.demoThresholdMmHg : null,
      duration: lowMapEpisode.endTime === undefined ? "ongoing" : "3 min",
      action: "DEMO ONLY",
    });
  }

  const phenylephrine = snapshot.events.find((event) => event.id === "medication-phenylephrine-rescue");
  if (phenylephrine) {
    const payload = recordPayload(phenylephrine.payload);
    events.push({
      id: phenylephrine.id,
      timestamp: formatCaseTime(snapshot.encounter.startedAt, phenylephrine.eventTime),
      simulationTime: phenylephrine.eventTime,
      priority: "INFO",
      type: "MEDICATION_OVERLAP",
      details: "Temporal overlap only; no causal effect is inferred.",
      medicationName: typeof payload.name === "string" ? payload.name : "Phenylephrine",
      duration: "—",
      action: "OVERLAPS",
    });
  }

  const induction = snapshot.events.find((event) => {
    const payload = recordPayload(event.payload);
    return event.eventType === "PHASE_STARTED" && payload.phaseId === "induction";
  });
  if (induction) {
    events.push({
      id: induction.id,
      timestamp: formatCaseTime(snapshot.encounter.startedAt, induction.eventTime),
      simulationTime: induction.eventTime,
      priority: "INFO",
      type: "INDUCTION",
      details: "Synthetic perioperative phase marker.",
    });
  }
  return events.sort((left, right) => (right.simulationTime ?? 0) - (left.simulationTime ?? 0));
}

function findPhenylephrineOverlap(snapshot: SimulationSnapshot): { timestamp: string; medicationName: string } | null {
  const edge = snapshot.eventGraph.find((candidate) => candidate.relationship === "OVERLAPS" &&
    (candidate.eventId === "medication-phenylephrine-rescue" || candidate.relatedEventId === "medication-phenylephrine-rescue"));
  if (!edge) return null;
  const medicationEvent = snapshot.events.find((event) => event.id === "medication-phenylephrine-rescue");
  if (!medicationEvent) return null;
  const payload = recordPayload(medicationEvent.payload);
  return {
    timestamp: formatCaseTime(snapshot.encounter.startedAt, medicationEvent.eventTime),
    medicationName: typeof payload.name === "string" ? payload.name : "Phenylephrine",
  };
}

function isUnavailable(status: string): boolean {
  return ["TECHNICAL_DROPOUT", "EXPECTED_INTERMITTENT", "STRUCTURAL_NOT_MONITORED", "INVALIDATED_ARTIFACT", "UNKNOWN", "UNAVAILABLE"].includes(status);
}

function confidenceLabel(confidence: number | undefined): HemodynamicPrediction["confidence"] {
  if (confidence === undefined) return "unavailable";
  return confidence >= 0.8 ? "high" : confidence >= 0.6 ? "medium" : "low";
}

function riskLevel(value: number | null): ForecastHorizon["riskLevel"] {
  if (value === null) return "unavailable";
  return value >= 70 ? "high" : value >= 35 ? "medium" : "low";
}

function alertPriority(severity: string): HemodynamicEvent["priority"] {
  return severity === "CRITICAL" || severity === "HIGH" ? "HIGH" : severity === "MEDIUM" ? "MEDIUM" : "INFO";
}

function relativePercent(value: number | null, baseline?: number): number | null {
  if (value === null || baseline === undefined || baseline === 0) return null;
  return Math.round(((value - baseline) / Math.abs(baseline)) * 100);
}

function roundNullable(value: number | null, decimals: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function recordPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
