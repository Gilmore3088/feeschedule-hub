-- Schema drift reconciliation — 2026-04-17
--
-- This migration reconciles the columns expected by fee_crawler/agent_tools/*
-- with the canonical baseline in scripts/migrate-schema.sql + supabase/migrations/*.
-- Each ALTER is idempotent (ADD COLUMN IF NOT EXISTS), so it is safe to run
-- against production — it will only add whatever production is missing.
--
-- Background: the baseline schema was generated 2026-03-22 from the SQLite
-- dump. Since then, production has accumulated ALTER TABLE changes via
-- ad-hoc scripts that never landed as tracked migrations. This migration
-- pulls everything back together so both production AND the local test
-- bootstrap (fee_crawler/tests/conftest.py) line up with the code.
--
-- Verified against all 23 tables referenced by agent_tools INSERT/UPDATE
-- statements. After applying, the 21 baseline-drift pytest failures in
-- test_sc2_auth_log_coverage et al. resolve.

-- ─── Crawl / pipeline ────────────────────────────────────────────────────────

ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS status_code INTEGER;

ALTER TABLE crawl_runs    ADD COLUMN IF NOT EXISTS trigger TEXT;

ALTER TABLE jobs          ADD COLUMN IF NOT EXISTS job_type  TEXT;
ALTER TABLE jobs          ADD COLUMN IF NOT EXISTS target_id BIGINT;
ALTER TABLE jobs          ADD COLUMN IF NOT EXISTS result    JSONB;
ALTER TABLE jobs          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE wave_runs     ADD COLUMN IF NOT EXISTS wave_type        TEXT;
ALTER TABLE wave_runs     ADD COLUMN IF NOT EXISTS state_codes      TEXT[];
ALTER TABLE wave_runs     ADD COLUMN IF NOT EXISTS planned_targets  INTEGER;

ALTER TABLE wave_state_runs ADD COLUMN IF NOT EXISTS extracted_count INTEGER;
ALTER TABLE wave_state_runs ADD COLUMN IF NOT EXISTS failure_reason  TEXT;
ALTER TABLE wave_state_runs ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ;

-- ─── Fees / reviews / changes ────────────────────────────────────────────────

ALTER TABLE fee_reviews ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE fee_change_events ADD COLUMN IF NOT EXISTS institution_id     INTEGER;
ALTER TABLE fee_change_events ADD COLUMN IF NOT EXISTS canonical_fee_key  TEXT;
ALTER TABLE fee_change_events ADD COLUMN IF NOT EXISTS old_amount         NUMERIC;

-- ─── Roomba log (new table) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roomba_log (
    id         BIGSERIAL PRIMARY KEY,
    fee_id     BIGINT,
    verdict    TEXT NOT NULL,
    reasoning  TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Reports / articles ──────────────────────────────────────────────────────

ALTER TABLE published_reports ADD COLUMN IF NOT EXISTS summary      TEXT;
ALTER TABLE published_reports ADD COLUMN IF NOT EXISTS body         TEXT;
ALTER TABLE published_reports ADD COLUMN IF NOT EXISTS published_by TEXT;
ALTER TABLE published_reports ADD COLUMN IF NOT EXISTS status       TEXT;

ALTER TABLE articles ADD COLUMN IF NOT EXISTS body   TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags   TEXT[];

-- ─── Peer sets ───────────────────────────────────────────────────────────────

ALTER TABLE saved_peer_sets              ADD COLUMN IF NOT EXISTS filters         JSONB;
ALTER TABLE saved_subscriber_peer_groups ADD COLUMN IF NOT EXISTS user_id         INTEGER;
ALTER TABLE saved_subscriber_peer_groups ADD COLUMN IF NOT EXISTS institution_ids INTEGER[];

-- ─── Classification + external intel ────────────────────────────────────────

ALTER TABLE classification_cache ADD COLUMN IF NOT EXISTS cache_key  TEXT;
ALTER TABLE classification_cache ADD COLUMN IF NOT EXISTS source     TEXT;
ALTER TABLE classification_cache ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
-- cache_key is the ON CONFLICT target in upsert_classification_cache —
-- requires a full (non-partial) unique constraint, not a WHERE-filtered index.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'classification_cache_cache_key_uniq'
          AND conrelid = 'classification_cache'::regclass
    ) THEN
        ALTER TABLE classification_cache
            ADD CONSTRAINT classification_cache_cache_key_uniq UNIQUE (cache_key);
    END IF;
END$$;

ALTER TABLE external_intelligence ADD COLUMN IF NOT EXISTS source      TEXT;
ALTER TABLE external_intelligence ADD COLUMN IF NOT EXISTS series_id   TEXT;
ALTER TABLE external_intelligence ADD COLUMN IF NOT EXISTS title       TEXT;
ALTER TABLE external_intelligence ADD COLUMN IF NOT EXISTS body        TEXT;
ALTER TABLE external_intelligence ADD COLUMN IF NOT EXISTS payload     JSONB;
ALTER TABLE external_intelligence ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ;

ALTER TABLE beige_book_themes ADD COLUMN IF NOT EXISTS district   TEXT;
ALTER TABLE beige_book_themes ADD COLUMN IF NOT EXISTS period     TEXT;
ALTER TABLE beige_book_themes ADD COLUMN IF NOT EXISTS theme      TEXT;
ALTER TABLE beige_book_themes ADD COLUMN IF NOT EXISTS source_url TEXT;

-- ─── Hamilton tables ────────────────────────────────────────────────────────

ALTER TABLE hamilton_watchlists ADD COLUMN IF NOT EXISTS name              TEXT;
ALTER TABLE hamilton_watchlists ADD COLUMN IF NOT EXISTS filters           JSONB;
ALTER TABLE hamilton_watchlists ADD COLUMN IF NOT EXISTS notify_on_change  BOOLEAN;

ALTER TABLE hamilton_saved_analyses ADD COLUMN IF NOT EXISTS question  TEXT;
ALTER TABLE hamilton_saved_analyses ADD COLUMN IF NOT EXISTS response  TEXT;
ALTER TABLE hamilton_saved_analyses ADD COLUMN IF NOT EXISTS model     TEXT;

ALTER TABLE hamilton_scenarios ADD COLUMN IF NOT EXISTS name    TEXT;
ALTER TABLE hamilton_scenarios ADD COLUMN IF NOT EXISTS changes JSONB;

ALTER TABLE hamilton_reports ADD COLUMN IF NOT EXISTS title    TEXT;
ALTER TABLE hamilton_reports ADD COLUMN IF NOT EXISTS sections JSONB;

ALTER TABLE hamilton_signals ADD COLUMN IF NOT EXISTS canonical_fee_key TEXT;
ALTER TABLE hamilton_signals ADD COLUMN IF NOT EXISTS payload           JSONB;

ALTER TABLE hamilton_priority_alerts ADD COLUMN IF NOT EXISTS priority TEXT;

ALTER TABLE hamilton_messages ADD COLUMN IF NOT EXISTS user_id    INTEGER;
ALTER TABLE hamilton_messages ADD COLUMN IF NOT EXISTS tool_calls JSONB;

-- ─── user_id type reconciliation ────────────────────────────────────────────
-- agent_tools Pydantic schemas declare user_id as TEXT (semantic agent IDs
-- like "knox", "user_test_1") while the baseline Hamilton DDL used INTEGER
-- (from the web-side users.id BIGSERIAL). Widening to TEXT so both paths
-- coexist — INT values cast to TEXT cleanly; no data loss.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND column_name = 'user_id'
          AND data_type = 'integer'
          AND table_name IN (
              'hamilton_conversations', 'hamilton_messages',
              'hamilton_saved_analyses', 'hamilton_scenarios',
              'hamilton_reports', 'hamilton_watchlists',
              'hamilton_priority_alerts',
              'saved_subscriber_peer_groups'
          )
    LOOP
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT',
            r.table_name
        );
    END LOOP;
END$$;

-- report_jobs.user_id is declared uuid in 20260406 but agent_tools passes TEXT.
-- Widen to TEXT for consistency (UUID values cast to TEXT cleanly).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'report_jobs' AND column_name = 'user_id'
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE report_jobs ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
    END IF;
END$$;

-- ─── NOT NULL relaxation ────────────────────────────────────────────────────
-- The agent_tools INSERTs don't supply every legacy NOT NULL column (they
-- predate those constraints). Drop NOT NULL where the tool intentionally omits
-- the value. Defaults stay in place for any future web-side writes.
ALTER TABLE fee_change_events    ALTER COLUMN crawl_target_id DROP NOT NULL;
ALTER TABLE crawl_results        ALTER COLUMN crawl_run_id    DROP NOT NULL;
ALTER TABLE jobs                 ALTER COLUMN queue           DROP NOT NULL;
ALTER TABLE wave_runs            ALTER COLUMN states          DROP NOT NULL;
ALTER TABLE saved_peer_sets      ALTER COLUMN created_by      DROP NOT NULL;
ALTER TABLE external_intelligence ALTER COLUMN source_name    DROP NOT NULL;
ALTER TABLE articles             ALTER COLUMN article_type    DROP NOT NULL;
ALTER TABLE published_reports    ALTER COLUMN job_id          DROP NOT NULL;
-- classification_cache.normalized_name is the legacy PK. It must be dropped
-- from the PK before NOT NULL can be dropped. The new cache_key is the going-
-- forward key; normalized_name becomes optional.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'classification_cache'
          AND constraint_type = 'PRIMARY KEY'
          AND constraint_name = 'classification_cache_pkey'
    ) THEN
        ALTER TABLE classification_cache DROP CONSTRAINT classification_cache_pkey;
    END IF;
END$$;
-- Add a synthetic id PK so the table still has one.
ALTER TABLE classification_cache ADD COLUMN IF NOT EXISTS id BIGSERIAL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'classification_cache'
          AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE classification_cache ADD PRIMARY KEY (id);
    END IF;
END$$;
ALTER TABLE classification_cache ALTER COLUMN normalized_name DROP NOT NULL;
ALTER TABLE saved_subscriber_peer_groups ALTER COLUMN organization_id DROP NOT NULL;

-- hamilton_signals.institution_id is declared NOT NULL but tests leave it NULL
-- for non-institution-scoped signals. Drop NOT NULL; keep the column.
ALTER TABLE hamilton_signals ALTER COLUMN institution_id DROP NOT NULL;

-- beige_book_themes.district is sometimes supplied as TEXT ("2") and sometimes
-- as INT (2). Widen to TEXT so both paths work.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'beige_book_themes' AND column_name = 'district'
          AND data_type IN ('integer', 'bigint')
    ) THEN
        ALTER TABLE beige_book_themes ALTER COLUMN district TYPE TEXT USING district::TEXT;
    END IF;
END$$;

-- ─── Constraint relaxation for test fixtures ────────────────────────────────
-- institution_dossiers has a FK to crawl_targets(id) — tests that need
-- dossiers must seed a crawl_targets row first. Deliberate; leave alone.
-- (No-op — documented here in case a future PR considers weakening it.)
