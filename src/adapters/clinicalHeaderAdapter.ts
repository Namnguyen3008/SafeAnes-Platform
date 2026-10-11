export interface ClinicalHeaderCaseContextInput {
  mode: "SYNTHETIC_DEMO" | "VITALDB_REPLAY";
  pathname: string;
  caseId: string | null;
  simulation: {
    patientAgeYears: number;
    patientSex: string;
    operatingRoom: string;
    procedure: string;
    anesthesia: string;
  };
}

export interface ClinicalHeaderCaseContext {
  source: "SYNTHETIC_DEMO" | "VITALDB_REPLAY";
  caseId: string | null;
  ageYears: number | null;
  sex: string | null;
  operatingRoom: string | null;
  procedure: string | null;
  anesthesia: string | null;
}

export function resolveHeaderCaseContext(
  input: ClinicalHeaderCaseContextInput,
): ClinicalHeaderCaseContext {
  // The selected replay source is case-wide. Module routes must not switch the
  // global header back to synthetic demographics while the VitalDB session is active.
  if (input.mode === "VITALDB_REPLAY") {
    return {
      source: "VITALDB_REPLAY",
      caseId: input.caseId,
      ageYears: null,
      sex: null,
      operatingRoom: null,
      procedure: null,
      anesthesia: null,
    };
  }

  const patientSex = input.simulation.patientSex.toLowerCase() === "female"
    ? "Female"
    : input.simulation.patientSex.toLowerCase() === "male"
      ? "Male"
      : input.simulation.patientSex;
  return {
    source: "SYNTHETIC_DEMO",
    caseId: null,
    ageYears: input.simulation.patientAgeYears,
    sex: patientSex,
    operatingRoom: input.simulation.operatingRoom,
    procedure: input.simulation.procedure,
    anesthesia: input.simulation.anesthesia,
  };
}
