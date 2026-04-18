-- Hamilton schema — extracted from src/lib/hamilton/chat-memory.ts and
-- src/lib/hamilton/pro-tables.ts. These tables are defined inside the Next.js
-- app's `ensureHamilton*()` boot hooks and don't live in supabase/migrations/,
-- so the Python test harness needs them copied here to run Hamilton-related
-- integration tests.
--
-- Keep in lockstep with those two source files when columns change.

-- ─── Chat memory (chat-memory.ts) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hamilton_conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    INTEGER NOT NULL,
    title      TEXT,
    metadata   JSONB,  -- added by fee_crawler/agent_tools/tools_hamilton.py, not in chat-memory.ts
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hamilton_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES hamilton_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    token_count     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Hamilton Pro tables (pro-tables.ts) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS hamilton_saved_analyses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         INTEGER NOT NULL,
    institution_id  TEXT NOT NULL,
    title           TEXT NOT NULL,
    analysis_focus  TEXT NOT NULL,
    prompt          TEXT,
    response_json   JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    archived_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hamilton_scenarios (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          INTEGER NOT NULL,
    institution_id   TEXT NOT NULL,
    fee_category     TEXT NOT NULL,
    peer_set_id      TEXT,
    horizon          TEXT,
    current_value    NUMERIC NOT NULL,
    proposed_value   NUMERIC NOT NULL,
    result_json      JSONB NOT NULL,
    confidence_tier  TEXT NOT NULL CHECK (confidence_tier IN ('strong', 'provisional', 'insufficient')),
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    archived_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hamilton_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         INTEGER NOT NULL,
    institution_id  TEXT NOT NULL,
    scenario_id     UUID REFERENCES hamilton_scenarios(id) ON DELETE SET NULL,
    report_type     TEXT NOT NULL,
    report_json     JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'generated',
    exported_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hamilton_watchlists (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          INTEGER NOT NULL,
    institution_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
    fee_categories   JSONB NOT NULL DEFAULT '[]'::jsonb,
    regions          JSONB NOT NULL DEFAULT '[]'::jsonb,
    peer_set_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hamilton_signals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id  TEXT NOT NULL,
    signal_type     TEXT NOT NULL,
    severity        TEXT NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    source_json     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hamilton_priority_alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         INTEGER NOT NULL,
    signal_id       UUID NOT NULL REFERENCES hamilton_signals(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed')),
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
