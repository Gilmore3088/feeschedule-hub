-- Drop the legacy `extracted_fees` table and its freeze infrastructure.
--
-- Prereqs (all must be true BEFORE applying this in prod):
--   1. 20260525_extractor_agent_registry.sql applied (agent registered).
--   2. 20260525_fees_verified_dedup.sql applied (Tier-2 dedup index).
--   3. 20260525_fees_verified_compat_columns.sql applied (TS reads working).
--   4. Modal redeployed (3am/4am crons now call extractor agent → fees_raw).
--   5. fee-actions.ts deployed (admin UI writes to fees_verified).
--   6. Any preserved-data import from the legacy DB completed (see
--      scripts/migrate-legacy-fees.py).
--   7. Soak window of operator's choosing has passed.
--
-- This migration is IRREVERSIBLE without restoring from a backup. The
-- DO-block makes it idempotent (re-applying after success is a no-op) but
-- there is no built-in rollback. Pull a Supabase snapshot first.

DO $$
BEGIN
  IF to_regclass('extracted_fees') IS NULL THEN
    RAISE NOTICE 'extracted_fees does not exist; nothing to drop.';
    RETURN;
  END IF;

  -- Drop the freeze trigger + its function. They reference the table.
  EXECUTE 'DROP TRIGGER IF EXISTS extracted_fees_freeze ON extracted_fees';
  EXECUTE 'DROP FUNCTION IF EXISTS _block_extracted_fees_writes() CASCADE';

  -- Drop the table. CASCADE removes the FK from fee_reviews(fee_id), which
  -- becomes a dangling reference — historical fee_reviews rows are
  -- preserved but no longer point at an enforced parent.
  EXECUTE 'DROP TABLE extracted_fees CASCADE';
END $$;

-- Re-create fee_reviews.fee_id as a plain BIGINT (the FK was the only thing
-- removed by CASCADE; the column itself survives the DROP TABLE).
-- Future audit writes target agent_events / agent_auth_log instead.
