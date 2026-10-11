"use client";

import React from "react";
import { Cpu } from "lucide-react";
import { useTranslation } from "@/context/LocalizationContext";
import { useSimulationReplay } from "@/context/SimulationReplayContext";
import { adaptUc01Snapshot } from "@/simulation";

export default function DataIntegrityPage() {
  const { snapshot } = useSimulationReplay();
  const dataIntegrity = adaptUc01Snapshot(snapshot).dataIntegrity;
  const deviceSources = dataIntegrity?.deviceSources ?? [];
  const signals = dataIntegrity?.signals ?? [];
  const { t } = useTranslation("common");
  const qualityPriority = ["TECHNICAL_DROPOUT", "INVALIDATED_ARTIFACT", "DEGRADED", "EXPECTED_INTERMITTENT", "UNKNOWN", "STRUCTURAL_NOT_MONITORED"];
  const signalQuality = qualityPriority.find((status) => signals.some((signal) => signal.qualityState === status))
    ?? (deviceSources.some((device) => device.status === "DEGRADED") ? "DEGRADED" : "GOOD");
  const feedsConnected = deviceSources.length > 0 && deviceSources.every((device) => device.status === "CONNECTED");
  const feedsDisconnected = deviceSources.some((device) => device.status === "DISCONNECTED");
  const telemetryStatus = feedsConnected
    ? t("deviceStatus.active").toUpperCase()
    : feedsDisconnected ? t("deviceStatus.offline").toUpperCase() : t("quality.degraded").toUpperCase();
  const qualityColor = signalQuality === "GOOD" ? "text-[#2AD86A]" :
    signalQuality === "DEGRADED" ? "text-[#FFD429]" :
      signalQuality === "EXPECTED_INTERMITTENT" ? "text-[#13BDF3]" : "text-[#FF6675]";
  const monitorOffset = dataIntegrity?.clockSync.monitorOffset ?? "—";

  return (
    <div className="w-full min-w-0 min-h-full flex flex-col gap-3 p-2 bg-[#07121A] border border-[rgba(45,155,215,0.38)] rounded-[3px]">
      <div className="flex items-center gap-2 pb-2 border-b border-[rgba(45,155,215,0.20)]">
        <Cpu className="w-5 h-5 text-[#00E5FF]" />
        <h2 className="text-sm font-bold text-[#F4F7F8] tracking-wide">
          {t("overview.command.dataIntegrityHeader")}
        </h2>
      </div>
      <div className="p-4 bg-[#02080C] rounded border border-[rgba(45,155,215,0.20)] text-xs text-[#A6B2BA] space-y-2">
        <p>{t("overview.command.dataIntegrityDesc")}</p>
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="p-3 bg-[#0A1720] rounded border border-[rgba(45,155,215,0.20)]">
            <div className="text-[10px] text-[#A6B2BA]">{t("overview.command.signalQuality")}</div>
            <div className={`text-sm font-bold mt-1 ${qualityColor}`}>{signalQuality}</div>
          </div>
          <div className="p-3 bg-[#0A1720] rounded border border-[rgba(45,155,215,0.20)]">
            <div className="text-[10px] text-[#A6B2BA]">{t("overview.command.telemetryLink")}</div>
            <div className={`text-sm font-bold mt-1 ${feedsConnected ? "text-[#2AD86A]" : feedsDisconnected ? "text-[#FF6675]" : "text-[#FFD429]"}`}>{telemetryStatus}</div>
          </div>
          <div className="p-3 bg-[#0A1720] rounded border border-[rgba(45,155,215,0.20)]">
            <div className="text-[10px] text-[#A6B2BA]">{t("overview.command.timeSyncOffset")}</div>
            <div className="text-sm font-bold text-[#00E5FF] mt-1">{monitorOffset}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
