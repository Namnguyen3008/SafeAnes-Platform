"use client";

import React, { useMemo } from "react";
import { WaveformAxis } from "./visualization/WaveformAxis";
import { ClinicalWaveformCanvas } from "@/components/clinical-waveforms";
import { WaveformSample, SignalQuality } from "@/types/uc05";
import { useTranslation } from "@/context/LocalizationContext";
import { getWaveformHeaderMode, getWaveformUnit } from "@/adapters/uc05WaveformPresentation";

export interface PlethysmographPanelProps {
  waveform: WaveformSample | null;
  signalQuality: SignalQuality["pleth"];
  recordedDataMode?: boolean;
}

export function PlethysmographPanel({ waveform, signalQuality = "good", recordedDataMode = false }: PlethysmographPanelProps) {
  const { t } = useTranslation("uc05");
  const headerMode = getWaveformHeaderMode(recordedDataMode ? "VITALDB_REPLAY" : "SYNTHETIC_DEMO", Boolean(waveform?.recorded));
  const isUnavailable = waveform === null || signalQuality === "unavailable";
  const ticks = useMemo(
    () => [{ value: waveform?.yMax ?? 1 }, { value: waveform?.yMin ?? 0 }],
    [waveform?.yMax, waveform?.yMin]
  );

  return (
    <section className="uc05-pleth-panel shrink-0 min-w-0 bg-[#061019] border border-[rgba(80,160,210,0.45)] flex flex-col p-2 rounded-[2px] relative select-none">
      <div className="flex items-center justify-between pb-1 z-10 gap-2 flex-wrap min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[#12B9F2] font-black text-[16px] tracking-wide leading-none">SpO₂</span>
          <span className="text-[#F4F6F7] font-medium text-[14px] leading-none truncate">{t("waveforms.plethTitle")}</span>
          {signalQuality !== "good" && (
            <span className="text-[10px] text-amber-400 font-mono">
              [{signalQuality === "unavailable" ? t("simulation.signalUnavailable") : signalQuality === "unknown" ? t("vitalDb.unknownQuality") : signalQuality.toUpperCase()}]
            </span>
          )}
        </div>
        <div className="text-[#A7B0B6] text-[12px] tabular-nums font-medium shrink-0">
          {headerMode === "RECORDED_RATE"
            ? t("vitalDb.recordedRate", { rate: waveform?.sampleRateHz ?? t("vitalDb.notRecorded") })
            : headerMode === "UNAVAILABLE"
              ? t("simulation.signalUnavailable")
              : <>{t("waveforms.liveSweep")}: {waveform?.sweepSpeedMmPerSec ?? 25} mm/sec</>}
        </div>
      </div>
      <div className="flex-1 flex relative overflow-hidden border-t border-[rgba(80,160,210,0.25)]">
        <WaveformAxis ticks={ticks} unit={getWaveformUnit(recordedDataMode ? "VITALDB_REPLAY" : "SYNTHETIC_DEMO", waveform?.unit ?? null, "relative amplitude")} />
        <div className="relative min-w-0 flex-1 overflow-hidden border-l border-[rgba(80,160,210,0.35)] bg-[#03070A]/85">
          {waveform && (
            <ClinicalWaveformCanvas
              source={waveform}
              color="#12B9F2"
              sweepMode
              accessibleLabel={`${t("waveforms.plethTitle")} ${waveform.timestamp ?? ""}`}
              waitingLabel={t("waveforms.awaitingSamples")}
            />
          )}
          {isUnavailable && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#03070A]/55 text-xs font-mono text-amber-300">
              {t("simulation.signalUnavailable")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default PlethysmographPanel;
