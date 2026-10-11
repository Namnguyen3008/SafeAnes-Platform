"use client";

import React from "react";

export interface ClinicalPanelProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  status?: React.ReactNode;
  footer?: React.ReactNode;
  compact?: boolean;
  variant?: "default" | "secondary" | "elevated";
  scrollBehavior?: "visible" | "auto" | "always";
  minHeight?: number | string;
  contentClassName?: string;
  headerClassName?: string;
}

export function ClinicalPanel({
  title,
  subtitle,
  icon: Icon,
  action,
  status,
  footer,
  compact = false,
  variant = "default",
  scrollBehavior = "visible",
  minHeight,
  className = "",
  contentClassName = "",
  headerClassName = "",
  children,
  style,
  ...props
}: ClinicalPanelProps) {
  const bgClass =
    variant === "secondary"
      ? "bg-safe-surface-secondary"
      : variant === "elevated"
      ? "bg-safe-surface-elevated"
      : "bg-safe-surface";

  const paddingClass = compact ? "p-2" : "p-[var(--safe-panel-padding)]";
  const contentOverflow =
    scrollBehavior === "auto"
      ? "overflow-auto overscroll-contain"
      : scrollBehavior === "always"
      ? "overflow-auto overscroll-contain"
      : "overflow-visible";

  return (
    <div
      className={`${bgClass} border border-safe-border rounded-sm ${paddingClass} flex flex-col min-w-0 min-h-0 ${className}`}
      {...props}
      style={{ ...style, minHeight: minHeight ?? style?.minHeight }}
    >
      {/* Header if title or action provided */}
      {(title || action || status) && (
        <div
          className={`flex flex-wrap items-start justify-between gap-x-2 gap-y-1 pb-2 border-b border-safe-border-subtle mb-2 shrink-0 ${headerClassName}`}
        >
          <div className="flex items-start gap-1.5 min-w-0 flex-1">
            {Icon && <Icon className="w-4 h-4 text-safe-cyan shrink-0" />}
            <div className="min-w-0 flex-1">
              {typeof title === "string" ? (
                <span className="text-panel-title text-safe-text font-bold whitespace-normal break-words block">
                  {title}
                </span>
              ) : (
                title
              )}
              {subtitle && (
                <span className="text-[10.5px] font-mono text-safe-text-muted block whitespace-normal break-words">
                  {subtitle}
                </span>
              )}
            </div>
          </div>
          {(status || action) && (
            <div className="flex min-w-0 max-w-full flex-wrap items-center justify-start gap-1.5 sm:justify-end">
              {status}
              {action}
            </div>
          )}
        </div>
      )}

      {/* Main Panel Content */}
      <div className={`flex-1 min-h-0 min-w-0 ${contentOverflow} ${contentClassName}`}>{children}</div>

      {/* Optional Footer */}
      {footer && (
        <div className="pt-2 mt-2 border-t border-safe-border-subtle shrink-0">
          {footer}
        </div>
      )}
    </div>
  );
}
