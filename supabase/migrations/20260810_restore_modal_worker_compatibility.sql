-- Restore schema objects referenced by deployed Modal workers but omitted from
-- this branch's active migration chain. All statements are additive so the
-- migration is safe whether production has none, some, or all of the objects.

ALTER TABLE agent_messages
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS agent_messages_darwin_pending_idx
  ON agent_messages (recipient_agent, created_at)
  WHERE responded_at IS NULL;

CREATE TABLE IF NOT EXISTS hamilton_digest_subscriptions (
  subscription_id  BIGSERIAL PRIMARY KEY,
  user_id          BIGINT REFERENCES users(id) ON DELETE CASCADE,
  label            TEXT NOT NULL,
  prompt           TEXT NOT NULL CHECK (length(prompt) > 0),
  cadence          TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly')),
  delivery         TEXT NOT NULL DEFAULT 'inbox'
                   CHECK (delivery IN ('email', 'inbox')),
  delivery_address TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at      TIMESTAMPTZ,
  next_due_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hamilton_digest_subs_due_idx
  ON hamilton_digest_subscriptions (next_due_at)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS hamilton_digest_subs_user_idx
  ON hamilton_digest_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS hamilton_digest_runs (
  run_id          BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL
                  REFERENCES hamilton_digest_subscriptions(subscription_id)
                  ON DELETE CASCADE,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'success', 'failed')),
  response_text   TEXT,
  response_r2_key TEXT,
  cost_cents      INTEGER NOT NULL DEFAULT 0,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS hamilton_digest_runs_sub_idx
  ON hamilton_digest_runs (subscription_id, started_at DESC);

CREATE INDEX IF NOT EXISTS hamilton_digest_runs_status_idx
  ON hamilton_digest_runs (status, started_at DESC)
  WHERE status <> 'success';
