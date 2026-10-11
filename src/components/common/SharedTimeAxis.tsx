"use client";

import React from "react";

interface SharedTimeAxisProps {
  ticks?: string[];
  selectedTime?: string;
  onSelectTime?: (time: string) => void;
  paddingX?: string;
  className?: string;
}

export function SharedTimeAxis({
  ticks = [],
  selectedTime,
  onSelectTime,
  paddingX = "px-[135px]",
  className = "",
}: SharedTimeAxisProps) {
  return (
    <div
      className={`flex justify-between items-center text-[10.5px] font-mono text-safe-text-muted pt-1 border-t border-safe-border ${paddingX} tabular-nums select-none ${className}`}
    >
      {ticks.map((tick) => (
        <span
          key={tick}
          className={`cursor-pointer transition-colors hover:text-safe-text ${
            tick === selectedTime
              ? "text-safe-cyan font-semibold border-b border-safe-cyan pb-0.5"
              : ""
          }`}
          onClick={() => onSelectTime && onSelectTime(tick)}
        >
          {tick}
        </span>
      ))}
    </div>
  );
}
