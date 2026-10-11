"use client";

import React from "react";

export function ModuleViewport({ children }: { children: React.ReactNode }) {
  return (
    <main className="clinical-module-viewport bg-safe-bg p-[var(--safe-panel-gap)] flex flex-col min-w-0 min-h-0 flex-1 overflow-auto overscroll-contain">
      {children}
    </main>
  );
}
