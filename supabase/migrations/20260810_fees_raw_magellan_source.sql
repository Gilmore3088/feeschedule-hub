-- Magellan owns discovery and collection in the canonical agent registry.
-- Preserve legacy Knox rows while making new Tier-1 extraction provenance honest.
ALTER TABLE fees_raw
    DROP CONSTRAINT IF EXISTS fees_raw_source_check;

ALTER TABLE fees_raw
    ADD CONSTRAINT fees_raw_source_check
    CHECK (source IN ('magellan', 'knox', 'migration_v10', 'manual_import'));

COMMENT ON COLUMN fees_raw.source IS
    'Collection provenance: Magellan for current extraction, Knox for legacy state-agent rows, migration_v10, or manual_import.';
