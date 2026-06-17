-- Purge demo-seed rows from the database.
--
-- Context: the `seed-demo` CLI tool (fee_crawler/commands/seed_demo.py) was
-- REMOVED because its synthetic rows used a real `source` value
-- ('migration_v10') and were not filtered by any read path, so they leaked
-- into the PUBLIC /api/v1 index and faked the Command Center "Pipeline live"
-- banner. This script removes any demo rows already written to a database.
--
-- It deletes only rows carrying a distinguishable demo marker:
--   * sentinel event id 11111111-1111-1111-1111-111111111111
--   * outlier_flags @> ["demo"]
--   * source_url under https://demo.example.com/
--   * crawl_targets.source = 'demo_seed' (cert_number LIKE 'DEMO%')
--   * workers_last_run.status = 'demo'
--   * agent_events.tool_name = '_demo_seed'
--   * agent_lessons.description LIKE '%demo_seed%'
-- It does NOT delete by source='migration_v10' alone (that value is shared
-- with real backfill rows).
--
-- Review, then run against the target DB:
--   psql "$DATABASE_URL" -f scripts/purge-demo-rows.sql
-- (or adapt one of scripts/apply-*.mjs, which use the postgres client).

\set demo_sentinel '11111111-1111-1111-1111-111111111111'

BEGIN;

-- 1. Fee tiers (children first: published -> verified -> raw).
DELETE FROM fees_published
 WHERE published_by_adversarial_event_id = :'demo_sentinel'::uuid
    OR source_url LIKE 'https://demo.example.com/%'
    OR institution_id IN (SELECT id FROM crawl_targets WHERE source = 'demo_seed');

DELETE FROM fees_verified
 WHERE verified_by_agent_event_id = :'demo_sentinel'::uuid
    OR outlier_flags @> '["demo"]'::jsonb
    OR source_url LIKE 'https://demo.example.com/%'
    OR institution_id IN (SELECT id FROM crawl_targets WHERE source = 'demo_seed');

DELETE FROM fees_raw
 WHERE agent_event_id = :'demo_sentinel'::uuid
    OR outlier_flags @> '["demo"]'::jsonb
    OR source_url LIKE 'https://demo.example.com/%'
    OR institution_id IN (SELECT id FROM crawl_targets WHERE source = 'demo_seed');

-- 2. Agent infra / fake liveness markers.
DELETE FROM agent_lessons    WHERE description LIKE '%demo_seed%';
DELETE FROM agent_events     WHERE tool_name = '_demo_seed';
DELETE FROM workers_last_run WHERE status = 'demo';

-- 3. agent_budgets: seed-demo OVERWROTE spent_cents in place (no marker, so it
--    cannot be "deleted"). Reset the per_day spend for the seeded agents; this
--    is a safe operational reset — the rollover logic re-accumulates real spend.
UPDATE agent_budgets
   SET spent_cents = 0, window_started_at = NOW()
 WHERE budget_window = 'per_day'
   AND agent_name IN ('extractor','magellan','darwin','hamilton','discoverer','atlas','knox');

-- 4. Demo institutions (parents last, after their fees are gone).
DELETE FROM crawl_targets WHERE source = 'demo_seed';

-- 5. crawl_runs: the seeder wrote unmarked 'scheduled'/'completed' rows
--    (targets_total=50, targets_crawled=50, targets_succeeded=48). These are
--    indistinguishable from genuine scheduled runs, so they are NOT deleted
--    automatically. Inspect candidates and delete manually if confirmed demo:
--
--    SELECT * FROM crawl_runs
--     WHERE trigger_type='scheduled' AND status='completed'
--       AND targets_total=50 AND targets_crawled=50 AND targets_succeeded=48
--     ORDER BY completed_at DESC;

COMMIT;
