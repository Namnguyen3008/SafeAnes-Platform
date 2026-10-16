import type { SimulationAlert } from "../types/alerts";
import type { SimulationEpisode } from "../types/episodes";
import type { Observation } from "../types/observations";
import type { PredictionEvent } from "../types/predictions";
import type { HemodynamicRiskKnot } from "../types/scenarioManifest";
import type { SimulationProcessingContext, SimulationStageResult } from "../types/replay";

const MINUTE_MS = 60_000;
const MAX_OBSERVATION_AGE_MS = 45_000;
const MAX_ABP_WAVEFORM_AGE_MS = 5 * MINUTE_MS + 8_000;
const INPUT_SIGNALS = ["MAP", "HR", "SV", "SVV", "CI", "SVR"] as const;
const MODEL_ALERT_ID = "alert-uc04-impending-hypotension-demo";
const MODEL_EPISODE_ID = "episode-uc04-impending-hypotension-demo";
const UNAVAILABLE_QUALITY = new Set([
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

/** Deterministic synthetic HPI-style output. It does not estimate clinical risk. */
export function runUc04Engine(context: SimulationProcessingContext): SimulationStageResult | undefined {
  if (context.event.eventType !== "OBSERVATION_BATCH_RECORDED") return undefined;

  const config = context.caseInfo.scenarioManifest.hemodynamics;
  if (context.event.eventTime % config.evaluationIntervalMs !== 0) return undefined;
  const inputs = collectInputs(context);
  const dataCoverage = inputs.length / (INPUT_SIGNALS.length + 1);
  if (dataCoverage === 0) return undefined;

  const predictionsGenerated = config.horizonsMinutes.map((horizonMinutes) => {
    // The manifest curve defines the synthetic five-minute score. Other
    // horizons are deterministic offsets on that same smooth scenario curve.
    const curveOffsetMs = (horizonMinutes - 5) * MINUTE_MS;
    const probability = interpolateRiskCurve(config.riskCurve, context.simulationTime + curveOffsetMs);
    const id = `prediction-uc04-demo-hpi-${context.simulationTime}-${horizonMinutes}`;
    const prediction: PredictionEvent = {
      id,
      modelId: config.modelId,
      modelVersion: config.modelVersion,
      task: `synthetic ${horizonMinutes}-minute low-MAP risk estimate (demo only)`,
      timestamp: context.simulationTime,
      horizonMinutes,
      probability,
      confidence: round(0.55 + dataCoverage * 0.35, 3),
      dataCoverage: round(dataCoverage, 3),
      missingModalities: missingInputNames(inputs),
      synthetic: true,
      clinicalUse: false,
      output: { label: "DEMO ONLY — not clinically validated", value: probability, unit: "probability" },
      inputSummary: inputs,
      relatedEventIds: [context.event.id],
    };
    return prediction;
  });

  const fiveMinutePrediction = predictionsGenerated.find((item) => item.horizonMinutes === 5)!;
  const priorAlert = context.snapshot.alerts.find((alert) => alert.id === MODEL_ALERT_ID);
  const priorEpisode = context.snapshot.episodes.find((episode) => episode.id === MODEL_EPISODE_ID);
  const firstTrigger = priorAlert?.firstTriggerTime ?? context.simulationTime;
  const leadTimeMinutes = Math.max(0, Math.ceil(
    (config.hypotensionEpisodeStartTime - context.simulationTime) / MINUTE_MS
  ));

  let alertsCreated: SimulationAlert[] = [];
  let alertsUpdated: SimulationAlert[] = [];
  let episodesAdded: SimulationEpisode[] = [];

  if (!priorAlert && fiveMinutePrediction.probability >= config.alertTriggerProbability) {
    const alert = createRiskAlert({
      context,
      probability: fiveMinutePrediction.probability,
      leadTimeMinutes,
      thresholdMmHg: config.hypotensionThresholdMmHg,
      firstTriggerTime: context.simulationTime,
      status: "ACTIVE",
    });
    alertsCreated = [alert];
    episodesAdded = [createRiskEpisode(context, context.simulationTime, "ACTIVE")];
  } else if (priorAlert && priorAlert.status !== "RESOLVED") {
    const status = fiveMinutePrediction.probability <= config.alertResolveProbability ? "RESOLVED" : "ACTIVE";
    const alert = createRiskAlert({
      context,
      probability: fiveMinutePrediction.probability,
      leadTimeMinutes,
      thresholdMmHg: config.hypotensionThresholdMmHg,
      firstTriggerTime: firstTrigger,
      status,
    });
    alertsUpdated = [alert];
    if (priorEpisode) {
      episodesAdded = [{
        ...priorEpisode,
        status,
        ...(status === "RESOLVED" ? { endTime: context.simulationTime } : {}),
      }];
    }
  }

  return {
    predictionsGenerated,
    alertsCreated,
    alertsUpdated,
    episodesAdded,
    rulesTriggered: ["SAFEANES-DEMO-HPI@0.1-demo"],
    stateChanges: [
      `uc04-horizons-generated:${context.simulationTime}`,
      ...(alertsCreated.length ? [`uc04-alert-created:${MODEL_ALERT_ID}`] : []),
      ...(alertsUpdated.length ? [`uc04-alert-updated:${MODEL_ALERT_ID}`] : []),
    ],
  };
}

function collectInputs(context: SimulationProcessingContext): ModelInput[] {
  const inputs: ModelInput[] = [];
  for (const signal of INPUT_SIGNALS) {
    const observation = latestUsableObservation(context, signal);
    if (!observation) continue;
    inputs.push({ signal, value: observation.value, unit: observation.unit, provenance: observation.provenance });
  }

  const abp = latestUsableAbp(context);
  if (abp) inputs.push(abp);
  return inputs;
}

function latestUsableObservation(
  context: SimulationProcessingContext,
  signal: (typeof INPUT_SIGNALS)[number]
): Observation | undefined {
  const observation = context.snapshot.observations
    .filter((item) => item.signal === signal && item.eventTime <= context.simulationTime && item.receivedTime <= context.simulationTime)
    .sort((left, right) => right.eventTime - left.eventTime || right.receivedTime - left.receivedTime)[0];
  if (!observation || context.simulationTime - observation.receivedTime > MAX_OBSERVATION_AGE_MS) return undefined;
  if (observation.imputed || UNAVAILABLE_QUALITY.has(observation.quality.status)) return undefined;

  const qualityState = context.snapshot.qualityStates
    .filter((item) => item.signal === signal && item.sourceDevice === observation.sourceDevice &&
      item.eventTime <= context.simulationTime &&
      (item.validUntilTime === undefined || context.simulationTime < item.validUntilTime))
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  if (qualityState && UNAVAILABLE_QUALITY.has(qualityState.status)) return undefined;
  return observation;
}

function latestUsableAbp(context: SimulationProcessingContext): ModelInput | undefined {
  const waveform = context.snapshot.waveforms
    .filter((item) => item.signal === "ABP" && item.eventTime <= context.simulationTime && item.recordedTime <= context.simulationTime)
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  if (!waveform || context.simulationTime - waveform.eventTime > MAX_ABP_WAVEFORM_AGE_MS) return undefined;
  if (UNAVAILABLE_QUALITY.has(waveform.quality.status) || waveform.samples.length === 0) return undefined;
  const meanPressure = waveform.samples.reduce((sum, value) => sum + value, 0) / waveform.samples.length;
  return { signal: "ABP", value: round(meanPressure, 1), unit: waveform.unit, provenance: waveform.provenance };
}

function missingInputNames(inputs: ModelInput[]): string[] {
  const available = new Set(inputs.map((input) => input.signal));
  return [...INPUT_SIGNALS, "ABP"].filter((signal) => !available.has(signal));
}

export function interpolateRiskCurve(curve: readonly HemodynamicRiskKnot[], time: number): number {
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

function createRiskAlert(input: {
  context: SimulationProcessingContext;
  probability: number;
  leadTimeMinutes: number;
  thresholdMmHg: number;
  firstTriggerTime: number;
  status: "ACTIVE" | "RESOLVED";
}): SimulationAlert {
  const { context, probability, leadTimeMinutes, thresholdMmHg, firstTriggerTime, status } = input;
  const config = context.caseInfo.scenarioManifest.hemodynamics;
  const percent = Math.round(probability * 100);
  const timing = leadTimeMinutes > 0
    ? `approximately ${leadTimeMinutes} minutes before the configured demo episode`
    : "during the configured demo episode window";
  return {
    id: MODEL_ALERT_ID,
    alertId: MODEL_ALERT_ID,
    code: "DEMO-HPI-01",
    title: "Impending hypotension risk trend — demo only",
    message: `Synthetic ${5}-minute risk estimate ${percent}% ${timing}; configured threshold ${thresholdMmHg} mmHg is DEMO ONLY.`,
    severity: severityFor(probability),
    sourceModule: "UC04",
    status,
    eventTime: firstTriggerTime,
    relatedEventIds: [context.event.id],
    evidenceEventIds: [context.event.id],
    provenance: "INFERRED",
    demoOnly: true,
    clinicalUse: false,
    firstTriggerTime,
    lastEvaluatedTime: context.simulationTime,
    riskProbability: probability,
    leadTimeMinutes,
    modelId: config.modelId,
    modelVersion: config.modelVersion,
    thresholdMmHg,
    safetyBoundary: "DEMO ONLY — synthetic scenario output; not clinically validated and not clinical guidance.",
  };
}

function createRiskEpisode(
  context: SimulationProcessingContext,
  startTime: number,
  status: "ACTIVE" | "RESOLVED"
): SimulationEpisode {
  return {
    id: MODEL_EPISODE_ID,
    type: "IMPENDING_HYPOTENSION",
    startTime,
    status,
    relatedEventIds: [context.event.id],
    summary: "Synthetic UC04 risk-estimate episode. This is a model output, not a measured hypotension event or clinical fact.",
  };
}

function severityFor(probability: number): SimulationAlert["severity"] {
  if (probability >= 0.85) return "CRITICAL";
  if (probability >= 0.7) return "HIGH";
  if (probability >= 0.4) return "MEDIUM";
  return "LOW";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
