# Technology Stack — v9.0 Data Foundation & Production Polish

**Project:** Bank Fee Index
**Researched:** 2026-04-09
**Confidence:** HIGH — all new dependencies verified via npm and official docs; existing stack capabilities verified against Tailwind v4 and TanStack Table v8 documentation.
**Scope:** NEW additions for v9.0 only. The v8.0 validated stack (Next.js 16, React 19, Tailwind v4, `postgres` client, Anthropic SDK, Vercel AI SDK, Stripe, `radix-ui`, Recharts, `@react-pdf/renderer`, Zustand) is NOT reconsidered here.

---

## Decision Summary

| Capability | Decision | Rationale |
|---|---|---|
| Canonical fee matching (JS) | `fuse.js` in-process | Lightweight, zero deps, no server, adequate for 200-key taxonomy lookup in browser |
| Canonical fee matching (Python) | `rapidfuzz` 3.14 | C++ backed, 10-100x faster than fuzzywuzzy, same API, pip installable |
| DB-level duplicate detection | `pg_trgm` extension (Supabase) | Already available on Supabase Postgres; GIN index makes similarity queries sub-second at 15K rows |
| LLM-assisted classification | Existing Anthropic SDK (claude-haiku) | Zero new dep; batch API for backfill, streaming for real-time |
| Sortable tables | `@tanstack/react-table` v8.21 | Headless, zero style opinion, full Tailwind freedom, no new style conflict |
| Responsive layout | Tailwind v4 container queries (already installed) | Built-in to v4 core; no plugin needed |
| Report PDF layout | `@react-pdf/renderer` v4.4 (already installed) | Already validated in v8.0 research; stat callout layout pattern confirmed |
| Report chart embedding | SVG-to-data-URI via Recharts (already installed) | Recharts renders SVG; serialize to data URI before PDF API route call |

---

## New Dependencies Required

Three new packages total. Everything else reuses existing installs.

### JavaScript / Node

| Library | Version | Purpose | Why |
|---|---|---|---|
| `fuse.js` | `^7.0.0` | Client-side fuzzy canonical key lookup when reviewing fees in admin UI | 15KB, zero deps, Bitap algorithm, handles typos in category names. Used in admin Review page to suggest canonical_fee_key while analyst types. |
| `@tanstack/react-table` | `^8.21.3` | Headless sort/filter engine for all admin tables | Works as a `"use client"` hook. Provides getSortedRowModel + column meta. Zero style opinion — plugs directly into existing Tailwind table markup. v9 alpha is not production-ready. |

```bash
npm install fuse.js @tanstack/react-table
```

### Python (fee_crawler)

| Library | Version | Purpose | Why |
|---|---|---|---|
| `rapidfuzz` | `>=3.14` | Fuzzy string matching in auto-classification pipeline | C++-backed Levenshtein + token_set_ratio. 10-100x faster than fuzzywuzzy. Required for processing 15K+ raw category strings against 200-key canonical taxonomy without blocking the Modal worker. |

```bash
pip install rapidfuzz
```

---

## Already Present — No New Install Needed

| Library | In repo? | v9.0 Usage |
|---|---|---|
| `@react-pdf/renderer` | Yes — validated v8.0 | Report PDF export already wired via `serverExternalPackages`; v9 adds richer layout (stat callouts, section headers) |
| `recharts` | Yes | SVG charts serialized to data URI for PDF embedding |
| `radix-ui` umbrella | Yes | Dialog, Select, Tooltip in admin sort controls |
| `postgres` client | Yes | New canonical_fee_key + fee_family columns added via migration |
| `@anthropic-ai/sdk` | Yes | LLM-assisted fallback classification when rapidfuzz score < threshold |
| Tailwind v4 | Yes | Container queries built-in; use `@container` for responsive Pro screen components |
| Zustand v5 | Yes (installed v8.0) | Admin Review page uses for optimistic row-remove animation state |

---

## Explicitly NOT Adding

| Rejected Library | Reason |
|---|---|
| `sentence-transformers` (Python) | Embedding-based matching is overkill for a 200-key canonical taxonomy with explicit aliases per key. rapidfuzz token_set_ratio at threshold 80 handles 95%+ of cases. Embeddings add 400MB model weight to Modal workers. |
| `react-table` (v7, legacy) | Superseded by `@tanstack/react-table` v8. The v7 package requires `react-table` (not `@tanstack`) and has no TypeScript support. |
| Puppeteer / `@sparticuz/chromium` | Already rejected in v8.0 for valid reasons (Vercel 250MB limit, 10s timeout). `@react-pdf/renderer` is the answer. |
| `ag-grid` / `react-data-grid` | Bring their own CSS, conflicting with the existing Tailwind design system. TanStack Table is headless and attaches to existing markup. |
| Elasticsearch / Typesense | The canonical taxonomy is ~200 keys, not a search corpus. pg_trgm + rapidfuzz is sufficient. A full search engine adds operational cost and complexity for no gain at this scale. |
| `fuzzysort` | Prioritizes prefix matches (CLI autocomplete use case). Fee category strings match anywhere in the string — token_set_ratio from rapidfuzz is the right algorithm. |
| `compromise` NLP | NLP parsing is appropriate for natural language, not structured fee category slugs. Adds 200KB browser bundle for a problem fuzzy matching solves. |

---

## Integration Details

### 1. Canonical Fee Layer — Database Schema

Two new columns on the existing `fees` table. No new tables needed.

```sql
-- Migration: add canonical fee columns
ALTER TABLE fees
  ADD COLUMN canonical_fee_key  text,
  ADD COLUMN fee_family         text;

-- Index for fast taxonomy lookups
CREATE INDEX fees_canonical_key_idx ON fees (canonical_fee_key);
CREATE INDEX fees_fee_family_idx    ON fees (fee_family);
```

Enable `pg_trgm` for similarity-based duplicate detection (Supabase already has this extension available):

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Find duplicate/near-duplicate raw category names across institutions
CREATE INDEX fees_category_trgm_idx ON fees USING GIN (fee_category gin_trgm_ops);
```

The canonical taxonomy itself (200-key map with aliases) lives in `fee_crawler/taxonomy/canonical_keys.py` and `src/lib/fee-taxonomy.ts` — not the database. The DB stores the resolved key per fee row.

**Confidence:** HIGH — pg_trgm is a standard Supabase-available extension; GIN indexing for 15K rows is sub-second.

---

### 2. Auto-Classification Pipeline — Python (Modal Worker)

The classification pipeline runs in the existing Modal extraction worker. After fee extraction, before writing to the DB:

```python
# fee_crawler/classification/canonical_mapper.py
from rapidfuzz import process, fuzz
from fee_crawler.taxonomy.canonical_keys import CANONICAL_MAP  # dict[str, list[str]]

THRESHOLD = 80  # token_set_ratio score below this triggers LLM fallback

def map_to_canonical(raw_category: str) -> tuple[str | None, float]:
    """Returns (canonical_key, confidence_score)."""
    # Build flat alias list: [(alias, canonical_key), ...]
    choices = [(alias, key) for key, aliases in CANONICAL_MAP.items() for alias in aliases]
    alias_strings = [c[0] for c in choices]

    result = process.extractOne(
        raw_category,
        alias_strings,
        scorer=fuzz.token_set_ratio
    )
    if result is None:
        return None, 0.0

    match_str, score, idx = result
    canonical_key = choices[idx][1]
    return canonical_key, score / 100.0
```

When `score < THRESHOLD`, the pipeline calls Claude Haiku with a structured prompt listing the 200 canonical keys and asking for the best match. The LLM result is cached in a `classification_cache` table (key=raw_category, value=canonical_key) so each raw string is only LLM-classified once.

**Confidence:** HIGH — rapidfuzz 3.14.4 confirmed on PyPI; token_set_ratio is the documented algorithm for unordered word matching; Modal workers already run Python 3.12.

---

### 3. Sortable Admin Tables — TanStack Table v8

TanStack Table runs as a `"use client"` hook. Data is fetched server-side in the parent server component and passed as props. The table component owns only sort state — not data fetching.

Pattern for converting existing tables:

```typescript
// src/components/admin/SortableTable.tsx  ("use client")
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';

export function SortableTable<T>({
  data,
  columns,
}: {
  data: T[];
  columns: ColumnDef<T>[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map(hg => (
          <tr key={hg.id}>
            {hg.headers.map(header => (
              <th
                key={header.id}
                onClick={header.column.getToggleSortingHandler()}
                className="cursor-pointer select-none px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider"
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map(row => (
          <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
            {row.getVisibleCells().map(cell => (
              <td key={cell.id} className="px-4 py-2.5">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Existing table styles (`px-4 py-2.5`, `hover:bg-gray-50/50`, `text-[11px] font-semibold text-gray-400 uppercase tracking-wider`) carry forward unchanged. TanStack Table adds zero CSS.

**Pages requiring conversion:** `/admin/index`, `/admin/market`, `/admin/fees/catalog`, `/admin/peers`, `/admin/fees` (review queue), `/admin/districts`, `/admin/ops`.

**Confidence:** HIGH — v8.21.3 confirmed on npm; React 19 confirmed compatible; client component requirement confirmed (hooks-based architecture); existing markup styles are preserved.

---

### 4. Responsive Design — Tailwind v4 Container Queries

Tailwind v4 ships container queries as a core API (no plugin required). For Hamilton Pro screens that need responsive component-level layout:

```tsx
// Responsive card layout example
<div className="@container">
  <div className="flex flex-col @md:flex-row gap-4">
    {/* At container width >= 448px, switches to row layout */}
  </div>
</div>
```

Named containers for complex nested layouts:

```tsx
<div className="@container/card">
  <div className="@lg/card:grid-cols-2">
    {/* triggers when "card" container >= 512px */}
  </div>
</div>
```

Standard viewport breakpoints (`sm:`, `md:`, `lg:`) remain appropriate for page-level layout. Container queries (`@sm:`, `@md:`, `@lg:`) are for component-internal responsiveness — specifically needed in Hamilton Pro screen cards that appear in variable-width grid columns.

**No new package required.** `@tailwindcss/postcss` (already installed) includes container query support.

**Confidence:** HIGH — confirmed in Tailwind v4.0 release notes; no plugin required statement verified in official docs.

---

### 5. Report Quality — PDF Layout Upgrade

The existing `@react-pdf/renderer` route at `GET /api/hamilton/reports/[id]/pdf` handles PDF generation. v9.0 upgrades the layout to Salesforce-grade editorial structure.

Key layout primitives for the upgraded report:

```typescript
// src/components/hamilton/report/ReportDocument.tsx
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  statCallout: {
    backgroundColor: '#f0f4ff',
    borderLeft: '3pt solid #1d4ed8',
    padding: '12pt 16pt',
    marginBottom: '16pt',
  },
  chapterNumber: {
    fontSize: 9,
    color: '#6b7280',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: '4pt',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: 700,
    color: '#111827',
    marginBottom: '8pt',
  },
});
```

Charts from Recharts cannot render inside `@react-pdf/renderer` directly. The pattern:

1. Client renders chart via Recharts and captures SVG node via `ref`
2. Serializes SVG to data URI: `btoa(svgNode.outerHTML)` → `data:image/svg+xml;base64,...`
3. Sends data URI as part of the POST body to the report generation route
4. API route passes the data URI to `<Image src={chartDataUri} />` in the PDF document

For v9.0, limit this to one key chart per report section (fee distribution histogram). Full chart embedding is a v10.0 concern.

**Confidence:** HIGH — `@react-pdf/renderer` v4.4.0 confirmed; SVG-as-Image pattern documented in react-pdf GitHub discussions.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|---|---|---|---|
| Fuzzy matching (Python) | `rapidfuzz` | `fuzzywuzzy` | fuzzywuzzy is pure Python, 10-100x slower. rapidfuzz is a drop-in replacement with C++ backend. Same API. |
| Fuzzy matching (Python) | `rapidfuzz` | Embedding similarity | Requires 400MB+ model download in Modal worker. Overkill for 200-key taxonomy with explicit aliases. |
| Sortable tables | `@tanstack/react-table` | `ag-grid-community` | ag-grid bundles its own CSS that conflicts with Tailwind design system. Zero-style headless library is the correct choice. |
| Sortable tables | `@tanstack/react-table` | Manual `useState` sort | Acceptable for 1-2 tables; not scalable across 7+ admin pages. TanStack provides consistent sort icon, multi-column sort, and type safety for free. |
| Client canonical lookup | `fuse.js` | pg_trgm via server action | Round-trip to server for every keystroke adds 100-300ms latency in the review UI. fuse.js runs in-browser against a loaded 200-key array — instant. |
| Report charts | SVG data URI | `html2canvas` | html2canvas produces raster images (blurry at high DPI). SVG preserves vector quality in PDF. |
| Duplicate detection | `pg_trgm` | Python pre-processing only | pg_trgm lets the admin UI query near-duplicates ad hoc via SQL without running a Python job. More flexible for data curation. |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---|---|---|
| `@tanstack/react-table` 8.21.3 | React 19 | Confirmed; React 19 listed as compatible peer |
| `@tanstack/react-table` 8.21.3 | Next.js 16 App Router | Must be used in `"use client"` components (hooks-based). Server component receives data; client component owns sort state. |
| `fuse.js` 7.0.0 | React 19 / Next.js 16 | Pure JS, no React dependency. Import in client components only. |
| `rapidfuzz` 3.14 | Python 3.12 | Confirmed; requires Python >= 3.10 |
| `pg_trgm` | Supabase Postgres 13+ | Available as a standard extension on all Supabase plans. Enable with `CREATE EXTENSION IF NOT EXISTS pg_trgm;` |

---

## Required Configuration Changes

### Database Migrations

```sql
-- 1. Enable trigram extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Add canonical columns to fees table
ALTER TABLE fees
  ADD COLUMN IF NOT EXISTS canonical_fee_key text,
  ADD COLUMN IF NOT EXISTS fee_family        text;

-- 3. Add classification cache (prevents repeat LLM calls for same raw string)
CREATE TABLE IF NOT EXISTS classification_cache (
  raw_category   text PRIMARY KEY,
  canonical_key  text NOT NULL,
  confidence     numeric(4,3) NOT NULL,
  method         text NOT NULL,  -- 'fuzzy' | 'llm'
  created_at     timestamptz DEFAULT NOW()
);

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS fees_canonical_key_idx  ON fees (canonical_fee_key);
CREATE INDEX IF NOT EXISTS fees_fee_family_idx     ON fees (fee_family);
CREATE INDEX IF NOT EXISTS fees_category_trgm_idx  ON fees USING GIN (fee_category gin_trgm_ops);
```

### Python requirements.txt

```
rapidfuzz>=3.14
```

### No next.config.ts changes needed

`serverExternalPackages: ['@react-pdf/renderer']` was added in v8.0. No additional config required for `fuse.js` or `@tanstack/react-table`.

---

## Sources

- `@tanstack/react-table` 8.21.3 npm: https://www.npmjs.com/package/@tanstack/react-table — v8.21.3 current stable; v9 alpha not production-ready (HIGH)
- TanStack Table sorting docs: https://tanstack.com/table/v8/docs/guide/sorting — getSortedRowModel pattern confirmed (HIGH)
- TanStack Table + Next.js App Router: https://github.com/TanStack/table/discussions/5410 — client component requirement confirmed (HIGH)
- `fuse.js` 7.0.0: https://www.fusejs.io/ — Bitap algorithm, zero deps, 15KB (HIGH)
- `rapidfuzz` 3.14.4 PyPI: https://pypi.org/project/RapidFuzz/ — current stable, Python 3.10+ required (HIGH)
- `rapidfuzz` docs: https://rapidfuzz.github.io/RapidFuzz/ — token_set_ratio algorithm confirmed (HIGH)
- pg_trgm PostgreSQL docs: https://www.postgresql.org/docs/current/pgtrgm.html — GIN index pattern confirmed (HIGH)
- Tailwind v4 container queries: https://tailwindcss.com/blog/tailwindcss-v4 — built-in core API, no plugin (HIGH)
- `@react-pdf/renderer` 4.4.0: https://www.npmjs.com/package/@react-pdf/renderer — current version confirmed (HIGH)
- Puppeteer on Vercel (rejected): https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel — bundle limit constraints confirmed (HIGH)

---

*Stack research for: Bank Fee Index v9.0 Data Foundation & Production Polish*
*Researched: 2026-04-09*
