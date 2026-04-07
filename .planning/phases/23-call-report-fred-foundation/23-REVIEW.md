---
phase: 23-call-report-fred-foundation
reviewed: 2026-04-07T19:00:40Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - fee_crawler/commands/ingest_fred.py
  - fee_crawler/config.py
  - src/lib/crawler-db/call-reports.test.ts
  - src/lib/crawler-db/call-reports.ts
  - src/lib/crawler-db/fed.test.ts
  - src/lib/crawler-db/fed.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-04-07T19:00:40Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This phase adds the Call Report and FRED economic indicator data layer — Python ingestion
(`ingest_fred.py`), Pydantic config (`config.py`), and TypeScript query functions with
tests (`call-reports.ts`, `fed.ts`). The overall architecture is sound: error handling
is consistent, the `* 1000` scaling for thousands-stored monetary values is correct and
well-tested, and the YoY ratio logic is defensible.

One critical issue exists: `Number(null)` coercion in `getFredSummary` converts missing
FRED values to `0` instead of preserving `null`, which will cause downstream consumers
to display a 0% fed funds rate or 0% unemployment as live data rather than "no data."

Additional warnings cover: a potential API key committed to `config.yaml`, silent error
swallowing in `getTopRevenueInstitutions`, a YoY gap assumption in `getRevenueTrend`,
and empty-password seed users in `AuthConfig`.

## Critical Issues

### CR-01: `Number(null)` coerces missing indicator values to `0` in `getFredSummary`

**File:** `src/lib/crawler-db/fed.ts:362`
**Issue:** The `DISTINCT ON` query result type declares `value: number | null`, but the
row is stored as `value: Number(row.value)`. `Number(null)` evaluates to `0` in
JavaScript. When a series is absent from the DB (or has a null value), `byId` stores
`{ value: 0 }`. The subsequent read at line 392 —
`byId.get("FEDFUNDS")?.value ?? null` — returns `0` (not `null`) because `0` is
falsy but `??` only catches `null`/`undefined`, not `0`. Callers will see
`fed_funds_rate: 0` and treat it as live data rather than missing data.

**Fix:**
```typescript
// In the byId-building loop (line 360-363), preserve null:
byId.set(row.series_id, {
  value: row.value !== null && row.value !== undefined ? Number(row.value) : null,
  observation_date: date,
});

// Update the byId type accordingly:
const byId = new Map<string, { value: number | null; observation_date: string }>();
```
Then the existing `?? null` at line 392 will correctly return `null` for missing series.

## Warnings

### WR-01: FRED API key may be committed to `config.yaml`

**File:** `fee_crawler/config.py:59`
**Issue:** `FREDConfig.api_key: str = ""` creates a field that YAML-loading will
happily populate from `config.yaml`. If a developer puts their real key in
`config.yaml` and commits it, the key is exposed in version history. The project
`CLAUDE.md` shows `config.local.yaml` is checked first (load order in `load_config`),
but `config.yaml` is the committed fallback — and there is no runtime guard preventing
a real key from being written there.

**Fix:** Remove `api_key` from `FREDConfig` entirely and make `_get_api_key()` the
sole source of truth (env var only):
```python
class FREDConfig(BaseModel):
    base_url: str = "https://api.stlouisfed.org/fred"
    series: list[str] = [...]
    # api_key intentionally omitted — use FRED_API_KEY env var
```
If config-file keys are required, add a note in the field doc that the value must not
be committed and ensure `config.yaml` is in `.gitignore`.

### WR-02: Silent error suppression in `getTopRevenueInstitutions`

**File:** `src/lib/crawler-db/call-reports.ts:148`
**Issue:** The `catch` block is empty — no logging, no context. Every other exported
function in this file logs `console.warn('[functionName]', e)` on error. A DB failure
in `getTopRevenueInstitutions` will silently return `[]`, making it impossible to
distinguish "no institutions have revenue data yet" from "the database is down."

**Fix:**
```typescript
  } catch (e) {
    console.warn('[getTopRevenueInstitutions]', e);
    return [];
  }
```

### WR-03: YoY comparison in `getRevenueTrend` assumes no quarter gaps

**File:** `src/lib/crawler-db/call-reports.ts:76-83`
**Issue:** YoY is computed by comparing `snapshots[i]` to `snapshots[i + 4]` on the
assumption that 4 positions back in the sorted result is exactly one year prior. If
any quarter has zero `service_charge_income > 0` rows (e.g., a quarter with only
rejected fees), that quarter is omitted from the result set by the `WHERE` filter,
and the offset-4 assumption breaks silently — the "prior year" value will actually
be from a different quarter, producing a meaningless percentage.

**Fix:** Compare by quarter label rather than positional index:
```typescript
// Build a lookup map after mapping rows
const byQuarter = new Map(snapshots.map((s) => [s.quarter, s]));

for (const snap of snapshots) {
  const priorLabel = priorYearQuarter(snap.quarter); // derive "2023-Q4" from "2024-Q4"
  const prior = byQuarter.get(priorLabel);
  if (prior && prior.total_service_charges > 0) {
    snap.yoy_change_pct =
      ((snap.total_service_charges - prior.total_service_charges) /
        prior.total_service_charges) * 100;
  }
}
```
Where `priorYearQuarter` decrements the year in the `YYYY-QN` label.

### WR-04: Empty-password seed users created when env vars are unset

**File:** `fee_crawler/config.py:83-96`
**Issue:** `AuthConfig.seed_users` is evaluated at class-definition time (Pydantic
default). If `BFI_ADMIN_PASSWORD` or `BFI_ANALYST_PASSWORD` are not set in the
environment when the module is imported, the seed users are created with
`password: ""`. Downstream, if `bcryptjs` accepts an empty string as a valid password,
any admin-username + empty-password combination becomes a valid credential.

**Fix:** Use a validator or `model_validator` to raise an error if passwords are empty
when seed users are actually used, or use `Field(default_factory=...)` with a runtime
check:
```python
class SeedUser(BaseModel):
    username: str
    password: str
    display_name: str
    role: str = "viewer"

    @model_validator(mode='after')
    def password_must_not_be_empty(self) -> 'SeedUser':
        if not self.password:
            raise ValueError(
                f"Seed user '{self.username}' has an empty password. "
                f"Set {self.username.upper()}_PASSWORD env var."
            )
        return self
```
If empty passwords are intentional for local-only dev, document that explicitly in the
class docstring.

## Info

### IN-01: `getFredSummary` fetches CPIAUCSL twice

**File:** `src/lib/crawler-db/fed.ts:353-389`
**Issue:** The first `DISTINCT ON` query includes `CPIAUCSL` in its `IN (...)` filter
(line 354), but the result is never used for CPI in the return value — CPI is handled
exclusively by the separate 13-row fetch at lines 372-389. The CPIAUCSL row from the
first query is fetched and stored in `byId` but never read. This is a minor wasted
query slot, not a bug.

**Fix:** Remove `'CPIAUCSL'` from the first query's `IN` list:
```sql
WHERE series_id IN ('FEDFUNDS', 'UNRATE', 'UMCSENT')
```

### IN-02: `ingest_fred.py` applies `REQUEST_DELAY` before every attempt including retries

**File:** `fee_crawler/commands/ingest_fred.py:80`
**Issue:** `time.sleep(REQUEST_DELAY)` runs before the `for attempt in range(MAX_RETRIES)`
loop. On a retry after exponential backoff (`time.sleep(2 ** attempt)` at line 94),
the next iteration will sleep the `REQUEST_DELAY` (0.5s) again before the retry
request. This means retries accumulate two sleeps: the backoff + the rate-limit delay.
Functionally correct but slightly longer than intended.

**Fix:** Move `time.sleep(REQUEST_DELAY)` inside the loop, or only apply it on the
first attempt:
```python
for attempt in range(MAX_RETRIES):
    if attempt == 0:
        time.sleep(REQUEST_DELAY)
    try:
        ...
    except requests.exceptions.RequestException as e:
        if attempt < MAX_RETRIES - 1:
            print(f"  Retry {attempt + 1}/{MAX_RETRIES}: {e}")
            time.sleep(2 ** attempt)
        ...
```

### IN-03: `getRevenueByCharter` uses `sql.unsafe()` with dynamic SQL fragment

**File:** `src/lib/crawler-db/call-reports.ts:174-197`
**Issue:** `quarterFilter` is a string containing either a parameterized `$1`
placeholder or a hardcoded subquery, and it is interpolated directly into the SQL
string passed to `sql.unsafe()`. The value is not user-supplied (it is constructed
from a ternary on a typed function argument), so there is no injection risk today.
However, the pattern would become dangerous if `quarter` were ever passed through from
an HTTP request without validation. The code comment explaining the two cases would
make future maintenance clearer.

**Fix:** Add a brief comment above `quarterFilter` and validate the `quarter` parameter
format if it originates from user input upstream:
```typescript
// quarterFilter is one of two hardcoded SQL fragments; never interpolate user input here.
const quarterFilter = quarter
  ? `AND TO_CHAR(...) = $1`
  : `AND inf.report_date = (SELECT MAX(...) ...)`;
```

---

_Reviewed: 2026-04-07T19:00:40Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
