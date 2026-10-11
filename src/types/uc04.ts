export type SignalQuality = "OPTIMAL" | "ACCEPTABLE" | "DEGRADED" | "NO_SIGNAL";

export interface PatientContext {
  ageGroup: string;
  orRoom: string;
  anesthesiaType: string;
}

export interface DeviceStatus {
  telemetryOnline: boolean;
  linkActive: boolean;
  signalQuality: SignalQuality;
}

export interface HemodynamicVitals {
  map: number | null;
  ci: number | null;
  sv: number | null;
  svv: number | null;
  svr?: number | null;
  hpi: number | null;
  modelOutputScore?: number | null;
  timestamp: string;
}

export interface HemodynamicTrendSample {
  timestamp: string; // "HH:MM:SS" or "HH:MM"
  abp?: number | null;
  map?: number | null;
  hpi?: number | null;
  svv?: number | null;
  svr?: number | null;
  ci?: number | null;
  sv?: number | null;
  sbp?: number | null;
  dbp?: number | null;
  hr?: number | null;
  modelOutputScore?: number | null;
}

export interface HemodynamicPrediction {
  timestamp: string;
  horizonMinutes: number | null;
  available: boolean;
  hpiRisk: number | null;
  confidence: "unavailable" | "low" | "medium" | "high";
  dataCoverage: number | null;
  missingSignals: string[];
  modelId?: string;
  modelVersion?: string;
  synthetic?: true;
  clinicalUse?: false;
  riskPercent?: number | null;
  thresholdMmHg?: number;
  outputValue?: number | null;
  outputSemantics?: string;
  calibrated?: boolean | null;
  qualityStatus?: string;
  task?: string;
  readinessStatus?: string;
  predictionCacheStatus?: string;
  windowEligibility?: string;
  windowReason?: string | null;
  windowPredictionTimeSeconds?: number | null;
  windowStartSeconds?: number | null;
  windowEndSeconds?: number | null;
  abstainedWindowCount?: number | null;
}

export interface ForecastHorizon {
  minute: number;
  riskPercent: number | null;
  riskLevel: "unavailable" | "low" | "medium" | "high";
  outputValue?: number | null;
}

export interface HemodynamicEvent {
  id: string;
  timestamp: string;
  priority: "HIGH" | "MEDIUM" | "INFO";
  type:
    | "HYPOTENSION_RISK_RISING"
    | "HYPOTENSION_EPISODE"
    | "MEDICATION_OVERLAP"
    | "SVR_INCREASE"
    | "INDUCTION"
    | "FLUID_BOLUS"
    | "VITALDB_ANNOTATION";
  details: string;
  duration?: string;
  action?: string;
  simulationTime?: number;
  riskPercent?: number | null;
  leadTimeMinutes?: number;
  mapValue?: number | null;
  thresholdMmHg?: number | null;
  medicationName?: string;
}

export interface MetricDeterminant {
  value: number;
  unit: string;
  changePercent: number;
}

export interface DeterminantPillar {
  title: string;
  metric1: {
    label: string;
    value: number | null;
    unit: string;
    changePercent: number | null;
    trend?: Array<number | null>;
  };
  metric2: {
    label: string;
    value: number | null;
    unit: string;
    changePercent: number | null;
    trend?: Array<number | null>;
  };
  footerSubtitle: string;
  footerTitle: string;
}

export interface HemodynamicRelationshipState {
  map: {
    value: number | null;
    changePercent: number | null;
    unit: string;
  };
  preload: DeterminantPillar;
  contractility: DeterminantPillar;
  afterload: DeterminantPillar;
}

export interface CaseAlert {
  id: string;
  priority: "HIGH" | "MEDIUM" | "INFO";
  title: string;
  subtitle: string;
  timestamp: string;
  recommendedActions: string[];
  demoOnly?: true;
  clinicalUse?: false;
  riskPercent?: number | null;
  leadTimeMinutes?: number;
  thresholdMmHg?: number;
  modelId?: string;
  modelVersion?: string;
  ageMinutes?: number;
  status?: "ACTIVE" | "RESOLVED";
  confidencePercent?: number | null;
  dataCoveragePercent?: number | null;
  missingSignals?: string[];
}
