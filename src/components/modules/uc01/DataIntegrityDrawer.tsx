"use client";

import React, { useState } from "react";
import {
  Cpu,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sliders,
  ShieldCheck,
} from "lucide-react";
import { ClinicalDrawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import {
  DataIntegrityState,
  SignalProvenance,
  SignalQualityStatus,
  TransformationStatus,
} from "@/types/uc01";
import { useTranslation } from "@/context/LocalizationContext";

export interface DataIntegrityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  dataIntegrity: DataIntegrityState;
}

const statusBadgeConfig: Record<
  SignalQualityStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  GOOD: {
    label: "GOOD",
    bg: "bg-[#31E874]/15",
    text: "text-[#31E874]",
    border: "border-[#31E874]/40",
  },
  DEGRADED: {
    label: "DEGRADED",
    bg: "bg-[#FFD429]/15",
    text: "text-[#FFD429]",
    border: "border-[#FFD429]/40",
  },
  TECHNICAL_DROPOUT: {
    label: "TECHNICAL DROPOUT",
    bg: "bg-[#FF394D]/15",
    text: "text-[#FF394D]",
    border: "border-[#FF394D]/40",
  },
  EXPECTED_INTERMITTENT: {
    label: "EXPECTED INTERMITTENT",
    bg: "bg-[#13BDF3]/15",
    text: "text-[#13BDF3]",
    border: "border-[#13BDF3]/40",
  },
  STRUCTURAL_NOT_MONITORED: {
    label: "NOT MONITORED",
    bg: "bg-[#0A1822]",
    text: "text-[#A7B2B9]",
    border: "border-[#A7B2B9]/30",
  },
  INVALIDATED_ARTIFACT: {
    label: "INVALIDATED ARTIFACT",
    bg: "bg-[#FF394D]/15",
    text: "text-[#FF394D]",
    border: "border-[#FF394D]/40",
  },
  UNKNOWN: {
    label: "UNKNOWN",
    bg: "bg-[#0A1822]",
    text: "text-[#A7B2B9]",
    border: "border-[#A7B2B9]/30",
  },
};

const transformationConfig: Record<
  TransformationStatus,
  { label: string; color: string; border: string }
> = {
  RAW: {
    label: "RAW (Direct Sensor)",
    color: "text-[#31E874]",
    border: "border-[#31E874]/40",
  },
  NORMALIZED: {
    label: "NORMALIZED (BTPS)",
    color: "text-[#13BDF3]",
    border: "border-[#13BDF3]/40",
  },
  DERIVED: {
    label: "DERIVED (Annotated)",
    color: "text-[#FFD429]",
    border: "border-[#FFD429]/40",
  },
};

export const DataIntegrityDrawer: React.FC<DataIntegrityDrawerProps> = ({
  isOpen,
  onClose,
  dataIntegrity,
}) => {
  const { t } = useTranslation("uc01");
  // Default to BIS signal to immediately expose UC01 Imputation and Immutability rules
  const [selectedSignalId, setSelectedSignalId] = useState<string>("sig-bis");

  const selectedSignal: SignalProvenance | undefined =
    dataIntegrity.signals.find((s) => s.signalId === selectedSignalId) ||
    dataIntegrity.signals[0];

  return (
    <ClinicalDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={t("dataIntegrity.title")}
      subtitle={t("dataIntegrity.subtitle")}
      width="w-[520px]"
    >
      <div className="space-y-4 text-xs font-sans pb-4">
        {/* Top Clinical Trust Rule Banner */}
        <div className="p-2.5 rounded-[2px] bg-[#0A1822] border border-[rgba(35,160,220,0.45)]">
          <div className="flex items-center space-x-2 text-[#13BDF3] font-semibold text-[12px] mb-1">
            <ShieldCheck className="w-4 h-4 shrink-0 text-[#13BDF3]" />
            <span>{t("dataIntegrity.principleTitle")}</span>
          </div>
          <p className="text-[11px] text-[#A7B2B9] leading-snug">
            {t("dataIntegrity.principleDesc")}
          </p>
        </div>

        {/* Section 1: Device Sources */}
        <div>
          <div className="flex items-center justify-between pb-1 border-b border-[rgba(35,160,220,0.3)] mb-2">
            <span className="text-[11px] uppercase tracking-wider text-[#A7B2B9] font-semibold flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#13BDF3]" />
              {t("dataIntegrity.deviceSources", { count: dataIntegrity.deviceSources.length })}
            </span>
            <span className="text-[10px] text-[#31E874] font-mono font-medium">
              {dataIntegrity.deviceSources.every((device) => device.status === "CONNECTED")
                ? t("dataIntegrity.allFeedsLive")
                : t("dataIntegrity.feedsNeedReview")}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {dataIntegrity.deviceSources.map((device) => (
              <div
                key={device.id}
                className="p-2 rounded-[2px] bg-[#02080C] border border-[rgba(35,160,220,0.25)] flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11.5px]"
              >
                <div className="flex min-w-0 flex-1 items-center space-x-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      device.status === "CONNECTED"
                        ? "bg-[#31E874]"
                        : device.status === "DEGRADED"
                          ? "bg-[#FFD429]"
                          : "bg-[#FF394D]"
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="font-semibold text-[#F4F7F8]">
                      {device.name}
                    </span>
                    <span className="text-[10.5px] text-[#A7B2B9] ml-2 font-mono">
                      {device.model}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[10.5px] font-mono">
                  {device.latencyMs !== undefined && (
                    <span className="text-[#A7B2B9]">
                      latency:{" "}
                      <strong className="text-[#13BDF3]">
                        {device.latencyMs} ms
                      </strong>
                    </span>
                  )}
                  {device.lastMessageAt && (
                    <span className="text-[#A7B2B9]">{t("dataIntegrity.deviceLastMessage")} {device.lastMessageAt}</span>
                  )}
                  {device.details && (
                    <span className="text-[#A7B2B9]">{device.details}</span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded-[1px] text-[9.5px] uppercase font-bold border ${
                      device.status === "CONNECTED"
                        ? "bg-[#31E874]/10 text-[#31E874] border-[#31E874]/30"
                        : device.status === "DEGRADED"
                          ? "bg-[#FFD429]/10 text-[#FFD429] border-[#FFD429]/30"
                          : "bg-[#FF394D]/10 text-[#FF394D] border-[#FF394D]/30"
                    }`}
                  >
                    {device.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Clock & Synchronization */}
        <div>
          <div className="flex items-center justify-between pb-1 border-b border-[rgba(35,160,220,0.3)] mb-2">
            <span className="text-[11px] uppercase tracking-wider text-[#A7B2B9] font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#13BDF3]" />
              {t("dataIntegrity.clockSync")}
            </span>
            <span className="px-1.5 py-0.5 rounded-[1px] bg-[#31E874]/15 border border-[#31E874]/40 text-[#31E874] text-[10px] font-mono font-bold">
              {dataIntegrity.clockSync.clockStatus}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-[2px] bg-[#02080C] border border-[rgba(35,160,220,0.25)]">
              <span className="text-[#A7B2B9] text-[10px] block">
                {t("dataIntegrity.referenceClock")}
              </span>
              <span className="font-semibold text-[#F4F7F8] mt-0.5 block">
                {dataIntegrity.clockSync.referenceClock}
              </span>
            </div>

            <div className="p-2 rounded-[2px] bg-[#02080C] border border-[rgba(35,160,220,0.25)]">
              <span className="text-[#A7B2B9] text-[10px] block">
                {t("dataIntegrity.monitorOffset")}
              </span>
              <span className="font-mono text-[#31E874] font-semibold mt-0.5 block">
                {dataIntegrity.clockSync.monitorOffset}
              </span>
            </div>

            <div className="p-2 rounded-[2px] bg-[#02080C] border border-[rgba(35,160,220,0.25)]">
              <span className="text-[#A7B2B9] text-[10px] block">
                {t("dataIntegrity.anesthesiaMachineOffset")}
              </span>
              <span className="font-mono text-[#13BDF3] font-semibold mt-0.5 block">
                {dataIntegrity.clockSync.anesthesiaMachineOffset}
              </span>
            </div>

            <div className="p-2 rounded-[2px] bg-[#02080C] border border-[rgba(35,160,220,0.25)]">
              <span className="text-[#A7B2B9] text-[10px] block">
                {t("dataIntegrity.pumpGatewayOffset")}
              </span>
              <span className="font-mono text-[#FFD429] font-semibold mt-0.5 block">
                {dataIntegrity.clockSync.pumpGatewayOffset}
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Signal Quality Matrix */}
        <div>
          <div className="flex items-center justify-between pb-1 border-b border-[rgba(35,160,220,0.3)] mb-2">
            <span className="text-[11px] uppercase tracking-wider text-[#A7B2B9] font-semibold flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-[#13BDF3]" />
              {t("dataIntegrity.signalQualityMonitor")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {dataIntegrity.signals.map((sig) => {
              const isSelected = selectedSignalId === sig.signalId;
              const badge = statusBadgeConfig[sig.qualityState];

              return (
                <div
                  key={sig.signalId}
                  onClick={() => setSelectedSignalId(sig.signalId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedSignalId(sig.signalId);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className={`p-2 rounded-[2px] cursor-pointer transition-all border text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#13BDF3] ${
                    isSelected
                      ? "bg-[#0A1822] border-[#13BDF3] ring-1 ring-[#13BDF3]"
                      : "bg-[#02080C] border-[rgba(35,160,220,0.25)] hover:border-[rgba(35,160,220,0.5)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[13px] text-[#F4F7F8]">
                      {sig.signalName}
                    </span>
                    <span
                      className={`text-[9px] uppercase px-1.5 py-0.5 rounded-[1px] font-mono font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#A7B2B9] truncate">
                    {sig.sourceDevice}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 4: Signal Provenance & Immutability Audit */}
        {selectedSignal && (
          <div className="p-3 rounded-[2px] bg-[#0A1822] border border-[rgba(35,160,220,0.45)] space-y-2.5">
            <div className="flex items-center justify-between border-b border-[rgba(35,160,220,0.3)] pb-1.5">
              <div className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#13BDF3]" />
                <span className="font-bold text-[#F4F7F8] text-[13px]">
                  {t("dataIntegrity.signalProvenance", { name: selectedSignal.signalName })}
                </span>
              </div>
              <span
                className={`text-[9.5px] uppercase px-1.5 py-0.5 rounded-[1px] font-mono font-bold border ${
                  transformationConfig[selectedSignal.transformationStatus].color
                } ${
                  transformationConfig[selectedSignal.transformationStatus].border
                }`}
              >
                {selectedSignal.transformationStatus}
              </span>
            </div>

            {/* Imputation & Immutability Alert */}
            {selectedSignal.isImputed ? (
              <div className="p-2 bg-[#FFD429]/10 border border-[#FFD429]/40 rounded-[2px] text-[11px] space-y-1">
                <div className="flex items-center gap-1 text-[#FFD429] font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t("dataIntegrity.imputationActive")}</span>
                  <span className="ml-auto bg-[#FFD429]/20 text-[#FFD429] px-1 py-0.2 rounded font-mono text-[9.5px]">
                    imputed=true
                  </span>
                </div>
                <div className="text-[#F4F7F8] text-[11px] leading-tight">
                  {t("dataIntegrity.method")}{" "}
                  <strong className="text-[#FFD429]">
                    {selectedSignal.imputationMethod}
                  </strong>
                </div>
                <div className="text-[#A7B2B9] text-[10.5px]">
                  {t("dataIntegrity.gapDuration")}{" "}
                  <span className="font-mono text-[#F4F7F8]">
                    {selectedSignal.gapDuration}
                  </span>
                </div>
                <p className="text-[10px] text-[#A7B2B9] italic pt-0.5 border-t border-[#FFD429]/20">
                  {t("dataIntegrity.rawImmutableNotice")}
                </p>
              </div>
            ) : selectedSignal.qualityState === "GOOD" || selectedSignal.qualityState === "DEGRADED" ? (
              <div className="p-1.5 bg-[#31E874]/10 border border-[#31E874]/30 rounded-[2px] flex items-center justify-between text-[10.5px]">
                <div className="flex items-center gap-1 text-[#31E874] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t("dataIntegrity.directTelemetryNotice")}</span>
                </div>
                <span className="font-mono text-[9px] text-[#31E874] bg-[#31E874]/20 px-1 py-0.2 rounded">
                  imputed=false
                </span>
              </div>
            ) : (
              <div className="p-2 bg-[#FF394D]/10 border border-[#FF394D]/35 rounded-[2px] text-[10.5px] flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#FF6675] mt-0.5" />
                <span className="text-[#F4F7F8]">{t("dataIntegrity.missingDataNotice")}</span>
                <span className="ml-auto shrink-0 font-mono text-[9px] text-[#FF6675]">imputed=false</span>
              </div>
            )}

            {/* Provenance Metadata Attributes Grid */}
            <div className="grid grid-cols-[130px_1fr] gap-x-2 gap-y-1.5 text-[11px] bg-[#02080C] p-2.5 rounded-[2px] border border-[rgba(35,160,220,0.25)]">
              <span className="text-[#A7B2B9]">{t("dataIntegrity.sourceDevice")}</span>
              <span className="font-semibold text-[#F4F7F8]">
                {selectedSignal.sourceDevice}
              </span>

              <span className="text-[#A7B2B9]">{t("dataIntegrity.nativeSamplingRate")}</span>
              <span className="font-mono text-[#13BDF3]">
                {selectedSignal.nativeSamplingRate}
              </span>

              <span className="text-[#A7B2B9]">{t("dataIntegrity.eventTime")}</span>
              <span className="font-mono text-[#F4F7F8]">
                {selectedSignal.eventTime}
              </span>

              <span className="text-[#A7B2B9]">{t("dataIntegrity.receivedTime")}</span>
              <span className="font-mono text-[#F4F7F8]">
                {selectedSignal.receivedTime}
              </span>

              <span className="text-[#A7B2B9]">{t("dataIntegrity.clockUncertainty")}</span>
              <span className="font-mono text-[#31E874]">
                {selectedSignal.clockUncertainty}
              </span>

              <span className="text-[#A7B2B9]">{t("dataIntegrity.qualityState")}</span>
              <span
                className={`font-semibold font-mono ${
                  statusBadgeConfig[selectedSignal.qualityState].text
                }`}
              >
                {selectedSignal.qualityState}
              </span>

              <span className="text-[#A7B2B9]">{t("dataIntegrity.transformation")}</span>
              <span className="font-mono text-[#F4F7F8]">
                {transformationConfig[selectedSignal.transformationStatus].label}
              </span>
            </div>

            {selectedSignal.qualityNotes && (
              <div className="p-2 bg-[#02080C] border border-[rgba(35,160,220,0.2)] rounded-[2px] text-[10.5px] text-[#A7B2B9] leading-relaxed">
                <span className="text-[#F4F7F8] font-semibold block mb-0.5">
                  {t("dataIntegrity.diagnosticsNote")}
                </span>
                {selectedSignal.qualityNotes}
              </div>
            )}
          </div>
        )}

        {/* Footer controls */}
        <div className="pt-2 border-t border-[rgba(35,160,220,0.3)] flex justify-end">
          <Button
            variant="workstation"
            size="sm"
            onClick={onClose}
            className="text-xs border-[rgba(35,160,220,0.45)] text-[#A7B2B9] hover:text-[#F4F7F8]"
          >
            {t("dataIntegrity.closeDrawer")}
          </Button>
        </div>
      </div>
    </ClinicalDrawer>
  );
};
