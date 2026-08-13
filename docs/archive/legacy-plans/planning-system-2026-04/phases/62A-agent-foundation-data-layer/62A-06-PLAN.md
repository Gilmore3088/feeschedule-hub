---
phase: 62A
plan: 06
type: execute
wave: 1
depends_on:
  - 62A-03
  - 62A-04
files_modified:
  - supabase/migrations/20260420_backfill_fees_raw.sql
  - supabase/migrations/20260420_freeze_extracted_fees_writes.sql
  - fee_crawler/tests/test_backfill_and_freeze.py
autonomous: true
requirements:
  - TIER-01
must_haves:
  truths:
    - "After backfill migration runs, every non-rejected extracted_fees row has a corresponding fees_raw row"
    - "Rows with NULL document_url get outlier_flags containing 'lineage_missing'"
    - "Rows with non-NULL document_url do NOT have the lineage_missing flag"
    - "After freeze migration runs, INSERT INTO extracted_fees raises 'extracted_fees is frozen'"
    - "Kill-switch `SET app.allow_legacy_writes = 'true'` (session-scope) permits the write"
  artifacts:
    - path: "supabase/migrations/20260420_backfill_fees_raw.sql"
      provides: "One-shot copy: extracted_fees (non-rejected) -> fees_raw with lineage_missing outlier flag on NULL-url rows"
      contains: "INSERT INTO fees_raw"
    - path: "supabase/migrations/20260420_freeze_extracted_fees_writes.sql"
      provides: "BEFORE INSERT/UPDATE/DELETE trigger blocking writes to extracted_fees"
      contains: "CREATE TRIGGER extracted_fees_freeze"
    - path: "fee_crawler/tests/test_backfill_and_freeze.py"
      provides: "Tests seeding extracted_fees + asserting backfill + freeze semantics"
      contains: "lineage_missing"
  key_links:
    - from: "extracted_fees (legacy)"
      to: "fees_raw (TIER-01)"
      via: "INSERT INTO fees_raw SELECT FROM extracted_fees LEFT JOIN crawl_results"
      pattern: "LEFT JOIN crawl_results"
    - from: "extracted_fees trigger"
      to: "current_setting('app.allow_legacy_writes')"
      via: "kill-switch session variable for ops one-offs"
      pattern: "app.allow_legacy_writes"
---

<objective>
Land the one-shot backfill from `extracted_fees` → `fees_raw` (D-04) and the freeze trigger that locks `extracted_fees` against future writes (post-backfill cutover). Flag every row with NULL document_url as `outlier_flags: ['lineage_missing']` so Atlas (Phase 65) can route these institutions to Knox for re-discovery.

Purpose: Without backfill, `fees_raw` starts empty and Hamilton's eventual Tier 3 cutover (Phase 66) has no historical data to serve. Without the freeze trigger, legacy write paths continue to split history across tables.

Output: Two migrations + one test file. Rows surviving the backfill: approximately 18,000 non-rejected extracted_fees rows (current prod) → 18,000 fees_raw rows, ~80% with lineage_missing flag per audit finding.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md
@.planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md
@supabase/migrations/20260418_fees_tier_tables.sql
@.planning/audits/2026-04-16-pipeline-audit/SYNTHESIS.md
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Backfill SQL → fees_raw | Runs as service role during migration; no agent context |
| Freeze trigger → legacy callers | BEFORE trigger blocks every INSERT/UPDATE/DELETE unless session variable set |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-62A06-01 | Tampering | Backfill run twice doubles data in fees_raw | high | mitigate | Migration uses `ON CONFLICT DO NOTHING` on a new `(source, crawl_event_id, fee_name)` unique index; re-running is idempotent. Plan 62A-13 test_backfill_idempotent verifies |
| T-62A06-02 | Elevation of Privilege | Developer sets app.allow_legacy_writes accidentally in production | medium | mitigate | Kill-switch is session-local only; operator must explicitly set. Migration RAISE NOTICE reminds how to use |
| T-62A06-03 | Denial of Service | Backfill on 18K rows takes too long and blocks other migrations | low | accept | 18K rows is <5s on Postgres 15 with indexes already present; documented in migration comment |
| T-62A06-04 | Information Disclosure | Sentinel uuid 0000...000 as agent_event_id leaks "this is migration data" | low | accept | Intentional — Atlas routing logic (Phase 65) uses this sentinel to find backfilled rows needing re-discovery |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Backfill migration — extracted_fees to fees_raw with lineage_missing flag</name>
  <files>supabase/migrations/20260420_backfill_fees_raw.sql</files>
  <read_first>
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §7.6 (backfill SQL code sketch)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md §D-04 (dual-write rejected)
    - supabase/migrations/20260418_fees_tier_tables.sql (fees_raw columns)
  </read_first>
  <action>
Create `supabase/migrations/20260420_backfill_fees_raw.sql`:

```sql
-- Phase 62a — D-04 one-shot backfill: extracted_fees -> fees_raw.
-- Runs AFTER 20260418_fees_tier_tables.sql.
-- Idempotent via ON CONFLICT on the dedup index below; safe to re-run.

-- Dedup index: identifies a backfill row by (source, crawl_event_id, fee_name).
-- crawl_event_id is the legacy crawl_results.id. fee_name is the raw label.
CREATE UNIQUE INDEX IF NOT EXISTS fees_raw_backfill_dedup_idx
    ON fees_raw (source, crawl_event_id, fee_name)
    WHERE source = 'migration_v10';

INSERT INTO fees_raw (
    institution_id, crawl_event_id, source_url, document_r2_key,
    extraction_confidence, agent_event_id,
    fee_name, amount, frequency, conditions,
    outlier_flags, source
)
SELECT
    ef.crawl_target_id,
    ef.crawl_result_id,
    cr.document_url,
    cr.document_path,
    ef.extraction_confidence,
    '00000000-0000-0000-0000-000000000000'::uuid,  -- sentinel pre-v10 event
    ef.fee_name,
    ef.amount,
    ef.frequency,
    ef.conditions,
    CASE
        WHEN cr.document_url IS NULL THEN '["lineage_missing"]'::jsonb
        ELSE '[]'::jsonb
    END,
    'migration_v10'
FROM extracted_fees ef
LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
WHERE ef.review_status IS DISTINCT FROM 'rejected'
ON CONFLICT (source, crawl_event_id, fee_name) WHERE source = 'migration_v10' DO NOTHING;

DO $$
DECLARE
    v_total           BIGINT;
    v_lineage_missing BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_total FROM fees_raw WHERE source = 'migration_v10';
    SELECT COUNT(*) INTO v_lineage_missing
      FROM fees_raw WHERE source = 'migration_v10' AND outlier_flags ? 'lineage_missing';
    RAISE NOTICE 'Backfill complete: % total rows, % flagged lineage_missing',
        v_total, v_lineage_missing;
END $$;
```

Note: if `extracted_fees` or `crawl_results` tables are missing from the test schema (they are in production but test conftest applies supabase/migrations/ only), the migration will fail. In CI/test where legacy tables don't exist, wrap the body:

```sql
DO $$
BEGIN
    IF to_regclass('extracted_fees') IS NULL OR to_regclass('crawl_results') IS NULL THEN
        RAISE NOTICE 'Legacy tables not present (likely CI); skipping backfill.';
        RETURN;
    END IF;
    -- backfill body inlined here via EXECUTE or separated into a function.
END $$;
```

Because the INSERT uses columns that must exist at parse time, we cannot wrap the raw INSERT in `EXECUTE` easily while preserving type-checking. The cleanest path: put the whole backfill body in a PL/pgSQL DO block that uses dynamic `EXECUTE` for the INSERT so parsing tolerates missing tables:

```sql
DO $$
DECLARE
    v_total           BIGINT := 0;
    v_lineage_missing BIGINT := 0;
BEGIN
    IF to_regclass('extracted_fees') IS NULL OR to_regclass('crawl_results') IS NULL THEN
        RAISE NOTICE 'Legacy tables not present; skipping backfill (dev/CI schema).';
        RETURN;
    END IF;

    EXECUTE $sql$
        INSERT INTO fees_raw (
            institution_id, crawl_event_id, source_url, document_r2_key,
            extraction_confidence, agent_event_id,
            fee_name, amount, frequency, conditions,
            outlier_flags, source
        )
        SELECT
            ef.crawl_target_id, ef.crawl_result_id,
            cr.document_url, cr.document_path,
            ef.extraction_confidence,
            '00000000-0000-0000-0000-000000000000'::uuid,
            ef.fee_name, ef.amount, ef.frequency, ef.conditions,
            CASE WHEN cr.document_url IS NULL THEN '["lineage_missing"]'::jsonb ELSE '[]'::jsonb END,
            'migration_v10'
        FROM extracted_fees ef
        LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
        WHERE ef.review_status IS DISTINCT FROM 'rejected'
        ON CONFLICT (source, crawl_event_id, fee_name) WHERE source = 'migration_v10' DO NOTHING
    $sql$;

    SELECT COUNT(*) INTO v_total FROM fees_raw WHERE source = 'migration_v10';
    SELECT COUNT(*) INTO v_lineage_missing
      FROM fees_raw WHERE source = 'migration_v10' AND outlier_flags ? 'lineage_missing';
    RAISE NOTICE 'Backfill complete: % total rows, % flagged lineage_missing', v_total, v_lineage_missing;
END $$;
```

Place the `CREATE UNIQUE INDEX IF NOT EXISTS fees_raw_backfill_dedup_idx ...` at the top of the file BEFORE the DO block. The index creation runs unconditionally (targets fees_raw which always exists after Plan 62A-03).
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && python -c "
import asyncio, asyncpg, os, secrets, pathlib
async def main():
    conn = await asyncpg.connect(os.environ.get('DATABASE_URL_TEST','postgres://postgres:postgres@localhost:5433/bfi_test'), statement_cache_size=0)
    s=f'tmp_{secrets.token_hex(6)}'
    try:
        await conn.execute(f'CREATE SCHEMA \"{s}\"'); await conn.execute(f'SET search_path TO \"{s}\", public')
        for m in sorted(pathlib.Path('supabase/migrations').glob('*.sql')):
            await conn.execute(m.read_text())
        r = await conn.fetchval(\"SELECT indexname FROM pg_indexes WHERE indexname='fees_raw_backfill_dedup_idx'\")
        assert r == 'fees_raw_backfill_dedup_idx', 'dedup index must exist'
        print('OK')
    finally:
        await conn.execute(f'DROP SCHEMA \"{s}\" CASCADE'); await conn.close()
asyncio.run(main())
"</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `supabase/migrations/20260420_backfill_fees_raw.sql`
    - Contains `CREATE UNIQUE INDEX IF NOT EXISTS fees_raw_backfill_dedup_idx`
    - Contains `to_regclass('extracted_fees')` guard (skips cleanly on CI where tables are absent)
    - Contains `'00000000-0000-0000-0000-000000000000'::uuid` sentinel
    - Contains `lineage_missing` outlier flag assignment
    - Migration runs cleanly on a fresh test schema (which has no extracted_fees) via the RAISE NOTICE skip path
    - Applied via `db_schema` fixture doesn't error
  </acceptance_criteria>
  <done>Backfill migration exists; idempotent via dedup index; tolerates CI schemas without legacy tables via to_regclass guard; RAISE NOTICE logs row counts.</done>
</task>

<task type="auto">
  <name>Task 2: Freeze trigger migration on extracted_fees</name>
  <files>supabase/migrations/20260420_freeze_extracted_fees_writes.sql</files>
  <read_first>
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §7.6 (freeze trigger SQL)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md §D-01 (extracted_fees frozen post-cutover)
  </read_first>
  <action>
Create `supabase/migrations/20260420_freeze_extracted_fees_writes.sql`:

```sql
-- Phase 62a — D-01 freeze trigger: extracted_fees is read-only post-backfill.
-- Kill-switch: SET LOCAL app.allow_legacy_writes = 'true'; within a transaction
-- permits a one-off write (ops-hands-on debugging only).
-- Runs AFTER 20260420_backfill_fees_raw.sql.

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

    -- Drop prior trigger if present, then re-create.
    EXECUTE 'DROP TRIGGER IF EXISTS extracted_fees_freeze ON extracted_fees';
    EXECUTE $sql$
        CREATE TRIGGER extracted_fees_freeze
          BEFORE INSERT OR UPDATE OR DELETE ON extracted_fees
          FOR EACH ROW EXECUTE FUNCTION _block_extracted_fees_writes()
    $sql$;

    RAISE NOTICE 'extracted_fees freeze trigger installed.';
END $$;

COMMENT ON FUNCTION _block_extracted_fees_writes() IS
    'Phase 62a D-01: blocks writes to legacy extracted_fees table. Kill-switch via app.allow_legacy_writes session var.';
```
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && python -c "
import asyncio, asyncpg, os, secrets, pathlib
async def main():
    conn = await asyncpg.connect(os.environ.get('DATABASE_URL_TEST','postgres://postgres:postgres@localhost:5433/bfi_test'), statement_cache_size=0)
    s=f'tmp_{secrets.token_hex(6)}'
    try:
        await conn.execute(f'CREATE SCHEMA \"{s}\"'); await conn.execute(f'SET search_path TO \"{s}\", public')
        for m in sorted(pathlib.Path('supabase/migrations').glob('*.sql')):
            await conn.execute(m.read_text())
        # Verify function exists (trigger only present if extracted_fees exists)
        r = await conn.fetchval(\"SELECT 1 FROM pg_proc WHERE proname='_block_extracted_fees_writes'\")
        # Function only gets created when extracted_fees exists; in CI it's skipped. Accept either.
        print('OK (function present)' if r else 'OK (skipped because extracted_fees absent)')
    finally:
        await conn.execute(f'DROP SCHEMA \"{s}\" CASCADE'); await conn.close()
asyncio.run(main())
"</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `supabase/migrations/20260420_freeze_extracted_fees_writes.sql`
    - Contains `to_regclass('extracted_fees')` guard (skips in CI)
    - Contains `CREATE OR REPLACE FUNCTION _block_extracted_fees_writes()`
    - Contains `CREATE TRIGGER extracted_fees_freeze`
    - Contains `app.allow_legacy_writes` kill-switch check
    - Trigger fires BEFORE INSERT OR UPDATE OR DELETE
    - Migration applies cleanly against db_schema fixture (RAISE NOTICE on skip)
  </acceptance_criteria>
  <done>Freeze trigger migration exists; function + trigger created when extracted_fees is present; kill-switch session var allows one-off writes; CI skips cleanly.</done>
</task>

<task type="auto">
  <name>Task 3: Integration tests for backfill + freeze</name>
  <files>fee_crawler/tests/test_backfill_and_freeze.py</files>
  <read_first>
    - supabase/migrations/20260420_backfill_fees_raw.sql
    - supabase/migrations/20260420_freeze_extracted_fees_writes.sql
    - fee_crawler/tests/conftest.py (db_schema fixture)
  </read_first>
  <action>
Create `fee_crawler/tests/test_backfill_and_freeze.py`:

```python
"""Tests for Phase 62a backfill + freeze trigger.

These tests seed a minimal extracted_fees + crawl_results + crawl_targets surface
inside the per-test schema, then run the backfill DO block manually (bypassing
the to_regclass guard by creating the tables).
"""

from __future__ import annotations

import pytest


CREATE_LEGACY_SURFACE = """
CREATE TABLE IF NOT EXISTS crawl_targets (
    id SERIAL PRIMARY KEY,
    institution_name TEXT
);
CREATE TABLE IF NOT EXISTS crawl_results (
    id SERIAL PRIMARY KEY,
    crawl_target_id INTEGER REFERENCES crawl_targets(id),
    document_url TEXT,
    document_path TEXT
);
CREATE TABLE IF NOT EXISTS extracted_fees (
    id SERIAL PRIMARY KEY,
    crawl_target_id INTEGER,
    crawl_result_id INTEGER,
    fee_name TEXT NOT NULL,
    amount NUMERIC(12,2),
    frequency TEXT,
    conditions TEXT,
    extraction_confidence NUMERIC(5,4),
    review_status TEXT DEFAULT 'pending'
);
"""


@pytest.mark.asyncio
async def test_backfill_flags_lineage_missing(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(CREATE_LEGACY_SURFACE)
        await conn.execute(
            "INSERT INTO crawl_targets (institution_name) VALUES ('A'), ('B')"
        )
        await conn.execute(
            "INSERT INTO crawl_results (crawl_target_id, document_url, document_path) "
            "VALUES (1, 'https://a.example/fees.pdf', 's3://bucket/a.pdf'), "
            "       (2, NULL, NULL)"
        )
        await conn.execute(
            "INSERT INTO extracted_fees (crawl_target_id, crawl_result_id, fee_name, amount) "
            "VALUES (1, 1, 'wire_domestic', 25.00), "
            "       (2, 2, 'overdraft', 35.00)"
        )
        # Re-run the backfill body manually (migration already applied; this is a re-invocation).
        import pathlib
        backfill_sql = pathlib.Path("supabase/migrations/20260420_backfill_fees_raw.sql").read_text()
        await conn.execute(backfill_sql)

        rows = await conn.fetch(
            "SELECT fee_name, outlier_flags FROM fees_raw "
            "WHERE source = 'migration_v10' ORDER BY fee_name"
        )
    by_name = {r["fee_name"]: r["outlier_flags"] for r in rows}
    assert "overdraft" in by_name and "wire_domestic" in by_name
    # Postgres JSONB decoder gives a python list (we registered the codec in pool.py;
    # conftest uses raw connect which may not register — tolerate both list and string).
    overdraft_flags = by_name["overdraft"]
    wire_flags = by_name["wire_domestic"]
    assert "lineage_missing" in str(overdraft_flags), f"overdraft should be flagged: {overdraft_flags}"
    assert "lineage_missing" not in str(wire_flags), f"wire_domestic should NOT be flagged: {wire_flags}"


@pytest.mark.asyncio
async def test_freeze_blocks_extracted_fees_writes(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(CREATE_LEGACY_SURFACE)
        # Re-apply the freeze migration now that extracted_fees exists.
        import pathlib
        freeze_sql = pathlib.Path("supabase/migrations/20260420_freeze_extracted_fees_writes.sql").read_text()
        await conn.execute(freeze_sql)

        with pytest.raises(Exception) as exc:
            await conn.execute(
                "INSERT INTO extracted_fees (crawl_target_id, fee_name) VALUES (1, 'x')"
            )
        assert "frozen" in str(exc.value).lower()


@pytest.mark.asyncio
async def test_freeze_kill_switch_permits_write(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(CREATE_LEGACY_SURFACE)
        import pathlib
        freeze_sql = pathlib.Path("supabase/migrations/20260420_freeze_extracted_fees_writes.sql").read_text()
        await conn.execute(freeze_sql)

        async with conn.transaction():
            await conn.execute("SET LOCAL app.allow_legacy_writes = 'true'")
            await conn.execute(
                "INSERT INTO extracted_fees (crawl_target_id, fee_name) VALUES (1, 'x')"
            )
        # After the transaction ends, the SET LOCAL is gone; writes blocked again.
        with pytest.raises(Exception):
            await conn.execute(
                "INSERT INTO extracted_fees (crawl_target_id, fee_name) VALUES (1, 'y')"
            )


@pytest.mark.asyncio
async def test_backfill_idempotent(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute(CREATE_LEGACY_SURFACE)
        await conn.execute(
            "INSERT INTO crawl_targets (institution_name) VALUES ('A')"
        )
        await conn.execute(
            "INSERT INTO crawl_results (crawl_target_id, document_url) VALUES (1, 'x')"
        )
        await conn.execute(
            "INSERT INTO extracted_fees (crawl_target_id, crawl_result_id, fee_name) "
            "VALUES (1, 1, 'wire')"
        )
        import pathlib
        backfill_sql = pathlib.Path("supabase/migrations/20260420_backfill_fees_raw.sql").read_text()
        # Run twice.
        await conn.execute(backfill_sql)
        count1 = await conn.fetchval("SELECT COUNT(*) FROM fees_raw WHERE source='migration_v10'")
        await conn.execute(backfill_sql)
        count2 = await conn.fetchval("SELECT COUNT(*) FROM fees_raw WHERE source='migration_v10'")
        assert count1 == count2 == 1, f"backfill not idempotent: {count1} -> {count2}"
```
  </action>
  <verify>
    <automated>export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && pytest fee_crawler/tests/test_backfill_and_freeze.py -v --no-header</automated>
  </verify>
  <acceptance_criteria>
    - File exists and parses
    - 4 test functions: test_backfill_flags_lineage_missing, test_freeze_blocks_extracted_fees_writes, test_freeze_kill_switch_permits_write, test_backfill_idempotent
    - All 4 tests PASS against db_schema fixture
  </acceptance_criteria>
  <done>Backfill + freeze behaviors verified end-to-end via integration tests against a real Postgres schema.</done>
</task>

</tasks>

<verification>
`pytest fee_crawler/tests/test_backfill_and_freeze.py -v` passes all 4 tests. The backfill is idempotent, lineage_missing flag correctly assigned, freeze blocks writes except with the session kill-switch.
</verification>

<success_criteria>
- Backfill migration lands and is idempotent via dedup index
- Freeze trigger blocks INSERT/UPDATE/DELETE on extracted_fees
- Kill-switch (SET LOCAL app.allow_legacy_writes='true') permits one-off writes
- CI migrations apply cleanly when legacy tables are absent (to_regclass guard)
- Integration test coverage for all four behaviors
</success_criteria>

<output>
After completion, create `.planning/phases/62A-agent-foundation-data-layer/62A-06-SUMMARY.md` noting:
- Backfill + freeze migrations landed
- Lineage_missing flagging implemented per D-04
- TIER-01 best-effort lineage backfill complete
- Kill-switch documented for ops one-offs
</output>
