"use client";

import React from "react";
import { Activity } from "lucide-react";
import { useTranslation } from "@/context/LocalizationContext";

export function PhysiologicSummaryPanel() {
  const { t } = useTranslation("uc01");
  return (
    <div className="bg-safe-surface border border-safe-border rounded-sm p-2 flex flex-col justify-between select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-safe-border mb-1.5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-safe-text">
          {t("realtime.title")}
        </h3>
        <button
          className="w-5 h-5 flex items-center justify-center bg-safe-surface-secondary border border-safe-border-light rounded-sm text-safe-cyan hover:bg-safe-surface-elevated transition-colors cursor-pointer"
          title="Telemetry waveform audio active"
        >
          <Activity className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2x2 Telemetry Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {/* MAP */}
        <div className="bg-safe-surface-secondary border border-safe-border-light rounded-sm p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex flex-col leading-none">
              <span className="text-xs font-bold text-safe-yellow">MAP</span>
              <span className="text-[10px] text-safe-text-muted font-mono mt-0.5">mmHg</span>
            </div>
            <div className="text-[46px] font-bold text-safe-yellow font-mono tabular-nums leading-none tracking-tight">
              78
            </div>
            <div className="flex flex-col text-right text-[10px] font-mono tabular-nums text-safe-text-muted leading-none">
              <span>120</span>
              <span className="mt-3">40</span>
            </div>
          </div>
          {/* Sparkline */}
          <div className="w-full h-5 relative pt-1">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 100 20">
              <path
                d="M 0 12 Q 15 15, 25 10 T 50 12 T 75 14 T 100 11"
                fill="none"
                stroke="var(--safe-yellow)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* HR */}
        <div className="bg-safe-surface-secondary border border-safe-border-light rounded-sm p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex flex-col leading-none">
              <span className="text-xs font-bold text-safe-green">HR</span>
              <span className="text-[10px] text-safe-text-muted font-mono mt-0.5">bpm</span>
            </div>
            <div className="text-[46px] font-bold text-safe-green font-mono tabular-nums leading-none tracking-tight">
              72
            </div>
            <div className="flex flex-col text-right text-[10px] font-mono tabular-nums text-safe-text-muted leading-none">
              <span>140</span>
              <span className="mt-3">40</span>
            </div>
          </div>
          {/* Sparkline */}
          <div className="w-full h-5 relative pt-1">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 100 20">
              <path
                d="M 0 10 L 22 10 L 26 4 L 30 16 L 34 10 L 62 10 L 66 4 L 70 16 L 74 10 L 100 10"
                fill="none"
                stroke="var(--safe-green)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* SpO2 */}
        <div className="bg-safe-surface-secondary border border-safe-border-light rounded-sm p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex flex-col leading-none">
              <span className="text-xs font-bold text-safe-cyan">SpO₂</span>
              <span className="text-[10px] text-safe-text-muted font-mono mt-0.5">%</span>
            </div>
            <div className="text-[46px] font-bold text-safe-cyan font-mono tabular-nums leading-none tracking-tight">
              99
            </div>
            <div className="flex flex-col text-right text-[10px] font-mono tabular-nums text-safe-text-muted leading-none">
              <span>100</span>
              <span className="mt-3">90</span>
            </div>
          </div>
          {/* Sparkline */}
          <div className="w-full h-5 relative pt-1">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 100 20">
              <path
                d="M 0 8 Q 15 6, 25 12 T 50 9 T 75 7 T 100 10"
                fill="none"
                stroke="var(--safe-cyan)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* EtCO2 */}
        <div className="bg-safe-surface-secondary border border-safe-border-light rounded-sm p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex flex-col leading-none">
              <span className="text-xs font-bold text-safe-text">EtCO₂</span>
              <span className="text-[10px] text-safe-text-muted font-mono mt-0.5">mmHg</span>
            </div>
            <div className="text-[46px] font-bold text-safe-text font-mono tabular-nums leading-none tracking-tight">
              36
            </div>
            <div className="flex flex-col text-right text-[10px] font-mono tabular-nums text-safe-text-muted leading-none">
              <span>60</span>
              <span className="mt-3">20</span>
            </div>
          </div>
          {/* Sparkline */}
          <div className="w-full h-5 relative pt-1">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 100 20">
              <path
                d="M 0 11 Q 15 9, 25 13 T 50 11 T 75 12 T 100 10"
                fill="none"
                stroke="var(--safe-text)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
