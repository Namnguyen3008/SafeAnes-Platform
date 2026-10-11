"use client";

import React, { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MedicationProvider, useMedication } from "@/context/MedicationContext";
import { UpperWorkspace } from "./UpperWorkspace";
import { MedicationTimelinePanel } from "./MedicationTimelinePanel";
import { BottomReviewGrid } from "./BottomReviewGrid";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { ClinicalOverrideModal } from "./ClinicalOverrideModal";
import { AddMedicationModal } from "./AddMedicationModal";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { VitalDBReplayWorkspace } from "@/components/modules/replay/VitalDBReplayWorkspace";

function MedicationRouteSync() {
  const searchParams = useSearchParams();
  const {
    handleSelectMedication,
    alerts,
    handleSelectAlert,
    setCurrentTimeCursor,
  } = useMedication();

  useEffect(() => {
    if (!searchParams) return;
    const medParam = searchParams.get("medication");
    const alertParam = searchParams.get("alert");
    const timeParam = searchParams.get("time");

    if (medParam) {
      handleSelectMedication(medParam);
    }
    if (alertParam) {
      const foundAlert = alerts.find(
        (a) =>
          a.id === alertParam ||
          a.id.includes(alertParam) ||
          alertParam.includes(a.id) ||
          (medParam && a.medicationId === medParam)
      );
      if (foundAlert) {
        handleSelectAlert(foundAlert);
      }
    }
    if (timeParam) {
      setCurrentTimeCursor(timeParam);
    }
  }, [searchParams, alerts, handleSelectMedication, handleSelectAlert, setCurrentTimeCursor]);

  return null;
}

export function MedicationSafetyWorkspace() {
  const replay = useSafeAnesData();
  if (replay.mode === "VITALDB_REPLAY") return <VitalDBReplayWorkspace module="UC03" />;

  return (
    <MedicationProvider>
      <Suspense fallback={null}>
        <MedicationRouteSync />
      </Suspense>
      <div className="w-full min-w-[1100px] h-full min-h-[720px] grid grid-rows-[minmax(260px,1.45fr)_minmax(140px,0.75fr)_minmax(170px,0.85fr)] gap-[var(--safe-panel-gap)] min-h-0 overflow-hidden bg-safe-bg text-safe-text font-sans antialiased select-none">
        {/* Upper Workspace: Active Meds (28%), Safety Review (48%), Patient Rail (24%) */}
        <UpperWorkspace />

        {/* Medication Timeline (Multi-track infusion/bolus timeline) */}
        <MedicationTimelinePanel />

        {/* Bottom Review Grid: Recent Alerts (56%), Recent Med Values (44%) */}
        <BottomReviewGrid />

        {/* Clinical Interactive Modals & Drawers */}
        <EvidenceDrawer />
        <ClinicalOverrideModal />
        <AddMedicationModal />
      </div>
    </MedicationProvider>
  );
}
