CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;
SELECT no_plan();

SELECT ok(to_regclass('public.safeanes_cases') IS NOT NULL, 'safeanes_cases exists');
SELECT ok(to_regclass('public.safeanes_tracks') IS NOT NULL, 'safeanes_tracks exists');
SELECT ok(to_regclass('public.safeanes_events') IS NOT NULL, 'safeanes_events exists');
SELECT ok(to_regclass('public.safeanes_signal_windows') IS NOT NULL, 'safeanes_signal_windows exists');

SELECT ok(
  ARRAY['id', 'dataset_id', 'subject_id', 'age', 'sex', 'height', 'weight', 'bmi', 'asa', 'op_name', 'department', 'duration_s', 'track_count', 'has_waveforms', 'review_status', 'metadata']::text[]
    <@ ARRAY(SELECT column_name::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'safeanes_cases'),
  'safeanes_cases contains the VitalDB case contract'
);
SELECT ok(
  ARRAY['id', 'case_id', 'signal_code', 'signal_name', 'device', 'sample_rate_hz', 'unit', 'duration_s', 'metadata']::text[]
    <@ ARRAY(SELECT column_name::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'safeanes_tracks'),
  'safeanes_tracks contains the VitalDB track contract'
);
SELECT ok(
  ARRAY['id', 'case_id', 'timestamp_s', 'event_type', 'name', 'value', 'unit', 'source_system', 'provenance_ref']::text[]
    <@ ARRAY(SELECT column_name::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'safeanes_events'),
  'safeanes_events contains the VitalDB event contract'
);
SELECT ok(
  ARRAY['id', 'case_id', 'window_start_s', 'window_end_s', 'observations', 'waveforms', 'predictions_uc04', 'predictions_uc05']::text[]
    <@ ARRAY(SELECT column_name::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'safeanes_signal_windows'),
  'safeanes_signal_windows contains the VitalDB signal-window contract'
);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.safeanes_cases'::regclass), 'RLS enabled on safeanes_cases');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.safeanes_tracks'::regclass), 'RLS enabled on safeanes_tracks');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.safeanes_events'::regclass), 'RLS enabled on safeanes_events');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.safeanes_signal_windows'::regclass), 'RLS enabled on safeanes_signal_windows');

SELECT ok(has_table_privilege('anon', 'public.safeanes_cases', 'SELECT'), 'anon can select safeanes_cases');
SELECT ok(has_table_privilege('authenticated', 'public.safeanes_cases', 'SELECT'), 'authenticated can select safeanes_cases');
SELECT ok(has_table_privilege('anon', 'public.safeanes_tracks', 'SELECT'), 'anon can select safeanes_tracks');
SELECT ok(has_table_privilege('authenticated', 'public.safeanes_tracks', 'SELECT'), 'authenticated can select safeanes_tracks');
SELECT ok(has_table_privilege('anon', 'public.safeanes_events', 'SELECT'), 'anon can select safeanes_events');
SELECT ok(has_table_privilege('authenticated', 'public.safeanes_events', 'SELECT'), 'authenticated can select safeanes_events');
SELECT ok(has_table_privilege('anon', 'public.safeanes_signal_windows', 'SELECT'), 'anon can select safeanes_signal_windows');
SELECT ok(has_table_privilege('authenticated', 'public.safeanes_signal_windows', 'SELECT'), 'authenticated can select safeanes_signal_windows');

SELECT ok(
  NOT (has_table_privilege('anon', 'public.safeanes_cases', 'INSERT') OR has_table_privilege('anon', 'public.safeanes_cases', 'UPDATE') OR has_table_privilege('anon', 'public.safeanes_cases', 'DELETE')),
  'anon has no write grant on safeanes_cases'
);
SELECT ok(
  NOT (has_table_privilege('authenticated', 'public.safeanes_cases', 'INSERT') OR has_table_privilege('authenticated', 'public.safeanes_cases', 'UPDATE') OR has_table_privilege('authenticated', 'public.safeanes_cases', 'DELETE')),
  'authenticated has no write grant on safeanes_cases'
);
SELECT ok(
  NOT (has_table_privilege('anon', 'public.safeanes_tracks', 'INSERT') OR has_table_privilege('anon', 'public.safeanes_tracks', 'UPDATE') OR has_table_privilege('anon', 'public.safeanes_tracks', 'DELETE')),
  'anon has no write grant on safeanes_tracks'
);
SELECT ok(
  NOT (has_table_privilege('authenticated', 'public.safeanes_tracks', 'INSERT') OR has_table_privilege('authenticated', 'public.safeanes_tracks', 'UPDATE') OR has_table_privilege('authenticated', 'public.safeanes_tracks', 'DELETE')),
  'authenticated has no write grant on safeanes_tracks'
);
SELECT ok(
  NOT (has_table_privilege('anon', 'public.safeanes_events', 'INSERT') OR has_table_privilege('anon', 'public.safeanes_events', 'UPDATE') OR has_table_privilege('anon', 'public.safeanes_events', 'DELETE')),
  'anon has no write grant on safeanes_events'
);
SELECT ok(
  NOT (has_table_privilege('authenticated', 'public.safeanes_events', 'INSERT') OR has_table_privilege('authenticated', 'public.safeanes_events', 'UPDATE') OR has_table_privilege('authenticated', 'public.safeanes_events', 'DELETE')),
  'authenticated has no write grant on safeanes_events'
);
SELECT ok(
  NOT (has_table_privilege('anon', 'public.safeanes_signal_windows', 'INSERT') OR has_table_privilege('anon', 'public.safeanes_signal_windows', 'UPDATE') OR has_table_privilege('anon', 'public.safeanes_signal_windows', 'DELETE')),
  'anon has no write grant on safeanes_signal_windows'
);
SELECT ok(
  NOT (has_table_privilege('authenticated', 'public.safeanes_signal_windows', 'INSERT') OR has_table_privilege('authenticated', 'public.safeanes_signal_windows', 'UPDATE') OR has_table_privilege('authenticated', 'public.safeanes_signal_windows', 'DELETE')),
  'authenticated has no write grant on safeanes_signal_windows'
);

SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'safeanes_cases' AND policyname = 'safeanes_cases_vitaldb_read' AND cmd = 'SELECT' AND roles @> ARRAY['anon', 'authenticated']::name[]), 'cases has a scoped read policy');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'safeanes_tracks' AND policyname = 'safeanes_tracks_vitaldb_read' AND cmd = 'SELECT' AND roles @> ARRAY['anon', 'authenticated']::name[]), 'tracks has a scoped read policy');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'safeanes_events' AND policyname = 'safeanes_events_vitaldb_read' AND cmd = 'SELECT' AND roles @> ARRAY['anon', 'authenticated']::name[]), 'events has a scoped read policy');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'safeanes_signal_windows' AND policyname = 'safeanes_signal_windows_vitaldb_read' AND cmd = 'SELECT' AND roles @> ARRAY['anon', 'authenticated']::name[]), 'signal windows has a scoped read policy');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('safeanes_cases', 'safeanes_tracks', 'safeanes_events', 'safeanes_signal_windows')
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[])
), 'VitalDB tables have no public write policies');

SELECT ok(to_regclass('public.idx_safeanes_cases_dataset') IS NOT NULL, 'cases dataset index exists');
SELECT ok(to_regclass('public.idx_safeanes_tracks_case') IS NOT NULL, 'tracks case index exists');
SELECT ok(to_regclass('public.idx_safeanes_events_case_time') IS NOT NULL, 'events case/time index exists');
SELECT ok(to_regclass('public.idx_safeanes_signal_windows_case') IS NOT NULL, 'signal-window case/time index exists');
SELECT ok(
  (SELECT count(*) = 3 FROM pg_constraint WHERE contype = 'f' AND conrelid IN ('public.safeanes_tracks'::regclass, 'public.safeanes_events'::regclass, 'public.safeanes_signal_windows'::regclass) AND confrelid = 'public.safeanes_cases'::regclass),
  'tracks, events, and signal windows reference cases'
);
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.safeanes_signal_windows'::regclass AND conname = 'safeanes_signal_windows_end_after_start' AND contype = 'c'), 'signal-window time bound constraint exists');
SELECT ok(
  has_table_privilege('service_role', 'public.safeanes_cases', 'INSERT')
  AND has_table_privilege('service_role', 'public.safeanes_tracks', 'INSERT')
  AND has_table_privilege('service_role', 'public.safeanes_events', 'INSERT')
  AND has_table_privilege('service_role', 'public.safeanes_signal_windows', 'INSERT'),
  'service_role can write all VitalDB tables'
);

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$INSERT INTO public.safeanes_cases (id, subject_id) VALUES ('pgtap-safeanes-case', 'first') ON CONFLICT (id) DO UPDATE SET subject_id = EXCLUDED.subject_id$$,
  'service_role can upsert cases by id'
);
SELECT is((SELECT subject_id FROM public.safeanes_cases WHERE id = 'pgtap-safeanes-case'), 'first'::text, 'first case upsert is stored');
SELECT lives_ok($$INSERT INTO public.safeanes_tracks (id, case_id, signal_code) VALUES ('pgtap-safeanes-track', 'pgtap-safeanes-case', 'HR')$$, 'service_role can write tracks');
SELECT lives_ok($$INSERT INTO public.safeanes_events (id, case_id, timestamp_s, event_type, name) VALUES ('pgtap-safeanes-event', 'pgtap-safeanes-case', 1, 'TEST', 'test')$$, 'service_role can write events');
SELECT lives_ok($$INSERT INTO public.safeanes_signal_windows (id, case_id, window_start_s, window_end_s) VALUES ('pgtap-safeanes-window', 'pgtap-safeanes-case', 0, 1)$$, 'service_role can write signal windows');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.safeanes_cases WHERE id = 'pgtap-safeanes-case'), 1, 'anon can read cases');
SELECT is((SELECT count(*)::integer FROM public.safeanes_tracks WHERE id = 'pgtap-safeanes-track'), 1, 'anon can read tracks');
SELECT is((SELECT count(*)::integer FROM public.safeanes_events WHERE id = 'pgtap-safeanes-event'), 1, 'anon can read events');
SELECT is((SELECT count(*)::integer FROM public.safeanes_signal_windows WHERE id = 'pgtap-safeanes-window'), 1, 'anon can read signal windows');
SELECT throws_ok($$INSERT INTO public.safeanes_cases (id) VALUES ('anon-case')$$, '42501', NULL, 'anon insert is rejected for cases');
SELECT throws_ok($$UPDATE public.safeanes_cases SET subject_id = 'changed' WHERE id = 'pgtap-safeanes-case'$$, '42501', NULL, 'anon update is rejected for cases');
SELECT throws_ok($$DELETE FROM public.safeanes_cases WHERE id = 'pgtap-safeanes-case'$$, '42501', NULL, 'anon delete is rejected for cases');
SELECT throws_ok($$INSERT INTO public.safeanes_tracks (id, signal_code) VALUES ('anon-track', 'HR')$$, '42501', NULL, 'anon insert is rejected for tracks');
SELECT throws_ok($$UPDATE public.safeanes_tracks SET signal_code = 'HR' WHERE id = 'pgtap-safeanes-track'$$, '42501', NULL, 'anon update is rejected for tracks');
SELECT throws_ok($$DELETE FROM public.safeanes_tracks WHERE id = 'pgtap-safeanes-track'$$, '42501', NULL, 'anon delete is rejected for tracks');
SELECT throws_ok($$INSERT INTO public.safeanes_events (id, timestamp_s, event_type, name) VALUES ('anon-event', 1, 'TEST', 'test')$$, '42501', NULL, 'anon insert is rejected for events');
SELECT throws_ok($$UPDATE public.safeanes_events SET name = 'changed' WHERE id = 'pgtap-safeanes-event'$$, '42501', NULL, 'anon update is rejected for events');
SELECT throws_ok($$DELETE FROM public.safeanes_events WHERE id = 'pgtap-safeanes-event'$$, '42501', NULL, 'anon delete is rejected for events');
SELECT throws_ok($$INSERT INTO public.safeanes_signal_windows (id, case_id, window_start_s, window_end_s) VALUES ('anon-window', 'pgtap-safeanes-case', 0, 1)$$, '42501', NULL, 'anon insert is rejected for signal windows');
SELECT throws_ok($$UPDATE public.safeanes_signal_windows SET window_end_s = 2 WHERE id = 'pgtap-safeanes-window'$$, '42501', NULL, 'anon update is rejected for signal windows');
SELECT throws_ok($$DELETE FROM public.safeanes_signal_windows WHERE id = 'pgtap-safeanes-window'$$, '42501', NULL, 'anon delete is rejected for signal windows');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.safeanes_cases WHERE id = 'pgtap-safeanes-case'), 1, 'authenticated can read cases');
SELECT is((SELECT count(*)::integer FROM public.safeanes_tracks WHERE id = 'pgtap-safeanes-track'), 1, 'authenticated can read tracks');
SELECT is((SELECT count(*)::integer FROM public.safeanes_events WHERE id = 'pgtap-safeanes-event'), 1, 'authenticated can read events');
SELECT is((SELECT count(*)::integer FROM public.safeanes_signal_windows WHERE id = 'pgtap-safeanes-window'), 1, 'authenticated can read signal windows');
SELECT throws_ok($$INSERT INTO public.safeanes_cases (id) VALUES ('authenticated-case')$$, '42501', NULL, 'authenticated insert is rejected for cases');
SELECT throws_ok($$UPDATE public.safeanes_cases SET subject_id = 'changed' WHERE id = 'pgtap-safeanes-case'$$, '42501', NULL, 'authenticated update is rejected for cases');
SELECT throws_ok($$DELETE FROM public.safeanes_cases WHERE id = 'pgtap-safeanes-case'$$, '42501', NULL, 'authenticated delete is rejected for cases');
SELECT throws_ok($$INSERT INTO public.safeanes_tracks (id, signal_code) VALUES ('authenticated-track', 'HR')$$, '42501', NULL, 'authenticated insert is rejected for tracks');
SELECT throws_ok($$UPDATE public.safeanes_tracks SET signal_code = 'HR' WHERE id = 'pgtap-safeanes-track'$$, '42501', NULL, 'authenticated update is rejected for tracks');
SELECT throws_ok($$DELETE FROM public.safeanes_tracks WHERE id = 'pgtap-safeanes-track'$$, '42501', NULL, 'authenticated delete is rejected for tracks');
SELECT throws_ok($$INSERT INTO public.safeanes_events (id, timestamp_s, event_type, name) VALUES ('authenticated-event', 1, 'TEST', 'test')$$, '42501', NULL, 'authenticated insert is rejected for events');
SELECT throws_ok($$UPDATE public.safeanes_events SET name = 'changed' WHERE id = 'pgtap-safeanes-event'$$, '42501', NULL, 'authenticated update is rejected for events');
SELECT throws_ok($$DELETE FROM public.safeanes_events WHERE id = 'pgtap-safeanes-event'$$, '42501', NULL, 'authenticated delete is rejected for events');
SELECT throws_ok($$INSERT INTO public.safeanes_signal_windows (id, case_id, window_start_s, window_end_s) VALUES ('authenticated-window', 'pgtap-safeanes-case', 0, 1)$$, '42501', NULL, 'authenticated insert is rejected for signal windows');
SELECT throws_ok($$UPDATE public.safeanes_signal_windows SET window_end_s = 2 WHERE id = 'pgtap-safeanes-window'$$, '42501', NULL, 'authenticated update is rejected for signal windows');
SELECT throws_ok($$DELETE FROM public.safeanes_signal_windows WHERE id = 'pgtap-safeanes-window'$$, '42501', NULL, 'authenticated delete is rejected for signal windows');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok($$INSERT INTO public.safeanes_tracks (id, case_id, signal_code) VALUES ('orphan-track', 'missing-case', 'HR')$$, '23503', NULL, 'track case foreign key is enforced');
SELECT throws_ok($$INSERT INTO public.safeanes_events (id, case_id, timestamp_s, event_type, name) VALUES ('orphan-event', 'missing-case', 1, 'TEST', 'test')$$, '23503', NULL, 'event case foreign key is enforced');
SELECT throws_ok($$INSERT INTO public.safeanes_signal_windows (id, case_id, window_start_s, window_end_s) VALUES ('orphan-window', 'missing-case', 0, 1)$$, '23503', NULL, 'signal-window case foreign key is enforced');
SELECT throws_ok($$INSERT INTO public.safeanes_signal_windows (id, case_id, window_start_s, window_end_s) VALUES ('invalid-window', 'pgtap-safeanes-case', 2, 1)$$, '23514', NULL, 'signal-window end must not precede start');
RESET ROLE;

SELECT is(
  (
    SELECT array_agg(format('%s|%s|%s|%s', tablename, policyname, roles::text, cmd) ORDER BY tablename, policyname)
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('profiles', 'clinical_cases', 'clinical_events', 'clinical_audit_log', 'model_predictions')
  ),
  ARRAY[
    'clinical_audit_log|Allow authenticated staff to view audit logs|{authenticated}|SELECT',
    'clinical_audit_log|Allow staff to insert audit entries|{authenticated}|INSERT',
    'clinical_cases|Allow authenticated staff to read clinical cases|{authenticated}|SELECT',
    'clinical_events|Allow authenticated staff to read events|{authenticated}|SELECT',
    'clinical_events|Allow authenticated staff to insert events|{authenticated}|INSERT',
    'model_predictions|Allow authenticated staff to view predictions|{authenticated}|SELECT',
    'profiles|Allow authenticated users to read profiles|{authenticated}|SELECT',
    'profiles|Allow users to update own profile|{authenticated}|UPDATE'
  ]::text[],
  'existing local clinical policy names, roles, and commands are preserved'
);

SELECT * FROM finish();
ROLLBACK;
