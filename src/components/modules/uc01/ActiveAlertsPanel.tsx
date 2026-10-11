"use client";

import React, { useState } from "react";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { ClinicalDrawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ClinicalAlert } from "@/types/uc01";
import { useTranslation } from "@/context/LocalizationContext";

export interface ActiveAlertsPanelProps {
  alerts: ClinicalAlert[];
  onAlertClick?: (alert: ClinicalAlert) => void;
  onAcknowledgeAlert?: (alertId: string) => void;
}

export const ActiveAlertsPanel: React.FC<ActiveAlertsPanelProps> = ({
  alerts,
  onAlertClick,
  onAcknowledgeAlert,
}) => {
  const { t } = useTranslation("uc01");
  const [selectedAlert, setSelectedAlert] = useState<ClinicalAlert | null>(null);
  const [allAlertsDrawerOpen, setAllAlertsDrawerOpen] = useState(false);

  const handleSelectAlert = (alert: ClinicalAlert) => {
    setSelectedAlert(alert);
    if (onAlertClick) onAlertClick(alert);
  };

  const handleAcknowledge = (alertId: string) => {
    if (onAcknowledgeAlert) onAcknowledgeAlert(alertId);
    setSelectedAlert(null);
  };

  return (
    <div className="flex flex-col h-full bg-safe-surface border border-safe-border rounded-sm">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-safe-border bg-safe-surface">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-sm bg-safe-red/20 border border-safe-red/50 flex items-center justify-center">
            <AlertTriangle className="w-3.5 h-3.5 text-safe-red" />
          </div>
          <span className="text-sm font-semibold tracking-wider text-safe-text uppercase">
            {t("situation.activeAlerts")}
          </span>
          <span className="bg-safe-red text-safe-bg text-[10px] font-bold px-1.5 py-0.5 rounded-sm">
            {alerts.length}
          </span>
        </div>
        <Button
          variant="workstation"
          size="xs"
          className="text-[11px] h-6 px-2 border-safe-border-light text-safe-text-muted hover:text-safe-text"
          onClick={() => setAllAlertsDrawerOpen(true)}
        >
          {t("situation.viewAll", { count: alerts.length })}
        </Button>
      </div>

      {/* Alert Items List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {alerts.map((alert) => {
          const isHigh = alert.severity === "HIGH";

          return (
            <div
              key={alert.id}
              onClick={() => handleSelectAlert(alert)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectAlert(alert);
                }
              }}
              tabIndex={0}
              role="button"
              className="p-2 rounded-sm cursor-pointer transition-colors border bg-safe-surface-secondary border-safe-border-light hover:border-safe-cyan text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-safe-cyan"
            >
              <div className="flex items-start justify-between gap-1 mb-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  {isHigh ? (
                    <div className="w-4 h-4 rounded-sm bg-safe-yellow/20 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-3 h-3 text-safe-yellow" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-safe-cyan/20 flex items-center justify-center shrink-0">
                      <Info className="w-3 h-3 text-safe-cyan" />
                    </div>
                  )}
                  <span
                    className={`text-[12.5px] font-bold leading-tight truncate ${
                      isHigh ? "text-safe-yellow" : "text-safe-text"
                    }`}
                  >
                    {alert.title}
                  </span>
                </div>
                <span className="text-[10.5px] text-safe-text-muted tabular-nums shrink-0 font-mono">
                  {alert.timestamp}
                </span>
              </div>

              <div className="pl-6 text-[11.5px] text-safe-text-muted leading-tight">
                {alert.details}
              </div>
            </div>
          );
        })}
      </div>

      {/* Alert Detail Drawer */}
      <ClinicalDrawer
        isOpen={Boolean(selectedAlert)}
        onClose={() => setSelectedAlert(null)}
        title={selectedAlert?.title || t("situation.detail")}
      >
        {selectedAlert && (
          <div className="space-y-4 text-xs font-sans">
            <div className="p-2.5 rounded-[2px] bg-[#02080C] border border-[rgba(35,160,220,0.3)]">
              <div className="text-[10px] uppercase text-[#A7B2B9] tracking-wider mb-1">
                {t("situation.clinicalCondition")}
              </div>
              <div className="text-sm font-semibold text-[#F4F7F8]">
                {selectedAlert.details}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 bg-[#02080C] border border-[rgba(35,160,220,0.25)] rounded-[2px]">
                <div className="text-[10px] text-[#A7B2B9] uppercase">{t("situation.severity")}</div>
                <div
                  className={`font-semibold mt-0.5 ${
                    selectedAlert.severity === "HIGH"
                      ? "text-[#FF394D]"
                      : selectedAlert.severity === "ADVISORY"
                      ? "text-[#FFD429]"
                      : "text-[#13BDF3]"
                  }`}
                >
                  {selectedAlert.severity}
                </div>
              </div>
              <div className="p-2 bg-[#02080C] border border-[rgba(35,160,220,0.25)] rounded-[2px]">
                <div className="text-[10px] text-[#A7B2B9] uppercase">
                  {t("situation.firstTriggerTime")}
                </div>
                <div className="font-mono text-[#F4F7F8] mt-0.5">
                  {selectedAlert.firstTriggerTime}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-[rgba(35,160,220,0.3)]">
              <div>
                <div className="text-[10px] uppercase text-[#A7B2B9] font-medium">
                  {t("situation.patientData")}
                </div>
                <div className="text-[#F4F7F8] mt-0.5 bg-[#02080C] p-2 rounded-[2px] border border-[rgba(35,160,220,0.2)]">
                  {selectedAlert.patientData}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-[#A7B2B9] font-medium">
                  {t("situation.signalSource")}
                </div>
                <div className="text-[#13BDF3] font-mono mt-0.5 bg-[#02080C] p-2 rounded-[2px] border border-[rgba(35,160,220,0.2)]">
                  {selectedAlert.source}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-[#A7B2B9] font-medium">
                  {t("situation.provenance")}
                </div>
                <div className="text-[#A7B2B9] text-[11px] mt-0.5 bg-[#02080C] p-2 rounded-[2px] border border-[rgba(35,160,220,0.2)]">
                  {selectedAlert.provenance}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-[#A7B2B9] font-medium">
                  {t("situation.clinicalRuleModel")}
                </div>
                <div className="text-[#FFD429] font-mono text-[11px] mt-0.5 bg-[#02080C] p-2 rounded-[2px] border border-[rgba(35,160,220,0.2)]">
                  {selectedAlert.ruleOrModel}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-[#A7B2B9] font-medium">
                  {t("situation.currentStatus")}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[#31E874] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{selectedAlert.currentStatus}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[rgba(35,160,220,0.3)] flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-[rgba(35,160,220,0.45)] text-[#A7B2B9] hover:bg-[#0A1822]"
                onClick={() => setSelectedAlert(null)}
              >
                {t("situation.dismissOverlay")}
              </Button>
              <Button
                size="sm"
                className="text-xs bg-[#13BDF3] hover:bg-[#13BDF3]/80 text-[#02080C] font-semibold"
                onClick={() => handleAcknowledge(selectedAlert.id)}
              >
                {t("situation.ackAlert")}
              </Button>
            </div>
          </div>
        )}
      </ClinicalDrawer>

      {/* All Alerts Master Drawer */}
      <ClinicalDrawer
        isOpen={allAlertsDrawerOpen}
        onClose={() => setAllAlertsDrawerOpen(false)}
        title={t("situation.masterListTitle")}
      >
        <div className="space-y-3">
          <div className="text-xs text-[#A7B2B9] pb-2 border-b border-[rgba(35,160,220,0.3)]">
            {t("situation.totalActiveAlerts")}{" "}
            <span className="text-[#F4F7F8] font-bold">{alerts.length}</span>
          </div>
          {alerts.map((a) => (
            <div
              key={a.id}
              onClick={() => {
                setAllAlertsDrawerOpen(false);
                setSelectedAlert(a);
              }}
              className="p-3 bg-[#02080C] border border-[rgba(35,160,220,0.3)] hover:border-[#13BDF3] cursor-pointer rounded-[2px] space-y-1 transition-colors"
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-xs text-[#F4F7F8]">{a.title}</span>
                <span className="text-[10px] text-[#A7B2B9] font-mono">{a.timestamp}</span>
              </div>
              <div className="text-xs text-[#A7B2B9]">{a.details}</div>
              <div className="text-[10px] text-[#13BDF3] font-mono">{a.source}</div>
            </div>
          ))}
        </div>
      </ClinicalDrawer>
    </div>
  );
};
