import React from "react";
import { SeverityBadge } from "@/components/common";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "high" | "medium" | "info" | "neutral";
  children: React.ReactNode;
}

export function Badge({ variant = "neutral", children, className = "", ...props }: BadgeProps) {
  if (variant === "high") {
    return (
      <SeverityBadge
        severity="HIGH"
        label={typeof children === "string" ? children : undefined}
        className={className}
        size="xs"
      />
    );
  }
  if (variant === "medium") {
    return (
      <SeverityBadge
        severity="WARNING"
        label={typeof children === "string" ? children : undefined}
        className={className}
        size="xs"
      />
    );
  }
  if (variant === "info") {
    return (
      <SeverityBadge
        severity="INFO"
        label={typeof children === "string" ? children : undefined}
        className={className}
        size="xs"
      />
    );
  }

  return (
    <span
      className={`px-2 py-0.5 rounded-[2px] text-[10px] tracking-wide inline-block leading-none uppercase select-none bg-safe-surface-secondary text-safe-text-muted border border-safe-border-light font-semibold ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

