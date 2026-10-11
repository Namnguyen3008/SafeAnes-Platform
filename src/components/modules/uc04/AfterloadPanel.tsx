import React from "react";
import { DeterminantPillar } from "@/types/uc04";
import { useTranslation } from "@/context/LocalizationContext";
import { valuesToPath } from "./visualization/svgPaths";

export interface AfterloadPanelProps {
  afterload: DeterminantPillar;
}

export function AfterloadPanel({ afterload }: AfterloadPanelProps) {
  const { t } = useTranslation("uc04");
  const metric1Path = valuesToPath(afterload.metric1.trend ?? [], 38, 12, 500, 2_000);
  const metric2Path = valuesToPath(afterload.metric2.trend ?? [], 38, 12, 0, 3);
  const changeText = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value}%`;
  const changeArrow = (value: number | null) => value === null ? "" : value >= 0 ? "↑" : "↓";

  return (
    <div className="border border-[rgba(100,170,210,0.32)] bg-[#0A131B] rounded-[3px] flex flex-col overflow-hidden">
      <div className="bg-[#b91c1c] py-1 text-center text-[11px] font-extrabold text-[#FFFFFF] uppercase tracking-wider">
        {t("determinants.afterload")}
      </div>

      <div className="flex-1 p-1.5 flex flex-col justify-around gap-1.5">
        {/* Tile 1: SVR */}
        <div className="border border-[rgba(100,170,210,0.2)] bg-[#071018] p-1.5 rounded-[2px] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-[#F4F6F7]">{afterload.metric1.label}</div>
            <div className="text-[20px] font-black font-mono text-[#F4F6F7] tabular-nums leading-none mt-0.5">
              {afterload.metric1.value ?? "--"} <span className="text-[8px] text-[#AAB4BB] font-normal">{afterload.metric1.unit}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono font-bold tabular-nums" style={{ color: afterload.metric1.changePercent === null ? "#AAB4BB" : afterload.metric1.changePercent >= 0 ? "#F5E328" : "#4AF26F" }}>
              {changeArrow(afterload.metric1.changePercent)} {changeText(afterload.metric1.changePercent)}
            </div>
            {metric1Path && <svg width="38" height="12" viewBox="0 0 38 12" className="mt-0.5"><path d={metric1Path} fill="none" stroke="#F5E328" strokeWidth="1.5" strokeLinecap="round" /></svg>}
          </div>
        </div>

        {/* Tile 2: Eadyn */}
        <div className="border border-[rgba(100,170,210,0.2)] bg-[#071018] p-1.5 rounded-[2px] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-[#F4F6F7]">{afterload.metric2.label}</div>
            <div className="text-[20px] font-black font-mono text-[#F4F6F7] tabular-nums leading-none mt-0.5">
              {afterload.metric2.value?.toFixed(1) ?? "--"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono font-bold tabular-nums" style={{ color: afterload.metric2.changePercent === null ? "#AAB4BB" : afterload.metric2.changePercent >= 0 ? "#F5E328" : "#4AF26F" }}>
              {changeArrow(afterload.metric2.changePercent)} {changeText(afterload.metric2.changePercent)}
            </div>
            {metric2Path && <svg width="38" height="12" viewBox="0 0 38 12" className="mt-0.5"><path d={metric2Path} fill="none" stroke="#F5E328" strokeWidth="1.5" strokeLinecap="round" /></svg>}
          </div>
        </div>
      </div>

      <div className="text-[9px] text-center text-[#AAB4BB] py-1 bg-[#071018] border-t border-[rgba(100,170,210,0.2)] leading-tight">
        {afterload.footerSubtitle}
        <div className="font-bold text-[#F4F6F7] text-[11px]">{afterload.footerTitle}</div>
      </div>
    </div>
  );
}
