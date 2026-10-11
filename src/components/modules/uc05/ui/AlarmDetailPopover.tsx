"use client";

import React, { useRef, useEffect } from "react";
import { X, AlertTriangle, Check, VolumeX } from "lucide-react";
import { useRespiratory } from "@/context/RespiratoryContext";
import { useTranslation } from "@/context/LocalizationContext";
import { useDialogFocusTrap } from "@/components/ui/useDialogFocusTrap";

export function AlarmDetailPopover() {
  const { selectedAlarm, setSelectedAlarm, setHighlightedEventId } = useRespiratory();
  const { t } = useTranslation("uc05");
  const { t: tCommon } = useTranslation("common");
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    setSelectedAlarm(null);
    setHighlightedEventId(null);
  };
  useDialogFocusTrap(Boolean(selectedAlarm), popoverRef, handleClose);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        handleClose();
      }
    }
    if (selectedAlarm) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedAlarm]);

  if (!selectedAlarm) return null;

  const isHigh = selectedAlarm.priority === "HIGH";
  const isMedium = selectedAlarm.priority === "MEDIUM";
  const isRecordedEvent = selectedAlarm.sourceClass !== undefined;
  const eventName = selectedAlarm.eventName || (selectedAlarm as { event?: string }).event || "Respiratory Alarm";
  const timeStr = selectedAlarm.timestamp || (selectedAlarm as { timeStr?: string }).timeStr || "--";
  const displayVal = selectedAlarm.displayValue || (selectedAlarm.value ? `${selectedAlarm.value} ${selectedAlarm.unit || ""}` : "--");
  const durationStr = selectedAlarm.durationSeconds ? `${selectedAlarm.durationSeconds} sec` : "--";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isRecordedEvent ? t("vitalDb.eventDetails") : t("alarms.eventDetails")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 animate-in fade-in duration-100"
    >
      <div
        ref={popoverRef}
        tabIndex={-1}
        className="w-full max-w-[min(520px,calc(100vw-2rem))] max-h-[90vh] bg-[#061019] border border-[rgba(80,160,210,0.5)] rounded-[2px] shadow-2xl overflow-hidden flex flex-col select-none focus:outline-none"
      >
        {/* Top header accent */}
        <div
          className={`h-1 w-full ${
            isHigh ? "bg-[#E00014]" : isMedium ? "bg-[#FFE800]" : "bg-[#12B9F2]"
          }`}
        />

        <div className="min-h-0 overflow-y-auto overscroll-contain p-3.5">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(80,160,210,0.3)]">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={`w-4 h-4 ${
                  isHigh ? "text-[#E00014]" : isMedium ? "text-[#FFE800]" : "text-[#12B9F2]"
                }`}
              />
              <span className="text-[#F4F6F7] text-[14px] font-bold">{isRecordedEvent ? t("vitalDb.eventDetails") : t("alarms.detailTitle")}</span>
            </div>
            <button
              onClick={handleClose}
              aria-label={tCommon("drawer.close")}
              className="p-1 text-[#A7B0B6] hover:text-[#F4F6F7] hover:bg-[#09151D] rounded-[2px] transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Alarm summary body */}
          <div className="mt-3 space-y-2.5 text-[13px]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <span className="text-[#A7B0B6]">{t("alarms.event")}</span>
              <span className="min-w-0 text-right text-[#F4F6F7] font-semibold text-[14px] whitespace-normal break-words">
                {eventName}
              </span>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <span className="text-[#A7B0B6]">{isRecordedEvent ? t("vitalDb.sourceClass") : t("alarms.priority")}</span>
              <span
                className={`px-2 py-0.5 text-[11px] font-bold rounded-[2px] ${
                  isHigh
                    ? "bg-[#E00014] text-[#F4F6F7]"
                    : isMedium
                    ? "bg-[#FFE800] text-[#03070A]"
                    : "bg-[#12B9F2] text-[#03070A]"
                }`}
              >
                {isRecordedEvent ? t(selectedAlarm.sourceClass === "OBSERVED" ? "vitalDb.eventObserved" : "vitalDb.eventDerived") : isHigh ? t("alarms.highPriority") : `${selectedAlarm.priority} Priority`}
              </span>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <span className="text-[#A7B0B6]">{t("alarms.recordedTime")}</span>
              <span className="text-[#12B9F2] font-mono tabular-nums font-semibold">
                {timeStr}
              </span>
            </div>

            {isRecordedEvent && <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <span className="text-[#A7B0B6]">{t("vitalDb.eventSource")}</span>
              <span className="min-w-0 text-right font-mono text-[#F4F6F7] break-words">{selectedAlarm.source ?? "NOT_RECORDED"}</span>
            </div>}

            {isRecordedEvent && <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <span className="text-[#A7B0B6]">{t("vitalDb.eventQuality")}</span>
              <span className="text-right font-mono text-[#F4F6F7]">{selectedAlarm.quality ?? "UNKNOWN"}</span>
            </div>}

            {isRecordedEvent && <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <span className="text-[#A7B0B6]">{t("vitalDb.eventDefinition")}</span>
              <span className="min-w-0 text-right text-[#F4F6F7] break-words">{selectedAlarm.definition ?? "NOT_RECORDED"}</span>
            </div>}

            {!isRecordedEvent && <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <span className="text-[#A7B0B6]">{t("alarms.valueAtOnset")}</span>
              <span className="text-[#FFE800] font-mono tabular-nums font-bold">
                {displayVal}
              </span>
            </div>}

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <span className="text-[#A7B0B6]">{t("alarms.eventDuration")}</span>
              <span className="text-[#F4F6F7] font-mono tabular-nums">
                {durationStr}
              </span>
            </div>

            <div className="p-2 bg-[#09151D] border border-[rgba(80,160,210,0.3)] rounded-[2px] text-[12px] text-[#A7B0B6] leading-relaxed">
              {isRecordedEvent
                ? <pre className="whitespace-pre-wrap break-words font-mono text-[10px]">{JSON.stringify(selectedAlarm.provenance ?? {}, null, 2)}</pre>
                : isHigh ? t("alarms.highClinicalDesc") : t("alarms.medClinicalDesc")}
            </div>
          </div>

          {/* Actions */}
          {isRecordedEvent ? <div className="mt-4 pt-2.5 border-t border-[rgba(80,160,210,0.3)] flex justify-end">
            <button onClick={handleClose} className="px-3 py-1 text-[12px] border border-[rgba(80,160,210,0.45)] text-[#F4F6F7]">{t("trend.closeEsc")}</button>
          </div> : <div className="mt-4 pt-2.5 border-t border-[rgba(80,160,210,0.3)] flex flex-wrap justify-end gap-2">
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#09151D] hover:bg-[#0c1a24] text-[#A7B0B6] hover:text-[#F4F6F7] text-[12px] font-medium border border-[rgba(80,160,210,0.45)] rounded-[2px] transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer"
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span>{t("alarms.silence2m")}</span>
            </button>
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#0284c7] hover:bg-[#0284c7]/90 text-[#F4F6F7] text-[12px] font-semibold rounded-[2px] transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t("alarms.acknowledge")}</span>
            </button>
          </div>}
        </div>
      </div>
    </div>
  );
}

export default AlarmDetailPopover;
