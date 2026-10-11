"use client";

import React, { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  LayoutDashboard,
  ClipboardCheck,
  FileText,
  Syringe,
  Activity,
  Wind,
} from "lucide-react";
import { useCase } from "@/context/CaseContext";
import { useTranslation } from "@/context/LocalizationContext";

interface NavItem {
  id: "overview" | "situation" | "record" | "medications" | "hemodynamics" | "respiratory";
  hrefSegment: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    id: "overview",
    hrefSegment: "",
    icon: LayoutDashboard,
  },
  {
    id: "situation",
    hrefSegment: "situation",
    icon: ClipboardCheck,
  },
  {
    id: "record",
    hrefSegment: "record",
    icon: FileText,
  },
  {
    id: "medications",
    hrefSegment: "medications",
    icon: Syringe,
  },
  {
    id: "hemodynamics",
    hrefSegment: "hemodynamics",
    icon: Activity,
  },
  {
    id: "respiratory",
    hrefSegment: "respiratory",
    icon: Wind,
  },
];

export function ClinicalNavigationRail() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeCaseId } = useCase();
  const { t } = useTranslation("shell");
  const caseId = activeCaseId || "demo";

  const [isPending, startTransition] = useTransition();
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending) {
      setPendingTarget(null);
    }
  }, [isPending, pathname]);

  return (
    <aside className="w-[var(--safe-nav-width)] min-w-[var(--safe-nav-width)] h-full bg-safe-surface border-r border-safe-border flex flex-col items-center py-2 shrink-0 select-none z-20">
      <div className="flex flex-col space-y-1.5 w-full px-1.5">
        {navItems.map((item) => {
          const targetUrl = item.hrefSegment
            ? `/safeanes/case/${caseId}/${item.hrefSegment}`
            : `/safeanes/case/${caseId}`;

          const isActive =
            item.hrefSegment === ""
              ? pathname === `/safeanes/case/${caseId}` ||
                pathname === `/safeanes/case/${caseId}/`
              : pathname.includes(`/safeanes/case/${caseId}/${item.hrefSegment}`);

          const isTargetPending = isPending && pendingTarget === item.id;
          const IconComponent = item.icon;

          return (
            <Link
              key={item.id}
              href={targetUrl}
              prefetch={true}
              title={t(`navTooltips.${item.id}`)}
              onClick={(e) => {
                if (isActive) return;
                e.preventDefault();
                setPendingTarget(item.id);
                startTransition(() => {
                  router.push(targetUrl);
                });
              }}
              className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-sm border transition-all text-center group cursor-pointer ${
                isActive
                  ? "bg-safe-surface-secondary border-safe-border text-safe-cyan shadow-sm"
                  : isTargetPending
                  ? "bg-safe-surface-secondary/80 border-safe-cyan/60 text-safe-cyan shadow-inner animate-pulse"
                  : "border-transparent text-safe-text-muted hover:text-safe-text hover:bg-safe-surface-secondary/60 hover:border-safe-border-light"
              }`}
            >
              {/* Active left indicator strip */}
              {(isActive || isTargetPending) && (
                <div
                  className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r ${
                    isActive ? "bg-safe-cyan" : "bg-safe-cyan/60 animate-pulse"
                  }`}
                />
              )}

              {isTargetPending ? (
                <Loader2 className="w-5 h-5 mb-1 text-safe-cyan animate-spin" />
              ) : (
                <IconComponent
                  className={`w-5 h-5 mb-1 ${
                    isActive ? "text-safe-cyan" : "text-safe-text-muted group-hover:text-safe-text"
                  }`}
                />
              )}
              <span className="text-xs font-semibold tracking-tight leading-tight">
                {t(`nav.${item.id}`)}
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

