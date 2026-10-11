/**
 * Direct Supabase Data Client for VitalDB Cases, Tracks, and Physiological Observations.
 * Provides resilient, zero-downtime access to recorded surgical data directly from Supabase PostgreSQL.
 */

import type { VitalDbCaseSummary, TrackMetadata } from "./safeanesClient";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nntxlqchytvfmutmixea.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udHhscWNoeXR2Zm11dG1peGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5Nzk3OTcsImV4cCI6MjEwMTU1NTc5N30.robUviwFKiyoXaYEKRjM2JyhTCWO6vC5BlRkA_vD3D4";

function headers(): HeadersInit {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Accept: "application/json",
  };
}

export interface SupabaseCaseRow {
  id: string;
  dataset_id: string;
  subject_id: string | null;
  age: number | null;
  sex: string | null;
  height: number | null;
  weight: number | null;
  bmi: number | null;
  asa: number | null;
  op_name: string | null;
  department: string | null;
  duration_s: number;
  track_count: number;
  has_waveforms: boolean;
  metadata: {
    cache_status?: string;
    available_signals?: string[];
    eligibility?: {
      uc04_eligible?: boolean;
      uc05_eligible?: boolean;
    };
    quality_summary?: Record<string, unknown>;
    number_of_valid_windows?: Record<string, unknown>;
  } | null;
}

export interface SupabaseTrackRow {
  id: string;
  case_id: string;
  signal_code: string;
  signal_name: string;
  device: string;
  sample_rate_hz: number;
  unit: string;
  duration_s: number;
}

export interface SupabaseEventRow {
  id: string;
  case_id: string;
  timestamp_s: number;
  event_type: string;
  name: string;
  value: string;
  unit: string;
  source_system: string;
  provenance_ref: string;
}

export interface SupabaseSignalWindowRow {
  id: string;
  case_id: string;
  window_start_s: number;
  window_end_s: number;
  observations: Array<{
    track_name: string;
    count: number;
    samples: Array<{ t: number; v: number }>;
  }>;
  waveforms: {
    capno_preview?: number[];
  };
}

export async function fetchSupabaseCases(): Promise<VitalDbCaseSummary[]> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/safeanes_cases?dataset_id=eq.vitaldb&id=not.like.case_vitaldb_%&order=id.asc&select=*`;
    const resp = await fetch(url, { headers: headers(), cache: "no-store" });
    if (!resp.ok) return [];

    const rows = (await resp.json()) as SupabaseCaseRow[];
    return rows.map((r) => ({
      case_id: r.id,
      duration_seconds: Number(r.duration_s || 0),
      available_signals: r.metadata?.available_signals ?? [],
      uc04_eligible: Boolean(r.metadata?.eligibility?.uc04_eligible ?? true),
      uc05_eligible: Boolean(r.metadata?.eligibility?.uc05_eligible ?? true),
      coverage_summary: r.metadata?.quality_summary ?? {},
      number_of_valid_windows: r.metadata?.number_of_valid_windows ?? {},
      inference_readiness: { uc04: true, uc05: true },
      cache_status: "READY",
    }));
  } catch {
    return [];
  }
}

export async function fetchSupabaseTracks(caseId: string): Promise<TrackMetadata[]> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/safeanes_tracks?case_id=eq.${encodeURIComponent(caseId)}&order=signal_name.asc&select=*`;
    const resp = await fetch(url, { headers: headers(), cache: "no-store" });
    if (!resp.ok) return [];

    const rows = (await resp.json()) as SupabaseTrackRow[];
    return rows.map((r) => ({
      track_name: r.signal_name,
      source_device: r.device,
      track_type: r.sample_rate_hz > 10 ? "WAVEFORM" : "NUMERIC",
      native_sample_rate_hz: r.sample_rate_hz,
      observed_update_rate_hz: r.sample_rate_hz,
      unit: r.unit,
      record_count: 1000,
      native_sample_count: Math.round(r.sample_rate_hz * r.duration_s),
      valid_time_range_seconds: [0, r.duration_s],
    }));
  } catch {
    return [];
  }
}

export async function fetchSupabaseEvents(caseId: string): Promise<SupabaseEventRow[]> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/safeanes_events?case_id=eq.${encodeURIComponent(caseId)}&order=timestamp_s.asc&select=*`;
    const resp = await fetch(url, { headers: headers(), cache: "no-store" });
    if (!resp.ok) return [];
    return (await resp.json()) as SupabaseEventRow[];
  } catch {
    return [];
  }
}

export async function fetchSupabaseSignalWindows(
  caseId: string,
  startSeconds: number,
  endSeconds: number,
): Promise<SupabaseSignalWindowRow[]> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/safeanes_signal_windows?case_id=eq.${encodeURIComponent(caseId)}&window_start_s=lte.${endSeconds}&window_end_s=gte.${startSeconds}&order=window_start_s.asc&select=*`;
    const resp = await fetch(url, { headers: headers(), cache: "no-store" });
    if (!resp.ok) return [];
    return (await resp.json()) as SupabaseSignalWindowRow[];
  } catch {
    return [];
  }
}
