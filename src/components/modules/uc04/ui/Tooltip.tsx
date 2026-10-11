import React from "react";

export interface TooltipProps {
  visible: boolean;
  x: number;
  y: number;
  time: string;
  param: string;
  value: string | number;
  unit: string;
}

export function TrackTooltip({ visible, x, y, time, param, value, unit }: TooltipProps) {
  if (!visible) return null;

  return (
    <div
      style={{ left: `${x}px`, top: `${y}px` }}
      className="absolute z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full -mt-2 bg-safe-surface-elevated border border-safe-cyan shadow-[0_0_12px_rgba(0,229,255,0.3)] rounded-sm px-2.5 py-1 text-[11px] font-mono select-none"
    >
      <div className="flex items-center gap-1.5 border-b border-safe-border-light pb-0.5 mb-0.5 text-safe-text-muted text-[10px]">
        <span className="w-1.5 h-1.5 rounded-full bg-safe-cyan" />
        <span>{time}</span>
      </div>
      <div className="flex items-baseline gap-1 text-safe-text">
        <span className="font-bold text-safe-cyan">{param}:</span>
        <span className="font-black text-[13px] tabular-nums">{value}</span>
        <span className="text-[10px] text-safe-text-muted">{unit}</span>
      </div>
    </div>
  );
}
