# fix: Admin page crashes from SQLite→Postgres type mismatches

## Overview

The migration from SQLite (better-sqlite3) to Postgres (postgres.js) introduced 21 runtime issues across admin pages. SQLite returns all values as strings. Postgres returns typed values: `Date` objects for timestamps, parsed objects for JSONB, `string` for `bigint`/`numeric`. Code that assumed string returns crashes or produces wrong output.

## 10 Critical Issues (crash in production)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 1 | `src/lib/crawler-db/fees.ts:355` | `validation_flags = '[]'` on JSONB | `= '[]'::jsonb` |
| 2 | `src/app/admin/review/review-table.tsx:21` | `JSON.parse(flags)` on parsed array | Guard with typeof |
| 3 | `src/app/admin/review/outlier-view.tsx:21` | `JSON.parse(flags)` on parsed array | Guard with typeof |
| 4 | `src/app/admin/review/[id]/page.tsx:18` | `JSON.parse(flags)` on parsed array | Guard with typeof |
| 5 | `src/app/admin/review/categories/[category]/category-review-client.tsx:56` | `JSON.parse(flags)` on parsed array | Guard with typeof |
| 6 | `src/app/admin/ops/ops-client.tsx:755` | `JSON.parse(job.params_json)` on parsed object | Guard with typeof |
| 7 | `src/app/admin/research/[agentId]/save-article-action.ts:22` | `.startsWith()` on Date object | `new Date().toISOString()` |
| 8 | `src/app/admin/review/categories/[category]/page.tsx:32` | `=== "[]"` always false for JSONB | Array.isArray check |
| 9 | `src/app/admin/review/categories/[category]/category-review-client.tsx:54` | `=== "[]"` always false for JSONB | Array.isArray check |
| 10 | `src/lib/crawler-db/pipeline-runs.ts:81` | Arithmetic on string COUNT results | Number() wrap |

## 11 Moderate Issues (wrong output)

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 11 | `src/lib/crawler-db/dashboard.ts:496` | `::date` returns Date, typed as string | toISOString() |
| 12 | `src/app/admin/ops/ops-client.tsx:774` | Date rendered directly | Format with toISOString |
| 13 | `src/lib/crawler-db/fees.ts:345-357` | SUM() returns strings | Number() wrap |
| 14 | `src/lib/crawler-db/fees.ts:351` | ROUND()::numeric returns string | Number() wrap |
| 15 | `src/lib/crawler-db/geographic.ts:131` | ROUND()::numeric returns string | Number() wrap |
| 16 | `src/lib/crawler-db/fee-revenue.ts:28-108` | Multiple ROUND() return strings | Number() wrap |
| 17 | `src/lib/crawler-db/quality.ts:165,244` | ROUND() coverage_pct returns string | Number() wrap |
| 18 | `src/lib/crawler-db/types.ts:21,41-44` | Types wrong for JSONB/Date | Update types |
| 19 | `src/lib/crawler-db/ops.ts:6` | params_json typed as string | Update to unknown |
| 20 | `src/lib/crawler-db/pipeline-runs.ts:8,13` | JSONB typed as string | Update to unknown |
| 21 | `src/lib/crawler-db/news.ts:16` | NOW()::text creates text timestamps | Use TIMESTAMPTZ |

## Implementation

### Step 1: Add utility helpers (`src/lib/pg-helpers.ts`)

```typescript
// Safe JSONB parse — handles both string (SQLite) and parsed object (Postgres)
export function safeJsonb<T>(val: string | T | null | undefined): T | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  return val as T;
}

// Safe date to ISO string
export function toISO(val: string | Date | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

// Safe empty JSONB check
export function isEmptyJsonb(val: unknown): boolean {
  if (!val) return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'string') return val === '[]' || val === 'null' || val === '';
  return false;
}
```

### Step 2: Fix all 10 critical issues

### Step 3: Fix all 11 moderate issues

### Step 4: Update type declarations in types.ts

## Acceptance Criteria

- [ ] All 10 critical issues fixed (no crashes)
- [ ] All 11 moderate issues fixed (correct display)
- [ ] `/admin` loads without error
- [ ] `/admin/pipeline` loads without error
- [ ] `/admin/review` loads without error
- [ ] `/admin/data-quality` loads without error
- [ ] `/admin/ops` loads without error
- [ ] `/admin/review/categories` loads without error
- [ ] 0 TypeScript errors
- [ ] npm run build passes
