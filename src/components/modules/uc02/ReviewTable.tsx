"use client";

import React from "react";
import { ClaimReviewTable } from "./ClaimReviewTable";
import { CaseErrorSummary } from "./CaseErrorSummary";
import { BenchmarkModeCard } from "./BenchmarkModeCard";

export function ReviewTable() {
  return (
    <div className="w-full h-[250px] shrink-0 grid grid-cols-[minmax(0,1.8fr)_minmax(230px,0.8fr)_minmax(200px,0.7fr)] gap-2 select-none overflow-hidden">
      {/* 1. Left: Claim Review Table (~55-60% width) */}
      <ClaimReviewTable />

      {/* 2. Center-Right: Case Error Summary (~25% width) */}
      <CaseErrorSummary />

      {/* 3. Far-Right: Benchmark Mode Card (Secondary, ~20% width) */}
      <BenchmarkModeCard />
    </div>
  );
}
