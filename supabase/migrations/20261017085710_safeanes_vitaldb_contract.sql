-- Preserve existing SafeAnes data while making the VitalDB read/write boundary explicit.
-- The connected project already contains these tables and columns; CREATE/ADD IF NOT EXISTS
-- makes this migration usable on a fresh local database without replacing existing rows.

CREATE TABLE IF NOT EXISTS public.safeanes_cases (
  id text PRIMARY KEY,
  dataset_id text,
  subject_id text,
  age numeric,
  sex text,
  height numeric,
  weight numeric,
  bmi numeric,
  asa integer,
  op_name text,
  department text,
  duration_s numeric DEFAULT 0,
  track_count integer DEFAULT 0,
  has_waveforms boolean DEFAULT false,
  review_status text DEFAULT 'NOT_REVIEWED',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.safeanes_tracks (
  id text PRIMARY KEY,
  case_id text REFERENCES public.safeanes_cases(id) ON DELETE CASCADE,
  signal_code text NOT NULL,
  signal_name text,
  device text,
  sample_rate_hz numeric,
  unit text,
  duration_s numeric DEFAULT 0,
  s3_key text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.safeanes_events (
  id text PRIMARY KEY,
  case_id text REFERENCES public.safeanes_cases(id) ON DELETE CASCADE,
  timestamp_s numeric NOT NULL,
  event_type text NOT NULL,
  name text NOT NULL,
  value text,
  unit text,
  source_system text,
  provenance_ref text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.safeanes_signal_windows (
  id text PRIMARY KEY,
  case_id text NOT NULL,
  window_start_s numeric NOT NULL,
  window_end_s numeric NOT NULL,
  observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  waveforms jsonb NOT NULL DEFAULT '{}'::jsonb,
  predictions_uc04 jsonb NOT NULL DEFAULT '[]'::jsonb,
  predictions_uc05 jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add contract fields if an older deployment has a partially populated table.
ALTER TABLE public.safeanes_cases
  ADD COLUMN IF NOT EXISTS dataset_id text,
  ADD COLUMN IF NOT EXISTS subject_id text,
  ADD COLUMN IF NOT EXISTS age numeric,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS height numeric,
  ADD COLUMN IF NOT EXISTS weight numeric,
  ADD COLUMN IF NOT EXISTS bmi numeric,
  ADD COLUMN IF NOT EXISTS asa integer,
  ADD COLUMN IF NOT EXISTS op_name text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS duration_s numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS track_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_waveforms boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'NOT_REVIEWED',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.safeanes_tracks
  ADD COLUMN IF NOT EXISTS case_id text,
  ADD COLUMN IF NOT EXISTS signal_code text,
  ADD COLUMN IF NOT EXISTS signal_name text,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS sample_rate_hz numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS duration_s numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS s3_key text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.safeanes_events
  ADD COLUMN IF NOT EXISTS case_id text,
  ADD COLUMN IF NOT EXISTS timestamp_s numeric,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS value text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS provenance_ref text;

ALTER TABLE public.safeanes_signal_windows
  ADD COLUMN IF NOT EXISTS case_id text,
  ADD COLUMN IF NOT EXISTS window_start_s numeric,
  ADD COLUMN IF NOT EXISTS window_end_s numeric,
  ADD COLUMN IF NOT EXISTS observations jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS waveforms jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS predictions_uc04 jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS predictions_uc05 jsonb DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.safeanes_cases'::regclass
      AND conname = 'safeanes_cases_review_status_check'
  ) THEN
    ALTER TABLE public.safeanes_cases
      ADD CONSTRAINT safeanes_cases_review_status_check
      CHECK (review_status IN ('NOT_REVIEWED', 'IN_REVIEW', 'ACCEPTED', 'ACCEPTED_WITH_LIMITATIONS', 'REJECTED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.safeanes_tracks'::regclass
      AND conname = 'safeanes_tracks_case_id_fkey'
  ) THEN
    ALTER TABLE public.safeanes_tracks
      ADD CONSTRAINT safeanes_tracks_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES public.safeanes_cases(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.safeanes_events'::regclass
      AND conname = 'safeanes_events_case_id_fkey'
  ) THEN
    ALTER TABLE public.safeanes_events
      ADD CONSTRAINT safeanes_events_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES public.safeanes_cases(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.safeanes_signal_windows'::regclass
      AND conname = 'safeanes_signal_windows_case_id_fkey'
  ) THEN
    ALTER TABLE public.safeanes_signal_windows
      ADD CONSTRAINT safeanes_signal_windows_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES public.safeanes_cases(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.safeanes_signal_windows'::regclass
      AND conname = 'safeanes_signal_windows_end_after_start'
  ) THEN
    ALTER TABLE public.safeanes_signal_windows
      ADD CONSTRAINT safeanes_signal_windows_end_after_start
      CHECK (window_end_s >= window_start_s);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_safeanes_cases_dataset
  ON public.safeanes_cases (dataset_id);
CREATE INDEX IF NOT EXISTS idx_safeanes_tracks_case
  ON public.safeanes_tracks (case_id);
CREATE INDEX IF NOT EXISTS idx_safeanes_events_case_time
  ON public.safeanes_events (case_id, timestamp_s);
CREATE INDEX IF NOT EXISTS idx_safeanes_signal_windows_case
  ON public.safeanes_signal_windows (case_id, window_start_s);

ALTER TABLE public.safeanes_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safeanes_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safeanes_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safeanes_signal_windows ENABLE ROW LEVEL SECURITY;

-- Remove the known unrestricted policies from the read-only VitalDB API tables.
DROP POLICY IF EXISTS "Allow write safeanes_cases" ON public.safeanes_cases;
DROP POLICY IF EXISTS "Public read cases" ON public.safeanes_cases;
DROP POLICY IF EXISTS safeanes_cases_vitaldb_read ON public.safeanes_cases;
DROP POLICY IF EXISTS safeanes_cases_vitaldb_service_write ON public.safeanes_cases;

DROP POLICY IF EXISTS "Allow write safeanes_tracks" ON public.safeanes_tracks;
DROP POLICY IF EXISTS "Public read tracks" ON public.safeanes_tracks;
DROP POLICY IF EXISTS safeanes_tracks_vitaldb_read ON public.safeanes_tracks;
DROP POLICY IF EXISTS safeanes_tracks_vitaldb_service_write ON public.safeanes_tracks;

DROP POLICY IF EXISTS "Allow write safeanes_events" ON public.safeanes_events;
DROP POLICY IF EXISTS "Public read events" ON public.safeanes_events;
DROP POLICY IF EXISTS safeanes_events_vitaldb_read ON public.safeanes_events;
DROP POLICY IF EXISTS safeanes_events_vitaldb_service_write ON public.safeanes_events;

DROP POLICY IF EXISTS "Allow write safeanes_signal_windows" ON public.safeanes_signal_windows;
DROP POLICY IF EXISTS "Public read signal windows" ON public.safeanes_signal_windows;
DROP POLICY IF EXISTS safeanes_signal_windows_vitaldb_read ON public.safeanes_signal_windows;
DROP POLICY IF EXISTS safeanes_signal_windows_vitaldb_service_write ON public.safeanes_signal_windows;

REVOKE ALL PRIVILEGES ON TABLE
  public.safeanes_cases,
  public.safeanes_tracks,
  public.safeanes_events,
  public.safeanes_signal_windows
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.safeanes_cases,
  public.safeanes_tracks,
  public.safeanes_events,
  public.safeanes_signal_windows
TO anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.safeanes_cases,
  public.safeanes_tracks,
  public.safeanes_events,
  public.safeanes_signal_windows
TO service_role;

CREATE POLICY safeanes_cases_vitaldb_read
  ON public.safeanes_cases FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY safeanes_cases_vitaldb_service_write
  ON public.safeanes_cases FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY safeanes_tracks_vitaldb_read
  ON public.safeanes_tracks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY safeanes_tracks_vitaldb_service_write
  ON public.safeanes_tracks FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY safeanes_events_vitaldb_read
  ON public.safeanes_events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY safeanes_events_vitaldb_service_write
  ON public.safeanes_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY safeanes_signal_windows_vitaldb_read
  ON public.safeanes_signal_windows FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY safeanes_signal_windows_vitaldb_service_write
  ON public.safeanes_signal_windows FOR ALL TO service_role USING (true) WITH CHECK (true);
