"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  ExternalLink,
  Check,
  BellRing,
} from "lucide-react";
import { useCase } from "@/context/CaseContext";
import { AlertSourceModule } from "@/types/clinical";
import { getAlertNavigationUrl } from "@/utils/clinicalNavigation";
import { SeverityBadge } from "@/components/common";
import { useTranslation } from "@/context/LocalizationContext";

interface GlobalAlertRailProps {
  caseId: string;
}

interface SourceModuleConfig {
  label: string;
  badgeStyle: string;
  routeSegment: string;
}

const SOURCE_MODULE_CONFIG: Record<AlertSourceModule, SourceModuleConfig> = {
  MEDICATION: {
    label: "Medication",
    badgeStyle: "bg-purple-950/70 text-purple-300 border-purple-500/50",
    routeSegment: "medications",
  },
  HEMODYNAMICS: {
    label: "Hemodynamics",
    badgeStyle: "bg-orange-950/70 text-orange-300 border-orange-500/50",
    routeSegment: "hemodynamics",
  },
  RESPIRATORY: {
    label: "Respiratory",
    badgeStyle: "bg-cyan-950/70 text-cyan-300 border-cyan-500/50",
    routeSegment: "respiratory",
  },
  DATA_QUALITY: {
    label: "Data Quality",
    badgeStyle: "bg-amber-950/70 text-amber-300 border-amber-500/50",
    routeSegment: "situation",
  },
  RECORD_VALIDATION: {
    label: "Record Validation",
    badgeStyle: "bg-indigo-950/70 text-indigo-300 border-indigo-500/50",
    routeSegment: "record",
  },
  RECORD: {
    label: "Record Validation",
    badgeStyle: "bg-indigo-950/70 text-indigo-300 border-indigo-500/50",
    routeSegment: "record",
  },
  SITUATION: {
    label: "Situation",
    badgeStyle: "bg-blue-950/70 text-blue-300 border-blue-500/50",
    routeSegment: "situation",
  },
};

export function GlobalAlertRail({ caseId }: GlobalAlertRailProps) {
  const { activeAlerts, acknowledgeAlert } = useCase();
  const { t } = useTranslation("overview");
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "ACKNOWLEDGED">("ALL");

  // Filter alerts based on active selection
  const filteredAlerts = activeAlerts.filter((alert) => {
    if (filter === "ACTIVE") return !alert.acknowledged;
    if (filter === "ACKNOWLEDGED") return !!alert.acknowledged;
    return true;
  });

  const activeCount = activeAlerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="bg-safe-surface border border-safe-border rounded-sm flex flex-col h-full min-h-[460px]">
      {/* Rail Header */}
      <div className="p-3 border-b border-safe-border-subtle flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-safe-yellow animate-pulse" />
            <h2 className="text-panel-title text-safe-text font-bold">
              {t("alerts.title")}
            </h2>
          </div>
          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-sm bg-safe-orange/15 text-safe-orange border border-safe-orange/40">
            {t("alerts.highPriority", { count: activeCount })}
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 text-[11px] font-mono pt-1">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-2 py-0.5 rounded-sm border transition-colors ${
              filter === "ALL"
                ? "bg-safe-cyan/20 text-safe-cyan border-safe-cyan/60 font-semibold"
                : "bg-safe-surface-secondary text-safe-text-muted border-safe-border-light hover:text-safe-text"
            }`}
          >
            {t("alerts.filterAll")} ({activeAlerts.length})
          </button>
          <button
            onClick={() => setFilter("ACTIVE")}
            className={`px-2 py-0.5 rounded-sm border transition-colors ${
              filter === "ACTIVE"
                ? "bg-clinical-alert-critical/20 text-clinical-alert-critical border-clinical-alert-critical/60 font-semibold"
                : "bg-safe-surface-secondary text-safe-text-muted border-safe-border-light hover:text-safe-text"
            }`}
          >
            {t("alerts.filterActive")} ({activeCount})
          </button>
          <button
            onClick={() => setFilter("ACKNOWLEDGED")}
            className={`px-2 py-0.5 rounded-sm border transition-colors ${
              filter === "ACKNOWLEDGED"
                ? "bg-safe-green/20 text-safe-green border-safe-green/60 font-semibold"
                : "bg-safe-surface-secondary text-safe-text-muted border-safe-border-light hover:text-safe-text"
            }`}
          >
            {t("alerts.filterAcknowledged")} ({activeAlerts.length - activeCount})
          </button>
        </div>
      </div>

      {/* Alert Items List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {filteredAlerts.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-safe-text-muted">
            <CheckCircle className="w-8 h-8 text-safe-green/60 mb-2" />
            <p className="text-xs font-semibold text-safe-text">{t("alerts.noAlerts")}</p>
            <p className="text-[11px] text-safe-text-dim mt-0.5">
              {t("alerts.allResolved")}
            </p>
          </div>
        ) : (

          filteredAlerts.map((alert) => {
            const moduleConfig = SOURCE_MODULE_CONFIG[alert.sourceModule] ?? {
              label: alert.sourceModule,
              badgeStyle: "bg-safe-surface-secondary text-safe-text border-safe-border-light",
              routeSegment: "situation",
            };

            const isCritical = alert.severity === "CRITICAL";
            const isHigh = alert.severity === "HIGH";

            return (
              <div
                key={alert.id}
                className={`p-2.5 rounded-sm border transition-all ${
                  alert.acknowledged
                    ? "bg-safe-surface-secondary/50 border-safe-border-subtle opacity-70"
                    : isCritical
                    ? "bg-clinical-alert-critical/10 border-clinical-alert-critical/50 shadow-[0_0_8px_rgba(255,51,77,0.15)]"
                    : isHigh
                    ? "bg-safe-orange/10 border-safe-orange/50"
                    : "bg-safe-surface-secondary border-safe-border-light"
                }`}
              >
                {/* Alert Item Header: Source Module Pill + Severity + Timestamp */}
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Mandated Source Module Identification */}
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm border uppercase tracking-wider ${moduleConfig.badgeStyle}`}
                    >
                      {moduleConfig.label}
                    </span>

                    {/* Canonical Shared Severity Badge */}
                    <SeverityBadge severity={alert.severity} size="xs" />
                  </div>

                  <span className="text-[10px] font-mono text-safe-text-dim shrink-0">
                    {alert.timestamp}
                  </span>
                </div>

                {/* Title */}
                <h4 className="text-xs font-bold text-safe-text leading-snug">
                  {alert.title}
                </h4>

                {/* Message */}
                <p className="text-[11px] text-safe-text-muted mt-1 leading-relaxed">
                  {alert.message}
                </p>

                {/* Action Buttons: Acknowledge & Jump to Workspace */}
                <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-safe-border-subtle">
                  {/* Acknowledge Button */}
                  {alert.acknowledged ? (
                    <div className="flex items-center gap-1 text-[11px] font-mono text-safe-green font-semibold">
                      <Check className="w-3.5 h-3.5" />
                      <span>{t("alerts.acknowledged")}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="px-2 py-0.5 rounded-sm bg-safe-surface border border-safe-border hover:border-safe-green/60 hover:text-safe-green text-[11px] font-mono text-safe-text-muted transition-colors flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>{t("alerts.ack")}</span>
                    </button>
                  )}

                  {/* Jump to Source Workspace Link with Contextual Parameters */}
                  <Link
                    href={getAlertNavigationUrl(alert, caseId)}
                    className="flex items-center gap-1 text-[11px] font-medium text-safe-cyan hover:underline hover:text-white transition-colors"
                  >
                    <span>{t("alerts.jumpTo", { module: moduleConfig.label })}</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Rail Footer Clinical Summary */}
      <div className="p-2.5 border-t border-safe-border-subtle bg-safe-surface-secondary/40 text-[11px] text-safe-text-dim flex items-center justify-between">
        <span>{t("alerts.integratedEscalation")}</span>
        <span className="font-mono text-safe-cyan">{t("alerts.crossModuleSources")}</span>
      </div>
    </div>
  );
}

