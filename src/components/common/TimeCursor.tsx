"use client";

import React from "react";

export interface TimeCursorProps {
  x: number | string;
  timeLabel?: string;
  color?: string;
  lineStyle?: "solid" | "dashed";
  showPill?: boolean;
  pillPosition?: "top" | "bottom";
  className?: string;
}

export function TimeCursor({
  x,
  timeLabel,
  color = "var(--safe-cyan)",
  lineStyle = "solid",
  showPill = true,
  pillPosition = "top",
  className = "",
}: TimeCursorProps) {
  const leftValue = typeof x === "number" ? `${x}px` : x;

  return (
    <div
      className={`absolute top-0 bottom-0 pointer-events-none z-30 transition-all duration-75 ${className}`}
      style={{ left: leftValue }}
    >
      {/* Vertical Indicator Line */}
      <div
        className="w-[1.5px] h-full"
        style={{
          backgroundColor: color,
          borderStyle: lineStyle,
          boxShadow: `0 0 6px ${color}80`,
        }}
      />

      {/* Timestamp Pill Marker */}
      {showPill && timeLabel && (
        <div
          className={`absolute -translate-x-1/2 px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono font-bold leading-none select-none shadow-md ${
            pillPosition === "bottom" ? "bottom-1" : "top-1"
          }`}
          style={{
            backgroundColor: "#07121A",
            color: color,
            border: `1px solid ${color}80`,
          }}
        >
          {timeLabel}
        </div>
      )}
    </div>
  );
}
