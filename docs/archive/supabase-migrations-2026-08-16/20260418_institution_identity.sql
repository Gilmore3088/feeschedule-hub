-- 20260418_institution_identity.sql
--
-- Adds unified identity columns to crawl_targets so every federal dataset
-- can join through the correct external key. Internal canonical key
-- (crawl_targets.id) remains the single join point for all in-app tables
-- (fees_raw, fees_verified, fees_published, institution_financials, etc).
--
-- External keys added:
--   rssd_id         — Fed Reserve unique institution ID (FFIEC CDR, NIC)
--   ncua_charter_id — split out of overloaded cert_number for credit unions
--   routing_number  — ABA (FedACH, payment networks)
--   lei             — Legal Entity Identifier (GLEIF, HMDA, international)
--
-- cert_number remains dual-purpose (FDIC CERT + legacy NCUA charter) during
-- transition. Deprecate the NCUA overloading in a follow-up migration once
-- ncua_charter_id backfill is verified against source='ncua' rows.

BEGIN;

ALTER TABLE crawl_targets
  ADD COLUMN IF NOT EXISTS rssd_id          TEXT,
  ADD COLUMN IF NOT EXISTS ncua_charter_id  TEXT,
  ADD COLUMN IF NOT EXISTS routing_number   TEXT,
  ADD COLUMN IF NOT EXISTS lei              TEXT;

-- Backfill ncua_charter_id from existing overloaded cert_number for CUs.
-- Safe to re-run; only touches rows where the new column is still NULL.
UPDATE crawl_targets
   SET ncua_charter_id = cert_number
 WHERE source = 'ncua'
   AND ncua_charter_id IS NULL
   AND cert_number IS NOT NULL;

-- Unique-when-present indexes. rssd_id and routing_number must be globally
-- unique across all institutions; lei may repeat for subsidiaries so is
-- indexed non-unique; ncua_charter_id is unique within source='ncua'.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_targets_rssd
  ON crawl_targets(rssd_id)
  WHERE rssd_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_targets_routing
  ON crawl_targets(routing_number)
  WHERE routing_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crawl_targets_lei
  ON crawl_targets(lei)
  WHERE lei IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crawl_targets_ncua
  ON crawl_targets(ncua_charter_id)
  WHERE ncua_charter_id IS NOT NULL;

COMMIT;
