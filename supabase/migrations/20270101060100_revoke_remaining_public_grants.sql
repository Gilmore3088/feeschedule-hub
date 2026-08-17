-- Defense in depth after the 2026-08-17 access audit: the remaining 36 public
-- tables that still carried anon/authenticated grants are all protected by RLS with
-- no policies (they expose zero rows), but the grants themselves are unnecessary —
-- the application connects as postgres and never uses the anon key. Revoke them so
-- no table depends on RLS alone. Purely restrictive; no data changes.

BEGIN;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_auth_log',
    'agent_events',
    'alert_preferences',
    'api_keys',
    'articles',
    'beige_book_themes',
    'census_tracts',
    'coverage_snapshots',
    'demographics',
    'fed_beige_book',
    'fed_content',
    'fed_economic_indicators',
    'fee_index_cache',
    'fee_reviews',
    'historical_fee_observation_archive',
    'jobs',
    'leads',
    'market_concentration',
    'org_members',
    'organizations',
    'platform_registry',
    'published_reports',
    'reg_articles',
    'report_jobs',
    'research_articles',
    'research_conversations',
    'research_messages',
    'research_usage',
    'roomba_log',
    'saved_peer_sets',
    'saved_subscriber_peer_groups',
    'sessions',
    'stripe_events',
    'subscriptions',
    'usage_events',
    'users'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
