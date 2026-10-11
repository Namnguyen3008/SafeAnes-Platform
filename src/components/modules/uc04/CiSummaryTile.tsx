"use client";

import React from "react";
import { Bookmark } from "lucide-react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { valuesToPath } from "./visualization/svgPaths";
import { useTranslation } from "@/context/LocalizationContext";

export function CiSummaryTile() {
  const { vitals, trendSamples, dataSourceMode } = useHemodynamic();
  const { t } = useTranslation("uc04");
  const unavailable = dataSourceMode === "VITALDB_REPLAY" && vitals.ci === null;
  const ciPath = valuesToPath(trendSamples.map((sample) => sample.ci), 150, 46, 1, 4);

  return (
    <div className="uc04-ci-tile shrink-0 min-w-0 bg-[#071018] border border-[rgba(100,170,210,0.32)] rounded-[3px] p-2.5 flex items-center justify-between overflow-hidden select-none">
      <div className="flex flex-col justify-between h-full py-0.5">
        <div className="flex items-center gap-1.5">
          <Bookmark className="w-4 h-4 fill-[#4AF26F] text-[#4AF26F]" />
          <span className="text-[15px] font-bold text-[#F4F6F7] tracking-wide">CI</span>
        </div>
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className={`${unavailable ? "text-[10px] whitespace-normal leading-snug" : "uc04-clinical-value leading-none tracking-tighter"} font-black font-mono text-[#F4F6F7] tabular-nums`}>
            {unavailable ? t("vitaldb.dataNotAvailable") : vitals.ci !== null ? vitals.ci.toFixed(1) : "--"}
          </span>
          {!unavailable && <span className="text-[12px] text-[#AAB4BB] font-mono">L/min/m²</span>}
        </div>
      </div>

      <div className="w-[150px] h-full flex flex-col justify-between items-end text-[10px] font-mono text-[#AAB4BB] py-0.5">
        <span>4.0</span>
        <div className="w-full h-[46px] flex items-center">
          <svg className="w-full h-full" viewBox="0 0 150 46">
            <path
              d={ciPath}
              fill="none"
              stroke="#4AF26F"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <span>1.0</span>
      </div>
    </div>
  );
}
