import type { RecordSectionId, RejectionReason } from "@/types/uc02";

export interface RecordSectionDefinition {
  id: RecordSectionId;
  title: string;
}

/** Presentation taxonomy shared by the structured record and review controls. */
export const RECORD_SECTIONS: RecordSectionDefinition[] = [
  { id: "patient_context", title: "Patient Context" },
  { id: "pre_induction", title: "Pre-induction" },
  { id: "induction", title: "Induction" },
  { id: "airway", title: "Airway" },
  { id: "maintenance", title: "Maintenance" },
  { id: "ventilation", title: "Ventilation" },
  { id: "hemodynamics", title: "Hemodynamics" },
  { id: "medications", title: "Medications" },
  { id: "fluids_blood", title: "Fluids / Blood Products" },
  { id: "procedures", title: "Procedures" },
  { id: "major_events", title: "Major Events" },
  { id: "emergence", title: "Emergence" },
  { id: "recovery_transfer", title: "Recovery / Transfer" },
];

export const REJECTION_REASONS: RejectionReason[] = [
  "Unsupported by evidence",
  "Incorrect value",
  "Incorrect time",
  "Incorrect terminology",
  "Incorrect interpretation",
  "Duplicate",
  "Other",
];
