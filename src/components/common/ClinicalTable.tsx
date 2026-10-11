"use client";

import React from "react";

interface ClinicalTableProps {
  children: React.ReactNode;
  className?: string;
  maxHeight?: number | string;
  stickyHeader?: boolean;
}

export function ClinicalTable({
  children,
  className = "",
  maxHeight,
  stickyHeader = false,
}: ClinicalTableProps) {
  return (
    <div
      className={`clinical-table-frame min-w-0 min-h-0 w-full overflow-hidden bg-safe-surface border border-safe-border rounded-sm ${stickyHeader ? "clinical-table-sticky" : ""} ${className}`}
    >
      <div
        className="clinical-table-scroll"
        style={maxHeight === undefined ? undefined : { maxHeight, overflowY: "auto" }}
      >
        {children}
      </div>
    </div>
  );
}

interface ClinicalTableHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function ClinicalTableHeader({
  children,
  className = "",
}: ClinicalTableHeaderProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-1 pb-1 border-b border-safe-border shrink-0 select-none ${className}`}
    >
      {children}
    </div>
  );
}
