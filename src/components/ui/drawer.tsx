"use client";

import React, { useId, useRef } from "react";
import { X } from "lucide-react";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

interface ClinicalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: string;
}

export function ClinicalDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = "w-[min(540px,92vw)]",
}: ClinicalDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocusTrap(isOpen, drawerRef, onClose);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`h-full ${width} max-w-[92vw] min-w-0 bg-safe-surface border-l border-safe-border p-3.5 text-safe-text flex flex-col shadow-2xl focus:outline-none focus-visible:ring-1 focus-visible:ring-safe-cyan`}
        tabIndex={-1}
      >
        {/* Drawer Header */}
        <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-safe-border mb-3 shrink-0">
          <div className="flex flex-col min-w-0">
            <h3 id={titleId} className="text-sm font-semibold text-safe-text tracking-wide uppercase whitespace-normal break-words">
              {title}
            </h3>
            {subtitle && (
              <span className="text-[11px] text-safe-text-muted font-mono mt-0.5">
                {subtitle}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-sm bg-safe-surface-secondary hover:bg-safe-surface-elevated border border-safe-border-light text-safe-text-muted hover:text-safe-text transition-colors focus-visible:ring-1 focus-visible:ring-safe-cyan focus-visible:outline-none cursor-pointer"
            title="Close Drawer (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">{children}</div>
      </div>
    </div>
  );
}
