"use client";

import React, { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { HemodynamicProvider, useHemodynamic } from "@/context/HemodynamicContext";
import { MainClinicalWorkspace } from "./MainClinicalWorkspace";
import { RightClinicalSummaryRail } from "./RightClinicalSummaryRail";

function HemodynamicRouteSync() {
  const searchParams = useSearchParams();
  const { events, selectEvent, setCursorTime, setIsLive, selectedEventId, cursorTime } = useHemodynamic();

  useEffect(() => {
    if (!searchParams) return;
    const eventParam = searchParams.get("event");
    const timeParam = searchParams.get("time");

    if (eventParam) {
      // Find matching event by ID or type or partial match
      const found = events.find(
        (e) =>
          e.id === eventParam ||
          e.id.includes(eventParam) ||
          eventParam.includes(e.id) ||
          e.type.toLowerCase().includes("hypotension")
      );
      if (found && selectedEventId !== found.id) {
        selectEvent(found);
      }
    }
    if (timeParam && cursorTime !== timeParam) {
      setCursorTime(timeParam);
      setIsLive(false);
    }
  }, [searchParams, events, selectedEventId, cursorTime, selectEvent, setCursorTime, setIsLive]);

  return null;
}

export function HemodynamicIntelligenceWorkspace() {
  return (
    <HemodynamicProvider>
      <Suspense fallback={null}>
        <HemodynamicRouteSync />
      </Suspense>
      <div className="uc04-workspace-layout w-full min-w-[1040px] h-full min-h-0 overflow-hidden bg-safe-bg text-safe-text select-none">
        {/* Central Clinical Workspace (Overview Gauges, Mini Trends, 4-Channel Trends, MAP Determinant Tree, Recent Events) */}
        <MainClinicalWorkspace />

        {/* Right Summary Rail (Hypotension Risk HPI, MAP, CI, SV, Predicted Horizons, High Priority Alert) */}
        <RightClinicalSummaryRail />
      </div>
    </HemodynamicProvider>
  );
}

// Backward-compatibility alias
export { HemodynamicIntelligenceWorkspace as HemodynamicIntelligenceDashboard };
