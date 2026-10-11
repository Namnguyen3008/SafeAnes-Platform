-- SafeAnes Clinical Database Migration
-- Target: PostgreSQL 15+ / Supabase
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema: public.profiles (Anesthesiologists, OR Nurses, Residents, Auditors)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ANESTHESIOLOGIST', 'CRNA', 'RESIDENT', 'AUDITOR', 'ADMIN')),
    hospital_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schema: public.clinical_cases (Operating Room Cases & VitalDB Catalog)
CREATE TABLE IF NOT EXISTS public.clinical_cases (
    case_id TEXT PRIMARY KEY,
    dataset TEXT NOT NULL DEFAULT 'VitalDB',
    operating_room TEXT,
    anesthesia_type TEXT,
    duration_seconds DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'ARCHIVED')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schema: public.clinical_events (Recorded, Observed & Derived Timeline Annotations)
CREATE TABLE IF NOT EXISTS public.clinical_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id TEXT NOT NULL REFERENCES public.clinical_cases(case_id) ON DELETE CASCADE,
    event_time_s DOUBLE PRECISION NOT NULL,
    classification TEXT NOT NULL CHECK (classification IN ('OBSERVED', 'DERIVED', 'ALERT', 'INTERVENTION')),
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schema: public.clinical_audit_log (Clinician Overrides, Alert Responses, Drug Admin)
CREATE TABLE IF NOT EXISTS public.clinical_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id TEXT REFERENCES public.clinical_cases(case_id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_time_s DOUBLE PRECISION NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('OVERRIDE', 'MODIFY', 'DISMISS', 'ADMINISTER', 'NOTE')),
    medication_name TEXT,
    dose_given TEXT,
    reason TEXT NOT NULL,
    context_snapshot JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schema: public.model_predictions (Audit Trail for UC04 HypoFormer & UC05 RespFormer)
CREATE TABLE IF NOT EXISTS public.model_predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id TEXT NOT NULL REFERENCES public.clinical_cases(case_id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    model_version TEXT NOT NULL,
    as_of_s DOUBLE PRECISION NOT NULL,
    horizon_minutes INTEGER,
    predicted_value DOUBLE PRECISION NOT NULL,
    risk_level TEXT CHECK (risk_level IN ('LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'UNAVAILABLE')),
    data_coverage DOUBLE PRECISION,
    features_present TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for Fast Time-Series and Case Lookup
CREATE INDEX IF NOT EXISTS idx_clinical_events_case_time ON public.clinical_events (case_id, event_time_s);
CREATE INDEX IF NOT EXISTS idx_clinical_audit_log_case ON public.clinical_audit_log (case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_model_predictions_case ON public.model_predictions (case_id, as_of_s);

-- Row Level Security (RLS) Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_predictions ENABLE ROW LEVEL SECURITY;

-- 1. Profiles: Users can view all staff profiles and update their own
CREATE POLICY "Allow authenticated users to read profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow users to update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- 2. Cases: Clinical staff can read cases
CREATE POLICY "Allow authenticated staff to read clinical cases"
    ON public.clinical_cases FOR SELECT
    TO authenticated
    USING (true);

-- 3. Events: Clinical staff can read and record events
CREATE POLICY "Allow authenticated staff to read events"
    ON public.clinical_events FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated staff to insert events"
    ON public.clinical_events FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 4. Audit Log: Strict audit compliance - append-only, users can create logs for themselves
CREATE POLICY "Allow authenticated staff to view audit logs"
    ON public.clinical_audit_log FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow staff to insert audit entries"
    ON public.clinical_audit_log FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 5. Model Predictions: Read-only for clinical staff, insertable by backend service role
CREATE POLICY "Allow authenticated staff to view predictions"
    ON public.model_predictions FOR SELECT
    TO authenticated
    USING (true);
