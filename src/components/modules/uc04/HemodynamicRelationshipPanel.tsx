"use client";

import React from "react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { useTranslation } from "@/context/LocalizationContext";
import { PreloadPanel } from "./PreloadPanel";
import { ContractilityPanel } from "./ContractilityPanel";
import { AfterloadPanel } from "./AfterloadPanel";
import { valuesToPath } from "./visualization/svgPaths";

export function HemodynamicRelationshipPanel() {
  const { relationship, trendSamples, medicationOverlap, dataSourceMode, vitalDbProjection } = useHemodynamic();
  const { t } = useTranslation("uc04");
  if (dataSourceMode === "VITALDB_REPLAY") {
    const rows = [
      ["MAP", "mmHg"], ["SBP", "mmHg"], ["DBP", "mmHg"], ["HR", "/min"],
      ["CI", "L/min/m²"], ["SV", "mL/beat"], ["SVV", "%"], ["SVR", "dyn·s/cm⁵"],
    ] as const;
    return (
      <div className="bg-[#071018] border border-[rgba(100,170,210,0.32)] rounded-[3px] p-2.5 flex flex-col justify-between overflow-hidden h-full select-none">
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[rgba(100,170,210,0.32)]">
          <h2 className="text-[15px] font-bold text-[#F4F6F7] tracking-tight">{t("determinants.title")}</h2>
          <span className="text-[10px] text-[#AAB4BB]">{t("vitaldb.recordedDataLabel")}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 py-2">
          {rows.map(([signal, unit]) => {
            const observation = vitalDbProjection?.latestBySignal[signal];
            const observed = observation && !observation.is_missing && typeof observation.value === "number"
              ? observation.value
              : null;
            return (
              <div key={signal} className="flex items-center justify-between gap-2 border-b border-[rgba(100,170,210,0.12)] px-1 py-1.5">
                <span className="font-mono text-[12px] font-bold text-[#AAB4BB]">{signal}</span>
                <span className="min-w-0 text-right font-mono text-[12px] tabular-nums text-[#F4F6F7]">
                  {observed === null ? t("vitaldb.dataNotAvailable") : `${formatObserved(observed)} ${observation?.unit || unit}`}
                </span>
              </div>
            );
          })}
        </div>
        <p className="border-l-2 border-[#B392F0] pl-2 text-[10px] leading-snug text-[#AAB4BB]">
          {t("vitaldb.relationshipUnavailable")}
        </p>
      </div>
    );
  }
  const { map, preload, contractility, afterload } = relationship;
  const mapTrend = valuesToPath(trendSamples.map((sample) => sample.map), 44, 10, 40, 120);

  return (
    <div className="bg-[#071018] border border-[rgba(100,170,210,0.32)] rounded-[3px] p-2.5 flex flex-col justify-between overflow-hidden h-full select-none">
      {/* ======================================================== */}
      {/* PANEL HEADER                                             */}
      {/* ======================================================== */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[rgba(100,170,210,0.32)]">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[15px] font-bold text-[#F4F6F7] tracking-tight">
            {t("determinants.title")}
          </h2>
          <span className="text-[12px] text-[#AAB4BB] font-normal">{t("determinants.mapDeterminants")}</span>
        </div>
        {medicationOverlap && <span title={`${medicationOverlap.medicationName} · ${medicationOverlap.timestamp} · ${t("simulation.overlapNote")}`} className="shrink-0 rounded-sm border border-safe-cyan/40 px-1 py-0.5 text-[9px] font-mono text-safe-cyan">{t("simulation.overlapLabel")}</span>}
      </div>

      {/* ======================================================== */}
      {/* MAP ROOT NODE & 3-WAY RELATIONSHIP TREE                  */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col items-center justify-between py-1">
        {/* Center Top Root Node: MAP */}
        <div className="w-[188px] bg-[#0A131B] border border-[#F5E328]/75 rounded-[3px] py-1.5 px-3 flex flex-col items-center shadow-none">
          <span className="text-[11px] font-bold text-[#AAB4BB] leading-none mb-0.5">MAP</span>
          <div className="flex items-baseline gap-2">
            <span className="text-[38px] font-black font-mono text-[#F5E328] leading-none tabular-nums tracking-tight">
              {map.value ?? "--"}
            </span>
            <span className="text-[13px] font-bold font-mono text-[#F4F6F7] tabular-nums">
              {map.changePercent === null ? "—" : `${map.changePercent > 0 ? "+" : ""}${map.changePercent}%`}
            </span>
          </div>
          <div className="w-full flex items-center justify-between mt-1 px-1">
            <span className="text-[10px] text-[#AAB4BB] font-mono leading-none">{map.unit}</span>
            {/* Small downward trend sparkline */}
            <svg width="44" height="10" viewBox="0 0 44 10" className="overflow-visible">
              <path d={mapTrend} fill="none" stroke="#F5E328" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* SVG Connecting Tree: Perfectly aligned to the 3 column centers */}
        <div className="w-full flex items-center justify-center my-0.5 px-0.5">
          <svg
            className="w-full h-[18px]"
            viewBox="0 0 600 18"
            preserveAspectRatio="none"
            fill="none"
          >
            {/* Stem from MAP root (x=300, y=0) dropping to horizontal bar at y=6 */}
            <line x1="300" y1="0" x2="300" y2="6" stroke="rgba(100,170,210,0.5)" strokeWidth="1.5" />
            {/* Horizontal distribution bar spanning Column 1 center (100) to Column 3 center (500) */}
            <line x1="100" y1="6" x2="500" y2="6" stroke="rgba(100,170,210,0.5)" strokeWidth="1.5" />
            {/* 3 Vertical branches dropping into column tops */}
            <line x1="100" y1="6" x2="100" y2="18" stroke="rgba(100,170,210,0.5)" strokeWidth="1.5" />
            <line x1="300" y1="6" x2="300" y2="18" stroke="rgba(100,170,210,0.5)" strokeWidth="1.5" />
            <line x1="500" y1="6" x2="500" y2="18" stroke="rgba(100,170,210,0.5)" strokeWidth="1.5" />
          </svg>
        </div>

        {/* ====================================================== */}
        {/* THREE DETERMINANT GROUPS: PRELOAD, CONTRACTILITY, AFTERLOAD */}
        {/* ====================================================== */}
        <div className="w-full grid grid-cols-3 gap-2 flex-1">
          <PreloadPanel preload={preload} />
          <ContractilityPanel contractility={contractility} />
          <AfterloadPanel afterload={afterload} />
        </div>
      </div>
    </div>
  );
}

function formatObserved(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export { HemodynamicRelationshipPanel as HemodynamicRelationship };
