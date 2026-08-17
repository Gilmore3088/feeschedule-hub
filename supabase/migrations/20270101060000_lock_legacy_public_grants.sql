-- Lock down legacy public-schema objects that still carried Supabase's default
-- anon/authenticated grants with Row Level Security off (found by the 2026-08-17
-- database access audit). The application never uses the anon key; it connects to
-- Postgres from the server. These objects are retired agent/pipeline plumbing,
-- backups and the migration ledger; none of them are read through PostgREST.
--
-- Effects: REVOKE ALL from PUBLIC/anon/authenticated on 36 tables and
-- 1 view; enable RLS on those tables; revoke EXECUTE on
-- 9 legacy functions; stop future tables in public from inheriting
-- anon/authenticated grants by default. Purely restrictive; no data changes.

BEGIN;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_auth_log_2026_04',
    'agent_auth_log_2026_05',
    'agent_auth_log_2026_06',
    'agent_auth_log_2026_07',
    'agent_auth_log_2026_08',
    'agent_auth_log_2026_09',
    'agent_auth_log_default',
    'agent_budgets',
    'agent_events_2026_04',
    'agent_events_2026_05',
    'agent_events_2026_06',
    'agent_events_2026_07',
    'agent_events_2026_08',
    'agent_events_2026_09',
    'agent_events_default',
    'agent_health_rollup',
    'agent_lessons',
    'agent_messages',
    'agent_registry',
    'backup_institution_sources_names_20260815',
    'backup_published_fee_catalog_20260815',
    'canary_runs',
    'classification_cache',
    'classification_history',
    'external_intelligence',
    'hamilton_digest_runs',
    'hamilton_digest_subscriptions',
    'institution_dossiers',
    'knox_overrides',
    'pipeline_runs',
    'pipeline_steps',
    'schema_migrations',
    'shadow_outputs',
    'wave_runs',
    'wave_state_runs',
    'workers_last_run'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  v TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_agent_reasoning_trace'
  ]
  LOOP
    IF to_regclass(format('public.%I', v)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v);
    END IF;
  END LOOP;
END $$;

-- Sequences owned by the locked tables (identity/serial columns).
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN
    SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM PUBLIC, anon, authenticated', s.sequence_name);
  END LOOP;
END $$;

-- Legacy pipeline functions must not be callable through the public API.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('agent_messages_notify', 'ext_intel_search_vector_update', 'lineage_graph', 'log_classification_change', 'maintain_agent_auth_log_partitions', 'maintain_agent_events_partitions', 'promote_to_tier2', 'promote_to_tier3', 'refresh_agent_health_rollup')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;

-- Future tables/sequences/functions created in public by the migration role no longer
-- inherit anon/authenticated grants; the app grants explicitly when it needs to.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

COMMIT;
