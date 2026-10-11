"use client";

import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";

interface MedicationRiskSummaryProps {
  className?: string;
}

export function MedicationRiskSummary({ className = "" }: MedicationRiskSummaryProps) {
  const { t } = useTranslation("uc03");
  const { riskSummary } = useMedication();

  return (
    <div className={`px-2 py-1 space-y-1 select-none min-w-0 ${className}`}>
      <div className="text-[14px] font-semibold text-[#F3F6F7] tracking-wide">{t("alerts.riskSummaryTitle")}</div>
      {riskSummary.length === 0 ? (
        <div className="text-[11px] text-[#A6B0B8]">{t("simulation.noAlert")}</div>
      ) : riskSummary.map((item) => {
        const active = item.count > 0;
        return (
          <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 leading-tight">
            <div className="flex min-w-0 items-start gap-1.5">
              <div className={`w-[3px] h-3.5 shrink-0 rounded-[1px] ${active ? "bg-[#FF334D]" : "bg-[#30E96B]"}`} />
              <span className="min-w-0 whitespace-normal break-words text-[#F3F6F7]">{t("simulation.workflowReview")}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`font-mono font-bold text-[13px] tabular-nums ${active ? "text-[#FF334D]" : "text-[#30E96B]"}`}>{item.count}</span>
              <span className="max-w-32 whitespace-normal break-words text-right text-[11px] text-[#A6B0B8]">
                {active ? t("simulation.active") : t("simulation.noAlert")}
              </span>
            </div>
          </div>
        );
      })}
      <div className="text-[10px] text-[#A6B0B8]">{t("simulation.notForClinicalUse")}</div>
    </div>
  );
}
