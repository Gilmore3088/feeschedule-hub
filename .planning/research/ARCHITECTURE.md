# Architecture Research

**Domain:** Bank Fee Intelligence Platform — Data Consolidation + Production Polish
**Researched:** 2026-04-09
**Confidence:** HIGH (all conclusions drawn from direct codebase inspection)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Browser / Client Layer                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  Admin UI   │  │  Hamilton    │  │  Public / Consumer     │  │
│  │ /admin/*    │  │  Pro /pro/*  │  │  /consumer, /research  │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬─────────────┘  │
└─────────┼────────────────┼──────────────────────┼────────────────┘
          │                │                      │
┌─────────▼────────────────▼──────────────────────▼────────────────┐
│                 Next.js 16 App Router (Server Layer)              │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ Server         │  │ Server       │  │ API Routes         │   │
│  │ Components     │  │ Actions      │  │ /api/v1/*          │   │
│  │ (pages)        │  │ (mutations)  │  │ /api/research/*    │   │
│  │                │  │              │  │ /api/pro/*         │   │
│  └───────┬────────┘  └──────┬───────┘  └─────────┬──────────┘   │
│          │                  │                     │              │
│  ┌───────▼──────────────────▼─────────────────────▼──────────┐  │
│  │           src/lib/ — Business Logic & DB Layer             │  │
│  │  crawler-db/  hamilton/  report-engine/  report-assemblers│  │
│  │  fee-taxonomy.ts  auth.ts  stripe-actions.ts  format.ts   │  │
│  └───────────────────────────┬────────────────────────────────┘  │
└──────────────────────────────┼────────────────────────────────────┘
                               │ postgres client (TCP, port 6543)
┌──────────────────────────────▼────────────────────────────────────┐
│             Supabase PostgreSQL (production DB)                    │
│  extracted_fees  crawl_targets  institutions  users  reports       │
│  fed_*  call_reports  complaints  alerts  watchlists  scenarios    │
└──────────────────────────────┬────────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────────┐
│              Python Pipeline (Modal Serverless)                    │
│  extraction_worker.py  llm_batch_worker.py  discovery_worker.py   │
│  fee_analysis.py: normalize_fee_name() + get_fee_family()         │
│  Writes directly to extracted_fees with fee_category + fee_family │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Key Files |
|-----------|----------------|-----------|
| fee_analysis.py | Canonical normalization: raw fee name to fee_category slug via alias dict + regex + fuzzy match | `fee_crawler/fee_analysis.py` |
| extraction_worker.py | Calls normalize_fee_name() + get_fee_family() at write time, inserts fee_category + fee_family | `fee_crawler/workers/extraction_worker.py` |
| llm_batch_worker.py | Same normalization path for batch LLM extraction | `fee_crawler/workers/llm_batch_worker.py` |
| src/lib/fee-taxonomy.ts | JS mirror of Python fee family/category constants; single source for UI labels, colors, tiers | `src/lib/fee-taxonomy.ts` |
| src/lib/crawler-db/ | 20+ query functions, split by concern; no ORM, template literal SQL | `src/lib/crawler-db/*.ts` |
| sortable-table.tsx | Generic client-side sort + pagination component; already used on /admin/index | `src/components/sortable-table.tsx` |
| @react-pdf/renderer | Server-side PDF generation; API route at /api/pro/report-pdf renders React PDF components | `src/app/api/pro/report-pdf/route.ts` |
| Hamilton Pro /pro/* | Route-grouped under (hamilton) with CSS isolation; 5 screens: Home, Analyze, Simulate, Reports, Monitor | `src/app/pro/(hamilton)/` |
| Stripe billing | createPortalSession() exists in stripe-actions.ts; wired to /account/manage-billing-button.tsx only — not surfaced in Pro settings | `src/lib/stripe-actions.ts` |

## Recommended Project Structure

No structural changes needed for v9.0. Integration touches existing files rather than creating new directories. Modifications land in:

```
fee_crawler/
├── fee_analysis.py              # ADD: canonical_fee_key lookup table, variant_type detection
│                                # ADD: synonym consolidation map (rush_card variants, etc.)
├── workers/
│   ├── extraction_worker.py     # MODIFY: write canonical_fee_key + variant_type at insert time
│   └── llm_batch_worker.py      # MODIFY: same — shared normalize path already called here
└── db.py                        # ADD: ALTER extracted_fees ADD COLUMN canonical_fee_key TEXT
                                 # ADD: ALTER extracted_fees ADD COLUMN variant_type TEXT

src/
├── lib/
│   ├── fee-taxonomy.ts          # MODIFY: add canonical key lookup map (mirror Python)
│   └── crawler-db/
│       ├── fees.ts              # MODIFY: FeeInstance type gets canonical_fee_key + variant_type
│       └── fee-index.ts         # MODIFY: backfill query support for canonical_fee_key
├── components/
│   └── sortable-table.tsx       # NO CHANGE — already generic; adopt in more admin pages
├── app/
│   └── admin/
│       ├── review/
│       │   └── review-table.tsx # MODIFY: wrap with SortableTable
│       ├── institutions/
│       │   └── page.tsx         # MODIFY: pass rows to SortableTable client component
│       ├── fees/
│       │   └── page.tsx         # MODIFY: wrap with SortableTable
│       ├── peers/               # MODIFY: peer table to SortableTable
│       └── leads/               # MODIFY: leads table to SortableTable
│   └── pro/
│       └── (hamilton)/
│           ├── settings/        # MODIFY: wire Stripe billing portal button
│           ├── reports/         # MODIFY: wire real data, strip demo text
│           ├── analyze/         # MODIFY: responsive layout pass
│           └── monitor/         # MODIFY: responsive layout pass
```

### Structure Rationale

- **fee_analysis.py is the single normalization source.** All classification logic lives here. fee-taxonomy.ts mirrors constants for the UI but contains no classification logic. This separation is deliberate — Python does the work, TypeScript reads the results.
- **SortableTable component is already generic.** It accepts `Column<T>[]` + `rows: T[]` with a `rowKey` function. Adoption is additive: wrap existing server-fetched arrays in the client component.
- **@react-pdf/renderer is already integrated.** PdfDocument + AnalysisPdfDocument components exist. The v9.0 report quality work is a design/data pass on existing components — not a new library introduction.

## Architectural Patterns

### Pattern 1: Normalization at Write Time (Existing — Extend for v9.0)

**What:** normalize_fee_name() is called inside extraction_worker.py during the INSERT — not as a post-processing step. fee_category and fee_family are stored on the row immediately.

**When to use:** For canonical_fee_key and variant_type, follow the same pattern. Add the columns, compute them in a classify_fee() wrapper around normalize_fee_name(), write at INSERT. Do not add a separate backfill-only pipeline for new crawls.

**Trade-offs:** Writes are slightly heavier; reads are simple (no JOIN to a lookup table needed). Correct choice here — fee volume is low enough (thousands not millions of rows per run) that write cost is irrelevant.

**Key constraint:** `fee_category IS NULL` rows are skipped by backfill_validation — the existing test suite explicitly asserts this (test_categorization_stage.py, test_validation_stage.py). canonical_fee_key should follow the same NULL-if-unmatched convention. Do not assign a fallback category to unmatched fees; keep them NULL so the validation stage can skip them correctly.

```python
# In fee_analysis.py — wrapper around existing normalize_fee_name()
def classify_fee(raw_name: str) -> tuple[str | None, str | None, str | None]:
    """Returns (fee_category, canonical_fee_key, variant_type)."""
    fee_category = normalize_fee_name(raw_name)
    canonical_fee_key = CANONICAL_KEY_MAP.get(fee_category)  # 49-entry lookup
    variant_type = detect_variant_type(raw_name, fee_category)
    return fee_category, canonical_fee_key, variant_type
```

### Pattern 2: URL-Param Sort vs Client-Side Sort (Existing — Choose by Data Size)

**What:** Two sort patterns already coexist in the codebase:
- URL-param sort: `/admin/fees/catalog` reads `params.sort` + `params.dir` from searchParams for server-side sort. Correct for large datasets where the full dataset cannot be passed to the client.
- Client-side sort: `SortableTable` (useState + useMemo) is used on `/admin/index`. Correct when the full dataset is already fetched and small enough to pass to a client component.

**For v9.0:** Most admin tables (review, institutions, leads) render server-side with limited result sets (< 500 rows after pagination). The simplest path is adopting SortableTable (client-side) by passing already-fetched rows to the component. This avoids adding URL sort parameters to every server query.

**Trade-offs:** Client-side sort resets on navigation. For admin users who sort, navigate to a detail page, and return, sort state is lost. Acceptable for v9.0; fix with URL persistence in a later phase if needed.

```typescript
// Pattern: server component fetches, client component sorts
// page.tsx (server component)
const rows = await getInstitutions();
return <InstitutionSortableTable rows={rows} />;

// institution-sortable-table.tsx ("use client")
import { SortableTable, type Column } from "@/components/sortable-table";
const columns: Column<InstitutionRow>[] = [...];
export function InstitutionSortableTable({ rows }) {
  return <SortableTable columns={columns} rows={rows} rowKey={(r) => String(r.id)} />;
}
```

### Pattern 3: Server-Side PDF via API Route (Existing — Design Pass for v9.0)

**What:** `POST /api/pro/report-pdf` accepts a report payload, renders a React PDF component server-side with @react-pdf/renderer, returns `application/pdf` blob. The component tree (PdfDocument, AnalysisPdfDocument) lives in `src/components/hamilton/reports/`.

**v9.0 scope:** Report quality upgrade is a layout/design pass on PdfDocument — adding stat callouts, chapter structure, chart sections. Not a new generation mechanism.

**Constraint that affects design:** @react-pdf/renderer uses the Yoga layout engine, not the browser's. CSS Grid is not supported. Charts (Recharts components) cannot be rendered inside PDF components. Charts must be converted to SVG path data or simple bar representations using @react-pdf's `<Svg>` + `<Rect>` + `<Line>` primitives.

**Trade-offs:** PdfDocument must be a completely separate component tree from the web-rendered report — no shared Tailwind classes. Treat it as a parallel design system, not a reuse of web components.

### Pattern 4: Taxonomy Mirroring Between Python and TypeScript (Existing — Maintain Carefully)

**What:** FEE_FAMILIES dict exists in both `fee_analysis.py` (Python, authoritative) and `fee-taxonomy.ts` (TypeScript, UI mirror). They are manually kept in sync — there is no code-generation step.

**When it matters for v9.0:** The canonical_fee_key lookup table must be added to BOTH files. Drift between them causes silent mismatch: the pipeline writes one category slug but the UI renders a different display name or groups fees into the wrong family.

**Mitigation:** Add a comment block in both files marking the sync contract explicitly. Do not rely on tests to catch drift — add a unit test that asserts TypeScript category count equals Python category count.

## Data Flow

### Canonical Fee Layer: New Row Flow

```
Raw fee name from PDF/HTML extraction (e.g., "Rush Debit Card Fee")
    ↓
classify_fee("Rush Debit Card Fee")
    ├── normalize_fee_name() → fee_category = "rush_card"
    ├── CANONICAL_KEY_MAP["rush_card"] → canonical_fee_key = "card_replacement_rush"
    └── detect_variant_type() → variant_type = "rush"
    ↓
INSERT INTO extracted_fees
  (fee_name, fee_category, fee_family, canonical_fee_key, variant_type, ...)
```

### Canonical Fee Layer: Backfill Flow for Existing 15K Rows

```
Option A (SQL-only, fast): UPDATE extracted_fees
  SET canonical_fee_key = CASE fee_category
    WHEN 'rush_card' THEN 'card_replacement_rush'
    WHEN 'monthly_maintenance' THEN 'monthly_maintenance'
    ... (49 entries)
  END
  WHERE fee_category IS NOT NULL

Option B (Python, required for variant_type):
  SELECT id, fee_name FROM extracted_fees WHERE variant_type IS NULL
  For each row: classify_fee(fee_name) → variant_type
  UPDATE extracted_fees SET variant_type = ? WHERE id = ?
```

Recommended: run Option A first (fast, no Python needed for canonical_fee_key), then Option B for variant_type.

### Sortable Tables: Data Flow

```
Server Component (page.tsx)
    ↓ fetches rows[] server-side (existing query functions)
    ↓ passes rows as prop to client component
Client Component (XxxSortableTable.tsx — "use client")
    ↓ useState(sortKey, sortDir, page)
    ↓ useMemo → sorted + paginated slice
    ↓ renders SortableTable with column definitions
```

No server round-trip on sort. Sort state resets on navigation (acceptable for v9.0).

### Report PDF: Data Flow

```
Pro Reports screen — user clicks "Export PDF"
    ↓ POST /api/pro/report-pdf
      body: { type: "report", report: ReportSummaryResponse }
    ↓ API route: getCurrentUser() → auth check
    ↓ createElement(PdfDocument, { report, reportType })
    ↓ renderToBuffer() → Buffer
    ↓ Response: application/pdf, Content-Disposition: attachment
    ↓ Browser triggers file download
```

### Stripe Billing Portal: Gap and Fix

```
Current state:
  /account/manage-billing-button.tsx → createPortalSession() → redirect to Stripe portal
  (This component exists and works. Only wired to /account route.)

Gap:
  /pro/(hamilton)/settings/page.tsx shows subscription_status but has no portal button.

Fix (minimal):
  Import ManageBillingButton into pro/settings/page.tsx billing section.
  No new logic needed. createPortalSession() already exists.
```

## Integration Points

### New vs Modified: Canonical Fee Layer

| Touch Point | Status | What Changes |
|-------------|--------|--------------|
| `extracted_fees` table | MODIFIED | Two new nullable columns: `canonical_fee_key TEXT`, `variant_type TEXT` |
| `fee_crawler/db.py` | MODIFIED | ALTER TABLE migration entries in `_MIGRATIONS` list |
| `fee_crawler/fee_analysis.py` | MODIFIED | CANONICAL_KEY_MAP dict, detect_variant_type(), classify_fee() wrapper, synonym consolidation |
| `fee_crawler/workers/extraction_worker.py` | MODIFIED | Call classify_fee() instead of separate normalize + family calls |
| `fee_crawler/workers/llm_batch_worker.py` | MODIFIED | Same — use classify_fee() |
| `src/lib/fee-taxonomy.ts` | MODIFIED | Mirror canonical key lookup map from Python |
| `src/lib/crawler-db/fees.ts` | MODIFIED | FeeInstance type gets `canonical_fee_key: string | null`, `variant_type: string | null` |
| Backfill migration | NEW | SQL UPDATE for canonical_fee_key + Python CLI script for variant_type |

### New vs Modified: Sortable Tables

| Touch Point | Status | What Changes |
|-------------|--------|--------------|
| `src/components/sortable-table.tsx` | NO CHANGE | Already generic; already used on /admin/index |
| `src/app/admin/review/review-table.tsx` | MODIFIED | Wrap existing render in SortableTable |
| `src/app/admin/institutions/page.tsx` | MODIFIED | Extract rows, pass to client SortableTable wrapper |
| `src/app/admin/fees/page.tsx` | MODIFIED | Same pattern |
| `src/app/admin/institution-table.tsx` | MODIFIED | Migrate own sort logic to SortableTable |
| `src/app/admin/fees/catalog/[category]/institution-table.tsx` | MODIFIED | Migrate own sort logic to SortableTable |
| `src/app/admin/states/[code]/sortable-institution-table.tsx` | MODIFIED | Already sorted; migrate to shared component |
| `src/app/admin/peers/` | MODIFIED | Peer table to SortableTable |
| `src/app/admin/leads/` | MODIFIED | Leads table to SortableTable |

### New vs Modified: PDF Reports

| Touch Point | Status | What Changes |
|-------------|--------|--------------|
| `src/app/api/pro/report-pdf/route.ts` | NO CHANGE | Generation route is correct |
| `src/components/hamilton/reports/PdfDocument.tsx` | MODIFIED | Layout upgrade: stat callouts, chapter headers, editorial structure |
| `src/components/hamilton/reports/AnalysisPdfDocument.tsx` | MODIFIED | Same quality pass |
| `src/lib/report-assemblers/` | MODIFIED | Wire Call Report + FRED data into payload structs |

### New vs Modified: Hamilton Pro Polish

| Touch Point | Status | What Changes |
|-------------|--------|--------------|
| `src/app/pro/(hamilton)/settings/page.tsx` | MODIFIED | Add ManageBillingButton to billing section (import existing component) |
| `src/app/pro/(hamilton)/reports/page.tsx` | MODIFIED | Strip demo text, wire real report list |
| `src/app/pro/(hamilton)/analyze/` | MODIFIED | Responsive layout pass on AnalyzeWorkspace client component |
| `src/app/pro/(hamilton)/monitor/` | MODIFIED | Responsive layout pass |

### Internal Boundaries

| Boundary | Communication | Constraint |
|----------|---------------|------------|
| Python pipeline to PostgreSQL | psycopg2 direct writes | canonical_fee_key + variant_type written at insert time, not deferred |
| PostgreSQL to Next.js | `postgres` client, template literal SQL | New columns queryable immediately; no cache invalidation needed |
| Server components to client components | Serialized props only | SortableTable receives rows[] from server; columns defined client-side |
| API route to @react-pdf/renderer | `renderToBuffer()` server-side only | Must stay in `serverExternalPackages`; never import in client bundle |
| fee-taxonomy.ts and fee_analysis.py | Manual sync | Python is authoritative; TypeScript mirrors. Drift is a silent bug. |

## Build Order

Dependencies determine this order. Blocks with no listed dependency can run in parallel.

**Block 1 — DB Schema (unlocks Blocks 2 and 4)**
1. Add `canonical_fee_key TEXT` and `variant_type TEXT` columns to `extracted_fees` via migration in `fee_crawler/db.py`
2. Deploy migration to Supabase (production) and run locally for dev

**Block 2 — Classification Logic (depends on Block 1)**
3. Add CANONICAL_KEY_MAP dict to `fee_analysis.py` (one entry per 49 canonical categories)
4. Add detect_variant_type() function for rush/express/waived/capped variants
5. Add classify_fee() wrapper that returns (fee_category, canonical_fee_key, variant_type)
6. Update FEE_NAME_ALIASES to consolidate synonym clusters (rush_card/rush_card_delivery, skipapay variants, return_mail variants)
7. Update extraction_worker.py and llm_batch_worker.py to call classify_fee()
8. Mirror CANONICAL_KEY_MAP in fee-taxonomy.ts

**Block 3 — Backfill Existing Rows (depends on Block 2)**
9. Run SQL UPDATE for canonical_fee_key using CASE WHEN fee_category IS NOT NULL
10. Run Python CLI script to populate variant_type on existing rows by re-examining fee_name

**Block 4 — UI Reads New Columns (depends on Block 1)**
11. Update FeeInstance type to include canonical_fee_key + variant_type
12. Expose in detail pages and catalog where useful for grouping/display

**Block 5 — Sortable Tables (independent)**
No DB dependency. Can run in parallel with Blocks 1-4.
13. Audit all admin table pages for sort gaps
14. Wrap each non-sortable table with SortableTable (one page at a time; low risk per page)

**Block 6 — Pro Polish (independent)**
No dependency on Block 1-4 for most items.
15. Add ManageBillingButton to /pro/settings (5-line change; import existing component)
16. Responsive layout pass on Analyze + Monitor screens
17. Strip remaining demo/sample text from all Pro screens

**Block 7 — Report Quality (depends on data being real, not on canonical layer)**
18. Wire Call Report + FRED data into report assembler payload structs
19. Upgrade PdfDocument layout: stat callouts, chapter headers, editorial structure
20. Test PDF output against Salesforce Connected FINS visual reference

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (15K fee rows) | Direct SQL queries are fast; no caching needed on admin routes |
| 100K fee rows | Add index on `canonical_fee_key` column; index on `(fee_category, canonical_fee_key)` for benchmarking queries |
| 1M fee rows | getNationalIndex() full-table scan becomes expensive; activate `fee_index_cache` table (already defined in db.py at line 433) via scheduled refresh |

The `fee_index_cache` table already exists in the schema. It is the right materialization target if query times degrade — no architectural change needed, just populate and query it.

## Anti-Patterns

### Anti-Pattern 1: Classification as Post-Processing Step

**What people do:** Write raw fees first, run a separate classification job later to populate fee_category and canonical_fee_key.

**Why it's wrong:** The existing test suite explicitly asserts that `backfill_validation` skips rows with `fee_category IS NULL`. A two-phase write creates a window where fees exist but are unindexed, and requires careful pipeline ordering. The current design writes classification at INSERT time intentionally.

**Do this instead:** Extend classify_fee() in fee_analysis.py and call it during the INSERT in extraction_worker.py and llm_batch_worker.py. All three columns (fee_category, canonical_fee_key, variant_type) are written in the same INSERT.

### Anti-Pattern 2: Importing @react-pdf/renderer in Client Components

**What people do:** Import PdfDocument or renderToBuffer in a client component, or forget to add the package to serverExternalPackages.

**Why it's wrong:** @react-pdf/renderer uses Node.js APIs and will fail at build time or runtime if it enters the browser bundle.

**Do this instead:** All PDF rendering stays behind `/api/pro/report-pdf`. Client components POST to this route and receive the blob. The package is already in `serverExternalPackages` in next.config.ts — do not remove it.

### Anti-Pattern 3: Per-Page Sort Logic Duplication

**What people do:** Each admin page implements its own useState + sort comparator (current state in admin/institution-table.tsx, admin/fees/catalog/[category]/institution-table.tsx, admin/states/[code]/sortable-institution-table.tsx — three separate implementations).

**Why it's wrong:** Three implementations already exist with slightly different behavior. Bugs fixed in one are not fixed in others. New pages copy the wrong pattern.

**Do this instead:** Migrate existing per-page sort implementations to the generic SortableTable component. The component is in production on /admin/index and handles sort state, direction toggle, pagination, and column configuration.

### Anti-Pattern 4: Synonym Consolidation Before Alias Update

**What people do:** Run a SQL migration to rename old fee_category slugs (e.g., rename rush_card_delivery to rush_card), then update fee_analysis.py aliases later.

**Why it's wrong:** New crawls continue writing the old slug until fee_analysis.py is updated. The SQL migration and the alias update diverge.

**Do this instead:** Update fee_analysis.py aliases and CANONICAL_KEY_MAP first (so new crawls write the correct values), run tests, deploy the pipeline update, then run the SQL backfill on historical rows.

## Sources

- Direct inspection of `fee_crawler/fee_analysis.py` (1,254 lines) — normalization pipeline, FEE_NAME_ALIASES, FEE_FAMILIES, normalize_fee_name(), get_fee_family()
- Direct inspection of `fee_crawler/workers/extraction_worker.py` — write path showing normalize_fee_name() call at INSERT
- Direct inspection of `fee_crawler/workers/llm_batch_worker.py` — parallel write path with same pattern
- Direct inspection of `fee_crawler/db.py` — schema, migration list, existing indexes on fee_category
- Direct inspection of `src/lib/crawler-db/fee-index.ts` — CANONICAL_CATEGORIES filter, query pattern, getFeeFamily() import
- Direct inspection of `src/components/sortable-table.tsx` — existing generic SortableTable component
- Direct inspection of `src/app/api/pro/report-pdf/route.ts` — PDF generation route architecture
- Direct inspection of per-page sort implementations in admin/institution-table.tsx, catalog/[category]/institution-table.tsx, states/[code]/sortable-institution-table.tsx
- Direct inspection of `src/lib/stripe-actions.ts` and `/account/manage-billing-button.tsx` — billing portal gap vs Pro settings page
- E2E test assertions in `fee_crawler/tests/e2e/test_categorization_stage.py` and `test_validation_stage.py` — NULL handling contract for unclassified fees
- `.planning/PROJECT.md` — v9.0 milestone requirements and feature list

---
*Architecture research for: Bank Fee Index v9.0 — Data Consolidation + Production Polish*
*Researched: 2026-04-09*
