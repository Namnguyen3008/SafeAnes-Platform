"use client";

import React from "react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { HypotensionRiskCard } from "./HypotensionRiskCard";
import { MapSummaryTile } from "./MapSummaryTile";
import { CiSummaryTile } from "./CiSummaryTile";
import { SvSummaryTile } from "./SvSummaryTile";
import { PredictedHpiPanel } from "./PredictedHpiPanel";
import { CurrentHypotensionAlert } from "./CurrentHypotensionAlert";

export function RightClinicalSummaryRail() {
  const { activeAlert } = useHemodynamic();
  const isAlertActive = activeAlert !== null && activeAlert.status !== "RESOLVED";

  return (
    <aside className="uc04-summary-rail w-[clamp(320px,24vw,400px)] min-w-[320px] max-w-[400px] h-full min-h-0 flex flex-col justify-between shrink-0 select-none">
      <HypotensionRiskCard />
      {isAlertActive && <CurrentHypotensionAlert />}
      <MapSummaryTile />
      <CiSummaryTile />
      <SvSummaryTile />
      <PredictedHpiPanel />
      {!isAlertActive && <CurrentHypotensionAlert />}
    </aside>
  );
}

export {
  HypotensionRiskCard,
  MapSummaryTile,
  CiSummaryTile,
  SvSummaryTile,
  PredictedHpiPanel,
  CurrentHypotensionAlert,
};
