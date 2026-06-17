-- Phase 62a follow-up — Tier-2 deduplication guard.
--
-- Issue (audit 2026-05-24): fees_verified has no UNIQUE constraint on
-- (institution_id, canonical_fee_key, amount, frequency). If two Darwin
-- verification events promote the same fees_raw row, or if the same fee is
-- re-extracted and re-verified, duplicates accumulate silently. This inflates
-- peer benchmarking medians and can double-count toward published indices.
--
-- Strategy:
--   1. Detect existing duplicates BEFORE creating the constraint — fail loudly
--      if found so an operator can decide cleanup policy (this is NOT data
--      destruction; the migration aborts safely).
--   2. Add a partial UNIQUE index that excludes 'rejected' rows (rejected
--      duplicates are fine; active duplicates are not).
--   3. Use NULLS NOT DISTINCT (Postgres 15+) so a NULL amount counts as a
--      collision, matching the business invariant: "one verified fee per
--      (institution, canonical name, amount, frequency)."
--
-- After this migration, the Darwin promotion path MUST use
-- INSERT ... ON CONFLICT (institution_id, canonical_fee_key, amount, frequency)
-- DO UPDATE SET extraction_confidence = EXCLUDED.extraction_confidence,
--               verified_by_agent_event_id = EXCLUDED.verified_by_agent_event_id,
--               ...
-- rather than naive INSERT. See fee_crawler/agents/darwin/promote.py (or
-- equivalent) for the call site to update.

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO dup_count
    FROM (
      SELECT institution_id, canonical_fee_key, amount, frequency
        FROM fees_verified
        WHERE review_status <> 'rejected'
        GROUP BY institution_id, canonical_fee_key, amount, frequency
        HAVING COUNT(*) > 1
    ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Cannot create unique index: % duplicate group(s) exist in fees_verified. '
      'Resolve duplicates first (mark older rows as rejected), then re-run. '
      'Diagnostic: SELECT institution_id, canonical_fee_key, amount, frequency, '
      'COUNT(*), array_agg(fee_verified_id ORDER BY created_at) FROM fees_verified '
      'WHERE review_status <> ''rejected'' GROUP BY 1,2,3,4 HAVING COUNT(*) > 1;',
      dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fees_verified_dedup_idx
  ON fees_verified (institution_id, canonical_fee_key, amount, frequency)
  NULLS NOT DISTINCT
  WHERE review_status <> 'rejected';

COMMENT ON INDEX fees_verified_dedup_idx IS
  'Phase 62a dedup guard: one active (non-rejected) verified fee per '
  '(institution, canonical name, amount, frequency). Darwin promotion path '
  'must use ON CONFLICT DO UPDATE.';
