---
module: FeeSchedule Hub
date: 2026-02-16
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - "NaNmo ago displayed on Fed content articles in the UI"
  - "Fed in Print research items had empty string for published_at field"
  - "new Date('') returns NaN in JavaScript, causing timeAgo to produce 'NaNmo ago'"
root_cause: missing_validation
resolution_type: code_fix
severity: medium
tags: [date-parsing, rss-ingestion, timeago, nan, feedparser, defensive-coding]
---

# Troubleshooting: "NaNmo ago" Displayed on Fed Content Articles

## Problem
Fed content articles (speeches and research papers) displayed "NaNmo ago" instead of a human-readable relative timestamp. The root cause was twofold: the Python RSS ingestion stored empty strings for dates when the RSS feed lacked a `published` field, and the TypeScript `timeAgo()` function did not guard against empty or unparseable date strings.

## Environment
- Module: FeeSchedule Hub (Fed District Commentary feature)
- Framework: Next.js 16.1.6, Python 3.x with feedparser
- Affected Components: `fee_crawler/commands/ingest_fed_content.py` (Python ingestion), `src/lib/format.ts` (TypeScript display)
- Date: 2026-02-16

## Symptoms
- "NaNmo ago" text displayed next to Fed research articles in the admin UI
- Only affected research items from Fed in Print RSS feeds, not Board speeches
- The `published_at` column in `fed_content` table contained empty strings for all 300 research items

## What Didn't Work

**Direct solution:** The problem was identified and fixed on the first attempt after inspecting the database and tracing the data flow.

## Solution

Two fixes applied — one defensive (TypeScript) and one at the root cause (Python ingestion).

**Fix 1: Defensive guard in `timeAgo()` (src/lib/format.ts)**

```typescript
// Before (broken):
export function timeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  // ... when dateString is "", new Date("") returns NaN
  // NaN propagates through all math, producing "NaNmo ago"

// After (fixed):
export function timeAgo(dateString: string): string {
  if (!dateString) return "";
  const now = Date.now();
  const then = new Date(dateString).getTime();
  if (isNaN(then)) return "";
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  // ...
```

**Fix 2: Robust date extraction in Python ingestion (fee_crawler/commands/ingest_fed_content.py)**

```python
# Before (broken) — research section only tried `entry.get("published", "")`:
published = entry.get("published", "")
if not published and hasattr(entry, "published_parsed") and entry.published_parsed:
    from time import strftime
    published = strftime("%Y-%m-%d", entry.published_parsed)

# After (fixed) — shared helper tries multiple feedparser date fields:
def _extract_date(entry: dict) -> str:
    """Extract the best available date from a feedparser entry."""
    for field in ("published", "updated"):
        val = entry.get(field, "")
        if val:
            return val
    for field in ("published_parsed", "updated_parsed"):
        parsed = entry.get(field)
        if parsed:
            return strftime("%Y-%m-%d", parsed)
    return ""

# Used in both speeches and research sections:
published = _extract_date(entry)
```

**Commands run:**
```bash
# Re-ingest to update stored dates
python -m fee_crawler ingest-fed-content

# Verify no empty dates remain
sqlite3 data/crawler.db "SELECT COUNT(*) FROM fed_content WHERE published_at = '' OR published_at IS NULL;"
# Result: 0
```

## Why This Works

1. **Root cause:** Fed in Print RSS feeds do not include a `published` field in their entries. The feedparser library parses whatever fields are available — for these feeds, only `updated` or `updated_parsed` contained date information. The original code only checked `published` and `published_parsed`, missing the `updated` variants entirely.

2. **Why `new Date("")` produces NaN:** JavaScript's `Date` constructor returns `Invalid Date` for empty strings. Calling `.getTime()` on an invalid date returns `NaN`, which propagates through all arithmetic operations. The `timeAgo` function performed `now - NaN = NaN`, then `Math.floor(NaN / ...) = NaN`, producing "NaNmo ago".

3. **Defense in depth:** The TypeScript fix guards against any future cases where dates might be missing or malformed, regardless of the data source. The Python fix addresses the actual data quality issue at ingestion time.

## Prevention

- When parsing RSS/Atom feeds with feedparser, always try multiple date fields (`published`, `updated`, and their `_parsed` variants). Different feeds expose dates differently.
- Display functions that format external data should always validate inputs before processing. Add guards for empty strings, null, undefined, and NaN at the formatting layer.
- After ingesting external data, spot-check key fields with SQL queries like `SELECT COUNT(*) WHERE field = '' OR field IS NULL` to catch missing data early.
- The `_extract_date()` helper pattern (try multiple fields in priority order) is reusable for any feedparser-based ingestion.

## Related Issues

No related issues documented yet.
