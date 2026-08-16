SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

ALTER TABLE hamilton_scenarios
  ADD COLUMN IF NOT EXISTS peer_set_id TEXT;

CREATE INDEX IF NOT EXISTS idx_hamilton_scenarios_peer_set
  ON hamilton_scenarios (user_id, peer_set_id)
  WHERE peer_set_id IS NOT NULL;

COMMIT;
