"use client";

import React from "react";
import { OverviewGaugeStrip } from "./OverviewGaugeStrip";
import { MiniSignalTrendPanel } from "./MiniSignalTrendPanel";
import { HemodynamicTrendPanel } from "./HemodynamicTrendPanel";
import { HemodynamicRelationshipPanel } from "./HemodynamicRelationshipPanel";
import { RecentEventsPanel } from "./RecentEventsPanel";

export function MainClinicalWorkspace() {
  return (
    <main className="uc04-main-workspace flex-1 h-full min-w-[700px] min-h-0 overflow-hidden select-none">
      {/* ======================================================== */}
      {/* ROW 1: TOP OVERVIEW ROW (~28% height, 229px)             */}
      {/* ======================================================== */}
      <section className="h-full min-h-0 min-w-0 grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-2.5">
        <OverviewGaugeStrip />
        <MiniSignalTrendPanel />
      </section>

      {/* ======================================================== */}
      {/* ROW 2: TREND & RELATIONSHIP ROW (~53% height, 430px)     */}
      {/* ======================================================== */}
      <section className="h-full min-h-0 min-w-0 grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-2.5">
        <HemodynamicTrendPanel />
        <HemodynamicRelationshipPanel />
      </section>

      {/* ======================================================== */}
      {/* ROW 3: RECENT EVENTS PANEL (~19% height, 168px)          */}
      {/* ======================================================== */}
      <RecentEventsPanel />
    </main>
  );
}
