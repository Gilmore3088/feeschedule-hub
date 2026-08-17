BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS fees_verified_darwin_agentic_dedup_idx
  ON fees_verified (fee_raw_id)
  WHERE outlier_flags ? 'agentic_darwin_verified';

COMMENT ON INDEX fees_verified_darwin_agentic_dedup_idx IS
  'Idempotency guard for deterministic Darwin verification of Knox agentic raw rows.';

COMMIT;
