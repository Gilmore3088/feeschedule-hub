# Phase 58: FFIEC Pipeline & Institution Data - Research

**Researched:** 2026-04-10
**Domain:** FFIEC CDR / NCUA 5300 ingestion pipeline + institution financial profile UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Port `ingest_call_reports.py` and `ingest_ncua.py` from SQLite `Database` class to psycopg2 `conn` with `%s` placeholders. Keep existing field mappings and parsing logic. Same approach as Phase 56 snapshot rewrite.

**D-02:** Historical backfill covers 2010 Q1 to present (~60 quarters). FFIEC CDR bulk data going back to 2010.

**D-03:** One-time bulk load for initial backfill — download all FFIEC CDR bulk files from 2010-present in a single pipeline run. ~60 quarters x ~5K institutions = ~300K+ rows. Run once, then quarterly cron for new data.

**D-04:** Full financial profile on institution detail page: assets, total deposits, service charge revenue, net income, key ratios (efficiency ratio, fee-to-deposit ratio), QoQ and YoY deltas.

**D-05:** Hero stat cards with sparklines at top of institution page. 4-6 large stat cards showing key metrics with mini sparkline charts showing quarterly trends. Below: existing fee table. Consulting-grade visual hierarchy.

**D-06:** Inline peer context on each stat card. Show institution value + peer median/percentile badge.

**D-07:** Modal quarterly cron for re-ingestion. Schedule at 3am on Feb 15, May 15, Aug 15, Nov 15.

**D-08:** Retry + alert error handling. 3 retries with exponential backoff on FFIEC/NCUA download failures. On failure, log error and continue. Staleness badge on admin pages when data is older than expected.

**D-09:** Cert/charter number first, then fuzzy name+state match for remaining. Log all match types for audit.

**D-10:** Ingest all FFIEC/NCUA data regardless of crawl_target match. Store with cert_number as primary key. Link to crawl_targets via nullable FK. Unmatched institutions still provide aggregate and district-level data.

### Claude's Discretion

- Database schema for `institution_financials` table (column names, indexes, partitioning strategy for 60+ quarters)
- Specific FFIEC CDR field codes beyond RIAD4080, RIAD4079, RIAD4107
- Sparkline chart implementation (SVG inline vs Recharts mini) — existing `sparkline.tsx` is available
- Which financial ratios to compute and display (efficiency ratio, fee-to-deposit, ROA, etc.)
- Staleness badge design and threshold

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COV-03 | Running the FFIEC CDR ingestion pipeline populates quarterly financial data for FDIC-insured banks | Existing `ingest_call_reports.py` with SQLite->Postgres port; `institution_financials` table already in Postgres schema |
| ADM-05 | Institution-specific admin page shows assets, total deposits, service charge revenue, and key financial ratios | `getFinancialsByInstitution()` in `financial.ts` already exists; page needs new hero card layout on top of existing fee table |
</phase_requirements>

---

## Summary

Phase 58 is a two-part phase: (1) migrate the two existing ingestion scripts from SQLite to Postgres and add a historical backfill loop, and (2) upgrade the institution detail admin page with hero stat cards backed by real financial data.

The ingestion migration is low-risk. Both `ingest_call_reports.py` and `ingest_ncua.py` already use the `Database` interface which has a `PostgresDatabase` sibling in `db.py`. The migration pattern is exactly the same as Phase 56: replace `Database` / `?` with `PostgresDatabase` / `%s` and replace `datetime('now')` with `NOW()`. The `institution_financials` table already exists in the Postgres schema (`scripts/migrate-schema.sql`) with all required columns, including `total_revenue` and `fee_income_ratio` added beyond the SQLite version.

The institution page upgrade is the more design-intensive part. The current page already imports `getInstitutionRevenueTrend` and `getInstitutionPeerRanking` from `call-reports.ts`, but renders them as a plain data table. The decision requires replacing this section with 4-6 hero stat cards each carrying a sparkline (reuse `src/components/sparkline.tsx`) and a peer percentile badge. The `getFinancialsByInstitution()` function in `financial.ts` provides the full column set needed for multi-quarter data to feed the sparklines.

The historical backfill is the highest-volume operation: ~60 quarters x ~5,000 institutions = ~300K rows for FFIEC alone, plus ~5,000 rows per quarter for NCUA. The FFIEC CDR download URL requires a form POST (not a direct GET), which is a pitfall to navigate carefully.

**Primary recommendation:** Write the Postgres-native ingestion scripts first (Wave 1), add the backfill loop second (Wave 2), then build the UI on top of confirmed live data (Wave 3).

---

## Standard Stack

### Core (existing, no new installs needed)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| psycopg2-binary | 2.9+ | Postgres adapter for Python pipeline | `fee_crawler/requirements.txt` [VERIFIED: codebase] |
| requests | 2.31+ | HTTP download for FFIEC/NCUA bulk files | `fee_crawler/requirements.txt` [VERIFIED: codebase] |
| postgres (npm) | 3.4.8 | TypeScript DB client via `sql` tagged template | `package.json` [VERIFIED: codebase] |
| vitest | (project default) | TypeScript unit tests | `vitest.config.ts` [VERIFIED: codebase] |
| modal | (project default) | Serverless cron scheduling | `fee_crawler/modal_app.py` [VERIFIED: codebase] |

No new dependencies are required for this phase.

---

## Architecture Patterns

### SQLite -> Postgres Migration Pattern (established in Phase 56)

The `db.py` module already provides `PostgresDatabase` as a drop-in replacement for `Database`. The conversion rules are encapsulated in `_sqlite_to_pg()`, but for new Postgres-native code the pattern is to write directly to psycopg2:

```python
# Source: fee_crawler/db.py PostgresDatabase + modal_app.py extract_single
import os
import psycopg2
import psycopg2.extras

conn = psycopg2.connect(os.environ["DATABASE_URL"])
conn.autocommit = False
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# %s placeholders, not ?
cur.execute(
    """INSERT INTO institution_financials
       (crawl_target_id, report_date, source, total_assets, ...)
       VALUES (%s, %s, %s, %s, ...)
       ON CONFLICT (crawl_target_id, report_date, source) DO UPDATE SET
         total_assets = EXCLUDED.total_assets,
         fetched_at = NOW()""",
    (target_id, report_date, source, total_assets, ...),
)
conn.commit()
```

The existing `ingest_call_reports.py` uses `db.execute(sql, params)` and `db.commit()` -- these map directly to `cur.execute(pg_sql, params)` and `conn.commit()` in psycopg2.

### FFIEC CDR Bulk Download Pattern

The existing code documents the download URL but does NOT implement the HTTP request for bulk files. The FFIEC CDR bulk download requires a POST request to `https://cdr.ffiec.gov/public/PWS/DownloadBulkData.aspx` with form fields, OR direct GET from FDIC BankFind API as an alternative.

**IMPORTANT FINDING:** The existing `ingest_call_reports.py` contains the URL constant `_FFIEC_BULK_URL` but the `run()` function only reads from a local `csv_path` argument -- it does NOT fetch from FFIEC automatically. The HTTP download for historical backfill must be implemented from scratch.

Two reliable data sources for the backfill:
1. **FDIC BankFind Suite API** -- provides Call Report data per institution via REST API. URL pattern: `https://banks.data.fdic.gov/api/financials?fields=REPDTE,IDRSSD,RSSD9999,RIAD4080,RIAD4079,RIAD4107&limit=10000&offset=0&sort_by=REPDTE&sort_order=DESC&output=json` [ASSUMED -- API URL structure based on training knowledge, needs verification]
2. **FFIEC CDR Bulk ZIP** -- quarterly ZIPs at `https://www.ffiec.gov/npw/FinancialReport/ReturnFinancialReport?rpt=BHC&selectedyear=YYYY` pattern (different from the `_FFIEC_BULK_URL` constant in the existing code). [ASSUMED -- verify against actual FFIEC site]

**Recommended approach for backfill:** Use FDIC BankFind Suite API (REST, no auth needed, well-documented) rather than the FFIEC CDR direct download form. The existing `ingest_fdic.py` command already uses this API and can serve as the template.

### NCUA 5300 Quarterly ZIP Pattern (fully implemented, just needs Postgres swap)

`ingest_ncua.py` already downloads and parses the ZIP correctly. The URL pattern is:
```
https://ncua.gov/files/publications/analysis/call-report-data-{year}-{month:02d}.zip
```
The default is `NCUA_DEFAULT_YEAR=2025, NCUA_DEFAULT_MONTH=12`. For backfill from 2010, the loop iterates quarterly months: 3, 6, 9, 12 for each year 2010-2025.

### Hero Stat Card Pattern (from district page)

The district detail page (`/admin/districts/[id]/page.tsx`) uses this card structure for financial stats:

```tsx
// Source: src/app/admin/districts/[id]/page.tsx
<div className="rounded-lg border p-3">
  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
    {label}
  </div>
  <div className="mb-1">
    <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
      {value}
    </span>
  </div>
  <div className="text-[11px] text-gray-400">{subLabel}</div>
</div>
```

For Phase 58 the cards need: (1) larger stat value, (2) sparkline component inline, (3) peer badge. Example composition:

```tsx
// Pattern for hero stat card with sparkline
<div className="admin-card p-4">
  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
    Total Assets
  </p>
  <div className="flex items-end gap-3 mt-1">
    <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
      {formatAssets(latestAssets)}
    </p>
    <Sparkline data={assetHistory} width={64} height={24} color="#3b82f6" />
  </div>
  <p className="text-[11px] text-gray-400 mt-1">
    P{percentile} among {tier} peers
  </p>
</div>
```

### Sparkline Component Interface

```tsx
// Source: src/components/sparkline.tsx
<Sparkline
  data={number[]}        // array of values oldest-to-newest
  width={64}             // optional, default 64
  height={24}            // optional, default 24
  color="currentColor"   // optional CSS color string
  className=""           // optional
/>
// Returns null if data.length < 2
// Trending dot: emerald if last >= second-to-last, red otherwise
```

The sparkline expects `number[]` oldest-first (ascending time order). The `getInstitutionRevenueTrend` query returns rows newest-first, so the array must be reversed before passing to Sparkline.

### Modal Quarterly Cron Pattern

```python
# Source: fee_crawler/modal_app.py
@app.function(
    schedule=modal.Cron("0 3 15 2,5,8,11 *"),  # 3am on 15th of Feb/May/Aug/Nov
    timeout=7200,
    secrets=secrets,
    memory=1024,
    image=pdf_image,
)
def run_quarterly_ffiec_ingest():
    import os
    import subprocess
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    r = subprocess.run(
        ["python3", "-m", "fee_crawler", "ingest-call-reports",
         "--auto-quarter"],  # flag to auto-detect current quarter
        capture_output=True, text=True, env=env,
    )
    return r.stdout[-1000:] if r.stdout else r.stderr[-500:]
```

**Important:** The Modal free tier is limited to 5 cron jobs. Current crons occupy: 2am (discovery), 3am (pdf-extract), 4am (browser-extract), 6am (post-processing), 10am (ingest_data). The `ingest_data` function already runs `ingest-call-reports` weekly on Mondays. The quarterly FFIEC ingestion should be integrated into the `ingest_data` function with a date-based gate (quarterly check), not as a new 6th cron.

### Existing institution_financials Schema (Postgres)

```sql
-- Source: scripts/migrate-schema.sql (VERIFIED: codebase)
CREATE TABLE IF NOT EXISTS institution_financials (
    id                      BIGSERIAL PRIMARY KEY,
    crawl_target_id         BIGINT NOT NULL REFERENCES crawl_targets(id),
    report_date             TEXT NOT NULL,         -- '2024-12-31'
    source                  TEXT NOT NULL,         -- 'ffiec' | 'ncua' | 'fdic'
    total_assets            BIGINT,               -- thousands of dollars
    total_deposits          BIGINT,
    total_loans             BIGINT,
    service_charge_income   BIGINT,
    other_noninterest_income BIGINT,
    net_interest_margin     FLOAT,
    efficiency_ratio        FLOAT,
    roa                     FLOAT,
    roe                     FLOAT,
    tier1_capital_ratio     FLOAT,
    branch_count            INT,
    employee_count          INT,
    member_count            INT,
    raw_json                JSONB,
    fetched_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_revenue           BIGINT,
    fee_income_ratio        FLOAT,
    UNIQUE(crawl_target_id, report_date, source)
);
```

**D-10 migration required:** The current schema requires `crawl_target_id NOT NULL`, which conflicts with D-10 (ingest all data regardless of crawl_target match). Phase 58 will add a migration to:
1. `ALTER TABLE institution_financials ALTER COLUMN crawl_target_id DROP NOT NULL;`
2. Add a `source_cert_number TEXT` column for deduplication of unmatched rows.
3. Create a partial unique index for unmatched rows: `CREATE UNIQUE INDEX idx_financials_unmatched ON institution_financials(source_cert_number, report_date, source) WHERE crawl_target_id IS NULL;`
4. The existing `UNIQUE(crawl_target_id, report_date, source)` constraint remains valid for matched rows (non-NULL crawl_target_id).

### Existing Query Layer (already built)

| Function | Location | What It Returns |
|----------|----------|-----------------|
| `getFinancialsByInstitution(targetId)` | `financial.ts` | All quarters for one institution (all columns) |
| `getInstitutionRevenueTrend(targetId, n)` | `call-reports.ts` | Last N quarters: SC income, fee ratio, YoY% |
| `getInstitutionPeerRanking(targetId)` | `call-reports.ts` | Tier, rank, peer count, peer medians |

These three functions together provide everything needed for the hero cards. **No new query functions are required** unless a percentile rank beyond SC income is desired.

### Current Institution Page Structure

```
/admin/institution/[id]/page.tsx
+-- Header (breadcrumbs + institution name + metadata)
+-- Profile Card + Admin Actions (2-col grid)
+-- Financial Context (conditional, currently: 4 small stat cards + revenue trend table)
+-- Extracted Fees (FeeTable)
+-- Agent History
+-- Crawl History
```

The "Financial Context" section (lines 165-273) uses small `.rounded border` cards. Phase 58 replaces this with a proper hero card section placed at the same position, above the fee table.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Sparkline charts | Custom SVG chart | `src/components/sparkline.tsx` -- already handles min/max scaling, area fill, trending dot |
| Peer percentile calculation | Custom SQL percentile | `getInstitutionPeerRanking()` already computes rank, peer count, and medians |
| SQLite->Postgres placeholder conversion | Custom regex | `_sqlite_to_pg()` in `fee_crawler/db.py` -- or better, write Postgres-native SQL directly |
| FFIEC CDR download HTTP form | Custom form parser | FDIC BankFind REST API is cleaner and already used in `ingest_fdic.py` |
| CSV parsing | Custom parser | Python `csv.DictReader` already used in both ingestion scripts |
| Quarterly date math | Custom date logic | Python `datetime` + `calendar` -- or parse from FFIEC report_date field directly |
| Upsert conflict handling | Manual check-then-insert | Postgres `ON CONFLICT (crawl_target_id, report_date, source) DO UPDATE` |

---

## Common Pitfalls

### Pitfall 1: Sparkline data order
**What goes wrong:** `getInstitutionRevenueTrend()` returns rows newest-first (DESC). Sparkline renders oldest-to-newest (left to right). If you pass the array un-reversed, the chart shows time running backwards.
**How to avoid:** `.reverse()` or `[...trend].reverse()` before extracting `data` for the Sparkline component.
**Warning sign:** Sparkline trending dot is red on a growing institution or green on a shrinking one.

### Pitfall 2: FFIEC amounts stored in thousands, NCUA in whole dollars
**What goes wrong:** Mixing scaling. FFIEC RIAD fields are in thousands of dollars. NCUA ACCT fields are in whole dollars. The existing code applies `_apply_ffiec_scaling()` (x1000 for FFIEC) and `// 1000` for NCUA to normalize to thousands in the DB. If you bypass this, charts show wildly inconsistent numbers.
**How to avoid:** Preserve `_apply_ffiec_scaling()` in the ported code. Verify: `service_charge_income` in the DB should be in the same unit (thousands) for both sources.
**Warning sign:** NCUA institutions show ~1000x larger numbers than equivalent FDIC banks.

### Pitfall 3: Modal cron limit (5 jobs)
**What goes wrong:** Adding a new `@app.function(schedule=modal.Cron(...))` for quarterly FFIEC ingestion exceeds the free-tier 5-cron limit.
**How to avoid:** Add quarterly FFIEC ingestion as a date-gated branch inside the existing `ingest_data()` function. Check if it's the 15th day of a quarter-end month before running the heavy ingest.
**Warning sign:** Modal deploy fails with cron limit error.

### Pitfall 4: FFIEC CDR bulk download requires form POST
**What goes wrong:** `_FFIEC_BULK_URL` in the existing code is a page URL, not a direct download endpoint. A plain GET request returns HTML, not CSV.
**How to avoid:** Use the FDIC BankFind Suite API (`https://banks.data.fdic.gov/api/financials`) for the FFIEC-equivalent data. It's a standard REST API with pagination, no form interaction needed. The existing `ingest_fdic.py` already shows this pattern.
**Warning sign:** Download returns HTML or 405 error.

### Pitfall 5: 300K row backfill timeout on Modal
**What goes wrong:** Downloading and inserting ~60 quarters x ~5K institutions in a single Modal function run exceeds the 7200-second timeout.
**How to avoid:** The backfill should be a separate CLI command (`ingest-call-reports --backfill --from-year 2010`), run manually once (not via cron). Batch by year (12 quarter-months per year = 12 download/insert cycles), commit after each quarter.
**Warning sign:** Modal function times out partway through 2015.

### Pitfall 6: institution_financials requires NOT NULL crawl_target_id
**What goes wrong:** D-10 says "ingest all FFIEC data regardless of crawl_target match." But the current schema has `crawl_target_id BIGINT NOT NULL`. Inserting unmatched rows fails with constraint violation.
**How to avoid:** Run a migration BEFORE ingestion to `ALTER TABLE institution_financials ALTER COLUMN crawl_target_id DROP NOT NULL`. Add a `source_cert_number TEXT` column and a partial unique index for deduplication of unmatched rows. Then the ingestion scripts can insert with `crawl_target_id = NULL` for unmatched institutions.
**Warning sign:** Insert errors for ~80% of FFIEC rows (most institutions aren't in crawl_targets yet).

### Pitfall 7: `getInstitutionPeerRanking` asset tier boundaries use raw asset values
**What goes wrong:** `institution_financials.total_assets` is stored in **thousands** of dollars. The tier boundaries in `getInstitutionPeerRanking()` compare `total_assets` against constants like `100_000_000` (100 billion), which means the tier comparison is against thousandths-of-a-dollar values, making every institution look "mega."
**What to verify:** Check the actual values in the DB. If `formatAssets()` displays "$2.1B" from a stored value of `2100000`, then the boundaries in `getInstitutionPeerRanking()` need to be divided by 1000 (e.g., `100_000` not `100_000_000` for the $100M micro threshold). This is a pre-existing bug to verify, not introduce.
**Warning sign:** All institutions show tier "mega" in peer ranking.

---

## Code Examples

### NCUA Backfill Loop (quarterly, 2010 to present)

```python
# Recommended pattern for ingest_ncua.py historical backfill
import calendar

def iter_quarters(from_year: int, to_year: int):
    """Yield (year, month) for each quarter-end from from_year to to_year."""
    for year in range(from_year, to_year + 1):
        for month in (3, 6, 9, 12):
            yield year, month

for year, month in iter_quarters(2010, 2025):
    zip_url = NCUA_ZIP_BASE.format(year=year, month=month)
    # ... download, parse, upsert with retries
```

### Postgres Upsert (replacing SQLite ON CONFLICT)

```python
# Source: fee_crawler/db.py _sqlite_to_pg() + ingest_ncua.py pattern
cur.execute(
    """INSERT INTO institution_financials
       (crawl_target_id, source_cert_number, report_date, source,
        total_assets, total_deposits, service_charge_income,
        total_revenue, fee_income_ratio, raw_json)
       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
       ON CONFLICT (crawl_target_id, report_date, source)
         WHERE crawl_target_id IS NOT NULL
         DO UPDATE SET
         total_assets = EXCLUDED.total_assets,
         total_deposits = EXCLUDED.total_deposits,
         service_charge_income = EXCLUDED.service_charge_income,
         total_revenue = EXCLUDED.total_revenue,
         fee_income_ratio = EXCLUDED.fee_income_ratio,
         raw_json = EXCLUDED.raw_json,
         fetched_at = NOW()""",
    (target_id, cert_number, report_date, source,
     total_assets, total_deposits, service_charge_income,
     total_revenue, fee_income_ratio, json.dumps(raw)),
)
```

### Staleness Badge (TypeScript, Claude's Discretion)

```tsx
// Recommended: show badge when most recent report_date is > 95 days old
// FFIEC releases ~45 days after quarter end; 95 days = one quarter + buffer
function getStalenessLabel(latestReportDate: string): string | null {
  const reportDate = new Date(latestReportDate);
  const daysSince = (Date.now() - reportDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 95) return "Data may be stale";
  return null;
}

// In JSX:
{stalenessLabel && (
  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700">
    {stalenessLabel}
  </span>
)}
```

### Query to Derive Sparkline Data for Hero Cards

```typescript
// Source: financial.ts getFinancialsByInstitution() -- already returns all quarters
// Extract sparkline data from the full history array:
const financials = await getFinancialsByInstitution(institutionId);
const assetSparkline = [...financials]
  .reverse()                                        // oldest first
  .map(f => f.total_assets ?? 0)
  .filter(v => v > 0);

const scSparkline = [...financials]
  .reverse()
  .map(f => f.service_charge_income ?? 0)
  .filter(v => v > 0);
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| FFIEC CDR form POST download | FDIC BankFind REST API | JSON pagination, no form auth, simpler retry logic |
| SQLite `?` placeholders | Postgres `%s` + ON CONFLICT | Upserts work correctly across re-ingestion runs |
| Revenue trend as plain table | Hero cards with sparklines | Immediately actionable; matches consulting report aesthetic |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FDIC BankFind API (`banks.data.fdic.gov/api/financials`) provides RIAD4080/RIAD4079/RIAD4107 equivalent fields back to 2010 | Architecture Patterns | If fields missing pre-2015, backfill is incomplete; fallback to FFIEC bulk ZIP |
| A2 | NCUA quarterly ZIPs are available back to 2010 at the same URL pattern | Architecture Patterns | NCUA may use different URL patterns for older archives |
| A3 | `institution_financials.total_assets` stores values in thousands (matching FDIC convention, not raw dollars) | Pitfall 7 | If raw dollars, tier boundary comparisons in `getInstitutionPeerRanking` are correct as written; if thousands, they need a 1000x adjustment |
| A4 | Modal free tier limits to 5 scheduled crons | Pitfall 3 | If paid tier, a new cron is fine |

---

## Open Questions (RESOLVED)

1. **FDIC BankFind income field coverage** (RESOLVED)
   - **Resolution:** FDIC BankFind API **does** provide income statement fields. Confirmed in `ingest_fdic.py` lines 14-33: `FDIC_FINANCIAL_FIELDS` includes `SC` (RIAD4080 service charges), `NONII` (non-interest income), `INTINC` (interest income), `EINTEXP` (interest expense), `NETINC` (net income), plus ratios (`NIMY`, `EEFFR`, `ROA`, `ROE`, `RBC1AAJ`) and counts (`NUMEMP`, `OFFDOM`).
   - **Decision:** Use FDIC BankFind REST API for bank backfill. No need for FFIEC CDR bulk ZIP download. The `ingest_call_reports.py` script should use the FDIC BankFind API pattern from `ingest_fdic.py` for its `--backfill` mode.
   - **Note:** `SC` (service charges) is returned in whole dollars by the FDIC API while all other fields are in thousands. `ingest_fdic.py` line 148 already handles this: `sc = sc_raw // 1000`.

2. **total_assets unit convention** (RESOLVED)
   - **Resolution:** `total_assets` in the DB is stored in **thousands of dollars**. Confirmed in `ingest_fdic.py` line 15: `ASSET` field comment reads "total assets (in thousands)". The code inserts `_safe_int(d.get("ASSET"))` directly (line 201) without scaling, meaning the FDIC API returns thousands and the DB stores thousands. NCUA ingestion converts whole dollars to thousands before insert (existing code, confirmed in Pitfall 2).
   - **Impact on Pitfall 7:** The tier boundaries in `getInstitutionPeerRanking()` using values like `100_000_000` represent $100B (since the stored value is in thousands: 100,000,000 thousands = $100B). This appears correct for the "mega" tier. The micro tier boundary needs verification against the actual threshold definition.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| psycopg2-binary | Python pipeline | Confirmed in requirements.txt | 2.9+ | -- |
| requests | Python pipeline | Confirmed in requirements.txt | 2.31+ | -- |
| DATABASE_URL env | Postgres connection | Set in Modal secrets + .env.local | -- | -- |
| FFIEC CDR / FDIC BankFind | Historical backfill | Public internet | -- | Local CSV files |
| NCUA 5300 ZIP server | NCUA ingestion | Public internet, verified in existing code | -- | Cached local ZIPs |
| Modal | Quarterly cron | Deployed, working | -- | Manual CLI run |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/crawler-db/` |
| Full suite command | `npx vitest run` |
| Python tests | `python -m pytest fee_crawler/tests/ -x` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COV-03 | FFIEC ingestion populates `institution_financials` with bank financial rows | Integration (Python) | `python -m pytest fee_crawler/tests/test_ingest_call_reports.py -x` | Wave 0 |
| COV-03 | NCUA ingestion populates `institution_financials` with CU financial rows | Integration (Python) | `python -m pytest fee_crawler/tests/test_ingest_ncua.py -x` | Wave 0 |
| ADM-05 | Hero stat cards render with correct values from financial data | Type test (TS) | `npx vitest run src/lib/crawler-db/financial.test.ts` | Wave 0 |
| ADM-05 | Sparkline receives oldest-first array (not reversed) | Unit test (TS) | `npx vitest run src/components/sparkline.test.tsx` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/crawler-db/call-reports.test.ts`
- **Per wave merge:** `npx vitest run && python -m pytest fee_crawler/tests/ -x`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `fee_crawler/tests/test_ingest_call_reports.py` -- tests for Postgres port of FFIEC ingestion (mock psycopg2)
- [ ] `fee_crawler/tests/test_ingest_ncua.py` -- tests for Postgres port of NCUA ingestion (mock psycopg2)
- [ ] `src/lib/crawler-db/financial.test.ts` -- tests for `getFinancialsByInstitution` hero card data shape

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | -- |
| V3 Session Management | no | -- |
| V4 Access Control | yes | `requireAuth("view")` already called in institution page |
| V5 Input Validation | yes | `institutionId` validated with `isNaN()` before DB query; `targetId` typed as `number` in TypeScript |
| V6 Cryptography | no | -- |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `report_date` or `cert_number` user input | Tampering | Not applicable -- ingestion scripts run server-side, no user input |
| SQL injection via `cert_number` in lookup | Tampering | Use `%s` parameterized queries in psycopg2 -- never string interpolation |
| SSRF via configurable FFIEC URL | Elevation of Privilege | URL is hardcoded constant, not user-provided |

---

## Sources

### Primary (HIGH confidence)

- `fee_crawler/commands/ingest_call_reports.py` -- field mappings, scaling logic, CSV parse pattern
- `fee_crawler/commands/ingest_ncua.py` -- full FS220/FS220A field mapping, ZIP parse, upsert SQL
- `fee_crawler/commands/ingest_fdic.py` -- FDIC BankFind API fields (SC, NONII, INTINC, EINTEXP, NETINC, NIMY, EEFFR, ROA, ROE, RBC1AAJ), scaling conventions, cert matching pattern
- `fee_crawler/db.py` -- `PostgresDatabase` class, `_sqlite_to_pg()`, migration pattern
- `scripts/migrate-schema.sql` -- full Postgres `institution_financials` schema with all columns
- `src/lib/crawler-db/financial.ts` -- all query functions including `getFinancialsByInstitution`
- `src/lib/crawler-db/call-reports.ts` -- `getInstitutionRevenueTrend`, `getInstitutionPeerRanking`
- `src/app/admin/institution/[id]/page.tsx` -- current page layout, existing imports
- `src/components/sparkline.tsx` -- component interface
- `fee_crawler/modal_app.py` -- cron patterns, 5-function limitation comment, `ingest_data` weekly gate

### Secondary (MEDIUM confidence)

- `src/app/admin/districts/[id]/page.tsx` -- card layout and design system reference for hero cards

### Tertiary (LOW confidence -- marked ASSUMED)

- FDIC BankFind Suite API field availability for RIAD codes back to 2010 [A1]
- NCUA ZIP URL pattern availability for 2010 archives [A2]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified in codebase
- Architecture: HIGH -- migration pattern verified in Phase 56 artifacts, query layer verified in source
- Pitfalls: HIGH for items verified in code (scaling, modal limit, sparkline order); MEDIUM for FFIEC download method
- UI design pattern: HIGH -- district page provides working reference

**Research date:** 2026-04-10
**Valid until:** 2026-07-10 (stable domain -- FFIEC/NCUA APIs change infrequently)
