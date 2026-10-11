"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ClinicalEvent } from "@/types/uc01";
import { useTranslation } from "@/context/LocalizationContext";

export interface RecentEventsPanelProps {
  events: ClinicalEvent[];
  onViewAll?: () => void;
}

export const RecentEventsPanel: React.FC<RecentEventsPanelProps> = ({
  events,
  onViewAll,
}) => {
  const { t } = useTranslation("uc01");

  return (
    <div className="bg-[#07131B] border border-[rgba(35,160,220,0.45)] rounded-[2px] p-2 flex flex-col justify-between select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-[rgba(35,160,220,0.45)] mb-1">
        <h3 className="text-[16px] font-semibold text-[#F4F7F8] tracking-wide">
          {t("recentEvents.title")}
        </h3>
        <Button
          variant="workstation"
          size="xs"
          onClick={onViewAll}
          className="text-[#A7B2B9] border-[rgba(35,160,220,0.45)]"
        >
          {t("recentEvents.viewAll", { count: events.length })}
        </Button>
      </div>

      {/* Dense Table */}
      <div className="w-full min-w-0 overflow-x-auto text-[12px]">
        {/* Table Head */}
        <div className="grid min-w-[300px] grid-cols-[52px_minmax(72px,0.8fr)_minmax(54px,0.6fr)_minmax(90px,1.4fr)] pb-1 border-b border-[rgba(35,160,220,0.3)] text-[#A7B2B9] font-medium text-[11.5px]">
          <div>{t("recentEvents.time")}</div>
          <div>{t("recentEvents.event")}</div>
          <div>{t("recentEvents.source")}</div>
          <div>{t("recentEvents.details")}</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[rgba(35,160,220,0.15)]">
          {events.map((e) => (
            <div
              key={e.id}
              className="grid min-w-[300px] grid-cols-[52px_minmax(72px,0.8fr)_minmax(54px,0.6fr)_minmax(90px,1.4fr)] py-[3px] items-center leading-tight hover:bg-[#0A1822] transition-colors"
            >
              <div className="font-mono tabular-nums text-[#A7B2B9] text-[11px]">
                {e.time}
              </div>
              <div
                className="text-[#F4F7F8] font-medium text-[12px] truncate pr-1"
                title={e.event}
              >
                {e.event}
              </div>
              <div className="text-[#A7B2B9] text-[11.5px] truncate">{e.source}</div>
              <div
                className="text-[#F4F7F8] text-[11.5px] truncate font-sans"
                title={e.details}
              >
                {e.details}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
