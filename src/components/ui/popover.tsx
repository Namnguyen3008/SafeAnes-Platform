"use client";

import React, { useId, useRef } from "react";
import { X } from "lucide-react";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

interface ModalOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
  subtitle?: string;
}

export function ClinicalModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = "max-w-[min(560px,calc(100vw-2rem))]",
}: ModalOverlayProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocusTrap(isOpen, modalRef, onClose);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${width} max-h-[90vh] flex flex-col bg-safe-surface border border-safe-border rounded-sm p-3.5 text-safe-text relative shadow-2xl focus:outline-none focus-visible:ring-1 focus-visible:ring-safe-cyan`}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-2 border-b border-safe-border mb-2.5 shrink-0">
          <div className="flex flex-col min-w-0">
            <h3 id={titleId} className="text-sm font-semibold text-safe-text uppercase tracking-wide whitespace-normal break-words">
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
            title="Close (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
