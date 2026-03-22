# Phase 1 — Database Migration

> **Duration:** Weeks 1–2 (~15 hours)  
> **Goal:** Supabase Postgres is the live database. SQLite is read-only backup. Fly.io is still running — do not touch it yet.  
> **Risk:** See [R1](./02-risk-register.md#r1), [R3](./02-risk-register.md#r3)

---

## 1A — Create Postgres Schema

Run the schema script from [09-appendix.md](./09-appendix.md#schema-migration-script) against Supabase.

Key differences from SQLite schema:
- `TEXT` dates → `TIMESTAMPTZ`
- `INTEGER` booleans → `BOOLEAN`
- `TEXT` JSON columns → `JSONB`
- `AUTOINCREMENT` → `BIGSERIAL`
- Add `jobs` table (new — job queue primitive)
- Add `platform_registry` table (new — drives discovery routing)
- Add `document_r2_key` column to `crawl_targets` (new — R2 storage reference)

### New Tables (not in SQLite)

**`jobs` — the core job queue**
```sql
CREATE TABLE jobs (
    id           BIGSERIAL PRIMARY KEY,
    queue        TEXT        NOT NULL,  -- 'discovery' | 'extract' | 'llm_batch'
    entity_id    TEXT        NOT NULL,  -- institution id
    payload      JSONB,
    status       TEXT        NOT NULL DEFAULT 'pending',
    priority     INT         NOT NULL DEFAULT 0,  -- asset_size / 1M (bigger = higher)
    attempts     INT         NOT NULL DEFAULT 0,
    max_attempts INT         NOT NULL DEFAULT 3,
    run_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by    TEXT,                  -- worker_id that claimed this job
    locked_at    TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_queue_pending
    ON jobs (queue, priority DESC, id ASC)
    WHERE status = 'pending';
```

**`platform_registry` — CMS routing intelligence**
```sql
CREATE TABLE platform_registry (
    platform          TEXT    PRIMARY KEY,
    fee_paths         TEXT[], -- ordered by historical hit rate
    extraction_method TEXT    NOT NULL DEFAULT 'llm',  -- 'rule' | 'llm' | 'skip'
    rule_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    validated_count   INT     NOT NULL DEFAULT 0,
    success_rate      FLOAT,
    institution_count INT,
    last_updated      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO platform_registry (platform, fee_paths) VALUES
    ('banno',     ARRAY['/resources/fee-schedule', '/fee-schedule', '/personal/fee-schedule']),
    ('q2',        ARRAY['/fee-schedule', '/disclosures/fee-schedule', '/personal-banking/fees']),
    ('drupal',    ARRAY['/sites/default/files/fee-schedule.pdf', '/sites/default/files/fees.pdf']),
    ('wordpress', ARRAY['/wp-content/uploads/fee-schedule.pdf', '/wp-content/uploads/fees.pdf']),
    ('fiserv',    ARRAY['/fee-schedule', '/personal/fees', '/disclosures']),
    ('fis',       ARRAY['/digitalbanking/fees', '/personal-banking/fees']),
    ('ncr',       ARRAY['/d3banking/fees', '/ncr/fee-schedule']);
```

### Tasks
- [ ] Run full schema migration against Supabase (test project first, then production)
- [ ] Verify all tables created: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
- [ ] Seed `platform_registry` with the 7 known platforms
- [ ] Run `EXPLAIN ANALYZE` on the top 5 most common queries to verify index coverage

---

## 1B — Migrate Data: SQLite → Postgres

Use the migration script in [09-appendix.md](./09-appendix.md#data-migration-script).

The script:
1. Reads all rows from SQLite using `sqlite3`
2. Writes to Postgres using `asyncpg` with explicit column mapping
3. Converts TEXT dates to TIMESTAMPTZ, TEXT JSON to JSONB, INTEGER booleans to BOOLEAN
4. Preserves all IDs (does not re-sequence)

### Migration Order (respects FK constraints)
1. `users`
2. `crawl_targets`
3. `crawl_runs`
4. `crawl_results`
5. `extracted_fees`
6. `fee_reviews`
7. `institution_financials`
8. `institution_complaints`
9. `analysis_results`
10. `fee_snapshots`
11. `fee_change_events`
12. `discovery_cache`
13. All remaining tables (no FK deps)

### Validation Queries
Run after migration. All must return 0 or match SQLite counts:

```sql
-- Row counts must match SQLite
SELECT 'crawl_targets'   , COUNT(*) FROM crawl_targets
UNION ALL SELECT 'extracted_fees'   , COUNT(*) FROM extracted_fees
UNION ALL SELECT 'crawl_results'    , COUNT(*) FROM crawl_results
UNION ALL SELECT 'users'            , COUNT(*) FROM users
UNION ALL SELECT 'leads'            , COUNT(*) FROM leads;

-- FK integrity: orphaned extracted_fees
SELECT COUNT(*) FROM extracted_fees ef
WHERE NOT EXISTS (SELECT 1 FROM crawl_targets ct WHERE ct.id = ef.crawl_target_id);
-- Must return 0

-- FK integrity: orphaned crawl_results
SELECT COUNT(*) FROM crawl_results cr
WHERE NOT EXISTS (SELECT 1 FROM crawl_runs run WHERE run.id = cr.crawl_run_id);
-- Must return 0
```

### Tasks
- [ ] Run migration script against **test** Supabase project. Validate.
- [ ] Run migration script against **production** Supabase project. Validate.
- [ ] All row counts match SQLite exactly
- [ ] FK integrity checks pass (0 orphaned rows)
- [ ] Set SQLite to read-only: `chmod 444 /data/crawler.db` on Fly.io instance
- [ ] Commit `docs/migration-validation-YYYY-MM-DD.md` with the output of validation queries

---

## 1C — Next.js: Replace DB Connection Layer

This is the heaviest task. 21 files, 190 call sites. All synchronous DB calls become async.

### Step 1: Replace `connection.ts`

```typescript
// src/lib/crawler-db/connection.ts — NEW VERSION

import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;

// Singleton for server components and API routes
let _sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!_sql) {
    _sql = postgres(connectionString, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
  }
  return _sql;
}

// Convenience: export sql directly for tagged template queries
export const sql = getSql();
```

### Step 2: Convert each module in `src/lib/crawler-db/`

Work file by file. Each file follows this pattern:

```typescript
// BEFORE (better-sqlite3, sync):
export function getStats() {
  const db = getDb();
  return db.prepare(`
    SELECT COUNT(*) as total FROM crawl_targets
  `).get() as { total: number };
}

// AFTER (postgres.js, async):
export async function getStats() {
  const result = await sql`
    SELECT COUNT(*) as total FROM crawl_targets
  `;
  return result[0] as { total: number };
}
```

### Files to convert (in order of dependency)

| File | Lines | Estimated time |
|---|---|---|
| `connection.ts` | 45 | 30 min (done above) |
| `core.ts` | ~200 | 1 hr |
| `fees.ts` | ~150 | 1 hr |
| `peers.ts` | ~120 | 45 min |
| `geographic.ts` | ~100 | 45 min |
| `dashboard.ts` | ~80 | 30 min |
| `pipeline.ts` | ~80 | 30 min |
| `search.ts` | ~60 | 20 min |
| `financial.ts` | ~60 | 20 min |
| `fee-index.ts` | ~80 | 30 min |
| `market.ts` | ~60 | 20 min |
| `quality.ts` | ~60 | 20 min |
| `hygiene.ts` | ~40 | 15 min |
| `ops.ts` | ~60 | 20 min |
| `articles.ts` | ~40 | 15 min |
| `fed.ts` | ~40 | 15 min |
| `fee-revenue.ts` | ~60 | 20 min |
| `saved-peers.ts` | ~80 | 30 min |
| `index.ts` | ~20 | 10 min |
| All server `actions.ts` files (14) | ~30 each | 2 hr total |
| `auth.ts` | ~150 | 1 hr |

**Total estimate: ~12–15 hours of focused conversion work**

### Step 3: Update `package.json`

```json
// Add:
"postgres": "^3.4.4"

// Remove:
"better-sqlite3": "^12.6.2"

// Remove from devDependencies:
"@types/better-sqlite3": "^7.6.13"
```

### Step 4: Run `npm run build`
After each file conversion. Fix TypeScript errors as you go. Do not batch up errors.

### Tasks
- [ ] Replace `connection.ts`
- [ ] Convert all 21 `crawler-db/*.ts` modules to async
- [ ] Update all 14 server actions to use `await`
- [ ] Update `auth.ts` to use async DB calls
- [ ] Remove `better-sqlite3` from `package.json`
- [ ] Add `postgres` to `package.json`
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] `npm run lint` passes

---

## 1D — Python Pipeline: Add Postgres Support

### Update `fee_crawler/db.py`

Add Postgres connection mode alongside SQLite. Use `DATABASE_URL` env var to switch:

```python
import os
import asyncpg

class Database:
    def __init__(self, config):
        self.db_url = os.environ.get('DATABASE_URL')
        self.sqlite_path = config.database.path
        self._mode = 'postgres' if self.db_url else 'sqlite'
        # existing SQLite init stays unchanged for local dev

    async def _pg_fetchall(self, query: str, *args):
        async with asyncpg.connect(self.db_url) as conn:
            return await conn.fetch(query, *args)
```

### Fix SQLite-specific SQL syntax

Search for these patterns and update for Postgres compatibility:

| SQLite | Postgres |
|---|---|
| `datetime('now')` | `NOW()` |
| `datetime('now', '-7 days')` | `NOW() - INTERVAL '7 days'` |
| `strftime('%Y-%m-%d', col)` | `DATE(col)` |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| `INSERT OR REPLACE` | `INSERT ... ON CONFLICT DO UPDATE SET` |
| `AUTOINCREMENT` | `BIGSERIAL` (in schema only) |
| `INTEGER NOT NULL DEFAULT 0` (boolean) | `BOOLEAN NOT NULL DEFAULT FALSE` |

### Update `requirements.txt`

```
asyncpg>=0.29
httpx>=0.27       # for Phase 3 async discovery
boto3>=1.34       # for R2 document store
modal>=0.62       # for Phase 2 worker deployment
```

### Tasks
- [ ] Add Postgres mode to `fee_crawler/db.py`
- [ ] Fix SQLite-specific SQL syntax in all `commands/*.py` files
- [ ] Update `requirements.txt`
- [ ] Verify: `DATABASE_URL=[supabase_url] python3 -m fee_crawler validate` runs successfully
- [ ] Verify: `DATABASE_URL=[supabase_url] python3 -m fee_crawler enrich --limit 10` runs successfully

---

## 1E — Update Environment Variables

### Local `.env` (for development)
```bash
# Add:
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=[key]
SUPABASE_SERVICE_ROLE_KEY=[key]

# Keep for now (Fly.io still running):
# DB_PATH=data/crawler.db  ← comment out, don't delete yet
```

---

## Gate: Phase 1 Complete

All of the following must be true before starting Phase 2:

| Check | How to verify |
|---|---|
| ✅ Row counts match | Postgres counts = SQLite counts for all 12 tables |
| ✅ FK integrity passes | Zero orphaned rows in FK validation queries |
| ✅ Next.js build clean | `npm run build` succeeds, zero TypeScript errors |
| ✅ All 50 pages load | Manual test: homepage, /fees, /admin, /admin/review, /account all load correctly |
| ✅ Auth works | Login → session → admin hub → logout cycle completes against Postgres |
| ✅ Stripe webhook fires | Test webhook received and row created in `stripe_events` table in Postgres |
| ✅ Python pipeline runs | `DATABASE_URL=[pg] python3 -m fee_crawler validate` completes without error |
| ✅ Fly.io still running | `flyctl status` shows app healthy (do not touch it yet) |
