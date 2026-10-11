import type { RespiratoryCaseData, RespiratoryEvent, WaveformSample } from "@/types/uc05";
import type { VitalDbReplaySpeed, VitalDbReplayStatus } from "@/context/UC04VitalDbContext";
import { resolveWaveformDisplayRange } from "@/components/clinical-waveforms/waveformEngine";
import { toRecordedWaveformSamples, type UC05VitalDbProjection } from "./uc05VitalDbAdapter";

export function toRespiratoryVitalDbCaseData(
  view: UC05VitalDbProjection,
  playbackStatus: VitalDbReplayStatus = "PAUSED",
  playbackSpeed: VitalDbReplaySpeed = 1,
): RespiratoryCaseData {
  const signal = (name: string) => view.signals.find((item) => item.signal === name);
  const latest = (name: string) => view.latestBySignal[name];
  const value = (name: string) => {
    const item = latest(name);
    return item && !item.is_missing && item.value !== null && Number.isFinite(item.value) ? item.value : null;
  };
  const unit = (name: string) => signal(name)?.unit ?? "NOT_RECORDED";
  const units = {
    etco2: unit("ETCO2"),
    respiratoryRate: unit("RR"),
    spo2: unit("SPO2"),
    pulseRate: unit("PR"),
  };
  const trendByTime = new Map<number, { etco2: number | null; respiratoryRate: number | null; spo2: number | null; pulseRate: number | null }>();
  for (const series of view.signals) {
    const key = signalKey(series.signal);
    if (!key) continue;
    for (const observation of series.observations) {
      const row = trendByTime.get(observation.timestamp) ?? { etco2: null, respiratoryRate: null, spo2: null, pulseRate: null };
      row[key] = observation.is_missing ? null : observation.value;
      trendByTime.set(observation.timestamp, row);
    }
  }
  const trendSeries = [...trendByTime.entries()].sort(([a], [b]) => a - b).map(([timestamp, row]) => ({
    timestamp: formatElapsed(timestamp), timestampMs: timestamp * 1_000,
    etco2: row.etco2, respiratoryRate: row.respiratoryRate, spo2: row.spo2, pulseRate: row.pulseRate,
  }));
  const tabularTrends = trendSeries.slice(-180).reverse().map((row) => ({
    id: `vdb-trend-${view.case_id}-${row.timestampMs}`,
    timeStr: row.timestamp,
    timestamp: row.timestampMs!,
    etco2: row.etco2,
    rr: row.respiratoryRate,
    spo2: row.spo2,
    pr: row.pulseRate,
    units: { etco2: units.etco2, rr: units.respiratoryRate, spo2: units.spo2, pr: units.pulseRate },
  }));

  const capnogramWaveform = toWaveform(view, "capno", "CAPNOGRAM", 0, 60, playbackStatus, playbackSpeed);
  const plethWaveform = toWaveform(view, "ppg", "PLETHYSMOGRAPH", 0, 100, playbackStatus, playbackSpeed);
  const events = [...view.recorded_events, ...view.derived_events]
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((event) => ({
      id: event.id,
      timestamp: formatElapsed(event.timestamp),
      timestampMs: event.timestamp * 1_000,
      type: event.source_class === "DERIVED" ? "SPO2_BELOW_90_CANDIDATE" as const : "RECORDED_ANNOTATION" as const,
      priority: "LOW" as const,
      eventName: event.description,
      displayValue: "—",
      durationSeconds: event.start_time_s !== undefined && event.end_time_s !== undefined
        ? Math.max(0, event.end_time_s - event.start_time_s) : undefined,
      sourceClass: event.source_class,
      source: event.source,
      definition: event.definition,
      quality: event.quality,
      provenance: event.provenance,
    } satisfies RespiratoryEvent));
  const eventRegions = events.map((event) => ({
    id: event.id,
    name: event.eventName,
    startMs: event.timestampMs,
    endMs: event.durationSeconds ? event.timestampMs + event.durationSeconds * 1_000 : event.timestampMs,
    kind: "EVENT" as const,
  }));
  const qualityRegions = (view.waveforms.capno?.missing_intervals ?? []).map((interval, index) => ({
    id: `vdb-capno-gap-${index}-${interval.start_time_s}`,
    name: "Capnogram samples missing in source recording",
    startMs: interval.start_time_s * 1_000,
    endMs: interval.end_time_s * 1_000,
    kind: "QUALITY" as const,
  }));

  const latestOutputs = view.latestPredictions;
  const primaryOutputs = latestOutputs.filter((item) => item.horizon_minutes_or_null !== null);
  const firstOutput = primaryOutputs[0];
  const outputRows = latestOutputs.map((item) => ({
    horizonMinutes: item.horizon_minutes_or_null,
    value: item.interpreted_output.value,
    rawOutput: item.raw_output,
    kind: item.interpreted_output.kind,
    calibrated: item.interpreted_output.calibrated === true,
    predictionTime: item.prediction_time,
  }));
  const prediction = {
    timestamp: formatElapsed(firstOutput?.prediction_time ?? view.as_of_s),
    horizonMinutes: firstOutput?.horizon_minutes_or_null ?? null,
    available: primaryOutputs.length > 0,
    risk: null,
    confidence: "unavailable" as const,
    dataCoverage: firstOutput ? Math.round(firstOutput.data_coverage * 100) : null,
    missingModalities: firstOutput?.missing_features ?? [],
    modelName: view.model.model_id,
    modelVersion: view.model.model_version,
    riskStatus: "Unavailable" as const,
    subCategories: {
      ventilation: "Unavailable" as const,
      oxygenation: "Unavailable" as const,
      apneaRisk: "Unavailable" as const,
      overall: "Unavailable" as const,
    },
    sourceMode: "VITALDB_REPLAY" as const,
    task: view.model.task,
    outputRows,
    artifactHash: view.model.artifact_sha256,
    readinessStatus: view.model.readiness_status,
    predictionCacheStatus: view.predictionCacheStatus,
    windowEligibility: view.windowEligibility,
    windowReason: view.windowReason,
    windowPredictionTimeSeconds: view.windowPredictionTimeSeconds,
    windowStartSeconds: view.windowStartSeconds,
    windowEndSeconds: view.windowEndSeconds,
    abstainedWindowCount: view.abstainedWindowCount,
    auxiliaryOutput: latestOutputs.find((item) => item.horizon_minutes_or_null === null)?.raw_output ?? null,
  };

  return {
    sourceMode: "VITALDB_REPLAY",
    caseId: view.case_id,
    dataset: view.dataset,
    datasetVersion: view.dataset_version,
    asOfSeconds: view.as_of_s,
    modelReadinessStatus: view.model.readiness_status,
    patient: { category: "NOT_RECORDED", operatingRoom: "NOT_RECORDED", anesthesiaType: "NOT_RECORDED", patientId: "NOT_RECORDED" },
    device: { batteryLevelPercent: null, batteryBars: null, isWifiConnected: null, isSensorConnected: null, isSystemOk: null, dateTimeDisplay: formatElapsed(view.as_of_s) },
    vitals: {
      etco2: value("ETCO2"), respiratoryRate: value("RR"), spo2: value("SPO2"), pulseRate: value("PR"),
      timestamp: formatElapsed(view.as_of_s), units,
    },
    capnogramWaveform,
    plethWaveform,
    trendSeries,
    eventRegions: [...eventRegions, ...qualityRegions],
    alarmReview: events,
    tabularTrends,
    activeAlert: null,
    riskPrediction: prediction,
    signalQuality: {
      capnogram: qualityLabel(view.waveforms.capno?.quality, capnogramWaveform),
      pleth: qualityLabel(view.waveforms.ppg?.quality, plethWaveform),
    },
  };
}

function toWaveform(
  view: UC05VitalDbProjection,
  name: string,
  modality: WaveformSample["modality"],
  yMin: number,
  yMax: number,
  playbackStatus: VitalDbReplayStatus,
  playbackSpeed: VitalDbReplaySpeed,
): WaveformSample | null {
  const source = view.waveforms[name];
  if (!source || source.timestamps.length === 0) return null;
  const recordedSamples = toRecordedWaveformSamples(source);
  const preferredMin = source.display_range?.min ?? yMin;
  const preferredMax = source.display_range?.max ?? yMax;
  const displayRange = resolveWaveformDisplayRange(source.values, preferredMin, preferredMax);
  const displayWindowMs = 10_000;
  return {
    seed: 0,
    signal: modality === "CAPNOGRAM" ? "CAPNOGRAM" : "PLETH",
    sourceDevice: source.source,
    qualitySignal: modality === "CAPNOGRAM" ? "ETCO2" : "SPO2",
    sampleRateHz: source.sample_rate_hz,
    windowMs: displayWindowMs,
    receiptDelayMs: 0,
    simulationTimeMs: view.as_of_s * 1_000,
    playbackStatus,
    playbackSpeed,
    qualityStates: [],
    unit: source.unit,
    yMin: displayRange.min,
    yMax: displayRange.max,
    ...(modality === "CAPNOGRAM" ? { yMid: (displayRange.min + displayRange.max) / 2 } : {}),
    modality,
    sweepSpeedMmPerSec: 0,
    timestamp: formatElapsed(view.as_of_s),
    recorded: true,
    recordedSamples,
  };
}

function qualityLabel(value: string | undefined, waveform: WaveformSample | null): "good" | "degraded" | "unknown" | "unavailable" {
  if (!waveform) return "unavailable";
  const upper = value?.toUpperCase();
  if (upper === "GOOD") return "good";
  if (upper === "DEGRADED") return "degraded";
  return "unknown";
}

function signalKey(signal: string): "etco2" | "respiratoryRate" | "spo2" | "pulseRate" | null {
  if (signal === "ETCO2") return "etco2";
  if (signal === "RR") return "respiratoryRate";
  if (signal === "SPO2") return "spo2";
  if (signal === "PR") return "pulseRate";
  return null;
}

function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hour = Math.floor(total / 3_600).toString().padStart(2, "0");
  const minute = Math.floor((total % 3_600) / 60).toString().padStart(2, "0");
  const second = (total % 60).toString().padStart(2, "0");
  return `${hour}:${minute}:${second}`;
}
