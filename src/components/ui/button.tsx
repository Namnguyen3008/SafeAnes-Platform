"use client";

import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "workstation" | "active" | "ghost" | "danger" | "success" | "outline";
  size?: "xs" | "sm" | "md" | "icon" | "icon-xs";
}

export function Button({
  children,
  className = "",
  variant = "workstation",
  size = "sm",
  ...props
}: ButtonProps) {
  const baseClasses =
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors select-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan focus-visible:ring-offset-1 focus-visible:ring-offset-safe-bg disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

  const variantClasses = {
    workstation:
      "bg-safe-surface-secondary hover:bg-safe-surface-elevated text-safe-text-muted hover:text-safe-text border border-safe-border active:bg-safe-surface",
    outline:
      "bg-transparent hover:bg-safe-surface-secondary text-safe-text-muted hover:text-safe-text border border-safe-border-light active:bg-safe-surface",
    active:
      "bg-safe-cyan text-safe-bg font-semibold border border-safe-cyan hover:bg-safe-cyan/85 active:bg-safe-cyan/95 shadow-sm",
    ghost:
      "bg-transparent hover:bg-safe-surface-secondary text-safe-text-muted hover:text-safe-text border border-transparent",
    danger:
      "bg-safe-red/15 text-safe-red border border-safe-red/50 hover:bg-safe-red/25 active:bg-safe-red/35",
    success:
      "bg-safe-green/15 text-safe-green border border-safe-green/50 hover:bg-safe-green/25 active:bg-safe-green/35",
  }[variant];

  const sizeClasses = {
    xs: "px-2 py-0.5 text-[11px] h-6 min-w-6",
    sm: "px-2.5 py-1 text-[12px] h-7 min-w-7",
    md: "px-3 py-1.5 text-xs h-8 min-w-8",
    icon: "w-6 h-6 p-0 text-xs",
    "icon-xs": "w-5 h-5 p-0 text-[11px]",
  }[size];

  return (
    <button
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
