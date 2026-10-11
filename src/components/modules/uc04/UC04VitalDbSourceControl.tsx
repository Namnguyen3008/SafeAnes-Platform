"use client";

import React from "react";
import { Database } from "lucide-react";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { useTranslation } from "@/context/LocalizationContext";

/** Data-source indicator only. Replay controls live in the global header popover. */
export function UC04VitalDbSourceControl() {
  const { t } = useTranslation("uc04");
  const source = useSafeAnesData();
  return (
    <span
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-safe-border bg-safe-surface-secondary px-2 text-[10px] font-semibold text-safe-text-muted"
      title={source.mode === "VITALDB_REPLAY"
        ? (source.session ? `${t("vitaldb.recordedData")} · ${source.session.status}` : t("vitaldb.recordedData"))
        : t("vitaldb.syntheticDemo")}
    >
      <Database className="h-3.5 w-3.5 text-safe-cyan" aria-hidden="true" />
      <span>{source.mode === "VITALDB_REPLAY" ? t("vitaldb.recordedData") : t("vitaldb.syntheticDemo")}</span>
    </span>
  );
}
