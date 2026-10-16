import { RespiratoryCaseData, RespiratoryRiskPrediction } from "@/types/uc05";
import type { SimulationSnapshot } from "@/simulation/types/replay";
import type { Observation } from "@/simulation/types/observations";
import type { SignalQualityState } from "@/simulation/types/quality";
import { createClinicalWaveformSource } from "@/simulation/adapters/waveformAdapter";
import { formatCaseTime } from "@/simulation/formatTime";

/** Projects only replay-visible canonical data into the existing UC05 UI. */
export function getUC05SimulationViewModel(snapshot: SimulationSnapshot): RespiratoryCaseData {
  const startEpoch = Date.parse(snapshot.encounter.startedAt);
  const absoluteTime = (elapsed: number) => startEpoch + elapsed;
  const visibleObservations = snapshot.observations.filter((item) =>
    item.eventTime <= snapshot.simulationTime && item.receivedTime <= snapshot.simulationTime
  );
  const latest = (signal: string) => visibleObservations
    .filter((item) => item.signal === signal)
    .sort((left, right) => right.eventTime - left.eventTime || right.receivedTime - left.receivedTime)[0];
  const latestUsable = (signal: string): Observation | undefined => {
    const value = latest(signal);
    if (!value || snapshot.simulationTime - value.receivedTime > 35_000) return undefined;
    if (!isGoodAt(snapshot.qualityStates, signal, value.sourceDevice, snapshot.simulationTime, value.quality.status)) return undefined;
    return value;
  };

  const capnogramQuality = channelQuality(snapshot, "ETCO2", "capnograph-or2");
  const plethQuality = channelQuality(snapshot, "SPO2", "pulse-ox-or2");
  const waveformToSample = (
    modality: "CAPNOGRAM" | "PLETHYSMOGRAPH",
    signal: "CAPNOGRAM" | "PLETH",
    qualitySignal: "ETCO2" | "SPO2",
    sourceDevice: string,
    unit: string,
    yMax: number
  ) => {
    const isCapnogram = modality === "CAPNOGRAM";
    return {
      modality,
      ...createClinicalWaveformSource(
        snapshot,
        signal,
        sourceDevice,
        qualitySignal,
        unit,
        0,
        yMax
      ),
      sweepSpeedMmPerSec: isCapnogram ? 6.3 : 25,
      yMid: isCapnogram ? 30 : undefined,
      timestamp: formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime),
    } as const;
  };

  const observationsByTime = new Map<number, Map<string, Observation>>();
  for (const observation of visibleObservations) {
    if (!new Set(["ETCO2", "RR", "SPO2", "HR"]).has(observation.signal)) continue;
    const atTime = observationsByTime.get(observation.eventTime) ?? new Map<string, Observation>();
    atTime.set(observation.signal, observation);
    observationsByTime.set(observation.eventTime, atTime);
  }
  const trendSeries = [...observationsByTime.entries()]
    .sort(([left], [right]) => left - right)
    .map(([elapsed, values]) => {
      const usable = (signal: string) => {
        const observation = values.get(signal);
        if (!observation) return null;
        return isGoodAt(snapshot.qualityStates, signal, observation.sourceDevice, elapsed, observation.quality.status)
          ? observation.value
          : null;
      };
      return {
        timestamp: formatCaseTime(snapshot.encounter.startedAt, elapsed),
        timestampMs: absoluteTime(elapsed),
        etco2: usable("ETCO2"),
        respiratoryRate: usable("RR"),
        spo2: usable("SPO2"),
        pulseRate: usable("HR"),
      };
    });

  const tabularTrends = trendSeries.slice(-120).reverse().map((sample) => ({
    id: `respiratory-trend-${sample.timestampMs}`,
    timeStr: sample.timestamp,
    timestamp: sample.timestampMs!,
    etco2: sample.etco2,
    rr: sample.respiratoryRate,
    spo2: sample.spo2,
    pr: sample.pulseRate,
  }));

  const latestPredictionTime = snapshot.predictions
    .filter((prediction) => prediction.modelId === snapshot.scenarioManifest.respiratory.modelId && prediction.timestamp <= snapshot.simulationTime)
    .reduce((latestTime, prediction) => Math.max(latestTime, prediction.timestamp), -1);
  const latestPrediction = snapshot.predictions.find((prediction) =>
    prediction.modelId === snapshot.scenarioManifest.respiratory.modelId && prediction.timestamp === latestPredictionTime
  );
  const riskPercent = latestPrediction ? Math.round(latestPrediction.probability * 100) : null;
  const riskStatus: RespiratoryRiskPrediction["riskStatus"] = riskPercent === null
    ? "Unavailable"
    : riskPercent >= 70 ? "High" : riskPercent >= 30 ? "Elevated" : "Stable";
  const confidence = latestPrediction?.confidence;
  const modelPrediction = {
    available: latestPrediction !== undefined,
    timestamp: formatCaseTime(snapshot.encounter.startedAt, latestPrediction?.timestamp ?? snapshot.simulationTime),
    horizonMinutes: latestPrediction?.horizonMinutes ?? snapshot.scenarioManifest.respiratory.horizonMinutes,
    risk: riskPercent,
    confidence: confidence === undefined ? "unavailable" as const : confidence >= 0.75 ? "high" as const : confidence >= 0.55 ? "medium" as const : "low" as const,
    dataCoverage: latestPrediction ? Math.round(latestPrediction.dataCoverage * 100) : null,
    missingModalities: latestPrediction?.missingModalities ?? ["EtCO2", "RR", "SpO2", "PR", "Capnogram"],
    modelName: snapshot.scenarioManifest.respiratory.modelId,
    modelVersion: snapshot.scenarioManifest.respiratory.modelVersion,
    synthetic: true as const,
    clinicalUse: false as const,
    riskStatus,
    subCategories: riskPercent === null ? {
      ventilation: "Unavailable" as const,
      oxygenation: "Unavailable" as const,
      apneaRisk: "Unavailable" as const,
      overall: "Unavailable" as const,
    } : {
      ventilation: riskPercent >= 70 ? "Critical" as const : riskPercent >= 30 ? "Impaired" as const : "Normal" as const,
      oxygenation: riskPercent >= 80 ? "Critical" as const : riskPercent >= 60 ? "Impaired" as const : "Normal" as const,
      apneaRisk: riskPercent >= 70 ? "High" as const : riskPercent >= 30 ? "Medium" as const : "Low" as const,
      overall: riskPercent >= 80 ? "Critical" as const : riskPercent >= 35 ? "Unstable" as const : "Stable" as const,
    },
  };

  const uc05Alerts = snapshot.alerts.filter((alert) =>
    alert.sourceModule === "UC05" && alert.eventTime <= snapshot.simulationTime &&
    (alert.recordedTime === undefined || alert.recordedTime <= snapshot.simulationTime)
  );
  const alertEvents = uc05Alerts.map((alert) => {
    const episode = snapshot.episodes.find((item) => item.id === "episode-respiratory-deterioration-candidate");
    const durationSeconds = Math.max(20, Math.floor(((episode?.endTime ?? snapshot.simulationTime) - (episode?.startTime ?? alert.eventTime)) / 1_000));
    const alertTime = alert.recordedTime ?? alert.eventTime;
    return {
      id: alert.id,
      timestamp: formatCaseTime(snapshot.encounter.startedAt, alertTime),
      timestampMs: absoluteTime(alertTime),
      type: "NO_BREATH" as const,
      priority: "HIGH" as const,
      eventName: "No Breath Detected",
      translationKey: "alarms.noBreathDetected",
      displayValue: "--",
      durationSeconds,
      isCritical: true,
    };
  });
  const activeAlertRecord = [...uc05Alerts]
    .filter((alert) => alert.status === "ACTIVE" || alert.status === "ACKNOWLEDGED")
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  const currentRR = latestUsable("RR")?.value ?? null;
  const currentSpO2 = latestUsable("SPO2")?.value ?? null;
  const currentPR = latestUsable("HR")?.value ?? null;
  const activeAlert = activeAlertRecord ? {
    id: activeAlertRecord.id,
    code: activeAlertRecord.code,
    priority: "HIGH" as const,
    title: "No Breath Detected",
    subtitle: "Synthetic respiratory event; cause and diagnosis are not assigned.",
    elapsedSeconds: Math.max(0, Math.floor((snapshot.simulationTime - activeAlertRecord.eventTime) / 1_000)),
    isActive: true,
    physiologicalStatus: {
      capnogramExpiratoryPhase: "No-breath interval candidate",
      respiratoryRate: currentRR,
      spo2Trending: currentSpO2 === null ? "Unavailable" : "Observed",
      pulseRate: currentPR,
    },
    systemDiagnostics: activeAlertRecord.safetyBoundary ?? "DEMO ONLY — not clinically validated.",
  } : null;

  const episodeRegions = snapshot.episodes
    .filter((episode) => episode.type === "RESPIRATORY_DETERIORATION_CANDIDATE")
    .map((episode) => ({
      id: episode.id,
      name: episode.summary,
      startMs: absoluteTime(episode.startTime),
      endMs: absoluteTime(episode.endTime ?? snapshot.simulationTime),
      alarmId: activeAlertRecord?.id,
      kind: "EVENT" as const,
    }));
  const qualityRegions = snapshot.events
    .filter((event) => {
      const payload = event.payload as { signal?: string; quality?: string };
      return event.eventType === "SIGNAL_QUALITY_CHANGED" && payload.signal === "ETCO2" && payload.quality === "TECHNICAL_DROPOUT";
    })
    .map((event) => {
      const endEvent = snapshot.events.find((candidate) => {
        const payload = candidate.payload as { signal?: string };
        return candidate.eventType === "SIGNAL_QUALITY_RESTORED" && payload.signal === "ETCO2" && candidate.eventTime >= event.eventTime;
      });
      return {
        id: event.id,
        name: "EtCO2 signal unavailable — technical dropout",
        startMs: absoluteTime(event.eventTime),
        endMs: absoluteTime(endEvent?.eventTime ?? snapshot.simulationTime),
        kind: "QUALITY" as const,
      };
    });

  const capnoObservation = latestUsable("ETCO2");
  const deviceConnected = snapshot.devices.some((device) => device.kind === "VENTILATOR" && device.status === "CONNECTED");
  const wifiConnected = snapshot.devices.every((device) => device.status !== "DISCONNECTED");
  const timeString = formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime);
  const dateTimeDisplay = `${snapshot.encounter.startedAt.slice(0, 10)} ${timeString}`;

  return {
    patient: {
      category: "Adult",
      operatingRoom: snapshot.procedure.operatingRoom,
      anesthesiaType: snapshot.procedure.anesthesia,
      patientId: snapshot.patient.patientId,
    },
    device: {
      batteryLevelPercent: deviceBattery(snapshot.devices.find((device) => device.kind === "PATIENT_MONITOR")?.batteryPercent),
      batteryBars: batteryBars(snapshot.devices.find((device) => device.kind === "PATIENT_MONITOR")?.batteryPercent),
      isWifiConnected: wifiConnected,
      isSensorConnected: deviceConnected,
      isSystemOk: wifiConnected && deviceConnected,
      dateTimeDisplay,
    },
    vitals: {
      etco2: capnoObservation?.value ?? null,
      respiratoryRate: currentRR,
      spo2: currentSpO2,
      pulseRate: currentPR,
      timestamp: timeString,
    },
    capnogramWaveform: waveformToSample("CAPNOGRAM", "CAPNOGRAM", "ETCO2", "capnograph-or2", "mmHg", 60),
    plethWaveform: waveformToSample("PLETHYSMOGRAPH", "PLETH", "SPO2", "pulse-ox-or2", "relative amplitude", 1),
    trendSeries,
    eventRegions: [...episodeRegions, ...qualityRegions],
    alarmReview: alertEvents,
    tabularTrends,
    activeAlert,
    riskPrediction: modelPrediction,
    signalQuality: { capnogram: capnogramQuality, pleth: plethQuality },
  };
}

function deviceBattery(value: number | undefined): number | null {
  return value === undefined || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, Math.round(value)));
}

function batteryBars(value: number | undefined): number | null {
  const percent = deviceBattery(value);
  return percent === null ? null : Math.ceil(percent / 25);
}

function channelQuality(
  snapshot: SimulationSnapshot,
  signal: string,
  sourceDevice: string
): "good" | "degraded" | "unavailable" {
  const active = snapshot.qualityStates
    .filter((item) => item.signal === signal && item.sourceDevice === sourceDevice && item.eventTime <= snapshot.simulationTime &&
      (item.recordedTime === undefined || item.recordedTime <= snapshot.simulationTime) &&
      (item.validUntilTime === undefined || snapshot.simulationTime < item.validUntilTime))
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  if (active && ["TECHNICAL_DROPOUT", "EXPECTED_INTERMITTENT", "STRUCTURAL_NOT_MONITORED", "INVALIDATED_ARTIFACT", "UNKNOWN", "UNAVAILABLE"].includes(active.status)) return "unavailable";
  const device = snapshot.devices.find((item) => item.id === sourceDevice || item.sourceIds.includes(sourceDevice));
  if (device?.status === "DISCONNECTED") return "unavailable";
  if (active?.status === "DEGRADED" || device?.status === "DEGRADED") return "degraded";
  return "good";
}

function isGoodAt(
  qualityStates: SignalQualityState[],
  signal: string,
  sourceDevice: string,
  time: number,
  observationQuality: string
): boolean {
  if (["TECHNICAL_DROPOUT", "EXPECTED_INTERMITTENT", "STRUCTURAL_NOT_MONITORED", "INVALIDATED_ARTIFACT", "UNKNOWN", "UNAVAILABLE"].includes(observationQuality)) return false;
  const active = qualityStates
    .filter((item) => item.signal === signal && item.sourceDevice === sourceDevice && item.eventTime <= time &&
      (item.validUntilTime === undefined || time < item.validUntilTime))
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  return !active || !["TECHNICAL_DROPOUT", "EXPECTED_INTERMITTENT", "STRUCTURAL_NOT_MONITORED", "INVALIDATED_ARTIFACT", "UNKNOWN", "UNAVAILABLE"].includes(active.status);
}
