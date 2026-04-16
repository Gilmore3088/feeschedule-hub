-- Phase 62a — D-01 freeze trigger: extracted_fees is read-only post-backfill.
-- Runs AFTER 20260420_backfill_fees_raw.sql (lexicographic order guarantees it).
--
-- Kill-switch: `SET LOCAL app.allow_legacy_writes = 'true';` inside a
-- transaction permits a one-off write (ops-hands-on debugging only).
-- Because SET LOCAL scope ends with the transaction, the kill-switch is
-- session-bounded and cannot leak across requests.
--
-- Safety:
--   * Wrapped in DO block with a to_regclass guard so CI schemas without
--     extracted_fees apply cleanly.
--   * Uses CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS so re-running
--     the migration is idempotent.

DO $$
BEGIN
    IF to_regclass('extracted_fees') IS NULL THEN
        RAISE NOTICE 'extracted_fees does not exist (likely CI); skipping freeze trigger.';
        RETURN;
    END IF;

    EXECUTE $sql$
        CREATE OR REPLACE FUNCTION _block_extracted_fees_writes() RETURNS TRIGGER
        LANGUAGE plpgsql AS $fn$
        BEGIN
            IF current_setting('app.allow_legacy_writes', true) = 'true' THEN
                RETURN COALESCE(NEW, OLD);
            END IF;
            RAISE EXCEPTION 'extracted_fees is frozen post-v10.0. Writes go to fees_raw via agent gateway. Kill-switch: SET LOCAL app.allow_legacy_writes = ''true''. See .planning/phases/62A-agent-foundation-data-layer/';
        END;
        $fn$
    $sql$;

    -- Drop prior trigger if present, then re-create idempotently.
    EXECUTE 'DROP TRIGGER IF EXISTS extracted_fees_freeze ON extracted_fees';
    EXECUTE $sql$
        CREATE TRIGGER extracted_fees_freeze
          BEFORE INSERT OR UPDATE OR DELETE ON extracted_fees
          FOR EACH ROW EXECUTE FUNCTION _block_extracted_fees_writes()
    $sql$;

    RAISE NOTICE 'extracted_fees freeze trigger installed.';
END $$;

-- Attach the comment only if the function was created above.
DO $$
BEGIN
    IF to_regprocedure('_block_extracted_fees_writes()') IS NOT NULL THEN
        EXECUTE $sql$
            COMMENT ON FUNCTION _block_extracted_fees_writes() IS
                'Phase 62a D-01: blocks writes to legacy extracted_fees table. Kill-switch via app.allow_legacy_writes session var.'
        $sql$;
    END IF;
END $$;
