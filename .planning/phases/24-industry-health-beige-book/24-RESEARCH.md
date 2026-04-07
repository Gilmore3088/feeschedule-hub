# Phase 24: Industry Health & Beige Book - Research

**Researched:** 2026-04-07
**Domain:** PostgreSQL aggregate queries on institution_financials + Anthropic Haiku LLM summarization of Beige Book content during ingestion
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Reuse Phase 23's `RichIndicator` shape for all health metrics: `{ current: number, history: { date: string, value: number }[], trend: 'rising' | 'falling' | 'stable', asOf: string }`. ROA, ROE, efficiency ratio, deposit growth, and loan growth all use this shape. Consistent API for Hamilton.
- **D-02:** Industry health functions live in a new file `src/lib/crawler-db/health.ts`. Keeps domain separation from per-institution queries in `financial.ts`.
- **D-03:** District summaries are pre-computed during Beige Book ingestion (Python `ingest-beige-book` command). Use Claude Haiku to generate 2-3 sentence summaries per district. Store in DB (new column or table). Zero latency at query time.
- **D-04:** National themes (growth, employment, prices, lending) are extracted via a second LLM pass during ingestion that reads all 12 district summaries and produces structured theme objects. Stored alongside the edition.
- **D-05:** Deposit and loan YoY growth computed in SQL using quarter matching (DATE_TRUNC + self-join or LAG). Handles missing quarters gracefully. Consistent with Phase 23's revenue trend approach.
- **D-06:** An "active" institution is defined as one with a row in `institution_financials` for that quarter. If an institution stops filing, it drops from counts.
- **D-07:** `* 1000` scaling at SQL query level for monetary fields (total_deposits, total_loans are stored in thousands).
- **D-08:** One function per requirement pattern.
- **D-09:** Accuracy, consistency, and value for Hamilton reports as guiding principle.

### Claude's Discretion
- Import pattern for RichIndicator (re-export from health.ts or import from fed.ts)
- Test file organization (health.test.ts, fed.test.ts extension, or both)
- DB storage format for Beige Book summaries (new column vs new table)
- Haiku prompt design for district summarization and theme extraction

### Deferred Ideas (OUT OF SCOPE)
- National surveys, BLS data, additional FED data sources -- belongs in Phase 27 (External Intelligence System). Phase 24 works with data already in the DB.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HEALTH-01 | Industry-wide ROA, ROE, efficiency ratio averages computed | SQL AVG() on institution_financials grouped by quarter, segmented by charter_type via JOIN to crawl_targets |
| HEALTH-02 | Deposit and loan growth trends (YoY) from institution_financials | DATE_TRUNC quarter matching with LAG window function or self-join to prior-year quarter; pattern from call-reports.ts |
| HEALTH-03 | Institution count trends (new charters, closures if detectable) | COUNT(DISTINCT crawl_target_id) per quarter; "active" = has a row that quarter (D-06); period-over-period diff in TypeScript |
| HEALTH-04 | Health metrics segmented by charter type (bank vs CU) | JOIN crawl_targets ON charter_type; same pattern as getRevenueByCharter() in call-reports.ts |
| BEIGE-01 | District economic narratives condensed into 2-3 sentence summaries | Haiku LLM call during ingest_beige_book.py; new column or table; zero-latency TypeScript query |
| BEIGE-02 | National economic summary derived from all 12 district reports | Second Haiku pass on combined district summaries; stored per edition |
| BEIGE-03 | Key themes extracted (growth, employment, prices, lending conditions) | Structured JSON from Haiku; stored in same row/table as national summary |
</phase_requirements>

---

## Summary

Phase 24 has two parallel tracks that are largely independent: (1) TypeScript aggregate query functions in a new `health.ts` file, and (2) a Python ingestion extension to `ingest_beige_book.py` that calls Claude Haiku to pre-compute summaries.

The TypeScript track is straightforward: the `institution_financials` table already contains `roa`, `roe`, `efficiency_ratio`, `total_deposits`, `total_loans`, and `report_date` columns. The `crawl_targets` table provides `charter_type` for segmentation. All patterns from Phase 23 (`call-reports.ts`) apply directly -- template literal SQL, `getSql()`, `* 1000` scaling for monetary fields, `Number()` coercion, try/catch with fallback. The `RichIndicator` shape and `deriveTrend()` function are already in `fed.ts` and can be re-exported or imported.

The Python track extends `ingest_beige_book.py` to call the Anthropic API (`anthropic` package already installed, `ANTHROPIC_API_KEY` in env, Haiku model confirmed as `claude-haiku-4-5-20251001` in `config.py`). The existing `ingest_edition()` function processes all 12 districts -- the LLM calls slot in immediately after district content is written. A new DB table is the right storage approach (not a column on `fed_beige_book`) to avoid a schema migration on a UNIQUE-constrained table and to support versioning. The TypeScript side adds two query functions to `fed.ts` or a new `beige-summaries.ts`.

**Primary recommendation:** Write `health.ts` with five functions (ROA/ROE/efficiency, deposit growth, loan growth, institution counts, charter-segmented health), extend `ingest_beige_book.py` with a `_summarize_district()` and `_extract_national_themes()` helper, create `beige_book_summaries` table, add two TypeScript query functions to `fed.ts`.

---

## Standard Stack

### Core (all already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `postgres` | 3.4.8 | SQL queries against Supabase | Project standard, all Phase 23 patterns use it |
| `anthropic` (Python) | 0.40+ | Haiku LLM calls in ingest pipeline | Already used in `extract_pdf.py`, `extract_html.py`, `agents/` |
| `vitest` | (project install) | TypeScript unit tests | Project standard; `npx vitest run` |
| `pytest` | (project install) | Python tests | Project standard; `python -m pytest fee_crawler/tests/` |

### Existing Reusable Assets

| Asset | File | Use in Phase 24 |
|-------|------|-----------------|
| `RichIndicator` interface | `src/lib/crawler-db/fed.ts:185` | Shape for all 5 health metrics |
| `deriveTrend()` | `src/lib/crawler-db/fed.ts:199` | Trend computation for health metrics |
| `getSql()` | `src/lib/crawler-db/connection.ts` | Read DB singleton |
| `priorYearQuarter()` | `src/lib/crawler-db/call-reports.ts:36` | Quarter label math for YoY |
| `anthropic.Anthropic()` pattern | `fee_crawler/agents/extract_pdf.py` | LLM call template |
| `Database` class | `fee_crawler/db.py` | Python DB writes |
| `Config` / `ExtractionConfig` | `fee_crawler/config.py` | Model name (`claude-haiku-4-5-20251001`) |

**No new dependencies required.** [VERIFIED: codebase grep]

---

## Architecture Patterns

### TypeScript: health.ts Structure

```
src/lib/crawler-db/
├── health.ts          # NEW -- all HEALTH-01 through HEALTH-04 functions
└── fed.ts             # EXTEND -- add getDistrictBeigeBookSummaries(), getNationalBeigeBookSummary()
```

**Pattern: one function per requirement** (established in Phase 23 via `call-reports.ts`)

```typescript
// Source: src/lib/crawler-db/call-reports.ts pattern
import { getSql } from "./connection";
import type { RichIndicator } from "./fed";
import { deriveTrend } from "./fed";

export interface IndustryHealthMetrics {
  roa: RichIndicator | null;
  roe: RichIndicator | null;
  efficiency_ratio: RichIndicator | null;
}

export async function getIndustryHealthMetrics(): Promise<IndustryHealthMetrics> {
  const sql = getSql();
  try {
    // One query per metric -- 8 quarters DESC, compute current + history
    const rows = await sql.unsafe(
      `SELECT
         TO_CHAR(DATE_TRUNC('quarter', report_date::date), 'YYYY-"Q"Q') AS quarter,
         AVG(roa)              AS avg_roa,
         AVG(roe)              AS avg_roe,
         AVG(efficiency_ratio) AS avg_efficiency
       FROM institution_financials
       WHERE roa IS NOT NULL OR roe IS NOT NULL OR efficiency_ratio IS NOT NULL
       GROUP BY DATE_TRUNC('quarter', report_date::date)
       ORDER BY DATE_TRUNC('quarter', report_date::date) DESC
       LIMIT 8`,
      []
    );
    // ... map rows to RichIndicator shape using deriveTrend()
  } catch {
    return { roa: null, roe: null, efficiency_ratio: null };
  }
}
```

[VERIFIED: codebase - `call-reports.ts` `getRevenueTrend()` is the canonical pattern]

### TypeScript: YoY Growth Pattern (HEALTH-02)

Use the `priorYearQuarter()` label-matching approach from `call-reports.ts` -- not positional offset, which breaks when quarters have gaps.

```typescript
// Source: src/lib/crawler-db/call-reports.ts:85
const byQuarter = new Map(snapshots.map((s) => [s.quarter, s]));
for (const snap of snapshots) {
  const prior = byQuarter.get(priorYearQuarter(snap.quarter));
  if (prior && prior.total_deposits > 0) {
    snap.yoy_change_pct =
      ((snap.total_deposits - prior.total_deposits) / prior.total_deposits) * 100;
  }
}
```

For deposits/loans, `total_deposits * 1000` and `total_loans * 1000` (D-07). [VERIFIED: codebase]

### TypeScript: Charter Segmentation (HEALTH-04)

JOIN `crawl_targets` on `charter_type` -- exact same pattern as `getRevenueByCharter()` in `call-reports.ts:180`. Values are `'bank'` and `'credit_union'`. [VERIFIED: `fee_crawler/db.py` comment `-- bank | credit_union`]

### TypeScript: Institution Counts (HEALTH-03)

```typescript
// Count DISTINCT crawl_target_id per quarter group
// "active" = has a row in institution_financials that quarter (D-06)
SELECT
  TO_CHAR(DATE_TRUNC('quarter', report_date::date), 'YYYY-"Q"Q') AS quarter,
  COUNT(DISTINCT crawl_target_id) AS active_institutions,
  SUM(CASE WHEN charter_type = 'bank' THEN 1 ELSE 0 END) AS bank_count,
  SUM(CASE WHEN charter_type = 'credit_union' THEN 1 ELSE 0 END) AS cu_count
FROM institution_financials inf
JOIN crawl_targets ct ON ct.id = inf.crawl_target_id
GROUP BY DATE_TRUNC('quarter', report_date::date)
ORDER BY DATE_TRUNC('quarter', report_date::date) DESC
LIMIT 8
```

Period-over-period diff computed in TypeScript using same label-matching Map approach. [ASSUMED: SQL shape; pattern is VERIFIED from call-reports.ts]

### RichIndicator Import Strategy

**Recommendation:** Export `deriveTrend` from `fed.ts` as a named export alongside `RichIndicator`. Import both in `health.ts`. Do NOT re-export `RichIndicator` from `health.ts` to avoid circular re-export chains. This is the simplest approach given `fed.ts` already exports both.

```typescript
// health.ts
import { getSql } from "./connection";
import { type RichIndicator, deriveTrend } from "./fed";
```

[VERIFIED: `fed.ts` exports `RichIndicator` as an interface and `deriveTrend` is defined but currently not exported -- must add `export` keyword to `deriveTrend` in `fed.ts`]

**Action required:** Add `export` to `deriveTrend` function in `fed.ts`. Currently `function deriveTrend(...)` at line 199 -- not exported.

### Python: Beige Book Summarization

**Where to add:** Inside `ingest_edition()` in `ingest_beige_book.py`, after each district's sections are stored.

**Client pattern** (from `fee_crawler/agents/extract_pdf.py`):

```python
import anthropic
import os

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

def _summarize_district(district_text: str, district_num: int) -> str:
    """Generate 2-3 sentence economic narrative for one district."""
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",  # from config.py ExtractionConfig.model
        max_tokens=256,
        messages=[{
            "role": "user",
            "content": (
                f"Summarize the economic conditions in Federal Reserve District {district_num} "
                f"in exactly 2-3 sentences. Focus on overall activity, key sectors, "
                f"and notable trends. Be specific about direction (growing, slowing, etc.).\n\n"
                f"Beige Book text:\n{district_text[:4000]}"
            )
        }]
    )
    return response.content[0].text.strip()
```

[VERIFIED: `extract_pdf.py` uses identical `client.messages.create` pattern; model constant from `config.py:46`]

### DB Storage: New Table (Recommended over new column)

**Why new table, not new column on `fed_beige_book`:**
- `fed_beige_book` has `UNIQUE(release_code, fed_district, section_name)` -- adding a `llm_summary` column would leave it NULL on all rows except `section_name = 'Summary of Economic Activity'`
- A new table is easier to query, version, and rerun without touching the UNIQUE constraint
- Avoids Postgres migration on a large table (130 rows currently, grows each edition)

**Recommended schema:**

```sql
CREATE TABLE IF NOT EXISTS beige_book_summaries (
    id              BIGSERIAL PRIMARY KEY,
    release_code    TEXT        NOT NULL,
    fed_district    INT,        -- NULL for national summary
    district_summary TEXT,      -- 2-3 sentence LLM summary (BEIGE-01)
    national_summary TEXT,      -- national prose summary (BEIGE-02)
    themes          JSONB,      -- {growth, employment, prices, lending} (BEIGE-03)
    model_used      TEXT        NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(release_code, fed_district)
);
```

[ASSUMED: Schema design -- pattern is sound but final column names at Claude's discretion per CONTEXT.md]

**Matching Postgres/SQLite:** The Python `ingest_beige_book.py` uses SQLite's `db.execute()` pattern. A parallel Postgres migration (`.sql` file in `scripts/`) is needed for production.

### TypeScript Query Functions (BEIGE-01, 02, 03)

Add to `fed.ts` (it already owns all Beige Book queries):

```typescript
export interface DistrictBeigeBookSummary {
  fed_district: number;
  district_summary: string;
  release_code: string;
  generated_at: string;
}

export interface NationalBeigeBookSummary {
  release_code: string;
  national_summary: string;
  themes: {
    growth: string;
    employment: string;
    prices: string;
    lending: string;
  } | null;
  generated_at: string;
}

export async function getDistrictBeigeBookSummaries(
  releaseCode?: string
): Promise<DistrictBeigeBookSummary[]> { ... }

export async function getNationalBeigeBookSummary(
  releaseCode?: string
): Promise<NationalBeigeBookSummary | null> { ... }
```

[ASSUMED: Interface shape; pattern matches project conventions]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Quarter label arithmetic | Custom date math | `priorYearQuarter()` already in `call-reports.ts` | Handles edge cases, copy or export |
| Trend direction | Custom slope calc | `deriveTrend()` already in `fed.ts` | Tested, project-standard threshold (0.5%) |
| LLM client initialization | Custom HTTP | `anthropic.Anthropic()` | SDK handles retries, auth, streaming |
| PostgreSQL aggregation | Application-layer grouping | SQL `DATE_TRUNC + GROUP BY + AVG` | Correct and efficient at DB layer |

**Key insight:** Nearly all primitives exist. Phase 24 is composition, not invention.

---

## Common Pitfalls

### Pitfall 1: Exporting deriveTrend from fed.ts
**What goes wrong:** `health.ts` imports `deriveTrend` but it is not currently exported from `fed.ts` (line 199 is `function deriveTrend`, not `export function deriveTrend`). TypeScript compile error.
**Why it happens:** The function was written as a module-private helper.
**How to avoid:** First task in Wave 0 or Wave 1: add `export` keyword to `deriveTrend` in `fed.ts`.
**Warning signs:** `Module '"./fed"' has no exported member 'deriveTrend'` TypeScript error.

[VERIFIED: Read `fed.ts` line 199 -- `function deriveTrend(` with no export keyword]

### Pitfall 2: efficiency_ratio is a ratio, NOT scaled by 1000
**What goes wrong:** Multiplying `efficiency_ratio * 1000` like monetary fields. efficiency_ratio, roa, roe are `REAL`/`FLOAT` columns -- no scaling needed.
**Why it happens:** Confusing the monetary field rule (D-07) with ratio fields.
**How to avoid:** Only apply `* 1000` to `BIGINT` monetary columns: `total_assets`, `total_deposits`, `total_loans`, `service_charge_income`. Never to `FLOAT` ratio fields.
**Warning signs:** ROA values of 800% instead of 0.8%.

[VERIFIED: `scripts/migrate-schema.sql` -- `roa FLOAT`, `efficiency_ratio FLOAT`, `total_deposits BIGINT`]

### Pitfall 3: NULL handling in AVG() across sparse data
**What goes wrong:** `AVG(roa)` returns NULL if all rows for a quarter have `roa IS NULL`. The try-catch returns null, but partial data (some institutions have roa, others don't) silently skews averages.
**Why it happens:** FDIC and NCUA data completeness varies by quarter and source.
**How to avoid:** Add `WHERE roa IS NOT NULL` in per-metric queries; report `institution_count` alongside averages so Hamilton knows the sample size.
**Warning signs:** `current` values wildly inconsistent quarter-over-quarter.

[VERIFIED: `financial.ts` -- `roa: number | null` in `InstitutionFinancial`]

### Pitfall 4: Python DB writes use SQLite but Postgres is production
**What goes wrong:** `ingest_beige_book.py` uses `db.execute()` which is SQLite. The `beige_book_summaries` table must also exist in Postgres (`scripts/migrate-schema.sql`) for production queries.
**Why it happens:** Dual-database architecture (Python writes SQLite, Next.js reads Postgres via `getSql()`).
**How to avoid:** Add `beige_book_summaries` CREATE TABLE to both `fee_crawler/db.py` (SQLite) and `scripts/migrate-schema.sql` (Postgres). Use `ON CONFLICT (release_code, fed_district) DO UPDATE` for idempotent reruns.
**Warning signs:** TypeScript queries return empty arrays even after Python ingestion runs.

[VERIFIED: `fee_crawler/db.py` SQLite schema vs `scripts/migrate-schema.sql` Postgres schema are maintained separately]

### Pitfall 5: Beige Book text truncation for Haiku
**What goes wrong:** Full district content can be 3,000-8,000 tokens. Haiku's context window is 200K but the summarization call should be cheap ($0.01/district). Passing the full raw text with all sections is wasteful; only `section_name = 'Summary of Economic Activity'` is needed for the district headline.
**How to avoid:** In `_summarize_district()`, fetch only the `content_text` for `section_name = 'Summary of Economic Activity'` (the same field `getBeigeBookHeadline()` uses). Truncate to 4,000 chars as a safety cap.
**Warning signs:** API calls costing more than estimated $0.12/edition.

[VERIFIED: `fed.ts:64` -- `getBeigeBookHeadline()` uses `section_name = 'Summary of Economic Activity'`]

### Pitfall 6: National themes Haiku pass needs JSON output
**What goes wrong:** Asking Haiku to produce `{ growth: "...", employment: "...", ... }` in free text, then parsing with brittle regex.
**How to avoid:** Use a system prompt instructing JSON-only output, and wrap with `json.loads()` in a try/except. Store the raw JSON string in `themes JSONB` column.
**Warning signs:** `json.loads()` exceptions, partial theme extraction.

[ASSUMED: Prompt design at Claude's discretion per CONTEXT.md; JSON output pattern is standard Anthropic practice]

---

## Code Examples

### fetchRichIndicator reuse pattern for health metrics

```typescript
// Source: src/lib/crawler-db/fed.ts:212 -- exact pattern to replicate
async function fetchIndustryMetric(
  field: 'roa' | 'roe' | 'efficiency_ratio',
  quarterCount = 8
): Promise<RichIndicator | null> {
  const sql = getSql();
  try {
    const rows = await sql.unsafe(
      `SELECT
         TO_CHAR(DATE_TRUNC('quarter', report_date::date), 'YYYY-"Q"Q') AS quarter,
         AVG(${field}) AS value
       FROM institution_financials
       WHERE ${field} IS NOT NULL
       GROUP BY DATE_TRUNC('quarter', report_date::date)
       ORDER BY DATE_TRUNC('quarter', report_date::date) DESC
       LIMIT $1`,
      [quarterCount]
    ) as { quarter: string; value: string }[];

    if (rows.length === 0) return null;

    const current = Number(rows[0].value);
    const asOf = rows[0].quarter;
    const history = rows.slice(1).reverse().map((r) => ({
      date: r.quarter,
      value: Number(r.value),
    }));

    return { current, history, trend: deriveTrend(current, history), asOf };
  } catch {
    return null;
  }
}
```

### National themes extraction (Python)

```python
def _extract_national_themes(district_summaries: list[str]) -> dict:
    """Second LLM pass: extract structured themes from all 12 district summaries."""
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    combined = "\n\n".join(f"District {i+1}: {s}" for i, s in enumerate(district_summaries))
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system='Respond with only valid JSON. No markdown, no explanation.',
        messages=[{
            "role": "user",
            "content": (
                "Extract 4 key national economic themes from these Federal Reserve district reports. "
                "Respond with JSON: {\"growth\": \"...\", \"employment\": \"...\", "
                "\"prices\": \"...\", \"lending\": \"...\"}. "
                "Each value is 1-2 sentences.\n\n" + combined[:8000]
            )
        }]
    )
    import json
    try:
        return json.loads(response.content[0].text)
    except Exception:
        return {"growth": None, "employment": None, "prices": None, "lending": None}
```

[ASSUMED: Prompt wording; pattern mirrors project's extract_pdf.py approach]

---

## Validation Architecture

Nyquist validation is enabled (`nyquist_validation: true` in `.planning/config.json`).

### Test Framework
| Property | Value |
|----------|-------|
| TypeScript framework | vitest (no config file found; invoked via `npx vitest run`) |
| Python framework | pytest (`fee_crawler/tests/`) |
| Quick TS run | `npx vitest run src/lib/crawler-db/health.test.ts` |
| Full TS suite | `npx vitest run` |
| Quick Python run | `python -m pytest fee_crawler/tests/test_ingest_beige_book.py -x` |
| Full Python suite | `python -m pytest fee_crawler/tests/` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HEALTH-01 | `getIndustryHealthMetrics()` returns RichIndicator for roa/roe/efficiency | unit | `npx vitest run src/lib/crawler-db/health.test.ts` | No -- Wave 0 gap |
| HEALTH-02 | `getDepositGrowthTrend()` computes YoY pct correctly | unit | `npx vitest run src/lib/crawler-db/health.test.ts` | No -- Wave 0 gap |
| HEALTH-03 | `getInstitutionCountTrend()` returns period-over-period diff | unit | `npx vitest run src/lib/crawler-db/health.test.ts` | No -- Wave 0 gap |
| HEALTH-04 | `getHealthMetricsByCharter()` splits bank vs credit_union | unit | `npx vitest run src/lib/crawler-db/health.test.ts` | No -- Wave 0 gap |
| BEIGE-01 | `getDistrictBeigeBookSummaries()` returns 12 district objects | unit | `npx vitest run src/lib/crawler-db/fed.test.ts` | Extends existing |
| BEIGE-02 | `getNationalBeigeBookSummary()` returns prose national summary | unit | `npx vitest run src/lib/crawler-db/fed.test.ts` | Extends existing |
| BEIGE-03 | themes object has growth/employment/prices/lending keys | unit | `npx vitest run src/lib/crawler-db/fed.test.ts` | Extends existing |
| Python BEIGE-01/02/03 | `_summarize_district()` and `_extract_national_themes()` | unit (mock) | `python -m pytest fee_crawler/tests/test_ingest_beige_book.py -x` | No -- Wave 0 gap |

### Wave 0 Gaps
- [ ] `src/lib/crawler-db/health.test.ts` -- vitest tests for all 4 HEALTH requirements; mock pattern from `fed.test.ts`
- [ ] `fee_crawler/tests/test_ingest_beige_book.py` -- pytest tests for `_summarize_district()` and `_extract_national_themes()` with mocked Anthropic client
- [ ] `export` keyword added to `deriveTrend` in `fed.ts` (required before `health.ts` can import it)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | -- |
| V3 Session Management | no | -- |
| V4 Access Control | no | -- |
| V5 Input Validation | yes | Beige Book LLM output parsed with `json.loads()` in try/except; TypeScript `Number()` coercion with null guards |
| V6 Cryptography | no | -- |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM output injection into JSONB | Tampering | `json.loads()` with try/except fallback; store raw string, parse at read time |
| SQL injection via `sql.unsafe()` | Tampering | Only static field names used; `$1` parameterization for limit/date values |
| ANTHROPIC_API_KEY exposure | Information Disclosure | Read from `os.environ.get()`, never hardcoded; already project-standard |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `anthropic` Python package | BEIGE-01/02/03 ingestion | Yes | 0.40+ per requirements.txt | -- |
| `ANTHROPIC_API_KEY` env var | Haiku LLM calls | Assumed present | -- | Skip summarization, log warning |
| Postgres `institution_financials` | HEALTH-01 through 04 | Yes | 8 quarters confirmed (STATE.md) | -- |
| Postgres `fed_beige_book` | BEIGE-01/02/03 queries | Yes | 130 rows confirmed (STATE.md) | -- |
| `getSql()` / `postgres` TS client | health.ts queries | Yes | 3.4.8 | -- |

Step 2.6 NOTES: No new external dependencies. All tools confirmed present. [VERIFIED: `fee_crawler/config.py`, `STATE.md`, `scripts/migrate-schema.sql`]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `beige_book_summaries` table (new) is better than a new column on `fed_beige_book` | Architecture Patterns | Column approach would work but is messier; planner should confirm table approach |
| A2 | Only `section_name = 'Summary of Economic Activity'` text is fed to Haiku per district | Code Examples (Pitfall 5) | Using all sections costs more but is fine; only affects cost estimate |
| A3 | `_extract_national_themes()` receives assembled district summaries (not raw content) | Code Examples | If summaries aren't ready before national pass, ordering matters |
| A4 | `health.test.ts` mock pattern will follow `fed.test.ts` exactly (mock `connection` module with `vi.mock`) | Validation Architecture | Different mock pattern may be needed if health.ts uses `getSql()` vs `sql` export |

---

## Open Questions

1. **Should `priorYearQuarter()` be exported from `call-reports.ts` or duplicated in `health.ts`?**
   - What we know: it's a 6-line pure function in `call-reports.ts:36`
   - What's unclear: project convention on sharing private helpers
   - Recommendation: Export it from `call-reports.ts` and import in `health.ts`. One source of truth.

2. **Does `ingest_beige_book.py` need a `--skip-llm` flag for testing?**
   - What we know: LLM calls cost money and take time; existing commands have no such flag
   - What's unclear: test environment has `ANTHROPIC_API_KEY` available?
   - Recommendation: Add `--skip-llm` flag to `run()` that writes NULL summaries; pytest mocks the client

3. **How many Beige Book editions should be backfilled on first run?**
   - What we know: 130 rows across ~17 editions already in DB (STATE.md); summaries don't exist yet
   - What's unclear: Whether to summarize all historical editions or only newest
   - Recommendation: Default to latest edition only (matches existing `run()` default); add `--backfill` flag for historical run

---

## Sources

### Primary (HIGH confidence)
- `src/lib/crawler-db/fed.ts` -- RichIndicator, deriveTrend, getBeigeBookHeadline patterns [VERIFIED: read]
- `src/lib/crawler-db/call-reports.ts` -- priorYearQuarter, getRevenueTrend, getRevenueByCharter patterns [VERIFIED: read]
- `src/lib/crawler-db/financial.ts` -- InstitutionFinancial interface, field names, null handling [VERIFIED: read]
- `fee_crawler/db.py` -- SQLite table schemas, UNIQUE constraints, charter_type values [VERIFIED: read]
- `scripts/migrate-schema.sql` -- Postgres table schemas, BIGINT vs FLOAT field types [VERIFIED: read]
- `fee_crawler/agents/extract_pdf.py` -- canonical Anthropic client call pattern in Python [VERIFIED: read]
- `fee_crawler/config.py` -- Haiku model name `claude-haiku-4-5-20251001`, ExtractionConfig [VERIFIED: read]
- `fee_crawler/commands/ingest_beige_book.py` -- existing ingest pipeline structure [VERIFIED: read]
- `src/lib/crawler-db/fed.test.ts` -- vitest mock patterns, vi.mock("./connection") approach [VERIFIED: read]

### Secondary (MEDIUM confidence)
- `STATE.md` -- 130 Beige Book rows, 38,949 Call Report rows confirmed [VERIFIED: read]
- `.planning/config.json` -- nyquist_validation: true confirmed [VERIFIED: read]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, versions confirmed
- Architecture patterns: HIGH -- all patterns verified from existing Phase 23 files
- Pitfalls: HIGH -- all verified against actual source code (deriveTrend not exported, field types, dual DB)
- LLM prompt design: MEDIUM -- pattern established, exact wording at Claude's discretion

**Research date:** 2026-04-07
**Valid until:** 2026-07-07 (stable -- no external library changes needed)
