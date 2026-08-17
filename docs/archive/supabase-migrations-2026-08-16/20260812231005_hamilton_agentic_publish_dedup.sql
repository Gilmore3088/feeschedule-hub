BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS fees_published_agentic_live_lineage_dedup_idx
  ON fees_published (lineage_ref)
  WHERE rolled_back_at IS NULL
    AND batch_id LIKE 'agentic-run-%';

COMMENT ON INDEX fees_published_agentic_live_lineage_dedup_idx IS
  'Idempotency guard for Hamilton agentic Tier-3 publishing from fees_verified.';

COMMIT;
