"use client";

import React, { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MainWorkspace } from "./MainWorkspace";
import { ClinicianReviewRail } from "./ReviewRail/ClinicianReviewRail";
import { ClinicalReviewProvider, useClinicalReview } from "@/context/ClinicalReviewContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { VitalDBReplayWorkspace } from "@/components/modules/replay/VitalDBReplayWorkspace";

function RecordRouteSync() {
  const searchParams = useSearchParams();
  const {
    selectClaim,
    selectEvent,
    selectTime,
    claims,
    events,
    selectedClaimId,
    selectedEventId,
    selectedTime,
  } = useClinicalReview();

  useEffect(() => {
    if (!searchParams) return;
    const claimParam = searchParams.get("claim");
    const eventParam = searchParams.get("event");
    const timeParam = searchParams.get("time");

    if (timeParam && timeParam !== selectedTime) {
      selectTime(timeParam);
    }
    if (eventParam && eventParam !== selectedEventId && events.some((e) => e.id === eventParam)) {
      selectEvent(eventParam);
    }
    if (claimParam && claimParam !== selectedClaimId && claims[claimParam]) {
      selectClaim(claimParam);
    }
  }, [
    searchParams,
    claims,
    events,
    selectedClaimId,
    selectedEventId,
    selectedTime,
    selectClaim,
    selectEvent,
    selectTime,
  ]);

  return null;
}

export function UC02Workspace() {
  const replay = useSafeAnesData();
  if (replay.mode === "VITALDB_REPLAY") return <VitalDBReplayWorkspace module="UC02" />;

  return (
    <ClinicalReviewProvider>
      <Suspense fallback={null}>
        <RecordRouteSync />
      </Suspense>
      <div className="w-full min-w-[1160px] h-full min-h-[720px] flex overflow-hidden bg-safe-bg text-safe-text font-sans select-none antialiased">
        {/* Main Center Workspace (Fluid width) */}
        <MainWorkspace />

        {/* Review summary remains visible while the evidence layout adapts by workstation width. */}
        <ClinicianReviewRail />
      </div>
    </ClinicalReviewProvider>
  );
}
