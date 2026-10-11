"use client";

import React from "react";
import { Bookmark } from "lucide-react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { valuesToPath } from "./visualization/svgPaths";
import { useTranslation } from "@/context/LocalizationContext";

export function MapSummaryTile() {
  const { vitals, trendSamples, dataSourceMode, vitalDbProjection } = useHemodynamic();
  const { t } = useTranslation("uc04");
  const unavailable = dataSourceMode === "VITALDB_REPLAY" && vitals.map === null;
  const mapPath = valuesToPath(trendSamples.map((sample) => sample.map), 150, 46, 50, 150);

  return (
    <div className="uc04-map-tile shrink-0 min-w-0 bg-[#071018] border-2 border-[#F5E328] rounded-[3px] p-2.5 flex items-center justify-between overflow-hidden select-none">
      <div className="flex flex-col justify-between h-full py-0.5">
        <div className="flex items-center gap-1.5">
          <Bookmark className="w-4 h-4 fill-[#F5E328] text-[#F5E328]" />
          <span className="text-[15px] font-bold text-[#F4F6F7] tracking-wide">MAP</span>
          {dataSourceMode === "VITALDB_REPLAY" && (
            <span className="rounded-sm border border-[#F5E328]/30 px-1 py-0.5 text-[8px] font-semibold leading-none text-[#F5E328]">
              {vitalDbProjection?.latestBySignal.MAP?.quality ?? "UNKNOWN"}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className={`${unavailable ? "text-[10px] whitespace-normal leading-snug" : "uc04-clinical-value leading-none tracking-tighter"} font-black font-mono text-[#F4F6F7] tabular-nums`}>
            {unavailable ? t("vitaldb.dataNotAvailable") : vitals.map ?? "--"}
          </span>
          {!unavailable && <span className="text-[12px] text-[#AAB4BB] font-mono">mmHg</span>}
        </div>
      </div>

      <div className="w-[150px] h-full flex flex-col justify-between items-end text-[10px] font-mono text-[#AAB4BB] py-0.5">
        <span>150</span>
        <div className="w-full h-[46px] flex items-center">
          <svg className="w-full h-full" viewBox="0 0 150 46">
            <path
              d={mapPath}
              fill="none"
              stroke="#F5E328"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <span>50</span>
      </div>
    </div>
  );
}
