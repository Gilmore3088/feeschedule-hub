# Deployment Checklist: Pipeline Refactoring (Phases A-D)

This checklist covers schema migrations, backward compatibility verification,
and rollback procedures for the 4-phase pipeline refactoring on the
Fly.io + SQLite + Litestream deployment.

---

## Critical Architecture Constraints

1. **SQLite on persistent volume** at `/data/crawler.db` (Fly.io mount `bfi_data`).
2. **Build-time DB**: The Dockerfile includes the real DB during `npm run build`
   for Next.js prerendering. Schema changes in Python (`fee_crawler/db.py`) must
   also be reflected in the TypeScript stub tables (`src/lib/crawler-db/connection.ts`
   STUB_TABLES) or the Next.js build will fail on unknown columns.
3. **Litestream backup**: Continuous replication via `run.sh`. Any destructive
   schema change must complete within the busy_timeout (30s Python / 5s Node).
4. **Single-machine deployment**: No concurrent migration risk, but SSH pipeline
   commands run alongside the Node.js server (WAL mode handles this).
5. **GitHub Actions** invoke commands via `flyctl ssh console`. New CLI flags
   must have defaults that preserve existing behavior.

---

## PHASE A: Schema Additions (Non-Destructive)

### Changes
- CREATE TABLE `pipeline_runs` (new table)
- ALTER TABLE `ops_jobs` ADD COLUMN `pipeline_run_id`
- ALTER TABLE `crawl_results` ADD COLUMN `extraction_state`
- ALTER TABLE `crawl_targets` ADD COLUMN `processing_since`
- 5 new indexes

### Data Invariants

```
- [ ] All existing CLI commands still work with zero new flags
- [ ] ops_jobs rows: pipeline_run_id is NULL for all existing rows (new column)
- [ ] crawl_results rows: extraction_state is NULL for all existing rows (new column)
- [ ] crawl_targets rows: processing_since is NULL for all existing rows (new column)
- [ ] pipeline_runs table is empty after creation
- [ ] Next.js build succeeds with updated STUB_TABLES
- [ ] GitHub Actions workflows call run-pipeline with existing flags only
```

### Pre-Deploy Audits (Run on Fly.io via SSH)

```sql
-- BASELINE: Save these values BEFORE deploy
-- Run: flyctl ssh console --app bank-fee-index -C "sqlite3 /data/crawler.db"

-- 1. Record current table list
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;

-- 2. Record current column counts for tables being altered
SELECT COUNT(*) as col_count FROM pragma_table_info('ops_jobs');
-- Expected: 16 columns

SELECT COUNT(*) as col_count FROM pragma_table_info('crawl_results');
-- Expected: 9 columns

SELECT COUNT(*) as col_count FROM pragma_table_info('crawl_targets');
-- Expected: ~22 columns (depends on prior migrations)

-- 3. Record row counts for tables being altered
SELECT 'ops_jobs' as tbl, COUNT(*) as cnt FROM ops_jobs
UNION ALL
SELECT 'crawl_results', COUNT(*) FROM crawl_results
UNION ALL
SELECT 'crawl_targets', COUNT(*) FROM crawl_targets
UNION ALL
SELECT 'extracted_fees', COUNT(*) FROM extracted_fees;

-- 4. Verify no column name conflicts
SELECT name FROM pragma_table_info('ops_jobs') WHERE name = 'pipeline_run_id';
-- Expected: 0 rows (column does not exist yet)

SELECT name FROM pragma_table_info('crawl_results') WHERE name = 'extraction_state';
-- Expected: 0 rows

SELECT name FROM pragma_table_info('crawl_targets') WHERE name = 'processing_since';
-- Expected: 0 rows

-- 5. Verify pipeline_runs table does not exist
SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_runs';
-- Expected: 0 rows

-- 6. Current index count (to verify new ones are added)
SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND sql IS NOT NULL;
```

### Deploy Steps

| Step | Action | Estimated Time | Rollback |
|------|--------|----------------|----------|
| 1 | Update `fee_crawler/db.py`: add `_CREATE_PIPELINE_RUNS`, add 3 ALTER statements to migrations, add 5 indexes | Code change | Revert commit |
| 2 | Update `src/lib/crawler-db/connection.ts` STUB_TABLES: add `pipeline_runs` table, add new columns to `ops_jobs`, `crawl_results`, `crawl_targets` stubs | Code change | Revert commit |
| 3 | Merge to main, deploy triggers (`flyctl deploy --remote-only`) | ~5 min | Redeploy previous commit |
| 4 | Trigger one CLI command to run `_init_tables()` which applies migrations | < 30 sec | N/A (idempotent) |

```bash
# Step 4: Force schema migration by running stats (read-only, triggers _init_tables)
flyctl ssh console --app bank-fee-index -C \
  "cd /app && DB_PATH=/data/crawler.db python3 -m fee_crawler stats"
```

### Post-Deploy Verification (Within 5 Minutes)

```sql
-- 1. Verify new table exists
SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_runs';
-- Expected: 1 row

-- 2. Verify new columns exist
SELECT name FROM pragma_table_info('ops_jobs') WHERE name = 'pipeline_run_id';
-- Expected: 1 row

SELECT name FROM pragma_table_info('crawl_results') WHERE name = 'extraction_state';
-- Expected: 1 row

SELECT name FROM pragma_table_info('crawl_targets') WHERE name = 'processing_since';
-- Expected: 1 row

-- 3. Verify row counts unchanged (compare with baseline)
SELECT 'ops_jobs' as tbl, COUNT(*) as cnt FROM ops_jobs
UNION ALL
SELECT 'crawl_results', COUNT(*) FROM crawl_results
UNION ALL
SELECT 'crawl_targets', COUNT(*) FROM crawl_targets;
-- Expected: identical to pre-deploy baseline

-- 4. Verify new columns are all NULL (no data corruption)
SELECT COUNT(*) FROM ops_jobs WHERE pipeline_run_id IS NOT NULL;
-- Expected: 0

SELECT COUNT(*) FROM crawl_results WHERE extraction_state IS NOT NULL;
-- Expected: 0

SELECT COUNT(*) FROM crawl_targets WHERE processing_since IS NOT NULL;
-- Expected: 0

-- 5. Verify new indexes exist
SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND sql IS NOT NULL;
-- Expected: baseline + 5

-- 6. Verify existing pipeline command still works
-- (run from GitHub Actions or manually)
```

```bash
# Verify existing CLI invocation still works (dry check)
flyctl ssh console --app bank-fee-index -C \
  "cd /app && DB_PATH=/data/crawler.db python3 -m fee_crawler run-pipeline --help"
# Expected: shows help including existing flags, no errors
```

### Rollback Plan

**Can we roll back?** Yes - fully reversible.

1. Redeploy previous commit: `flyctl deploy --image registry.fly.io/bank-fee-index:sha-<previous>`
2. New columns remain in DB but are ignored by old code (SQLite tolerates extra columns)
3. New table `pipeline_runs` remains but is empty and unused
4. No data loss risk

---

## PHASE B: Backfill extraction_state

### Changes
- UPDATE `crawl_results` SET `extraction_state = 'llm_extracted'` WHERE `status = 'success'`
- Potentially set other states based on status values

### Data Invariants

```
- [ ] Every crawl_results row with status='success' gets extraction_state='llm_extracted'
- [ ] Rows with status!='success' get appropriate state or remain NULL
- [ ] No rows lose their existing status, document_url, content_hash, or fees_extracted values
- [ ] Total row count in crawl_results is unchanged
- [ ] extracted_fees table is untouched
```

### Pre-Deploy Audits

```sql
-- BASELINE: Record status distribution BEFORE backfill
SELECT status, COUNT(*) as cnt FROM crawl_results GROUP BY status ORDER BY cnt DESC;

-- Record total
SELECT COUNT(*) as total FROM crawl_results;

-- Record current extraction_state distribution (should be all NULL from Phase A)
SELECT extraction_state, COUNT(*) as cnt FROM crawl_results GROUP BY extraction_state;
-- Expected: NULL -> (total count)

-- Spot check: verify some success rows have fees
SELECT cr.id, cr.status, cr.fees_extracted, cr.crawl_target_id
FROM crawl_results cr
WHERE cr.status = 'success'
ORDER BY cr.id DESC
LIMIT 5;
```

### Deploy Steps

| Step | Action | Estimated Time | Batching | Rollback |
|------|--------|----------------|----------|----------|
| 1 | Run backfill SQL | < 1 min for typical dataset | Single UPDATE (SQLite handles well) | SET extraction_state = NULL |
| 2 | Verify counts | < 10 sec | N/A | N/A |

```bash
# Run backfill via SSH
flyctl ssh console --app bank-fee-index -C \
  "sqlite3 /data/crawler.db \"
    BEGIN;
    UPDATE crawl_results SET extraction_state = 'llm_extracted' WHERE status = 'success' AND extraction_state IS NULL;
    UPDATE crawl_results SET extraction_state = 'failed' WHERE status = 'failed' AND extraction_state IS NULL;
    UPDATE crawl_results SET extraction_state = 'unchanged' WHERE status = 'unchanged' AND extraction_state IS NULL;
    COMMIT;
  \""
```

**IMPORTANT**: If the crawl_results table has more than 100,000 rows, batch the update:

```bash
# Batched version (1000 rows per iteration)
flyctl ssh console --app bank-fee-index -C \
  "sqlite3 /data/crawler.db \"
    UPDATE crawl_results SET extraction_state = 'llm_extracted'
    WHERE status = 'success' AND extraction_state IS NULL
    AND id IN (SELECT id FROM crawl_results WHERE status = 'success' AND extraction_state IS NULL LIMIT 1000);
  \""
# Repeat until 0 rows affected
```

### Post-Deploy Verification

```sql
-- 1. Verify no NULL extraction_state for success rows
SELECT COUNT(*) FROM crawl_results
WHERE status = 'success' AND extraction_state IS NULL;
-- Expected: 0

-- 2. Verify distribution matches status distribution
SELECT status, extraction_state, COUNT(*) as cnt
FROM crawl_results
GROUP BY status, extraction_state
ORDER BY status, extraction_state;
-- Expected: success->llm_extracted, failed->failed, unchanged->unchanged

-- 3. Verify total row count unchanged
SELECT COUNT(*) as total FROM crawl_results;
-- Compare with baseline

-- 4. Verify no data corruption in other columns
SELECT COUNT(*) FROM crawl_results WHERE status IS NULL;
-- Expected: 0 (no rows lost their status)

-- 5. Spot check
SELECT id, status, extraction_state, fees_extracted
FROM crawl_results
ORDER BY RANDOM()
LIMIT 10;
```

### Rollback Plan

**Can we roll back?** Yes - trivially reversible.

```sql
UPDATE crawl_results SET extraction_state = NULL;
```

No other data is affected. The column just returns to its Phase A state (all NULL).

---

## PHASE C: fee_change_events Table Rebuild (UNIQUE Constraint)

### Changes
- Deduplicate existing `fee_change_events` data
- Create new table with UNIQUE constraint on `(crawl_target_id, fee_category, detected_at)`
- Copy data from old table to new
- Drop old table, rename new table
- This is the HIGHEST RISK phase

### Data Invariants

```
- [ ] All unique fee_change_events rows are preserved
- [ ] Duplicate rows are collapsed (keep one per unique key)
- [ ] Row count after >= row count before - duplicate count
- [ ] No orphaned references (crawl_target_id values all still valid)
- [ ] snapshot_fees.py still inserts change events successfully
- [ ] Next.js pages querying fee_change_events still work
```

### Pre-Deploy Audits

```sql
-- BASELINE: Total rows
SELECT COUNT(*) as total FROM fee_change_events;

-- Check for duplicates that will be collapsed
SELECT crawl_target_id, fee_category, detected_at, COUNT(*) as cnt
FROM fee_change_events
GROUP BY crawl_target_id, fee_category, detected_at
HAVING cnt > 1
ORDER BY cnt DESC
LIMIT 20;

-- Record duplicate count
SELECT SUM(cnt - 1) as duplicate_rows FROM (
  SELECT COUNT(*) as cnt
  FROM fee_change_events
  GROUP BY crawl_target_id, fee_category, detected_at
  HAVING cnt > 1
);

-- Record distinct row count (this is what we expect after rebuild)
SELECT COUNT(*) as distinct_rows FROM (
  SELECT DISTINCT crawl_target_id, fee_category, detected_at
  FROM fee_change_events
);

-- Verify all crawl_target_ids are valid
SELECT COUNT(*) as orphans FROM fee_change_events fce
WHERE NOT EXISTS (SELECT 1 FROM crawl_targets ct WHERE ct.id = fce.crawl_target_id);
-- Expected: 0 (or document any orphans)

-- Record change_type distribution
SELECT change_type, COUNT(*) FROM fee_change_events GROUP BY change_type;

-- Check if table is referenced by TypeScript code
-- (manual: grep for fee_change_events in src/lib/crawler-db/)
```

### Deploy Steps

**CRITICAL**: This must happen atomically. Stop all pipeline/snapshot commands first.

| Step | Action | Estimated Time | Rollback |
|------|--------|----------------|----------|
| 0 | **STOP** any running crawl-pipeline or snapshot workflows | Instant | N/A |
| 1 | Take Litestream snapshot | < 1 min | Restore from snapshot |
| 2 | Run table rebuild SQL (atomic transaction) | < 30 sec | Restore from Litestream |
| 3 | Verify counts | < 10 sec | N/A |
| 4 | Deploy code with updated CREATE TABLE definition | ~5 min | Redeploy previous |

```bash
# Step 0: Verify no pipeline is running
flyctl ssh console --app bank-fee-index -C \
  "ps aux | grep fee_crawler || echo 'No crawler processes running'"

# Step 1: Force a Litestream snapshot (if configured)
flyctl ssh console --app bank-fee-index -C \
  "cp /data/crawler.db /data/crawler.db.pre-phase-c-backup"

# Step 2: Run the atomic rebuild
flyctl ssh console --app bank-fee-index -C \
  "sqlite3 /data/crawler.db \"
    BEGIN EXCLUSIVE;

    -- Create new table with UNIQUE constraint
    CREATE TABLE fee_change_events_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crawl_target_id INTEGER NOT NULL REFERENCES crawl_targets(id),
      fee_category TEXT NOT NULL,
      previous_amount REAL,
      new_amount REAL,
      change_type TEXT NOT NULL,
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(crawl_target_id, fee_category, detected_at)
    );

    -- Copy deduplicated data (keep the row with lowest id per unique key)
    INSERT INTO fee_change_events_new
      (crawl_target_id, fee_category, previous_amount, new_amount, change_type, detected_at)
    SELECT crawl_target_id, fee_category, previous_amount, new_amount, change_type, detected_at
    FROM fee_change_events
    WHERE id IN (
      SELECT MIN(id)
      FROM fee_change_events
      GROUP BY crawl_target_id, fee_category, detected_at
    );

    -- Swap tables
    DROP TABLE fee_change_events;
    ALTER TABLE fee_change_events_new RENAME TO fee_change_events;

    COMMIT;
  \""
```

### Post-Deploy Verification

```sql
-- 1. Verify table has UNIQUE constraint
SELECT sql FROM sqlite_master WHERE type='table' AND name='fee_change_events';
-- Expected: contains UNIQUE(crawl_target_id, fee_category, detected_at)

-- 2. Verify row count matches expected (total - duplicates)
SELECT COUNT(*) as total FROM fee_change_events;
-- Expected: equals the "distinct_rows" value from pre-deploy audit

-- 3. Verify change_type distribution preserved
SELECT change_type, COUNT(*) FROM fee_change_events GROUP BY change_type;
-- Compare with pre-deploy baseline

-- 4. Verify UNIQUE constraint works
-- (try inserting a duplicate -- should fail)
-- DO NOT run this on production. Instead verify the constraint exists via schema.

-- 5. Verify snapshot_fees.py still works
-- (run snapshot command on a test date)

-- 6. Verify no orphaned foreign keys
SELECT COUNT(*) FROM fee_change_events fce
WHERE NOT EXISTS (SELECT 1 FROM crawl_targets ct WHERE ct.id = fce.crawl_target_id);
-- Expected: same as pre-deploy (ideally 0)
```

```bash
# Verify Next.js can still query the table (hit a page that uses it)
flyctl ssh console --app bank-fee-index -C \
  "curl -s http://localhost:3000/admin/pipeline | head -20"
# Expected: 200 response, no errors
```

### Rollback Plan

**Can we roll back?** Yes - restore from backup.

```bash
# Option A: Restore the pre-rebuild backup
flyctl ssh console --app bank-fee-index -C \
  "cp /data/crawler.db.pre-phase-c-backup /data/crawler.db"

# Option B: If Litestream is configured, restore from replica
# (requires stopping the app first)
```

**Post-rollback**: Redeploy the commit before the CREATE TABLE definition change.

---

## PHASE D: New CLI Flags + Workflow Updates

### Changes
- New CLI flags: `--from-phase`, `--resume`, `--batch-size` on `run-pipeline`
- Updated `crawl-pipeline.yml` and `refresh-data.yml` workflows
- All new flags must have defaults matching current behavior

### Data Invariants

```
- [ ] Existing cron invocation (run-pipeline --limit 100 --max-llm-calls 200 --workers 2) works unchanged
- [ ] New flags are optional with sensible defaults
- [ ] --from-phase defaults to phase 1 (discover) = existing behavior
- [ ] --batch-size defaults to existing limit behavior
- [ ] --resume with no prior run = normal fresh run
- [ ] refresh-data --cadence daily still works unchanged
```

### Pre-Deploy Audits

```bash
# Record current workflow invocation (from crawl-pipeline.yml)
# Current: python3 -m fee_crawler run-pipeline --limit 100 --max-llm-calls 200 --workers 2
# This MUST still work after deploy

# Record current refresh-data invocation
# Current: python3 -m fee_crawler refresh-data --cadence daily|weekly
# This MUST still work after deploy

# Test locally first
python3 -m fee_crawler run-pipeline --help
# Verify all existing flags still present, new flags shown with defaults
```

### Deploy Steps

| Step | Action | Estimated Time | Rollback |
|------|--------|----------------|----------|
| 1 | Deploy code with new CLI flags (defaults preserve old behavior) | ~5 min | Redeploy previous |
| 2 | Verify existing cron invocation works | < 1 min | N/A |
| 3 | Update workflow YAML (only after Step 2 passes) | Code change | Revert YAML |
| 4 | Trigger manual workflow dispatch to test | ~2 min | N/A |

**IMPORTANT**: Deploy the Python code changes FIRST. Update the GitHub Actions
workflow YAML in a SEPARATE commit/deploy. This way, if the new code has issues,
the old workflow still calls valid flags.

### Post-Deploy Verification

```bash
# 1. Verify existing invocation works
flyctl ssh console --app bank-fee-index -C \
  "cd /app && DB_PATH=/data/crawler.db python3 -m fee_crawler run-pipeline --help"
# Expected: shows --from-phase, --resume, --batch-size WITH defaults

# 2. Verify backward compatibility (existing cron invocation)
flyctl ssh console --app bank-fee-index -C \
  "cd /app && DB_PATH=/data/crawler.db python3 -m fee_crawler run-pipeline \
    --limit 5 --max-llm-calls 0 --workers 1 --skip-crawl --skip-discover"
# Expected: runs categorize + auto-review stages only, no errors

# 3. Verify new flags work
flyctl ssh console --app bank-fee-index -C \
  "cd /app && DB_PATH=/data/crawler.db python3 -m fee_crawler run-pipeline \
    --limit 5 --from-phase categorize --batch-size 10"
# Expected: starts from categorize phase, no errors

# 4. Verify refresh-data still works
flyctl ssh console --app bank-fee-index -C \
  "cd /app && DB_PATH=/data/crawler.db python3 -m fee_crawler refresh-data --cadence daily"
# Expected: runs OFR + NYFed, no errors
```

### Rollback Plan

**Can we roll back?** Yes - fully reversible.

1. Revert workflow YAML to previous version
2. Redeploy previous code commit
3. New flags disappear, old flags still work
4. No data changes in this phase

---

## CROSS-PHASE: STUB_TABLES Synchronization

Every phase that changes the Python schema (`fee_crawler/db.py`) MUST also update
the TypeScript stub tables (`src/lib/crawler-db/connection.ts` lines 9-32).

### Verification

```bash
# After any schema change, verify Next.js build succeeds
npm run build
# Must complete without "no such table" or "no such column" errors

# Cross-check: columns in Python CREATE TABLE match STUB_TABLES
# Python source of truth: fee_crawler/db.py
# TypeScript stub: src/lib/crawler-db/connection.ts STUB_TABLES
```

### Specific STUB_TABLES Updates Required

**Phase A**:
- Add `CREATE TABLE IF NOT EXISTS pipeline_runs (...)` to STUB_TABLES
- Add `pipeline_run_id INTEGER` to the ops_jobs stub line
- Add `extraction_state TEXT` to the crawl_results stub line
- Add `processing_since TEXT` to the crawl_targets stub line

**Phase C**:
- Update the fee_change_events line to include `UNIQUE(crawl_target_id, fee_category, detected_at)`
  (Note: STUB_TABLES uses simple CREATE TABLE without constraints for build-time only,
  so the UNIQUE constraint may be omitted in the stub if it causes issues)

---

## RED/YELLOW/GREEN SUMMARY

### RED - Pre-Deploy (Required for EACH Phase)

- [ ] Run baseline SQL queries and save output
- [ ] Verify STUB_TABLES updated to match schema changes
- [ ] `npm run build` succeeds locally with updated stubs
- [ ] `python3 -m fee_crawler stats` runs without errors locally
- [ ] Existing pipeline CLI invocation tested locally
- [ ] Confirm no crawl-pipeline or refresh-data workflow is currently running
- [ ] For Phase C: manual backup created at `/data/crawler.db.pre-phase-c-backup`

### YELLOW - Deploy Steps (Per Phase)

Phase A:
1. [ ] Merge code (db.py + connection.ts + any new Python modules)
2. [ ] Fly.io deploy completes (watch `flyctl deploy` output)
3. [ ] Run `python3 -m fee_crawler stats` via SSH to trigger migration
4. [ ] Verify new table + columns exist

Phase B:
1. [ ] Run backfill UPDATE via SSH
2. [ ] Verify extraction_state distribution matches status distribution

Phase C:
1. [ ] Verify no crawler processes running
2. [ ] Create manual backup
3. [ ] Run atomic table rebuild via SSH
4. [ ] Deploy updated CREATE TABLE definition
5. [ ] Verify row counts and constraint

Phase D:
1. [ ] Deploy Python code with new CLI flags
2. [ ] Verify existing invocations work
3. [ ] Deploy updated workflow YAML (separate commit)
4. [ ] Trigger manual workflow dispatch test

### GREEN - Post-Deploy (Within 5 Minutes)

- [ ] Run verification SQL queries for the deployed phase
- [ ] Compare counts with baseline (zero tolerance for row loss)
- [ ] Verify Next.js pages load without errors (`curl localhost:3000/`)
- [ ] Verify admin pages load (`curl localhost:3000/admin/`)
- [ ] Run `python3 -m fee_crawler stats` to confirm DB health

### BLUE - Monitoring (24 Hours)

| Metric | Check Method | Alert Condition |
|--------|-------------|-----------------|
| App health | `flyctl status --app bank-fee-index` | Machine not running |
| Next.js errors | Fly.io logs: `flyctl logs --app bank-fee-index` | Any unhandled exception |
| DB file size | `ls -la /data/crawler.db` via SSH | Unexpected growth > 20% |
| Litestream replication | Fly.io logs for Litestream entries | Replication lag > 5 min |
| Next scheduled pipeline | GitHub Actions crawl-pipeline run | Failure on first run post-deploy |
| Next scheduled refresh | GitHub Actions refresh-data run | Failure on first run post-deploy |

**Manual checks at +1h, +4h, +24h:**

```bash
# Quick health check
flyctl ssh console --app bank-fee-index -C \
  "cd /app && DB_PATH=/data/crawler.db python3 -m fee_crawler stats"

# Verify DB integrity
flyctl ssh console --app bank-fee-index -C \
  "sqlite3 /data/crawler.db 'PRAGMA integrity_check;'"
# Expected: "ok"

# Verify WAL mode still active
flyctl ssh console --app bank-fee-index -C \
  "sqlite3 /data/crawler.db 'PRAGMA journal_mode;'"
# Expected: "wal"
```

### ROLLBACK - If Needed (Any Phase)

1. [ ] Identify which phase failed
2. [ ] For Phase A/D: redeploy previous commit (`flyctl deploy --image <previous>`)
3. [ ] For Phase B: `UPDATE crawl_results SET extraction_state = NULL;`
4. [ ] For Phase C: restore from `/data/crawler.db.pre-phase-c-backup`
5. [ ] Verify with post-rollback queries (re-run pre-deploy baselines)
6. [ ] Confirm GitHub Actions workflows still use valid CLI flags

---

## Phase Deployment Order

```
Phase A  -->  Phase B  -->  Phase C  -->  Phase D
(schema)     (backfill)   (rebuild)     (CLI flags)
```

Each phase MUST be verified green before proceeding to the next.
Minimum 1 hour soak time between phases.
Phase C (table rebuild) should ideally happen during low-traffic window
(not during Wednesday 9am ET crawl-pipeline cron).

Recommended deployment windows:
- Phase A: Any time (non-destructive)
- Phase B: Any time (simple UPDATE)
- Phase C: Weekend or off-hours (table rebuild + brief lock)
- Phase D: Weekday (need to verify GitHub Actions)
