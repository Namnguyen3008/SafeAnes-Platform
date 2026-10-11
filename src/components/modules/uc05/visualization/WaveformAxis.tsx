"use client";

import React from "react";

export interface AxisTick {
  value: number | string;
  isPrimary?: boolean;
}

export interface WaveformAxisProps {
  ticks: AxisTick[];
  unit: string;
  className?: string;
}

export function WaveformAxis({ ticks, unit, className = "" }: WaveformAxisProps) {
  const unitNotRecorded = unit.trim().toUpperCase() === "NOT_RECORDED";

  return (
    <div
      className={`w-[58px] shrink-0 flex flex-col justify-between py-1 text-[12px] tabular-nums font-mono select-none ${className}`}
    >
      {/* Top Tick with Unit */}
      <div className="flex flex-col">
        <span className="leading-none text-[#F4F6F7] font-medium">{ticks[0]?.value}</span>
        <span
          className="block max-w-full whitespace-normal break-words text-[9px] leading-tight text-[#A7B0B6] mt-0.5"
          title={unit}
          aria-label={unit}
        >
          {unitNotRecorded ? "—" : unit}
        </span>
      </div>

      {/* Intermediate Ticks */}
      {ticks.slice(1, -1).map((tick, idx) => (
        <span key={idx} className="leading-none text-[#A7B0B6]">
          {tick.value}
        </span>
      ))}

      {/* Bottom Tick */}
      {ticks.length > 1 && (
        <span className="leading-none text-[#A7B0B6]">{ticks[ticks.length - 1]?.value}</span>
      )}
    </div>
  );
}

export default WaveformAxis;
