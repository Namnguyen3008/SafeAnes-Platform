"use client";

import React from "react";

export default function CaseModuleLoading() {
  return (
    <div className="w-full h-full flex flex-col gap-[var(--safe-panel-gap)] p-2 select-none overflow-hidden animate-pulse">
      {/* Top module header bar placeholder */}
      <div className="h-12 w-full bg-safe-surface/90 rounded border border-safe-border/60 flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full bg-safe-cyan/40 animate-ping" />
          <div className="h-4 w-44 bg-safe-border/80 rounded" />
          <div className="h-3 w-28 bg-safe-border/40 rounded hidden sm:block" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-20 bg-safe-border/50 rounded" />
          <div className="h-6 w-24 bg-safe-border/50 rounded" />
        </div>
      </div>

      {/* Main clinical workstation workspace split */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-[var(--safe-panel-gap)] min-h-0">
        {/* Left primary visualization workspace */}
        <div className="lg:col-span-8 2xl:col-span-9 flex flex-col gap-[var(--safe-panel-gap)] min-h-0">
          {/* Upper strip */}
          <div className="h-28 w-full bg-safe-surface/70 rounded border border-safe-border/50 p-3 flex flex-col justify-between">
            <div className="h-3 w-36 bg-safe-border/60 rounded" />
            <div className="grid grid-cols-4 gap-2">
              <div className="h-12 bg-safe-border/30 rounded" />
              <div className="h-12 bg-safe-border/30 rounded" />
              <div className="h-12 bg-safe-border/30 rounded" />
              <div className="h-12 bg-safe-border/30 rounded" />
            </div>
          </div>
          {/* Main central plot or table viewport */}
          <div className="flex-1 w-full bg-safe-surface/50 rounded border border-safe-border/40 p-4 flex flex-col justify-between min-h-0">
            <div className="flex justify-between items-center border-b border-safe-border/30 pb-2">
              <div className="h-4 w-48 bg-safe-border/50 rounded" />
              <div className="h-3 w-24 bg-safe-border/40 rounded" />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-safe-text-muted">
                <div className="w-6 h-6 border-2 border-safe-cyan/40 border-t-safe-cyan rounded-full animate-spin" />
                <span className="text-[11px] font-mono tracking-wider text-safe-cyan/80">LOADING WORKSPACE...</span>
              </div>
            </div>
            <div className="h-8 w-full bg-safe-border/20 rounded border border-safe-border/20" />
          </div>
        </div>

        {/* Right decision/alert summary rail */}
        <div className="lg:col-span-4 2xl:col-span-3 flex flex-col gap-[var(--safe-panel-gap)] min-h-0">
          <div className="h-36 w-full bg-safe-surface/70 rounded border border-safe-border/50 p-3 flex flex-col justify-between">
            <div className="h-3 w-28 bg-safe-border/60 rounded" />
            <div className="h-16 bg-safe-border/30 rounded" />
          </div>
          <div className="flex-1 w-full bg-safe-surface/50 rounded border border-safe-border/40 p-3 flex flex-col gap-2 min-h-0">
            <div className="h-3 w-32 bg-safe-border/50 rounded" />
            <div className="h-20 bg-safe-border/25 rounded" />
            <div className="h-20 bg-safe-border/25 rounded" />
            <div className="flex-1 bg-safe-border/15 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
