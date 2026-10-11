import type { SimulationAlert } from "../types/alerts";
import type { SimulationEpisode } from "../types/episodes";
import type { Observation } from "../types/observations";
import type { PredictionEvent } from "../types/predictions";
import type { RespiratoryRiskKnot } from "../types/scenarioManifest";
import type { SimulationProcessingContext, SimulationStageResult } from "../types/replay";
import type { WaveformSegment } from "../types/waveforms";

const MINUTE_MS = 60_000;
const MAX_OBSERVATION_AGE_MS = 35_000;
const MAX_WAVEFORM_AGE_MS = 5 * MINUTE_MS + 8_000;
const EPISODE_ID = "episode-respiratory-deterioration-candidate";
const ALERT_ID = "alert-respiratory-no-breath";
const QUALITY_UNAVAILABLE = new Set([
  "DEGRADED",
  "TECHNICAL_DROPOUT",
  "EXPECTED_INTERMITTENT",
  "STRUCTURAL_NOT_MONITORED",
  "INVALIDATED_ARTIFACT",
  "UNKNOWN",
  "UNAVAILABLE",
]);

interface ModelInput {
  signal: string;
  value: number;
  unit: string;
  provenance: Observation["provenance"];
}

/**
 * Deterministic UC05 demonstration engine. Its outputs are synthetic UI data,
 * not validated respiratory predictions or clinical facts.
 */
export function runUc05Engine(context: SimulationProcessingContext): SimulationStageResult | undefined {
  const result: SimulationStageResult = {};
  const stateChanges: string[] = [];
  const eventPayload = payloadRecord(context.event.payload);

  if (
    context.event.eventType === "OBSERVATION_BATCH_RECORDED" &&
    context.event.eventTime % context.caseInfo.scenarioManifest.respiratory.evaluationIntervalMs === 0
  ) {
    const prediction = createPrediction(context);
    if (prediction) {
      result.predictionsGenerated = [prediction];
      stateChanges.push(`uc05-respiratory-prediction:${prediction.id}`);
    }
  }

  if (
    context.event.eventType === "EPISODE_DETECTED" &&
    eventPayload.episodeId === EPISODE_ID &&
    eventPayload.type === "RESPIRATORY_DETERIORATION_CANDIDATE" &&
    hasGoodRespiratoryEvidence(context)
  ) {
    const priorEpisode = context.snapshot.episodes.find((episode) => episode.id === EPISODE_ID);
    if (!priorEpisode) {
      result.episodesAdded = [createEpisode(context, "ACTIVE")];
      stateChanges.push(`uc05-respiratory-episode-created:${EPISODE_ID}`);
    }
  }

  if (
    context.event.eventType === "EPISODE_RESOLVED" &&
    eventPayload.episodeId === EPISODE_ID
  ) {
    const priorEpisode = context.snapshot.episodes.find((episode) => episode.id === EPISODE_ID);
    if (priorEpisode && priorEpisode.status !== "RESOLVED") {
      result.episodesAdded = [{
        ...priorEpisode,
        status: "RESOLVED",
        endTime: context.event.eventTime,
        relatedEventIds: unique([...priorEpisode.relatedEventIds, context.event.id]),
        summary: "Synthetic no-breath interval candidate resolved as the waveform returned toward baseline; no diagnosis or cause assigned.",
      }];
      stateChanges.push(`uc05-respiratory-episode-resolved:${EPISODE_ID}`);
    }
  }

  if (
    context.event.eventType === "ALERT_RAISED" &&
    eventPayload.alertId === ALERT_ID &&
    context.snapshot.episodes.some((episode) => episode.id === EPISODE_ID)
  ) {
    const priorAlert = context.snapshot.alerts.find((alert) => alert.id === ALERT_ID);
    const alert = createAlert(context, priorAlert?.firstTriggerTime ?? context.event.eventTime);
    if (priorAlert) {
      result.alertsUpdated = [alert];
      stateChanges.push(`uc05-respiratory-alert-updated:${ALERT_ID}`);
    } else {
      result.alertsCreated = [alert];
      stateChanges.push(`uc05-respiratory-alert-created:${ALERT_ID}`);
    }
  }

  if (stateChanges.length === 0 && !result.predictionsGenerated) return undefined;
  result.stateChanges = stateChanges;
  result.rulesTriggered = stateChanges.some((change) => change.startsWith("uc05-respiratory-alert"))
    ? ["SAFEANES-DEMO-RESP-v0.1"]
    : undefined;
  return result;
}

function createPrediction(context: SimulationProcessingContext): PredictionEvent | undefined {
  const config = context.caseInfo.scenarioManifest.respiratory;
  const inputs = collectInputs(context);
  if (inputs.length === 0) return undefined;

  const dataCoverage = round(inputs.length / 5, 3);
  const probability = interpolateRespiratoryRiskCurve(config.riskCurve, context.simulationTime);
  return {
    id: `prediction-uc05-respiratory-${context.simulationTime}`,
    modelId: config.modelId,
    modelVersion: config.modelVersion,
    task: "synthetic respiratory deterioration estimate (demonstration only)",
    timestamp: context.simulationTime,
    horizonMinutes: config.horizonMinutes,
    probability,
    confidence: round(Math.min(0.9, 0.48 + dataCoverage * 0.4), 3),
    dataCoverage,
    missingModalities: missingModalities(inputs, context),
    synthetic: true,
    clinicalUse: false,
    output: {
      label: "DEMO ONLY — not clinically validated",
      value: probability,
      unit: "probability",
    },
    inputSummary: inputs,
    relatedEventIds: [context.event.id],
  };
}

function collectInputs(context: SimulationProcessingContext): ModelInput[] {
  const inputs: ModelInput[] = [];
  for (const signal of ["ETCO2", "RR", "SPO2", "HR"] as const) {
    const observation = latestUsableObservation(context, signal);
    if (observation) {
      inputs.push({ signal, value: observation.value, unit: observation.unit, provenance: observation.provenance });
    }
  }

  const waveform = latestUsableCapnogram(context);
  if (waveform) {
    const amplitude = waveform.samples.length > 0
      ? Math.max(...waveform.samples) - Math.min(...waveform.samples)
      : 0;
    inputs.push({ signal: "CAPNOGRAM", value: round(amplitude, 2), unit: waveform.unit, provenance: "DERIVED" });
  }
  return inputs;
}

function latestUsableObservation(
  context: SimulationProcessingContext,
  signal: "ETCO2" | "RR" | "SPO2" | "HR"
): Observation | undefined {
  const observation = context.snapshot.observations
    .filter((item) => item.signal === signal && item.eventTime <= context.simulationTime && item.receivedTime <= context.simulationTime)
    .sort((left, right) => right.eventTime - left.eventTime || right.receivedTime - left.receivedTime)[0];
  if (!observation || context.simulationTime - observation.receivedTime > MAX_OBSERVATION_AGE_MS) return undefined;
  if (observation.imputed || QUALITY_UNAVAILABLE.has(observation.quality.status)) return undefined;
  if (hasUnavailableQuality(context, signal, observation.sourceDevice)) return undefined;
  return observation;
}

function latestUsableCapnogram(context: SimulationProcessingContext): WaveformSegment | undefined {
  const waveform = context.snapshot.waveforms
    .filter((item) => item.signal === "CAPNOGRAM" && item.eventTime <= context.simulationTime && item.recordedTime <= context.simulationTime)
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  if (!waveform || context.simulationTime - waveform.eventTime > MAX_WAVEFORM_AGE_MS) return undefined;
  if (QUALITY_UNAVAILABLE.has(waveform.quality.status) || waveform.samples.length === 0) return undefined;
  if (hasUnavailableQuality(context, "ETCO2", waveform.sourceDevice)) return undefined;
  return waveform;
}

function hasGoodRespiratoryEvidence(context: SimulationProcessingContext): boolean {
  if (hasUnavailableQuality(context, "ETCO2", "capnograph-or2")) return false;
  const waveform = latestUsableCapnogram(context);
  if (!waveform || waveform.quality.status !== "GOOD") return false;
  const rr = latestUsableObservation(context, "RR");
  return rr !== undefined && rr.value <= 6;
}

function hasUnavailableQuality(
  context: SimulationProcessingContext,
  signal: string,
  sourceDevice: string
): boolean {
  const active = context.snapshot.qualityStates
    .filter((item) => item.signal === signal && item.sourceDevice === sourceDevice &&
      item.eventTime <= context.simulationTime &&
      (item.validUntilTime === undefined || context.simulationTime < item.validUntilTime))
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  return active ? QUALITY_UNAVAILABLE.has(active.status) : false;
}

function missingModalities(inputs: ModelInput[], context: SimulationProcessingContext): string[] {
  const available = new Set(inputs.map((input) => input.signal));
  const missing = ["ETCO2", "RR", "SPO2", "HR", "CAPNOGRAM"].filter((signal) => !available.has(signal));
  const etco2Unavailable = hasUnavailableQuality(context, "ETCO2", "capnograph-or2");
  return missing.map((signal) => signal === "ETCO2" && etco2Unavailable
    ? "EtCO2 — technical signal unavailable"
    : signal === "CAPNOGRAM" && etco2Unavailable
      ? "Capnogram — technical signal unavailable"
      : signal);
}

function createEpisode(context: SimulationProcessingContext, status: SimulationEpisode["status"]): SimulationEpisode {
  return {
    id: EPISODE_ID,
    type: "RESPIRATORY_DETERIORATION_CANDIDATE",
    startTime: context.event.eventTime,
    status,
    relatedEventIds: [context.event.id],
    summary: "Synthetic no-breath interval candidate observed with good signal quality; no diagnosis or cause assigned.",
  };
}

function createAlert(context: SimulationProcessingContext, firstTriggerTime: number): SimulationAlert {
  const relatedEventIds = context.event.relatedEventIds?.length
    ? context.event.relatedEventIds
    : [context.event.id];
  return {
    id: ALERT_ID,
    alertId: ALERT_ID,
    code: "DEMO-RESP-02",
    title: "No Breath Detected",
    message: "Synthetic high-priority respiratory event; no diagnosis; cause not assigned.",
    severity: "HIGH",
    sourceModule: "UC05",
    status: "ACTIVE",
    eventTime: context.event.eventTime,
    recordedTime: context.event.recordedTime,
    firstTriggerTime,
    lastEvaluatedTime: context.simulationTime,
    relatedEventIds,
    evidenceEventIds: relatedEventIds,
    provenance: "DERIVED",
    demoOnly: true,
    clinicalUse: false,
    safetyBoundary: "DEMO ONLY — synthetic UI demonstration; not clinically validated for use, not a diagnosis, and does not assign cause.",
  };
}

export function interpolateRespiratoryRiskCurve(curve: readonly RespiratoryRiskKnot[], time: number): number {
  if (curve.length === 0) return 0;
  if (time <= curve[0].time) return round(clamp(curve[0].probability), 4);
  for (let index = 1; index < curve.length; index += 1) {
    const right = curve[index];
    if (time > right.time) continue;
    const left = curve[index - 1];
    const progress = (time - left.time) / (right.time - left.time);
    const eased = progress * progress * (3 - 2 * progress);
    return round(clamp(left.probability + (right.probability - left.probability) * eased), 4);
  }
  return round(clamp(curve[curve.length - 1].probability), 4);
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === "object" ? payload as Record<string, unknown> : {};
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
