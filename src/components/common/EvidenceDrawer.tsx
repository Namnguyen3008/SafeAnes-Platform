"use client";

import React, { useId, useRef } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";
import { useTranslation } from "@/context/LocalizationContext";
import { useDialogFocusTrap } from "@/components/ui/useDialogFocusTrap";

interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

export function EvidenceDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  isMaximized = false,
  onToggleMaximize,
}: EvidenceDrawerProps) {
  const { t } = useTranslation("common");
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocusTrap(isOpen, drawerRef, onClose);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed z-50 transition-all duration-200 bg-safe-surface border border-safe-border shadow-2xl flex flex-col ${
        isMaximized
          ? "inset-4 rounded-[4px]"
          : "right-0 top-0 bottom-0 w-[min(640px,92vw)] max-w-[92vw]"
      }`}
      ref={drawerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-safe-border bg-safe-surface-secondary select-none">
        <div className="min-w-0 pr-2">
          <h3 id={titleId} className="text-[14px] font-semibold text-safe-text whitespace-normal break-words">{title}</h3>
          {subtitle && (
            <span className="text-[10px] font-mono text-safe-text-muted break-words">
              {subtitle}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              aria-label={isMaximized ? t("drawer.restore") : t("drawer.maximize")}
              className="min-h-7 min-w-7 rounded-[2px] p-1 hover:bg-safe-surface text-safe-text-muted hover:text-safe-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
              title={isMaximized ? t("drawer.restore") : t("drawer.maximize")}
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("drawer.close")}
            className="min-h-7 min-w-7 rounded-[2px] p-1 hover:bg-safe-surface text-safe-text-muted hover:text-safe-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
            title={t("drawer.close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Drawer Content Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">{children}</div>
    </div>
  );
}
