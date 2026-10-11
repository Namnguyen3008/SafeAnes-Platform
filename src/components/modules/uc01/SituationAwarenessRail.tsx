"use client";

import React from "react";
import { RealTimePhysiologicSummary } from "./RealTimePhysiologicSummary";
import { SituationAwarenessPanel } from "./SituationAwarenessPanel";
import { ActiveAlertsPanel } from "./ActiveAlertsPanel";
import {
  PhysiologicObservation,
  SituationAwarenessState,
  ClinicalAlert,
  DataIntegrityState,
} from "@/types/uc01";

export interface SituationAwarenessRailProps {
  observations: PhysiologicObservation[];
  situationAwareness: SituationAwarenessState;
  alerts: ClinicalAlert[];
  dataIntegrity: DataIntegrityState;
}

export const SituationAwarenessRail: React.FC<SituationAwarenessRailProps> = ({
  observations,
  situationAwareness,
  alerts,
  dataIntegrity,
}) => {
  return (
    <div className="h-full flex flex-col justify-between space-y-2.5 overflow-hidden">
      {/* 1. Measured Facts: Real-time Telemetry Tiles & Data Integrity Layer */}
      <RealTimePhysiologicSummary
        observations={observations}
        dataIntegrity={dataIntegrity}
      />

      {/* 2. Derived & Predicted Cognitive State */}
      <SituationAwarenessPanel state={situationAwareness} />

      {/* 3. Clinical Alerts */}
      <ActiveAlertsPanel alerts={alerts} />
    </div>
  );
};
