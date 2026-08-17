-- 20260418_schema_migrations_tracking.sql
--
-- Reliability Roadmap #9 — eliminate schema drift risk.
--
-- Every migration under supabase/migrations/ now records itself in
-- schema_migrations on successful apply. An admin can then query which files
-- are applied vs pending without guessing from file dates.
--
-- Usage: scripts/apply-migration.mjs <filename> reads/writes this table.
-- Back-population of historical migrations is done separately by anyone who
-- can prove-out each file was already run against the DB.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by  TEXT,
    checksum    TEXT
);

COMMENT ON TABLE schema_migrations IS
'Reliability Roadmap #9: records every supabase/migrations/*.sql file applied to this database. Written by scripts/apply-migration.mjs on successful apply.';

COMMIT;
