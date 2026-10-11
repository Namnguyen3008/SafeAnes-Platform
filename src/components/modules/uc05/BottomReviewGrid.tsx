"use client";

import React from "react";
import { AlarmReviewTable } from "./AlarmReviewTable";
import { TabularTrendTable } from "./TabularTrendTable";
import { RespiratoryEvent, TabularTrendRecord } from "@/types/uc05";

export { AlarmReviewTable, TabularTrendTable };

export interface BottomReviewGridProps {
  alarmEvents: RespiratoryEvent[];
  tabularTrends: TabularTrendRecord[];
}

export function BottomReviewGrid({
  alarmEvents,
  tabularTrends,
}: BottomReviewGridProps) {
  return (
    <div className="uc05-bottom-review flex-1 min-h-[200px] min-w-0 grid grid-cols-[minmax(420px,1.1fr)_minmax(360px,1fr)] gap-1.5 select-none">
      {/* Alarm Review: ~56% width */}
      <div className="min-w-0 flex">
        <AlarmReviewTable events={alarmEvents} />
      </div>

      {/* Tabular Trend: ~44% width */}
      <div className="min-w-0 flex">
        <TabularTrendTable rows={tabularTrends} />
      </div>
    </div>
  );
}

export default BottomReviewGrid;
