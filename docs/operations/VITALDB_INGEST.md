# VitalDB ingestion into Supabase

The ingestion script writes VitalDB data to four Postgres tables: `safeanes_cases`, `safeanes_tracks`, `safeanes_events`, and `safeanes_signal_windows`. The web client reads these rows with the public Supabase key. Only the trusted server-side ingestion runner may write them.

## Credentials

Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the secret store for the server runner. The URL is not secret; the service-role key is. Keep that key out of browser variables such as `NEXT_PUBLIC_*`, source files, command logs, CI workflow files, and client bundles. The script has no public/anon-key fallback for writes. A live run stops before processing any case when the URL or service-role key is missing.

## Local dry run

Run a dry run from the repository root:

```sh
python scripts/ingest_vitaldb_to_supabase.py --dry-run --cases 1
```

The dry run may download and parse the requested VitalDB case, but it does not create an authenticated Supabase client or send database writes. It requires no Supabase credential.

## Server-side ingestion

Run the script only in a trusted server environment after setting the two variables in that environment's secret store:

```sh
python scripts/ingest_vitaldb_to_supabase.py --cases 1,6388
```

Each table uses `id` as the PostgREST conflict key, so rerunning a batch updates existing rows rather than creating duplicate IDs. Logs report table/status information and never print the credential or response body.

## Local database checks

The Supabase database workflow starts a local stack, resets it from the checked-in migrations, runs the pgTAP RLS contract, then lints the local schema. It does not connect to a linked project. Run these commands locally when Docker is available:

```sh
supabase start
supabase db reset --local
supabase test db supabase/tests/database/safeanes_vitaldb.test.sql --local
supabase db lint --local --level error
```

## Staging preflight

Before a separately authorized rollout, compare the target's four `safeanes_*` tables, column types, constraints, indexes, grants, and policies with this migration using read-only inspection. The current preflight found all four tables and their contract columns already present. It also found unrestricted `Allow write ...` policies and full anon/authenticated grants on those tables; the migration removes those known policies and grants, then grants reads to `anon`/`authenticated` and writes to `service_role`. Existing extra columns and data remain. The signal-window table currently has no case foreign key or end-after-start constraint; preflight found no orphan rows or invalid time bounds, so the migration adds both.

The current production policy snapshot includes five `clinical_review_*` policies for the `vmec_api` role. The checked-in local baseline contains a different set of eight clinical policies. This migration does not modify any `clinical_*` table or policy, and the local pgTAP test checks that local baseline explicitly. Compare the two environments again before rollout; do not assume their clinical policy snapshots are identical.

The migration does not update or delete VitalDB rows. If a rollout fails, keep the additive columns and rows in place and roll the application back to its last working release. For a database rollback, prepare and review a forward migration that removes only the new signal-window constraint/index or restores a previously approved grant/policy state; never restore the currently observed anon/authenticated write grants or unrestricted write policies as a rollback shortcut.

This repository change does not apply a remote migration or run a production ingest. Stop after preflight and obtain a separate rollout authorization before any linked database migration, remote SQL write, or staging ingest.
