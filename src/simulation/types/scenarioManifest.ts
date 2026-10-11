export interface HemodynamicRiskKnot {
  /** Milliseconds elapsed from the shared case start. */
  time: number;
  /** Synthetic demo curve value, normalized to [0, 1]. */
  probability: number;
}

export interface HemodynamicScenarioManifest {
  demoOnly: true;
  clinicalUse: false;
  modelId: "SAFEANES-DEMO-HPI";
  modelVersion: "0.1-demo";
  evaluationIntervalMs: 60_000;
  horizonsMinutes: readonly [1, 5, 10, 15];
  hypotensionThresholdMmHg: number;
  hypotensionThresholdLabel: "DEMO ONLY — synthetic scenario threshold; not clinical guidance.";
  hypotensionEpisodeStartTime: number;
  alertTriggerProbability: number;
  alertResolveProbability: number;
  riskCurve: readonly HemodynamicRiskKnot[];
}

export interface SafeAnesScenarioManifest {
  hemodynamics: HemodynamicScenarioManifest;
  respiratory: RespiratoryScenarioManifest;
}

export interface RespiratoryRiskKnot {
  /** Milliseconds elapsed from the shared case start. */
  time: number;
  /** Synthetic demonstration estimate normalized to [0, 1]. */
  probability: number;
}

export interface RespiratoryScenarioManifest {
  demoOnly: true;
  clinicalUse: false;
  modelId: "SAFEANES-DEMO-RESP-v0.1";
  modelVersion: "0.1-demo";
  evaluationIntervalMs: 60_000;
  horizonMinutes: 5;
  eventStartTime: number;
  eventEndTime: number;
  alertTriggerTime: number;
  riskCurve: readonly RespiratoryRiskKnot[];
}
