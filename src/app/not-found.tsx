import React from "react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#02080C] text-safe-text p-4 select-none">
      <h2 className="text-xl font-bold text-safe-cyan mb-2">404 - Not Found</h2>
      <p className="text-sm text-safe-text-muted mb-4">
        The requested clinical workstation route could not be found.
      </p>
      <Link
        href="/safeanes"
        className="px-4 py-2 bg-safe-surface border border-safe-border rounded text-xs text-safe-cyan hover:border-safe-cyan transition-colors"
      >
        Return to SafeAnes Workstation
      </Link>
    </div>
  );
}
