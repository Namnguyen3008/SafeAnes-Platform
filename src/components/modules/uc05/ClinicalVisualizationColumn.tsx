"use client";

import React from "react";
import { CapnogramPanel } from "./CapnogramPanel";
import { PlethysmographPanel } from "./PlethysmographPanel";
import { TrendWorkspace } from "./TrendWorkspace";
import { BottomReviewGrid, AlarmReviewTable, TabularTrendTable } from "./BottomReviewGrid";
import {
  WaveformSample,
  SignalQuality,
  RespiratoryEvent,
  TabularTrendRecord,
} from "@/types/uc05";

export { CapnogramPanel, PlethysmographPanel, TrendWorkspace, BottomReviewGrid, AlarmReviewTable, TabularTrendTable };

export interface ClinicalVisualizationColumnProps {
  capnogramWaveform: WaveformSample | null;
  plethWaveform: WaveformSample | null;
  signalQuality: SignalQuality;
  recordedDataMode: boolean;
  alarmReview: RespiratoryEvent[];
  tabularTrends: TabularTrendRecord[];
}

export function ClinicalVisualizationColumn({
  capnogramWaveform,
  plethWaveform,
  signalQuality,
  recordedDataMode,
  alarmReview,
  tabularTrends,
}: ClinicalVisualizationColumnProps) {
  return (
    <div className="uc05-visualization-column flex flex-col gap-1.5 h-full min-h-0 min-w-0 overflow-hidden">
      {/* 1. Capnogram Panel: 170px */}
      <CapnogramPanel
        waveform={capnogramWaveform}
        signalQuality={signalQuality?.capnogram}
        recordedDataMode={recordedDataMode}
      />

      {/* 2. Plethysmograph Panel: 135px */}
      <PlethysmographPanel
        waveform={plethWaveform}
        signalQuality={signalQuality?.pleth}
        recordedDataMode={recordedDataMode}
      />

      {/* 3. Trend Workspace: 280px */}
      <TrendWorkspace />

      {/* 4. Bottom Review Grid: ~266px */}
      <BottomReviewGrid
        alarmEvents={alarmReview}
        tabularTrends={tabularTrends}
      />
    </div>
  );
}

export default ClinicalVisualizationColumn;
