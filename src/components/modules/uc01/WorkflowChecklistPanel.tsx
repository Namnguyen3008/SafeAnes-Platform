"use client";

import React, { useState } from "react";
import { User, Monitor, Syringe, Pill, Scissors } from "lucide-react";
import { ChecklistStatus } from "./ChecklistStatus";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { ClinicalModal } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  WorkflowChecklistSection,
  WorkflowChecklistItem,
} from "@/types/uc01";
import { useTranslation } from "@/context/LocalizationContext";

export interface WorkflowChecklistPanelProps {
  sections: WorkflowChecklistSection[];
  activePhaseTab?: "Pre-induction" | "Intraoperative" | "Emergence" | "Postoperative";
  onItemClick?: (item: WorkflowChecklistItem) => void;
}

const sectionBadgeMap: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    bg: string;
    iconColor: string;
  }
> = {
  "patient-identity": {
    icon: User,
    bg: "bg-[#13BDF3]",
    iconColor: "text-black",
  },
  "equipment-monitoring": {
    icon: Monitor,
    bg: "bg-[#13BDF3]",
    iconColor: "text-black",
  },
  "anesthesia-plan": {
    icon: Syringe,
    bg: "bg-[#31E874]",
    iconColor: "text-black",
  },
  "medication-allergies": {
    icon: Pill,
    bg: "bg-[#FFD429]",
    iconColor: "text-black",
  },
  "surgical-readiness": {
    icon: Scissors,
    bg: "bg-transparent",
    iconColor: "text-[#F4F7F8]",
  },
};

const phases: Array<{
  id: "Pre-induction" | "Intraoperative" | "Emergence" | "Postoperative";
  labelKey: string;
  fallback: string;
}> = [
  { id: "Pre-induction", labelKey: "common.overview.command.phase1", fallback: "Pre-induction" },
  { id: "Intraoperative", labelKey: "common.overview.command.phase4", fallback: "Intraoperative" },
  { id: "Emergence", labelKey: "common.overview.command.phase5", fallback: "Emergence" },
  { id: "Postoperative", labelKey: "common.overview.command.phase6", fallback: "Postoperative" },
];

export const WorkflowChecklistPanel: React.FC<WorkflowChecklistPanelProps> = ({
  sections,
  activePhaseTab = "Pre-induction",
  onItemClick,
}) => {
  const { t } = useTranslation("uc01");
  const [activePhase, setActivePhase] = useState<
    "Pre-induction" | "Intraoperative" | "Emergence" | "Postoperative"
  >(activePhaseTab);

  const [openGroups, setOpenGroups] = useState<string[]>([
    "patient-identity",
    "equipment-monitoring",
    "anesthesia-plan",
    "medication-allergies",
    "surgical-readiness",
  ]);

  const [selectedItem, setSelectedItem] = useState<WorkflowChecklistItem | null>(
    null
  );

  const filteredSections = sections.filter(
    (s) => s.phaseTab === activePhase || !s.phaseTab
  );

  const handleItemClick = (item: WorkflowChecklistItem) => {
    setSelectedItem(item);
    if (onItemClick) {
      onItemClick(item);
    }
  };

  const totalItemsCount = sections.reduce(
    (acc, s) => acc + s.items.length,
    0
  );

  return (
    <>
      <div className="h-full bg-[#07131B] border border-[rgba(35,160,220,0.45)] rounded-[2px] p-2.5 flex flex-col justify-between overflow-hidden select-none">
        {/* Panel Header */}
        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[rgba(35,160,220,0.45)] shrink-0">
          <h2 className="text-[16px] font-semibold text-[#F4F7F8] tracking-wide">
            {t("workflow.title")}
          </h2>
          <Button
            variant="workstation"
            size="xs"
            className="text-[#A7B2B9] hover:text-[#F4F7F8] border-[rgba(35,160,220,0.45)] focus-visible:ring-1 focus-visible:ring-[#13BDF3] focus-visible:outline-none whitespace-nowrap"
          >
            {t("situation.viewAll", { count: totalItemsCount > 15 ? totalItemsCount : 32 })}
          </Button>
        </div>

        {/* Phase Navigation Tabs */}
        <div className="grid grid-cols-4 gap-1 mb-2 shrink-0">
          {phases.map((phase) => {
            const isActive = activePhase === phase.id;
            return (
              <button
                key={phase.id}
                onClick={() => setActivePhase(phase.id)}
                className={`py-1 px-1 rounded-[2px] text-[11px] xl:text-[12px] font-medium transition-all text-center leading-tight truncate cursor-pointer focus-visible:ring-1 focus-visible:ring-[#13BDF3] focus-visible:outline-none ${
                  isActive
                    ? "bg-[#13BDF3] text-black font-semibold"
                    : "bg-[#0A1822] hover:bg-[#0E202D] border border-[rgba(35,160,220,0.45)] text-[#A7B2B9] hover:text-[#F4F7F8]"
                }`}
                title={t(phase.labelKey)}
              >
                {t(phase.labelKey)}
              </button>
            );
          })}
        </div>


        {/* Collapsible Accordion Groups */}
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          <Accordion
            type="multiple"
            value={openGroups}
            onValueChange={setOpenGroups}
            className="h-full flex flex-col justify-between space-y-1.5"
          >
            {filteredSections.map((group) => {
              const badgeConfig = sectionBadgeMap[group.id] || {
                icon: User,
                bg: "bg-[#13BDF3]",
                iconColor: "text-black",
              };
              const Icon = badgeConfig.icon;

              return (
                <AccordionItem key={group.id} value={group.id}>
                  {/* Accordion Group Trigger */}
                  <AccordionTrigger className="focus-visible:ring-1 focus-visible:ring-[#13BDF3] focus-visible:outline-none">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`w-5 h-5 rounded-[2px] flex items-center justify-center shrink-0 ${badgeConfig.bg}`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${badgeConfig.iconColor}`} />
                      </div>
                      <span className="text-[15px] font-semibold text-[#F4F7F8]">
                        {group.title}
                      </span>
                    </div>
                  </AccordionTrigger>

                  {/* Accordion Group Content */}
                  <AccordionContent>
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="py-[2.5px] px-1 -mx-1 rounded-[1px] flex items-center justify-between hover:bg-[#0A1822] cursor-pointer transition-colors focus-visible:ring-1 focus-visible:ring-[#13BDF3] focus-visible:outline-none"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            handleItemClick(item);
                          }
                        }}
                      >
                        {/* Left: Reusable ChecklistStatus & Item Label */}
                        <div className="flex items-center space-x-2 min-w-0 pr-2">
                          <ChecklistStatus status={item.status} size="md" />

                          <span
                            className={`truncate text-[13.5px] ${
                              item.status === "COMPLETED"
                                ? "text-[#F4F7F8]"
                                : item.status === "IN_PROGRESS"
                                ? "text-[#13BDF3] font-medium"
                                : item.status === "BLOCKED"
                                ? "text-[#FF394D] font-medium"
                                : "text-[#A7B2B9]"
                            }`}
                          >
                            {item.label}
                          </span>
                        </div>

                        {/* Right: Timestamp, Role Badge, or Status Text */}
                        <div className="flex items-center space-x-2 shrink-0 font-mono text-[12px]">
                          {item.status === "IN_PROGRESS" && (
                            <span className="text-[#13BDF3] font-sans text-[11px] mr-1">
                              {t("workflow.inProgress")}...
                            </span>
                          )}

                          {item.timestamp ? (
                            <span className="text-[#F4F7F8]">{item.timestamp}</span>
                          ) : group.id === "equipment-monitoring" && item.id === "e3" ? (
                            <span className="text-[#A7B3BC]">—</span>
                          ) : group.id === "surgical-readiness" ? (
                            <span className="text-[#A7B3BC] font-sans text-[11.5px]">
                              {t("workflow.pending")}
                            </span>
                          ) : null}

                          {item.role && (
                            <span className="px-1.5 py-[1px] bg-[#0A1822] border border-[rgba(35,160,220,0.45)] rounded-[2px] text-[11px] font-sans font-semibold text-[#13BDF3]">
                              {item.role}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </div>

      {/* Checklist Item Detail Popover */}
      <ClinicalModal
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.label || t("workflow.title")}
        subtitle="Xác minh & Nguồn gốc lâm sàng"
      >
        {selectedItem && (
          <div className="space-y-2.5 text-[12.5px] leading-relaxed">
            <div className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1.5 bg-[#0A1822] border border-[rgba(35,160,220,0.3)] p-2.5 rounded-[2px]">
              <span className="text-[#A7B2B9]">Trạng thái:</span>
              <div className="flex items-center space-x-1.5">
                <ChecklistStatus status={selectedItem.status} size="sm" />
                <span
                  className={
                    selectedItem.status === "COMPLETED"
                      ? "text-[#31E874] font-semibold"
                      : selectedItem.status === "IN_PROGRESS"
                      ? "text-[#13BDF3] font-semibold"
                      : "text-[#A7B2B9]"
                  }
                >
                  {selectedItem.status === "COMPLETED"
                    ? t("workflow.completed")
                    : selectedItem.status === "IN_PROGRESS"
                    ? t("workflow.inProgress")
                    : selectedItem.status === "BLOCKED"
                    ? t("workflow.blocked")
                    : t("workflow.pending")}
                </span>
              </div>

              <span className="text-[#A7B2B9]">Thời điểm:</span>
              <span className="font-mono text-[#F4F7F8]">
                {selectedItem.timestamp || "Chưa ghi nhận"}
              </span>

              <span className="text-[#A7B2B9]">Người thực hiện:</span>
              <span className="text-[#F4F7F8] font-medium">
                {selectedItem.completedBy ||
                  (selectedItem.role
                    ? `Xác nhận ${selectedItem.role}`
                    : "Chờ xác minh")}
              </span>

              <span className="text-[#A7B2B9]">Nguồn:</span>
              <span className="text-[#F4F7F8]">
                {selectedItem.source || "Hệ thống lâm sàng chu phẫu"}
              </span>

              <span className="text-[#A7B2B9]">Nguồn gốc:</span>
              <span className="font-mono text-[11.5px] text-[#13BDF3]">
                {selectedItem.provenance || "Nhập quy trình trực tiếp"}
              </span>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                variant="workstation"
                size="sm"
                onClick={() => setSelectedItem(null)}
              >
                Đóng (Esc)
              </Button>
            </div>
          </div>
        )}
      </ClinicalModal>
    </>
  );
};
