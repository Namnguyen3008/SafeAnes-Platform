"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delayMs?: number;
}

interface TooltipPlacement {
  top: number;
  left: number;
  transform: string;
}

const TOOLTIP_MAX_WIDTH = 352;
const VIEWPORT_GUTTER = 8;

export function Tooltip({
  children,
  content,
  position = "top",
  delayMs = 150,
}: TooltipProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);

  const updatePlacement = useCallback(() => {
    const trigger = wrapperRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const maxWidth = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
    const verticalRoomAbove = rect.top;
    const verticalRoomBelow = window.innerHeight - rect.bottom;
    let activePosition = position;

    if (activePosition === "top" && verticalRoomAbove < 120) activePosition = "bottom";
    if (activePosition === "bottom" && verticalRoomBelow < 120) activePosition = "top";
    if (activePosition === "left" && rect.left < maxWidth + VIEWPORT_GUTTER) activePosition = "right";
    if (activePosition === "right" && window.innerWidth - rect.right < maxWidth + VIEWPORT_GUTTER) activePosition = "left";

    if (activePosition === "top" || activePosition === "bottom") {
      const left = Math.max(
        maxWidth / 2 + VIEWPORT_GUTTER,
        Math.min(window.innerWidth - maxWidth / 2 - VIEWPORT_GUTTER, rect.left + rect.width / 2),
      );
      setPlacement({
        left,
        top: activePosition === "top" ? rect.top - 6 : rect.bottom + 6,
        transform: activePosition === "top" ? "translate(-50%, -100%)" : "translateX(-50%)",
      });
      return;
    }

    const top = Math.max(VIEWPORT_GUTTER, Math.min(window.innerHeight - VIEWPORT_GUTTER, rect.top + rect.height / 2));
    setPlacement({
      left: activePosition === "left" ? rect.left - 6 : rect.right + 6,
      top,
      transform: activePosition === "left" ? "translate(-100%, -50%)" : "translateY(-50%)",
    });
  }, [position]);

  const show = useCallback((immediate = false) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const reveal = () => {
      updatePlacement();
      setIsVisible(true);
    };
    if (immediate) reveal();
    else timeoutRef.current = setTimeout(reveal, delayMs);
  }, [delayMs, updatePlacement]);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setIsVisible(false);
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [isVisible, updatePlacement]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const describedBy = React.isValidElement(children)
    ? [
        (children.props as { "aria-describedby"?: string })["aria-describedby"],
        isVisible ? tooltipId : undefined,
      ].filter(Boolean).join(" ") || undefined
    : undefined;
  const trigger = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": describedBy,
      })
    : children;

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex w-full min-w-0"
      onMouseEnter={() => show()}
      onMouseLeave={() => {
        if (!wrapperRef.current?.contains(document.activeElement)) hide();
      }}
      onFocus={() => show(true)}
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) hide();
      }}
    >
      {trigger}
      {isVisible && placement && typeof document !== "undefined"
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className="safe-tooltip-popover fixed z-[1000] bg-safe-surface-elevated border border-safe-border px-2.5 py-1.5 rounded-sm shadow-xl text-xs leading-relaxed text-safe-text font-sans pointer-events-none"
              style={{ top: placement.top, left: placement.left, transform: placement.transform }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
