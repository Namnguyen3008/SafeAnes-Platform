import { ClinicalClaim } from "@/types/uc02";
import { ClinicalAlert } from "@/types/clinical";

export interface CrossModuleBridgeLink {
  id: string;
  label: string;
  moduleBadge: string;
  targetModule: "UC01" | "UC02" | "UC03" | "UC04" | "UC05";
  url: string;
  category: "medication" | "hemodynamics" | "respiratory" | "record" | "situation";
}

/**
 * Derives cross-module contextual navigation links for a given UC02 claim.
 */
export function getCrossModuleLinksForClaim(
  claim: ClinicalClaim,
  caseId: string = "demo"
): CrossModuleBridgeLink[] {
  const links: CrossModuleBridgeLink[] = [];
  const textLower = (claim.text || "").toLowerCase();
  const propType = claim.propositionType || "";
  const relatedNames = (claim.relatedEvents || []).map((r) => r.name.toLowerCase());
  const canonicalRefs = new Set(claim.evidenceRefs);
  const hasPhenylephrine =
    canonicalRefs.has("medication-phenylephrine-rescue") ||
    claim.entityId === "PHENYLEPHRINE" ||
    textLower.includes("phenylephrine") ||
    propType.includes("vasopressor") ||
    relatedNames.some((n) => n.includes("phenylephrine"));

  const hasLowMap =
    canonicalRefs.has("episode-hemodynamic-low-map-detected") ||
    canonicalRefs.has("episode-hemodynamic-low-map-resolved") ||
    claim.conceptId === "HEMODYNAMIC_LOW_MAP_EPISODE" ||
    claim.conceptId === "HEMODYNAMIC_RESPONSE_ASSOCIATION" ||
    textLower.includes("map") ||
    textLower.includes("hypotension") ||
    textLower.includes("pressure") ||
    propType.includes("low_map") ||
    claim.section === "hemodynamics";

  const hasRespiratory =
    canonicalRefs.has("respiratory-no-breath-detected") ||
    canonicalRefs.has("respiratory-no-breath-resolved") ||
    claim.conceptId === "RESPIRATORY_NO_BREATH_INTERVAL" ||
    textLower.includes("spo2") ||
    textLower.includes("desaturation") ||
    textLower.includes("ventilation") ||
    textLower.includes("airway") ||
    propType.includes("desaturation") ||
    claim.section === "ventilation";

  // 1. Phenylephrine administration -> UC03
  if (hasPhenylephrine) {
    const time = afterRecordedEvent(claim.clinicalTime?.start || "10:33:00");
    links.push({
      id: "bridge-med-phenylephrine",
      label: "View Medication Context",
      moduleBadge: "UC03 Medication Safety",
      targetModule: "UC03",
      category: "medication",
      url: `/safeanes/case/${caseId}/medications?time=${encodeURIComponent(time)}&medication=med-phenylephrine&event=medication-phenylephrine-rescue`,
    });
  }

  // 2. Low MAP episode -> UC04
  if (hasLowMap) {
    const time = afterRecordedEvent(claim.clinicalTime?.start || "10:31:00");
    links.push({
      id: "bridge-hemo-map",
      label: "View Hemodynamic Context",
      moduleBadge: "UC04 Hemodynamics",
      targetModule: "UC04",
      category: "hemodynamics",
      url: `/safeanes/case/${caseId}/hemodynamics?time=${encodeURIComponent(time)}&event=episode-hemodynamic-low-map-detected`,
    });
  }

  // 3. Respiratory deterioration / Desaturation -> UC05
  if (hasRespiratory) {
    const time = afterRecordedEvent(claim.clinicalTime?.start || "08:24:00");
    links.push({
      id: "bridge-resp-desat",
      label: "View Respiratory Context",
      moduleBadge: "UC05 Respiratory",
      targetModule: "UC05",
      category: "respiratory",
      url: `/safeanes/case/${caseId}/respiratory?time=${encodeURIComponent(time)}&event=respiratory-no-breath-detected&alarm=respiratory-no-breath-detected`,
    });
  }

  return links;
}

/** Open just after record arrival so the destination replay includes the referenced event. */
function afterRecordedEvent(time: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match) return time;
  const totalSeconds = (Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3] ?? 0) + 1) % 86_400;
  const hours = Math.floor(totalSeconds / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor(totalSeconds % 3_600 / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Builds destination URL for a global alert with preserved caseId, timestamp, and event/medication context.
 */
export function getAlertNavigationUrl(
  alert: ClinicalAlert,
  caseId: string = "demo"
): string {
  const time = alert.timestamp || "10:44:00";

  switch (alert.sourceModule) {
    case "MEDICATION": {
      // If alert mentions ketorolac
      const isKetorolac = alert.title.toLowerCase().includes("ketorolac") || alert.message.toLowerCase().includes("ketorolac");
      const medId = isKetorolac ? "ketorolac" : "phenylephrine";
      return `/safeanes/case/${caseId}/medications?time=${encodeURIComponent(time)}&medication=${medId}&alert=${encodeURIComponent(alert.id)}`;
    }
    case "HEMODYNAMICS": {
      return `/safeanes/case/${caseId}/hemodynamics?time=${encodeURIComponent(time)}&event=evt_phys_03`;
    }
    case "RESPIRATORY": {
      const isApnea = alert.title.toLowerCase().includes("breath") || alert.code.includes("APNEA");
      const eventId = isApnea ? "alarm-1" : "alarm-2";
      return `/safeanes/case/${caseId}/respiratory?time=${encodeURIComponent(time)}&event=${eventId}&alarm=${eventId}`;
    }
    case "RECORD_VALIDATION":
    case "RECORD": {
      return `/safeanes/case/${caseId}/record?time=${encodeURIComponent(time)}&claim=clm_00182&event=evt_phys_03`;
    }
    case "DATA_QUALITY":
    case "SITUATION": {
      return `/safeanes/case/${caseId}/situation?time=${encodeURIComponent(time)}&event=evt_qual_02&device=masimo`;
    }
    default:
      return `/safeanes/case/${caseId}`;
  }
}
