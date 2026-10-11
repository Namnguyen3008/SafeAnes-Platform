"use client";

import React from "react";
import { ProvenanceStatus } from "@/types/uc02";
import { ShieldCheck, GitBranch, Cpu, Eye, XCircle } from "lucide-react";
import { useTranslation } from "@/context/LocalizationContext";

interface ProvenanceBadgeProps {
  provenance: ProvenanceStatus;
  showIcon?: boolean;
  size?: "xs" | "sm";
  className?: string;
}

export function ProvenanceBadge({
  provenance,
  showIcon = false,
  size = "xs",
  className = "",
}: ProvenanceBadgeProps) {
  const { t } = useTranslation("common");

  const getMeta = () => {
    switch (provenance) {
      case "DIRECT":
        return {
          label: t("provenance.direct"),
          color: "text-provenance-direct",
          bg: "bg-provenance-direct/10",
          border: "border-provenance-direct/40",
          Icon: Eye,
        };
      case "DERIVED":
        return {
          label: t("provenance.derived"),
          color: "text-provenance-derived",
          bg: "bg-provenance-derived/10",
          border: "border-provenance-derived/40",
          Icon: GitBranch,
        };
      case "INFERRED":
        return {
          label: t("provenance.inferred"),
          color: "text-provenance-inferred",
          bg: "bg-provenance-inferred/10",
          border: "border-provenance-inferred/40",
          Icon: Cpu,
        };
      case "CLINICIAN_CONFIRMED":
        return {
          label: t("provenance.confirmed"),
          color: "text-provenance-confirmed",
          bg: "bg-provenance-confirmed/10",
          border: "border-provenance-confirmed/40",
          Icon: ShieldCheck,
        };
      case "REJECTED":
        return {
          label: t("provenance.rejected"),
          color: "text-safe-red",
          bg: "bg-safe-red/10",
          border: "border-safe-red/40",
          Icon: XCircle,
        };
      default:
        return {
          label: String(provenance),
          color: "text-safe-text-muted",
          bg: "bg-safe-surface-secondary",
          border: "border-safe-border-light",
          Icon: ShieldCheck,
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
      <span className="min-w-0 break-words">{meta.label}</span>
    </span>
  );
}
