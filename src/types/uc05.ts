/**
 * SafeAnes — UC05 Respiratory Intelligence Domain Types
 */

import type { WaveformRenderSource } from "@/simulation/types/waveforms";
import type { RecordedWaveformSample } from "@/adapters/uc05VitalDbAdapter";

export interface PatientContext {
  category: "Adult" | "Pediatric" | "Neonatal" | "NOT_RECORDED";
  operatingRoom: string;
  anesthesiaType: string;
  patientId?: string;
}

export interface DeviceStatus {
  batteryLevelPercent: number | null;
  batteryBars: number | null; // 0 to 4; null when not monitored
  isWifiConnected: boolean | null;
  isSensorConnected: boolean | null;
  isSystemOk: boolean | null;
  dateTimeDisplay: string; // "Dec 21, 2024 04:39 PM"
}

export type RespiratoryVitals = {
  etco2: number | null;
  respiratoryRate: number | null;
  spo2: number | null;
  pulseRate: number | null;
  timestamp: string;
  units?: { etco2: string; respiratoryRate: string; spo2: string; pulseRate: string };
};

export interface WaveformSample extends WaveformRenderSource {
  modality: "CAPNOGRAM" | "PLETHYSMOGRAPH";
  sweepSpeedMmPerSec: number;
  yMid?: number;
  timestamp?: string;
  recorded?: boolean;
  recordedSamples?: readonly RecordedWaveformSample[];
}

export type RespiratoryTrendSample = {
  timestamp: string;
  timestampMs?: number;
  etco2: number | null;
  respiratoryRate: number | null;
  spo2: number | null;
  pulseRate: number | null;
};

export type TrendSample = RespiratoryTrendSample;

export type RespiratoryEventType =
  | "NO_BREATH"
  | "SPO2_LOW"
  | "ETCO2_LOW"
  | "RR_LOW"
  | "FILTER_DISCONNECTED"
  | "RECORDED_ANNOTATION"
  | "SPO2_BELOW_90_CANDIDATE";

export type RespiratoryPriority = "HIGH" | "MEDIUM" | "LOW";

export type RespiratoryEvent = {
  id: string;
  timestamp: string;
  timestampMs: number;
  type: RespiratoryEventType;
  priority: RespiratoryPriority;
  eventName: string;
  value?: number;
  unit?: string;
  durationSeconds?: number;
  displayValue: string; // e.g. "--", "85 %", "12 mmHg"
  isCritical?: boolean;
  translationKey?: string;
  sourceClass?: "OBSERVED" | "DERIVED";
  source?: string;
  definition?: string;
  quality?: string;
  provenance?: Record<string, unknown>;
};

export interface RespiratoryEventRegion {
  id: string;
  name: string;
  startMs: number;
  endMs: number;
  alarmId?: string;
  kind?: "EVENT" | "QUALITY";
}

export interface RespiratoryAlert {
  id: string;
  code: string;
  priority: RespiratoryPriority;
  title: string;
  subtitle: string;
  elapsedSeconds: number;
  isActive: boolean;
  physiologicalStatus: {
    capnogramExpiratoryPhase: string;
    respiratoryRate: number | null;
    spo2Trending: string;
    pulseRate: number | null;
  };
  systemDiagnostics: string;
}

export type RespiratoryPrediction = {
  timestamp: string;
  horizonMinutes: number | null;
  available: boolean;
  risk: number | null;
  confidence: "unavailable" | "low" | "medium" | "high";
  dataCoverage: number | null;
  missingModalities: string[];
};

export interface RespiratoryRiskPrediction extends RespiratoryPrediction {
  modelName: string;
  modelVersion?: string;
  synthetic?: true;
  clinicalUse?: false;
  riskStatus: "Unavailable" | "Stable" | "Elevated" | "High";
  subCategories: {
    ventilation: "Unavailable" | "Normal" | "Impaired" | "Critical";
    oxygenation: "Unavailable" | "Normal" | "Impaired" | "Critical";
    apneaRisk: "Unavailable" | "Low" | "Medium" | "High";
    overall: "Unavailable" | "Stable" | "Unstable" | "Critical";
  };
  sourceMode?: "VITALDB_REPLAY";
  task?: string;
  outputRows?: Array<{ horizonMinutes: number | null; value: number; rawOutput?: number; kind: string; calibrated: boolean; predictionTime: number }>;
  artifactHash?: string;
  readinessStatus?: string;
  auxiliaryOutput?: number | null;
  predictionCacheStatus?: string;
  windowEligibility?: string;
  windowReason?: string | null;
  windowPredictionTimeSeconds?: number | null;
  windowStartSeconds?: number | null;
  windowEndSeconds?: number | null;
  abstainedWindowCount?: number | null;
}

export type SignalQuality = {
  capnogram: "good" | "degraded" | "unknown" | "unavailable";
  pleth: "good" | "degraded" | "unknown" | "unavailable";
};

export interface TabularTrendRecord {
  id: string;
  timeStr: string;
  timestamp: number;
  etco2: number | null;
  rr: number | null;
  spo2: number | null;
  pr: number | null;
  units?: { etco2: string; rr: string; spo2: string; pr: string };
}

/**
 * Complete UC05 Clinical Case Aggregation Model
 */
export interface RespiratoryCaseData {
  sourceMode?: "VITALDB_REPLAY";
  caseId?: string;
  dataset?: string;
  datasetVersion?: string;
  asOfSeconds?: number;
  modelReadinessStatus?: string;
  patient: PatientContext;
  device: DeviceStatus;
  vitals: RespiratoryVitals;
  capnogramWaveform: WaveformSample | null;
  plethWaveform: WaveformSample | null;
  trendSeries: TrendSample[];
  eventRegions: RespiratoryEventRegion[];
  alarmReview: RespiratoryEvent[];
  tabularTrends: TabularTrendRecord[];
  activeAlert: RespiratoryAlert | null;
  riskPrediction: RespiratoryRiskPrediction;
  signalQuality: SignalQuality;
}
