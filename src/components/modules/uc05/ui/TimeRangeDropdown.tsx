"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useRespiratory, TIME_RANGE_OPTIONS } from "@/context/RespiratoryContext";
import { useTranslation } from "@/context/LocalizationContext";

export function TimeRangeDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { timeRangeHours, setTimeRangeHours } = useRespiratory();
  const { t, locale } = useTranslation("uc05");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (hours: number) => {
    setTimeRangeHours(hours);
    setIsOpen(false);
  };

  const getLabel = (hours: number) => {
    if (locale === "vi") {
      return `${hours} Giờ`;
    }
    return `${hours} Hour${hours > 1 ? "s" : ""}`;
  };

  return (
    <div ref={dropdownRef} className="relative inline-block text-left select-none">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t("trend.selectTimeRange")}
        className="flex items-center gap-1 px-2.5 py-0.5 text-[13px] font-medium text-[#F4F6F7] bg-[#09151D] hover:bg-[#0c1a24] border border-[rgba(80,160,210,0.45)] hover:border-[#12B9F2]/60 rounded-[2px] transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer"
      >
        <span>{getLabel(timeRangeHours)}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#A7B0B6] transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={t("trend.selectTimeRange")}
          className="absolute right-0 mt-1 w-28 bg-[#09151D] border border-[rgba(80,160,210,0.5)] rounded-[2px] shadow-2xl py-1 z-50 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
        >
          {TIME_RANGE_OPTIONS.map((hours) => {
            const isSelected = hours === timeRangeHours;
            return (
              <button
                key={hours}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(hours)}
                className={`w-full flex items-center justify-between px-2.5 py-1 text-[12px] font-mono transition-colors text-left focus-visible:bg-[#0284c7]/30 focus-visible:outline-none ${
                  isSelected
                    ? "bg-[#0284c7] text-[#F4F6F7] font-semibold"
                    : "text-[#A7B0B6] hover:bg-[#0c1a24] hover:text-[#F4F6F7]"
                }`}
              >
                <span>{getLabel(hours)}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-[#F4F6F7]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TimeRangeDropdown;
