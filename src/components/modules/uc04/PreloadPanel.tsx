import React from "react";
import { DeterminantPillar } from "@/types/uc04";
import { useTranslation } from "@/context/LocalizationContext";
import { valuesToPath } from "./visualization/svgPaths";

export interface PreloadPanelProps {
  preload: DeterminantPillar;
}

export function PreloadPanel({ preload }: PreloadPanelProps) {
  const { t } = useTranslation("uc04");
  const metric1Path = valuesToPath(preload.metric1.trend ?? [], 38, 12, 0, 30);
  const metric2Path = valuesToPath(preload.metric2.trend ?? [], 38, 12, 50, 150);
  const changeText = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value}%`;
  const changeArrow = (value: number | null) => value === null ? "" : value >= 0 ? "↑" : "↓";

  return (
    <div className="border border-[rgba(100,170,210,0.32)] bg-[#0A131B] rounded-[3px] flex flex-col overflow-hidden">
      <div className="bg-[#0284c7] py-1 text-center text-[11px] font-extrabold text-[#FFFFFF] uppercase tracking-wider">
        {t("determinants.preload")}
      </div>

      <div className="flex-1 p-1.5 flex flex-col justify-around gap-1.5">
        {/* Tile 1: SVV */}
        <div className="border border-[rgba(100,170,210,0.2)] bg-[#071018] p-1.5 rounded-[2px] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-[#F4F6F7]">{preload.metric1.label}</div>
            <div className="text-[20px] font-black font-mono text-[#F4F6F7] tabular-nums leading-none mt-0.5">
              {preload.metric1.value ?? "--"} <span className="text-[10px] text-[#AAB4BB] font-normal">{preload.metric1.unit}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono font-bold tabular-nums" style={{ color: preload.metric1.changePercent === null ? "#AAB4BB" : preload.metric1.changePercent <= 0 ? "#4AF26F" : "#F5E328" }}>
              {changeArrow(preload.metric1.changePercent)} {changeText(preload.metric1.changePercent)}
            </div>
            {metric1Path && <svg width="38" height="12" viewBox="0 0 38 12" className="mt-0.5"><path d={metric1Path} fill="none" stroke="#4AF26F" strokeWidth="1.5" strokeLinecap="round" /></svg>}
          </div>
        </div>

        {/* Tile 2: SV */}
        <div className="border border-[rgba(100,170,210,0.2)] bg-[#071018] p-1.5 rounded-[2px] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-[#F4F6F7]">{preload.metric2.label}</div>
            <div className="text-[20px] font-black font-mono text-[#F4F6F7] tabular-nums leading-none mt-0.5">
              {preload.metric2.value ?? "--"} <span className="text-[10px] text-[#AAB4BB] font-normal">{preload.metric2.unit}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono font-bold tabular-nums" style={{ color: preload.metric2.changePercent === null ? "#AAB4BB" : preload.metric2.changePercent >= 0 ? "#4AF26F" : "#FF3348" }}>
              {changeArrow(preload.metric2.changePercent)} {changeText(preload.metric2.changePercent)}
            </div>
            {metric2Path && <svg width="38" height="12" viewBox="0 0 38 12" className="mt-0.5"><path d={metric2Path} fill="none" stroke="#4AF26F" strokeWidth="1.5" strokeLinecap="round" /></svg>}
          </div>
        </div>
      </div>

      <div className="text-[9px] text-center text-[#AAB4BB] py-1 bg-[#071018] border-t border-[rgba(100,170,210,0.2)] leading-tight">
        {preload.footerSubtitle}
        <div className="font-bold text-[#F4F6F7] text-[11px]">{preload.footerTitle}</div>
      </div>
    </div>
  );
}
