"use client";

import React, { createContext, useContext, useState } from "react";
import { ChevronDown } from "lucide-react";

interface AccordionContextType {
  openValues: string[];
  toggleItem: (value: string) => void;
}

const AccordionContext = createContext<AccordionContextType | null>(null);

interface AccordionProps {
  type?: "single" | "multiple";
  defaultValue?: string[];
  value?: string[];
  onValueChange?: (values: string[]) => void;
  children: React.ReactNode;
  className?: string;
}

export function Accordion({
  type = "multiple",
  defaultValue = [],
  value,
  onValueChange,
  children,
  className = "",
}: AccordionProps) {
  const [internalOpen, setInternalOpen] = useState<string[]>(defaultValue);
  const openValues = value !== undefined ? value : internalOpen;

  const toggleItem = (itemValue: string) => {
    let nextValues: string[];
    if (type === "single") {
      nextValues = openValues.includes(itemValue) ? [] : [itemValue];
    } else {
      nextValues = openValues.includes(itemValue)
        ? openValues.filter((v) => v !== itemValue)
        : [...openValues, itemValue];
    }

    if (value === undefined) {
      setInternalOpen(nextValues);
    }
    if (onValueChange) {
      onValueChange(nextValues);
    }
  };

  return (
    <AccordionContext.Provider value={{ openValues, toggleItem }}>
      <div className={`space-y-1.5 ${className}`}>{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

const ItemContext = createContext<{ value: string; isOpen: boolean } | null>(null);

export function AccordionItem({
  value,
  children,
  className = "",
}: AccordionItemProps) {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error("AccordionItem must be used within an Accordion");
  }

  const isOpen = context.openValues.includes(value);

  return (
    <ItemContext.Provider value={{ value, isOpen }}>
      <div
        className={`bg-safe-surface border border-safe-border-light rounded-sm min-w-0 overflow-hidden ${className}`}
      >
        {children}
      </div>
    </ItemContext.Provider>
  );
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  className?: string;
}

export function AccordionTrigger({
  children,
  className = "",
}: AccordionTriggerProps) {
  const accordionContext = useContext(AccordionContext);
  const itemContext = useContext(ItemContext);

  if (!accordionContext || !itemContext) {
    throw new Error("AccordionTrigger must be used within an AccordionItem");
  }

  const { value, isOpen } = itemContext;

  return (
    <button
      type="button"
      onClick={() => accordionContext.toggleItem(value)}
      className={`w-full px-2.5 py-1.5 flex items-center justify-between bg-safe-surface-secondary hover:bg-safe-surface-elevated transition-colors cursor-pointer select-none text-left border-b border-safe-border-subtle ${className}`}
    >
      <div className="flex items-center space-x-2 min-w-0 text-safe-text">{children}</div>
      <ChevronDown
        className={`w-3.5 h-3.5 text-safe-text-muted transition-transform duration-200 ${
          isOpen ? "rotate-0" : "-rotate-90"
        }`}
      />
    </button>
  );
}

interface AccordionContentProps {
  children: React.ReactNode;
  className?: string;
}

export function AccordionContent({
  children,
  className = "",
}: AccordionContentProps) {
  const itemContext = useContext(ItemContext);
  if (!itemContext) {
    throw new Error("AccordionContent must be used within an AccordionItem");
  }

  if (!itemContext.isOpen) {
    return null;
  }

  return (
    <div
      className={`min-w-0 px-2.5 py-1 divide-y divide-safe-border-subtle text-[13px] bg-safe-surface ${className}`}
    >
      {children}
    </div>
  );
}
