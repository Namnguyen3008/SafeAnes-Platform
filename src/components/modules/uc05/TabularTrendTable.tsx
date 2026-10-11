"use client";

import React, { useMemo } from "react";
import { LayoutGrid, ChevronDown } from "lucide-react";
import { TabularTrendRecord } from "@/types/uc05";
import { useTrendSync } from "@/context/RespiratoryContext";
import { useTranslation } from "@/context/LocalizationContext";

export interface TabularTrendTableProps {
  rows: TabularTrendRecord[];
}

export function TabularTrendTable({
  rows,
}: TabularTrendTableProps) {
  const { cursorTimestamp, setCursorTimestamp } = useTrendSync();
  const { t } = useTranslation("uc05");
  const { t: tCommon } = useTranslation("common");
  const units = rows[0]?.units;

  // Find the row that corresponds closest to the active cursor timestamp
  const activeRowId = useMemo(() => {
    if (rows.length === 0) return "";
    let closestId = rows[0].id;
    let minDiff = Infinity;

    for (const row of rows) {
      const diff = Math.abs(row.timestamp - cursorTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestId = row.id;
      }
    }
    return closestId;
  }, [rows, cursorTimestamp]);

  const handleRowClick = (row: TabularTrendRecord) => {
    setCursorTimestamp(row.timestamp);
  };

  return (
    <section className="flex-1 min-w-0 min-h-0 bg-safe-surface border border-safe-border flex flex-col p-2 rounded-sm select-none shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-safe-border">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-safe-text" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-safe-text leading-none">
            {t("tabular.title")}{" "}
            <span className="text-xs text-safe-text-muted font-normal lowercase">{t("tabular.recentValues")}</span>
          </h2>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono text-safe-text bg-safe-surface-secondary border border-safe-border-light rounded-sm cursor-pointer hover:bg-safe-surface-elevated">
          <span>{t("alarms.oneHour")}</span>
          <ChevronDown className="w-3.5 h-3.5 text-safe-text-muted" />
        </div>
      </div>

      {/* Table Content */}
      <div className="clinical-table-scroll clinical-table-sticky flex-1 min-w-0 min-h-0 mt-1 overflow-auto">
        <table className="min-w-[360px] w-full text-[12.5px] text-center border-collapse">
          <thead>
            <tr className="text-safe-text-muted border-b border-safe-border-light font-medium bg-safe-surface-secondary/60 select-none">
              <th className="py-0.5 px-1.5 text-left font-medium whitespace-nowrap">{tCommon("table.time")}</th>
              <th className="py-0.5 px-1.5 text-[#FFE800] font-medium">
                EtCO₂<br />
                <span className="text-[10px] text-safe-text-muted font-normal">{units?.etco2 ?? "mmHg"}</span>
              </th>
              <th className="py-0.5 px-1.5 text-safe-text font-medium">
                RR<br />
                <span className="text-[10px] text-safe-text-muted font-normal">{units?.rr ?? "/min"}</span>
              </th>
              <th className="py-0.5 px-1.5 text-[#12B9F2] font-medium">
                SpO₂<br />
                <span className="text-[10px] text-safe-text-muted font-normal">{units?.spo2 ?? "%"}</span>
              </th>
              <th className="py-0.5 px-1.5 text-safe-green font-medium">
                PR<br />
                <span className="text-[10px] text-safe-text-muted font-normal">{units?.pr ?? "bpm"}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-safe-border-subtle font-mono tabular-nums text-safe-text">
            {rows.map((row) => {
              const isSelected = activeRowId === row.id;

              return (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(row);
                    }
                  }}
                  onClick={() => handleRowClick(row)}
                  className={`cursor-pointer transition-colors focus-visible:ring-1 focus-visible:ring-safe-cyan focus-visible:outline-none ${
                    isSelected
                      ? "bg-safe-cyan/20 text-safe-text font-semibold shadow-sm"
                      : "hover:bg-safe-surface-secondary"
                  }`}
                >
                  <td
                    className={`py-0.5 px-1.5 text-left whitespace-nowrap ${
                      isSelected ? "text-safe-text font-semibold" : "text-safe-text-muted"
                    }`}
                  >
                    {row.timeStr}
                  </td>
                  <td className="py-0.5 px-1.5 text-[#FFE800] font-semibold whitespace-nowrap">
                    {row.etco2 ?? "--"}
                  </td>
                  <td className="py-0.5 px-1.5 text-[#F4F6F7] whitespace-nowrap">{row.rr ?? "--"}</td>
                  <td className="py-0.5 px-1.5 text-[#12B9F2] font-semibold whitespace-nowrap">
                    {row.spo2 ?? "--"}
                  </td>
                  <td className="py-0.5 px-1.5 text-[#39E336] font-semibold whitespace-nowrap">
                    {row.pr ?? "--"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default TabularTrendTable;
