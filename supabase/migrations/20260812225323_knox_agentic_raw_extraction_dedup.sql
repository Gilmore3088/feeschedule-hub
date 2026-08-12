BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS fees_raw_knox_agentic_dedup_idx
  ON fees_raw (
    crawl_event_id,
    lower(fee_name),
    COALESCE(amount, '-1'::numeric)
  )
  WHERE source = 'knox'
    AND crawl_event_id IS NOT NULL;

COMMENT ON INDEX fees_raw_knox_agentic_dedup_idx IS
  'Idempotency guard for Knox agentic extraction from Rosetta text artifacts.';

COMMIT;
