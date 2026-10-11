"use client";

import React from "react";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, XOctagon } from "lucide-react";
import { useTranslation } from "@/context/LocalizationContext";

export type BadgeSeverityType =
  | "CRITICAL"
  | "HIGH"
  | "WARNING"
  | "WARN"
  | "INFO"
  | "PASS"
  | "FAIL"
  | "REQUIRES_REVIEW"
  | "ACCEPTED"
  | "EDITED"
  | "REJECTED"
  | "UNREVIEWED";

interface SeverityBadgeProps {
  severity: BadgeSeverityType;
  label?: string;
  size?: "xs" | "sm";
  showIcon?: boolean;
  className?: string;
}

export function SeverityBadge({
  severity,
  label,
  size = "xs",
  showIcon = false,
  className = "",
}: SeverityBadgeProps) {
  const { t } = useTranslation("common");

  const getMeta = () => {
    switch (severity) {
      case "CRITICAL":
        return {
          defaultLabel: t("severity.critical"),
          color: "text-safe-red",
          bg: "bg-safe-red/10",
          border: "border-safe-red/40",
          Icon: XOctagon,
        };
      case "FAIL":
        return {
          defaultLabel: t("uc02.header.fail"),
          color: "text-safe-red",
          bg: "bg-safe-red/10",
          border: "border-safe-red/40",
          Icon: XOctagon,
        };
      case "REJECTED":
        return {
          defaultLabel: t("uc02.status.rejected"),
          color: "text-safe-red",
          bg: "bg-safe-red/10",
          border: "border-safe-red/40",
          Icon: XOctagon,
        };
      case "HIGH":
        return {
          defaultLabel: t("severity.high"),
          color: "text-safe-yellow",
          bg: "bg-safe-yellow/10",
          border: "border-safe-yellow/40",
          Icon: AlertTriangle,
        };
      case "WARNING":
      case "WARN":
        return {
          defaultLabel: t("severity.medium"),
          color: "text-safe-yellow",
          bg: "bg-safe-yellow/10",
          border: "border-safe-yellow/40",
          Icon: AlertTriangle,
        };
      case "REQUIRES_REVIEW":
      case "UNREVIEWED":
        return {
          defaultLabel: t("uc02.status.requiresReview"),
          color: "text-safe-yellow",
          bg: "bg-safe-yellow/10",
          border: "border-safe-yellow/40",
          Icon: AlertTriangle,
        };
      case "INFO":
        return {
          defaultLabel: t("severity.info"),
          color: "text-safe-cyan",
          bg: "bg-safe-cyan/10",
          border: "border-safe-cyan/40",
          Icon: Info,
        };
      case "PASS":
        return {
          defaultLabel: t("uc02.header.pass"),
          color: "text-safe-green",
          bg: "bg-safe-green/10",
          border: "border-safe-green/40",
          Icon: CheckCircle2,
        };
      case "ACCEPTED":
        return {
          defaultLabel: t("uc02.status.accepted"),
          color: "text-safe-green",
          bg: "bg-safe-green/10",
          border: "border-safe-green/40",
          Icon: CheckCircle2,
        };
      case "EDITED":
        return {
          defaultLabel: t("uc02.status.edited"),
          color: "text-safe-cyan",
          bg: "bg-safe-cyan/10",
          border: "border-safe-cyan/40",
          Icon: Info,
        };
      default:
        return {
          defaultLabel: String(severity),
          color: "text-safe-text-muted",
          bg: "bg-safe-surface-secondary",
          border: "border-safe-border-light",
          Icon: AlertCircle,
        };
    }
  };

  const meta = getMeta();
  const Icon = meta.Icon;
  const sizeClasses =
    size === "xs"
      ? "text-[9.5px] px-1.5 py-0.2 leading-tight"
      : "text-[11px] px-2 py-0.5 leading-snug";

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 whitespace-normal break-words font-mono font-semibold rounded-[2px] border ${meta.bg} ${meta.border} ${meta.color} ${sizeClasses} ${className}`}
    >
      {showIcon && <Icon className="w-3 h-3 shrink-0" />}
      <span className="min-w-0 break-words">{label || meta.defaultLabel}</span>
    </span>
  );
}
