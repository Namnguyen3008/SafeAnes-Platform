import React from "react";
import { SafeAnesCaseProvider } from "@/context/CaseContext";
import { SafeAnesSimulationProvider } from "@/context/SimulationReplayContext";
import { SafeAnesAppShell } from "@/components/shell/SafeAnesAppShell";
import { SafeAnesDataProvider } from "@/context/UC04VitalDbContext";

export default function CaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SafeAnesSimulationProvider>
      <SafeAnesCaseProvider>
        <SafeAnesDataProvider>
          <SafeAnesAppShell>{children}</SafeAnesAppShell>
        </SafeAnesDataProvider>
      </SafeAnesCaseProvider>
    </SafeAnesSimulationProvider>
  );
}
