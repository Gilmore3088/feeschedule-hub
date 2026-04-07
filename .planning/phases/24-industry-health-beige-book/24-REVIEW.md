---
phase: 24-industry-health-beige-book
reviewed: 2026-04-07T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/lib/crawler-db/health.ts
  - src/lib/crawler-db/health.test.ts
  - src/lib/crawler-db/fed.ts
  - src/lib/crawler-db/fed.test.ts
  - fee_crawler/commands/ingest_beige_book.py
  - fee_crawler/db.py
  - fee_crawler/tests/test_ingest_beige_book.py
  - scripts/migrate-schema.sql
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-04-07
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This phase adds industry health metrics (ROA/ROE/efficiency ratio, deposit/loan growth trends, institution count trends by charter) to the TypeScript DB layer, and a Beige Book ingestion pipeline with LLM summarization in Python. The implementation is generally clean, but two critical issues were identified: SQL injection via dynamic field interpolation in `health.ts` and an ON CONFLICT clause mismatch in `ingest_beige_book.py` that silently breaks upserts when running against PostgreSQL. Four warnings cover silent error swallowing, a flawed UNIQUE constraint for the national summary row, an unsafe regex escape, and missing validation on LLM-returned JSON keys. Three info items cover dead code, a `console.log`-style print statement pattern, and a magic number.

---

## Critical Issues

### CR-01: SQL Injection via Dynamic Field Interpolation in `health.ts`

**File:** `src/lib/crawler-db/health.ts:41-49`, `72-83`

**Issue:** `fetchIndustryMetric` and `fetchCharterMetric` interpolate the `field` parameter directly into the SQL string using `sql.unsafe()`:

```typescript
const rows = await sql.unsafe(
  `SELECT ... AVG(${field}) AS value FROM institution_financials WHERE ${field} IS NOT NULL ...`,
  [quarterCount]
);
```

`field` is typed as `'roa' | 'roe' | 'efficiency_ratio'` in TypeScript, so a caller within the same TypeScript module cannot pass an arbitrary string. However, `sql.unsafe()` bypasses the `postgres` client's parameterization entirely. If this function is ever called from a context where the TypeScript type constraint is relaxed (e.g., via `as any`, deserialized user input, or future refactoring), the column interpolation becomes a direct SQL injection vector. TypeScript types are erased at runtime.

**Fix:** Validate `field` against an explicit allowlist at runtime before interpolating:

```typescript
const ALLOWED_FIELDS = new Set(['roa', 'roe', 'efficiency_ratio'] as const);

async function fetchIndustryMetric(
  field: 'roa' | 'roe' | 'efficiency_ratio',
  quarterCount = 8
): Promise<RichIndicator | null> {
  if (!ALLOWED_FIELDS.has(field)) {
    throw new Error(`Invalid field: ${field}`);
  }
  const sql = getSql();
  // ... rest of query unchanged
}
```

Alternatively, replace with a static map from field name to pre-built query to eliminate interpolation entirely.

---

### CR-02: ON CONFLICT Clause Silently Fails on PostgreSQL for `beige_book_summaries` National Row

**File:** `fee_crawler/commands/ingest_beige_book.py:318-326`

**Issue:** The national summary upsert uses `ON CONFLICT (release_code, fed_district)`. For the national row, `fed_district` is `NULL`. In PostgreSQL, `NULL` values are not considered equal in a UNIQUE constraint — two rows with the same `release_code` and `NULL` in `fed_district` do not conflict. This means the ON CONFLICT clause never fires for the national row; every re-ingestion inserts a new duplicate row instead of updating the existing one.

The same issue applies to the district summaries upsert on line 286-293: the UNIQUE constraint `(release_code, fed_district)` will work correctly when `fed_district` is a non-null integer, but if a NULL is ever passed, it will also silently insert duplicates.

The Postgres schema in `scripts/migrate-schema.sql` line 255 defines `UNIQUE(release_code, fed_district)` without a partial index or `NULLS NOT DISTINCT` clause.

**Fix:** In `scripts/migrate-schema.sql`, change the constraint to use `NULLS NOT DISTINCT` (Postgres 15+):

```sql
UNIQUE NULLS NOT DISTINCT (release_code, fed_district)
```

Or add a partial unique index for the national row:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_bbs_national_unique
    ON beige_book_summaries (release_code)
    WHERE fed_district IS NULL;
```

And update the upsert in `ingest_beige_book.py` to target the appropriate constraint:

```python
db.execute(
    """INSERT INTO beige_book_summaries (release_code, fed_district, national_summary, themes)
       VALUES (?, NULL, ?, ?)
       ON CONFLICT ON CONSTRAINT bbs_national_unique
       DO UPDATE SET national_summary = EXCLUDED.national_summary, ...""",
    (edition, national_summary, json_module.dumps(themes)),
)
```

In SQLite (dev), the UNIQUE constraint on `(release_code, fed_district)` also does not treat two NULLs as equal, so this bug affects both environments.

---

## Warnings

### WR-01: Silent Exception Swallowing Hides DB Failures

**File:** `src/lib/crawler-db/health.ts:110-112`, `168-170`, `222-225`, `258-261`, `281-284`; `src/lib/crawler-db/fed.ts:60-63`, `75-77`, `104-106`, `133-135`, `149-151`, `170-173`, `199-202`, `239-241`, `275-279`, `298-304`

**Issue:** Every exported function uses bare `catch { return null; }` or `catch { return []; }` without logging the error. This pattern means database connectivity failures, schema mismatches, or query errors are invisible in production. The application returns empty/null data silently, making it impossible to distinguish "no data exists" from "the DB query failed."

**Fix:** Log the error before returning the fallback. At minimum:

```typescript
} catch (err) {
  console.error('[health] getDepositGrowthTrend failed:', err);
  return null;
}
```

Per CLAUDE.md architecture docs: "LLM Errors: Anthropic API errors bubble up to streaming response, client sees error message" — the same principle should apply to DB errors so operators can distinguish empty state from failure.

---

### WR-02: `_extract_national_themes` Does Not Validate LLM-Returned JSON Keys

**File:** `fee_crawler/commands/ingest_beige_book.py:153-177`

**Issue:** After parsing the LLM JSON response, the returned dict is used directly without verifying it contains the expected keys (`growth`, `employment`, `prices`, `lending`). If the LLM returns a valid JSON object with different keys (e.g., `{"overview": "..."}`) or extra/missing keys, the dict is passed to the DB upsert as-is. Downstream consumers in `fed.ts` (`getNationalBeigeBookSummary`) extract these four specific keys; missing keys would silently surface as `null` with no warning.

**Fix:** Validate and normalize the parsed dict:

```python
def _extract_national_themes(district_summaries: list[str]) -> dict:
    # ... (existing code)
    try:
        raw = json_module.loads(response.content[0].text)
        return {
            "growth": raw.get("growth") or None,
            "employment": raw.get("employment") or None,
            "prices": raw.get("prices") or None,
            "lending": raw.get("lending") or None,
        }
    except Exception:
        return {"growth": None, "employment": None, "prices": None, "lending": None}
```

---

### WR-03: `_sqlite_to_pg` Regex for `datetime('now', '-N days')` Has a Signed-Number Bug

**File:** `fee_crawler/db.py:765`

**Issue:** The regex `r"datetime\('now',\s*'(-?\d+)\s*days?'\)"` uses `-?\d+` to capture the day offset, and the replacement is `r"NOW() + INTERVAL '\1 days'"`. For a negative offset like `-7 days`, this produces `NOW() + INTERVAL '-7 days'`, which is valid PostgreSQL and works correctly — so this specific case is fine.

However, the regex does not match `'hours'`, `'minutes'`, or `'months'` variants of SQLite's `datetime()` modifier. If any other command module calls `datetime('now', '-1 hours')`, the conversion silently falls through and produces invalid PostgreSQL SQL. This is a latent bug waiting to expand.

**Fix:** Broaden the pattern or document the limitation explicitly:

```python
s = re.sub(
    r"datetime\('now',\s*'(-?\d+)\s*(days?|hours?|minutes?|months?)'\)",
    r"NOW() + INTERVAL '\1 \2'",
    s
)
```

---

### WR-04: `ingest_beige_book.py` Uses SQLite-Syntax `datetime('now')` in Upsert that Runs Against PostgreSQL

**File:** `fee_crawler/commands/ingest_beige_book.py:291`, `324`

**Issue:** The `beige_book_summaries` upsert includes `generated_at = datetime('now')` in the DO UPDATE SET clause:

```python
DO UPDATE SET district_summary = EXCLUDED.district_summary,
             generated_at = datetime('now')
```

When running against PostgreSQL via `PostgresDatabase.execute()`, this SQL passes through `_sqlite_to_pg()` which does replace `datetime('now')` with `NOW()` (line 762 of `db.py`). So this works at runtime. However, the `EXCLUDED.generated_at` approach (letting the DB default handle it) would be cleaner and more portable. More critically, the DO UPDATE clause on line 291 does NOT include `generated_at = datetime('now')` but the default `generated_at` column is only set on INSERT — so repeated upserts for existing rows will not refresh `generated_at` unless the SET clause explicitly resets it. This is intentional but undocumented, making it a readability risk.

The actual bug risk: if `_sqlite_to_pg` ever fails to match the `datetime('now')` pattern (e.g., due to extra whitespace), the raw SQLite function name reaches PostgreSQL and raises a syntax error that is silently swallowed by `PostgresDatabase.execute()` (which has no error handler for individual statements).

**Fix:** Use `EXCLUDED.generated_at` or the DB default where appropriate, and explicitly document the intent:

```python
DO UPDATE SET district_summary = EXCLUDED.district_summary,
             generated_at = NOW()  -- refresh timestamp on re-summarization
```

Or parameterize the timestamp:

```python
db.execute(
    "... DO UPDATE SET district_summary = ?, generated_at = ?",
    (summary, datetime.utcnow().isoformat()),
)
```

---

## Info

### IN-01: `gold_standard_fees` Table Missing from `scripts/migrate-schema.sql`

**File:** `scripts/migrate-schema.sql` (entire file), `fee_crawler/db.py:465-475`

**Issue:** The SQLite `Database` class initializes a `gold_standard_fees` table (`_CREATE_GOLD_STANDARD_FEES` at line 465 of `db.py`) and includes it in `_init_tables()` (line 558). This table is absent from `scripts/migrate-schema.sql`, which defines the Postgres schema. Any production Postgres deployment is missing this table.

**Fix:** Add to `scripts/migrate-schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS gold_standard_fees (
    id              BIGSERIAL PRIMARY KEY,
    crawl_target_id BIGINT      NOT NULL REFERENCES crawl_targets(id),
    fee_id          BIGINT      NOT NULL REFERENCES extracted_fees(id),
    verdict         TEXT        NOT NULL,
    verified_by     TEXT,
    verified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(fee_id)
);
```

---

### IN-02: `_thread_local` State Leaks Between Tests in `db.py`

**File:** `fee_crawler/db.py:15-16`, `799-807`

**Issue:** `_DATABASE_URL` and `_thread_local` are module-level globals initialized once at import time. In the test suite, `patch.dict(os.environ, ...)` modifies `os.environ` but `_DATABASE_URL` is already bound to the value present at import. Tests that rely on `_DATABASE_URL` being unset (to exercise the SQLite path) may silently hit the PostgreSQL path if `DATABASE_URL` was set when `fee_crawler.db` was first imported.

`_thread_local` also accumulates connections across test cases since it is never reset. A DB connection opened in one test will be reused in the next test running in the same thread, potentially contaminating state.

**Fix:** In `get_worker_db`, allow callers to force reset. In tests, consider patching `fee_crawler.db._DATABASE_URL` directly rather than `os.environ`.

---

### IN-03: Commented-Out / Print-Based Debugging in `ingest_beige_book.py`

**File:** `fee_crawler/commands/ingest_beige_book.py:204`, `227`, `234`, `255`, `266`, `328`, `359`, `375-376`

**Issue:** The command uses `print()` throughout for progress output. Per the project's `CLAUDE.md` architecture notes, the project uses "Python logging module (fee_crawler)" for logging. These `print()` calls bypass log level filtering, cannot be suppressed in tests, and do not include timestamps or severity.

**Fix:** Replace `print()` calls with `logging.getLogger(__name__).info(...)` / `.warning(...)`:

```python
import logging
logger = logging.getLogger(__name__)

# Replace:
print(f"Fetching summary: {summary_url}")
# With:
logger.info("Fetching summary: %s", summary_url)
```

---

_Reviewed: 2026-04-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
