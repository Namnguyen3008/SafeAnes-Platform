"use client";

import React, { useMemo } from "react";
import { UC01Workspace } from "@/components/modules/uc01";
import { useSimulationReplay } from "@/context/SimulationReplayContext";
import { adaptUc01Snapshot } from "@/simulation";

export default function SituationPage() {
  const { snapshot } = useSimulationReplay();
  const caseState = useMemo(() => adaptUc01Snapshot(snapshot), [snapshot]);
  return <UC01Workspace caseState={caseState} />;
}
