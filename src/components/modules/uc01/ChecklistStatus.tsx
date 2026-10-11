"use client";

import React from "react";
import { CheckCircle2, Circle, AlertOctagon } from "lucide-react";
import { useTranslation } from "@/context/LocalizationContext";

export type ChecklistStatusType =
  | "COMPLETED"
  | "IN_PROGRESS"
  | "PENDING"
  | "BLOCKED";

interface ChecklistStatusProps {
  status: ChecklistStatusType;
  className?: string;
  size?: "sm" | "md";
}

export function ChecklistStatus({
  status,
  className = "",
  size = "md",
}: ChecklistStatusProps) {
  const { t } = useTranslation("uc01");
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  switch (status) {
    case "COMPLETED":
      return (
        <CheckCircle2
          className={`${iconSize} text-[#31E874] shrink-0 ${className}`}
          aria-label={t("workflow.completed")}
        />
      );

    case "IN_PROGRESS":
      return (
        <div
          className={`${iconSize} rounded-full border-2 border-[#13BDF3] border-t-transparent animate-spin shrink-0 ${className}`}
          aria-label={t("workflow.inProgress")}
        />
      );

    case "BLOCKED":
      return (
        <div
          className={`flex items-center justify-center shrink-0 ${className}`}
          aria-label={t("workflow.blocked")}
        >
          <AlertOctagon className={`${iconSize} text-[#FF394D] fill-[#FF394D]/20`} />
        </div>
      );

    case "PENDING":
    default:
      return (
        <Circle
          className={`${iconSize} text-[#A7B3BC] shrink-0 ${className}`}
          aria-label={t("workflow.pending")}
        />
      );
  }

}
