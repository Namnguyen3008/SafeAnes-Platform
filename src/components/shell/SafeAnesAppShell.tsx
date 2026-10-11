"use client";

import React from "react";
import { GlobalClinicalHeader } from "./GlobalClinicalHeader";
import { ClinicalNavigationRail } from "./ClinicalNavigationRail";
import { ModuleViewport } from "./ModuleViewport";

export function SafeAnesAppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen w-full min-w-[1280px] bg-[#02080C] text-[#F4F7F8] overflow-hidden select-none">
      {/* Persistent Global Clinical Header (Branding, Patient, OR, Proc, Anes, Status, Time, Devices, Alerts) */}
      <GlobalClinicalHeader />

      {/* Workstation Workspace: Persistent Navigation Rail + Isolated Module Viewport */}
      <div className="flex flex-1 min-h-0 min-w-0 w-full overflow-hidden">
        <ClinicalNavigationRail />
        <ModuleViewport>{children}</ModuleViewport>
      </div>
    </div>
  );
}
