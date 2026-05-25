-- Phase C-02 — scheduled Hamilton digest subscriptions.
--
-- A user (admin or pro) subscribes to a recurring Hamilton digest:
--   - cadence: 'daily' | 'weekly' | 'monthly'
--   - prompt:  the question Hamilton will answer each cycle
--   - active:  pause/resume without deleting the row
--
-- The digest runner (fee_crawler/agents/hamilton/digest.py) processes
-- due subscriptions on each per-minute Modal tick. Output is recorded
-- in hamilton_digest_runs for later retrieval / email send.

CREATE TABLE IF NOT EXISTS hamilton_digest_subscriptions (
    subscription_id     BIGSERIAL PRIMARY KEY,
    user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
    -- Free-form label for the operator: "Weekly OD comparison vs peers"
    label               TEXT NOT NULL,
    -- The Hamilton prompt to run each cycle.
    prompt              TEXT NOT NULL CHECK (length(prompt) > 0),
    -- Cadence: how often to run. Strict allowlist so the scheduler can
    -- compute the next due time without parsing arbitrary cron.
    cadence             TEXT NOT NULL
                        CHECK (cadence IN ('daily', 'weekly', 'monthly')),
    -- Where to deliver: 'email' (when an email channel ships) or 'inbox'
    -- (rendered into hamilton_digest_runs for in-app retrieval).
    delivery            TEXT NOT NULL DEFAULT 'inbox'
                        CHECK (delivery IN ('email', 'inbox')),
    delivery_address    TEXT,  -- email when delivery='email'
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at         TIMESTAMPTZ,
    next_due_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hamilton_digest_subs_due_idx
    ON hamilton_digest_subscriptions (next_due_at)
    WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS hamilton_digest_subs_user_idx
    ON hamilton_digest_subscriptions (user_id);

COMMENT ON TABLE hamilton_digest_subscriptions IS
'C-02: scheduled Hamilton digest subscriptions. Runner: fee_crawler/agents/hamilton/digest.py.';


-- Per-execution record: every digest run lands here for audit + later
-- retrieval. Hamilton's actual response text is stored inline (limited
-- to first 64KB; longer reports get a pointer to R2).
CREATE TABLE IF NOT EXISTS hamilton_digest_runs (
    run_id              BIGSERIAL PRIMARY KEY,
    subscription_id     BIGINT NOT NULL
                        REFERENCES hamilton_digest_subscriptions(subscription_id)
                        ON DELETE CASCADE,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','success','failed')),
    response_text       TEXT,                          -- nullable on pending/failed
    response_r2_key     TEXT,                          -- set when text > 64KB
    cost_cents          INTEGER NOT NULL DEFAULT 0,
    error               TEXT
);

CREATE INDEX IF NOT EXISTS hamilton_digest_runs_sub_idx
    ON hamilton_digest_runs (subscription_id, started_at DESC);
CREATE INDEX IF NOT EXISTS hamilton_digest_runs_status_idx
    ON hamilton_digest_runs (status, started_at DESC)
    WHERE status <> 'success';

COMMENT ON TABLE hamilton_digest_runs IS
'C-02: per-execution record for hamilton_digest_subscriptions. Append-only audit trail.';
