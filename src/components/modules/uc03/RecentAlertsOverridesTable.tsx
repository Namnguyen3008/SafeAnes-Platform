"use client";

import React from "react";
import { X, BookOpen, Clock, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useMedication } from "@/context/MedicationContext";
import { SeverityBadge } from "@/components/common";
import { useTranslation } from "@/context/LocalizationContext";

export function RecentAlertsOverridesTable() {
  const { t } = useTranslation("uc03");
  const { t: tCommon } = useTranslation("common");
  const {
    alerts,
    selectedAlert,
    setSelectedAlert,
    handleSelectAlert,
    setIsEvidenceOpen,
  } = useMedication();
  const selectedAlertTitle = selectedAlert?.rule?.id && selectedAlert.rule.id !== "—"
    ? t("simulation.alertTitle")
    : selectedAlert?.title ?? "";

  return (
    <div className="bg-safe-surface border border-safe-border rounded-sm flex flex-col h-full select-none overflow-hidden relative">
      {/* Header */}
      <div className="h-[var(--safe-row-height)] px-3 bg-safe-surface-secondary border-b border-safe-border flex items-center justify-between shrink-0">
        <span className="font-semibold text-sm text-safe-text uppercase tracking-wide">
          {t("tabs.recentAlerts")}{" "}
        </span>
      </div>

      {/* Table Column Headers */}
      <div className="min-h-6 px-3 py-1 bg-safe-surface-secondary/80 border-b border-safe-border-light grid grid-cols-[minmax(72px,.8fr)_minmax(82px,.9fr)_minmax(100px,1.5fr)_minmax(72px,.75fr)_minmax(72px,.85fr)] gap-1 text-xs font-medium text-safe-text-muted items-center shrink-0">
        <div className="min-w-0">{tCommon("table.time")}</div>
        <div className="min-w-0">{tCommon("table.priority")}</div>
        <div className="min-w-0">{tCommon("table.alert")}</div>
        <div className="min-w-0">{tCommon("table.value")}</div>
        <div className="min-w-0">{tCommon("table.action")}</div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-safe-border-subtle text-[13px]">
        {alerts.map((row) => {
          const isSelected = selectedAlert?.id === row.id;
          const displayTime = row.time || row.timestamp;
          const displayPriority = row.severity === "HIGH"
            ? t("activePanel.high")
            : row.severity === "ADVISORY"
            ? t("activePanel.advisory")
            : row.severity === "MONITORING"
            ? t("activePanel.monitoring")
            : t("alerts.info");
          const displayAlert = row.rule?.id && row.rule.id !== "—"
            ? t("simulation.alertTitle")
            : row.alert || row.title;
          const displayAction = row.action === "Continued without decision"
              ? t("simulation.continueWithoutDecision")
              : row.action === "Proposal modified in demo workflow"
                ? t("simulation.resolved")
                : row.action === "Demo override recorded"
                  ? t("simulation.overridden")
                  : row.action === "Review pending"
                    ? t("simulation.active")
                    : row.action
            ;

          return (
            <div
              key={row.id}
              onClick={() => handleSelectAlert(row)}
              className={`grid grid-cols-[minmax(72px,.8fr)_minmax(82px,.9fr)_minmax(100px,1.5fr)_minmax(72px,.75fr)_minmax(72px,.85fr)] gap-1 px-3 py-1 items-center cursor-pointer transition-colors ${
                isSelected
                  ? "bg-safe-cyan/15 border-l-2 border-safe-cyan"
                  : "hover:bg-safe-surface-secondary/70"
              }`}
            >
              {/* Time */}
              <div className="min-w-0 font-mono text-xs text-safe-text-muted tabular-nums whitespace-nowrap">
                {displayTime}
              </div>

              {/* Priority Badge */}
              <div className="min-w-0">
                <SeverityBadge
                  severity={
                    row.severity === "HIGH"
                      ? "CRITICAL"
                      : row.severity === "ADVISORY"
                      ? "WARNING"
                      : "INFO"
                  }
                  label={displayPriority}
                  size="xs"
                />
              </div>

              {/* Alert Description */}
              <div
                className={`min-w-0 whitespace-normal break-words text-[12.5px] pr-1 ${
                  row.isRedAlert ? "text-safe-red font-medium" : "text-safe-text"
                }`}
                title={displayAlert}
              >
                {displayAlert}
              </div>

              {/* Value */}
              <div className="min-w-0 font-mono text-[11px] text-[#A6B0B8] tabular-nums whitespace-nowrap">
                {row.value}
              </div>

              {/* Action Taken */}
              <div className="min-w-0 text-[11px] leading-tight text-[#A6B0B8] truncate" title={displayAction}>
                {displayAction}
              </div>
            </div>
          );
        })}
      </div>

      {/* Interaction 2: Compact Detail Popover when alert is clicked */}
      {selectedAlert && (
        <div className="absolute bottom-2 left-4 right-4 max-h-[70%] overflow-y-auto overscroll-contain bg-[#07121A] border border-[rgba(50,150,205,0.70)] shadow-2xl p-3 rounded-[2px] z-30 animate-in fade-in duration-150">
          <div className="flex items-start justify-between border-b border-[rgba(50,150,205,0.30)] pb-1.5 mb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {(selectedAlert.priority === "High" || selectedAlert.severity === "HIGH") ? (
                <AlertTriangle className="w-4 h-4 text-[#FF334D]" />
              ) : (selectedAlert.priority === "Advisory" || selectedAlert.severity === "ADVISORY") ? (
                <Info className="w-4 h-4 text-[#FFD828]" />
              ) : (
                <CheckCircle className="w-4 h-4 text-[#19BDF2]" />
              )}
              <span className="min-w-0 font-bold text-[13.5px] text-[#F3F6F7] whitespace-normal break-words">
                {selectedAlertTitle}
              </span>
              <span
                className={`px-1.5 py-0.2 text-[10px] font-bold uppercase rounded-[2px] ${
                  (selectedAlert.priority === "High" || selectedAlert.severity === "HIGH")
                    ? "bg-[#FF334D] text-white"
                    : (selectedAlert.priority === "Advisory" || selectedAlert.severity === "ADVISORY")
                    ? "bg-[#FFD828] text-black"
                    : "bg-[#19BDF2] text-black"
                }`}
              >
                {selectedAlert.priority || (selectedAlert.severity === "HIGH" ? "High" : selectedAlert.severity === "ADVISORY" ? "Advisory" : "Info")}
              </span>
            </div>
            <button
              onClick={() => setSelectedAlert(null)}
              className="text-[#A6B0B8] hover:text-[#F3F6F7] p-0.5 rounded-[2px]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-12 gap-2 text-[11.5px] text-[#A6B0B8]">
            <div className="col-span-7 space-y-1">
              <div>
                <span className="text-[#F3F6F7] font-semibold">{t("simulation.why")}</span>{" "}
                <span>{selectedAlert.why.join(" ") || t("simulation.alertWhy")}</span>
              </div>
              {selectedAlert.metric && (
                <div className="font-mono text-[#19BDF2]">
                  {selectedAlert.metric}
                </div>
              )}
            </div>

            <div className="col-span-5 flex flex-col justify-between items-end pl-2 border-l border-[rgba(50,150,205,0.20)]">
              <div className="text-right space-y-0.5">
                <div className="flex items-center justify-end space-x-1 font-mono text-[11px] text-[#A6B0B8]">
                  <Clock className="w-3 h-3 text-[#19BDF2]" />
                  <span>{t("safetyReview.timelineSynced", { time: selectedAlert.time || "" })}</span>
                </div>
                <div className="text-[#F3F6F7]">
                  {t("safetyReview.action")} <span className="font-medium">{selectedAlert.action}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button
                  onClick={() => setIsEvidenceOpen(true)}
                  className="h-6 px-2.5 bg-[#095484] hover:bg-[#0c6ba8] text-white font-medium text-[11px] rounded-[2px] flex items-center space-x-1 transition-colors"
                >
                  <BookOpen className="w-3 h-3" />
                  <span>{t("dosing.viewEvidence")}</span>
                </button>
                <button
                  onClick={() => setSelectedAlert(null)}
                  className="h-6 px-2 border border-[rgba(50,150,205,0.40)] text-[#A6B0B8] hover:text-white text-[11px] rounded-[2px] transition-colors"
                >
                  {t("safetyReview.dismiss")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
