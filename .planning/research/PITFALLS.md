# Pitfalls Research

**Domain:** Canonical fee taxonomy consolidation, auto-classification pipeline, sortable tables, responsive design retrofit, PDF report generation — added to existing Next.js 16 + PostgreSQL + Python pipeline.
**Researched:** 2026-04-09
**Confidence:** HIGH (code-grounded; verified against existing codebase patterns)

---

## Critical Pitfalls

### Pitfall 1: Taxonomy Backfill Breaks the Live Index

**What goes wrong:**
`getNationalIndex()` and `getPeerIndex()` filter on `ef.fee_category = ANY(ARRAY[...49 canonical keys...])`. When the canonical taxonomy backfill runs (adding a `canonical_fee_key` column and normalizing long-tail categories), any row whose `fee_category` gets reassigned to a new canonical key during migration will temporarily drop out of index queries until the code is also deployed. If the backfill runs before the code ships, the index silently loses coverage. If the code ships before the backfill, queries referencing the new column crash at runtime.

**Why it happens:**
The backfill is seen as a data operation and decoupled from the code deploy. The team updates `categorize_fees.py` logic, runs it on production, then deploys — but there is a window where the DB and the TypeScript code are misaligned.

**How to avoid:**
Add `canonical_fee_key` as a nullable column first. Keep the old `fee_category` column untouched and fully populated throughout the migration. All index queries continue to use `fee_category` until the backfill is verified complete and the new column is confirmed non-null for all 49 canonical keys. Only then flip query references. This is the expand-and-contract pattern: add column → backfill → verify → switch queries → (eventual) remove old column.

**Warning signs:**
- `institution_count` drops on any index category after a categorize-fees run
- `maturity_tier` degrades from "strong" to "provisional" on previously stable categories
- Admin `/index` page shows gaps in categories that previously had data

**Phase to address:**
Taxonomy consolidation phase. Start with `ALTER TABLE extracted_fees ADD COLUMN canonical_fee_key TEXT` (nullable, no default, no locks). Backfill in batches of 1,000. Verify row counts match before switching any query.

---

### Pitfall 2: False Merges in Synonym Consolidation — NSF vs Overdraft, Domestic vs International

**What goes wrong:**
The milestone context explicitly calls out categories that must never be merged: NSF vs Overdraft vs OD Protection, Domestic vs International wires. The existing `FEE_NAME_ALIASES` already contains dangerous proximity: `"overdraft/courtesy pay"` maps to `overdraft` and `"nsf fee"` maps to `nsf`. When extending the alias table to cover 15K long-tail categories, a normalizer that strips the "non-sufficient" text might accidentally resolve "NSF/OD combo fee" to `overdraft` instead of keeping both or flagging for manual review.

**Why it happens:**
Synonym expansion is done by a developer reading fee names at volume. The distinction between NSF (declined transaction, fee for bouncing) and Overdraft (paid transaction, fee for covering) is regulatory and behavioral — not obvious from string similarity alone. The NCUA changed its NSF/OD reporting policy in 2025, meaning institution-reported data is already less granular. Merging them in the canonical layer compounds this loss.

**How to avoid:**
Maintain a hard-coded `NEVER_MERGE` list of category pairs enforced in the categorize script. Before any alias table commit, run a validation that checks: (a) no alias maps an NSF-family term to `overdraft` or vice versa; (b) no domestic wire alias maps to `wire_intl_*`; (c) no `atm_non_network` alias captures `card_replacement`. Add this as a pytest test in `fee_crawler/tests/` that runs in CI before any alias table change ships.

**Warning signs:**
- Overdraft `institution_count` spikes significantly after a categorize-fees run
- NSF count drops by a similar magnitude at the same time
- Market index delta between NSF and overdraft compresses toward zero across all segments

**Phase to address:**
Taxonomy consolidation phase, before any alias table expansion. Write the guard tests first (TDD), then expand aliases.

---

### Pitfall 3: Auto-Classification Pipeline Adds Latency to Extraction Hot Path

**What goes wrong:**
Making taxonomy classification live (not one-time backfill) means each newly crawled fee must be classified before it can be staged for review. If classification uses an LLM call (Haiku) to resolve ambiguous fees, this adds 300-800ms per fee to the extraction pipeline. At scale across 4,000 institutions this makes scheduled runs miss their 2am-4am window. If classification is done in a separate post-processing step but the pipeline emits fees without `canonical_fee_key`, the review queue shows uncategorized fees which confuses maturity calculations.

**Why it happens:**
The classification logic is treated as a post-processing concern. The pipeline emits fees with raw `fee_name`, then a separate job runs `categorize_fees`. This creates a period where newly extracted fees have `fee_category = NULL`, which (per the current index query) causes them to not appear in the national index at all — silently reducing coverage.

**How to avoid:**
Classification must happen inline during extraction, not as a second job. The existing `crawl.py` already calls `normalize_fee_name()` and `get_fee_family()` synchronously for each extracted fee. The auto-classification pipeline should extend this same path: attempt alias lookup first (zero latency), fall back to LLM classification only for unmatched names, and write `canonical_fee_key` at insert time. Never ship a fee row to the DB without attempting canonical classification first.

**Warning signs:**
- `fee_category IS NULL` count climbs after pipeline runs
- Dashboard maturity badges degrade after new crawl batches
- `categorize_fees` reports high "unmatched" percentages on new batches

**Phase to address:**
Auto-classification phase. Treat `canonical_fee_key` as a required field at insert, defaulting to `NULL` only when alias lookup genuinely fails (not as a deferred step).

---

### Pitfall 4: Sortable Tables Load All Rows Into Client Memory

**What goes wrong:**
The existing `SortableTable` component (`src/components/sortable-table.tsx`) is a client-side component: it receives all rows as props, sorts in-memory with `useMemo`, and paginates client-side. This works for 49-category index pages. Applied to the fees review queue (potentially 15K+ rows), the Review page, or the Institution table, this pattern sends megabytes of JSON to the browser on each page load and sorts in the main thread.

**Why it happens:**
The `SortableTable` was designed for bounded datasets (49 index categories, ~200 peers). When extended to all admin tables without a size audit, developers assume it scales because it worked before.

**How to avoid:**
For tables with potentially unbounded row counts (fees, institutions, crawl runs, review queue), sort must move to the server. Use URL params (`?sort=amount&dir=desc`) parsed in the Server Component, passed to the DB query as `ORDER BY`. The `nuqs` library is the community standard for type-safe URL-based sort/filter state in Next.js, avoiding manual URLSearchParams sync bugs. Client-side `SortableTable` is acceptable only when the dataset is bounded at 200 rows or fewer.

**Warning signs:**
- Page load time exceeds 2 seconds on any admin table
- Browser tab memory climbs above 200MB on the fees or review pages
- `?sort=` in the URL does not survive navigation (because sort is local state only)

**Phase to address:**
Sortable tables phase. Audit each admin table's max row count before applying `SortableTable`. Flag any table that can exceed 200 rows for server-side sort instead.

---

### Pitfall 5: Sort State Conflicts With Existing URL Filter Pattern

**What goes wrong:**
The existing system uses URL search params for all peer filters (`?charter=bank&tier=a,b&district=1,3,7`). Adding sort params (`?sort=median&dir=asc`) to the same URL can conflict: the filter bar components call `router.push()` with new URLSearchParams that may not preserve sort keys (or vice versa). The result is that changing a filter resets the sort to default, or changing the sort wipes the active filters.

**Why it happens:**
Each filter and sort component constructs its own URLSearchParams from scratch rather than reading and mutating the current params. This is the most common URL state bug in Next.js App Router code.

**How to avoid:**
All URL param writes must start from `new URLSearchParams(currentSearchParams)` — clone first, then set/delete the changed key, then push. If using `nuqs`, this is handled automatically. Before shipping sortable tables, audit every `router.push(...)` call in filter bar components to confirm they preserve existing params.

**Warning signs:**
- Selecting a sort direction clears the charter/tier/district filters
- Applying a peer filter resets the table to default sort
- Browser back button produces unexpected filter/sort combinations

**Phase to address:**
Sortable tables phase. Fix the URL mutation pattern globally before adding any new params.

---

### Pitfall 6: react-pdf Cannot Render Recharts SVGs Directly

**What goes wrong:**
The `@react-pdf/renderer` library does not render Recharts components natively. Recharts renders to DOM SVG elements which react-pdf cannot traverse. Attempting to embed a `<BarChart>` directly in a PDF `<Document>` produces either a blank area or a runtime error. This is a known open issue in the react-pdf repository.

**Why it happens:**
Developers assume react-pdf is a full React renderer (like react-dom) that handles any React component tree. It is not — it is a PDF-specific renderer with a limited set of primitives (`View`, `Text`, `Image`, `SVG`, etc.) and does not execute browser-only rendering paths.

**How to avoid:**
Three viable approaches, in order of increasing reliability:

1. **Static images (recommended for this system):** Render charts server-side to PNG using a headless browser (Playwright, already in the stack) or `canvas` + `chart.js`, then embed as `<Image>` in react-pdf. Cleanest separation between web and PDF rendering.
2. **react-pdf-charts wrapper:** The `react-pdf-charts` npm package converts SVG DOM output from Recharts into react-pdf-compatible SVG primitives. Works for bar/line charts; breaks for custom `ReferenceDot` components and nested SVG elements.
3. **Pure react-pdf SVG:** Rebuild charts using react-pdf's native `<SVG>`, `<Rect>`, `<Line>` primitives. Full control, zero dependencies, but significant implementation time.

If Recharts must be used, set `isAnimationActive={false}` on all chart components before rendering — animations prevent static capture.

**Warning signs:**
- PDF renders charts as blank white rectangles
- `PDFDownloadLink` triggers a browser crash or hangs with complex chart trees
- `renderToBuffer()` throws on SVG nesting

**Phase to address:**
Report PDF generation phase. Spike chart rendering strategy before writing any report component — do not commit to an approach until a working chart in PDF is demonstrated.

---

### Pitfall 7: Responsive Retrofit Breaks Desktop-Optimized Data Density

**What goes wrong:**
The admin design system is explicitly Bloomberg-grade data density. The `Market Index Explorer` uses a `col-span-8` / `col-span-4` two-column grid with a sticky `top-[57px] z-30` segment control bar. Adding responsive breakpoints naively (e.g., `md:grid-cols-1`) collapses this to a single column on tablet, destroying the side-by-side layout that is a core UX decision. Tight cell padding (`px-4 py-2.5`) that makes tables readable at desktop density becomes cramped at mobile widths.

**Why it happens:**
Responsive is added as a global pass after the fact ("just add `sm:` prefixes"). Mobile-first retrofit changes base styles that were never designed for mobile, requiring a full audit of every component's layout assumptions.

**How to avoid:**
Admin screens are B2B-only. The target devices are desktop and large tablets (1024px+). Responsive for admin means "graceful degradation to 1024px minimum" — not full mobile support. Set a `min-w-[1024px]` on the admin layout and use `overflow-x-auto` on tables rather than trying to reflow complex multi-column grids. Reserve true mobile-first responsive work for the consumer/public-facing screens. The Hamilton Pro screens are the primary responsive target for v9.0 based on the milestone scope.

**Warning signs:**
- Desktop users see layout shifts after responsive changes ship
- Sticky elements start overlapping at intermediate viewport widths
- `col-span-8` grids collapse prematurely at 1280px

**Phase to address:**
Hamilton Pro polish phase. Scope responsive work to Pro screens only. Explicitly defer admin responsive to a future phase.

---

### Pitfall 8: Playwright Stealth vs. Big Bank Bot Detection is an Arms Race with Legal Exposure

**What goes wrong:**
Major banks (Chase, BofA, Wells Fargo) use Cloudflare, DataDome, or custom WAF configurations. Playwright stealth techniques (patching `navigator.webdriver`, spoofing user agent, randomizing mouse movements) fail against cryptographic proof-of-work challenges and timing-based behavioral analysis. Beyond technical failure, bank ToS typically prohibit automated access.

**Why it happens:**
Teams see scraping working on community banks and assume scaling to big banks is a technical problem (better stealth), not a legal one. The 116/250 big bank failure rate in the existing re-extraction run confirms this is already hitting the ceiling.

**How to avoid:**
Segment the strategy: (1) Public fee schedule pages posted for consumer access are defensible — automated access mimics a consumer reading a PDF. (2) Fee data behind login or behind CAPTCHA walls is higher risk — stop at CAPTCHA, flag for manual review. (3) For the 250 largest banks already failing, prioritize URL research to find direct PDF links rather than JS-rendered pages. Direct PDF download via `httpx` has no bot detection and is the highest-ROI path. Playwright stealth is acceptable for JS-rendered public pages but must hard-stop at any authentication wall.

**Warning signs:**
- Crawl success rate for Tier 1 banks does not improve with stealth changes
- Modal workers return 403 errors from Cloudflare challenge pages
- Extracted fee data shows pricing that looks like a logged-in account view (numbers too precise/granular)

**Phase to address:**
Pipeline coverage phase. Prioritize PDF direct-link strategy over Playwright stealth. Document legal rationale for the scraping approach in a comment in `config.yaml` or a `LEGAL.md`.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Client-side sort in SortableTable for all admin tables | Zero DB query changes needed | Memory blowup, slow TTI on large tables | Only when row count is bounded at ≤200 |
| `force=True` in categorize_fees to re-classify everything | Clean slate after alias table changes | Clears valid categories temporarily, index drops during run | Never in production without a verified backup |
| Nullable `canonical_fee_key` with no NOT NULL constraint | Easy to add later | Queries silently skip NULL rows, coverage gaps undetected | Acceptable during backfill phase only — add constraint after verification |
| react-pdf-charts wrapper over raw SVG primitives | Fast to implement | Breaks on nested SVGs, custom chart components | Acceptable for simple bar/line charts only |
| `overflow-x-auto` on admin tables instead of full responsive | Preserves desktop density | Horizontal scrolling is poor UX on tablet | Acceptable for admin (B2B desktop-only audience) |
| Alias lookup only, no LLM fallback, for auto-classification | Zero added pipeline latency | 20-30% of long-tail fees remain `fee_category = NULL` | Acceptable in v9.0 — LLM fallback is a future phase |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase transaction mode pooler (port 6543) | Running `ALTER TABLE ... SET NOT NULL` in a migration — holds ACCESS EXCLUSIVE lock, blocks all writes | Add column nullable first; add NOT NULL constraint with `NOT VALID`, then `VALIDATE CONSTRAINT` in a separate transaction |
| `postgres` client (raw SQL, no ORM) | Building `canonical_fee_key` index with `CREATE INDEX` (blocking) on a live table | Use `CREATE INDEX CONCURRENTLY` — non-blocking, safe on live tables |
| Vercel AI SDK streaming (`streamText`) | Generating PDF reports as streaming text — PDFs are binary, not SSE streams | PDF generation must be a non-streaming API route returning `application/pdf` content-type |
| react-pdf server-side rendering in Next.js App Router | Using `<PDFViewer>` (browser-only component) in a Server Component | Use `renderToBuffer()` in a Route Handler (`/api/reports/[id]/pdf`); never import PDFViewer server-side |
| Tailwind v4 container queries | Mixing `@container` with old `md:` breakpoints on the same element — double-fires at viewport boundaries | Choose one responsive strategy per component; use container queries for components that appear in multiple layout contexts |
| Modal Python workers + Postgres transaction pooler | Long-running backfill transactions hold pooler connections beyond timeout | Batch in 1,000-row transactions; commit and reconnect between batches |
| categorize_fees.py SQLite placeholder syntax | Uses `?` placeholders — works for legacy SQLite but will break if run directly against Postgres | Confirm the production backfill path goes through the Postgres-aware layer, not the legacy `db.py` SQLite path |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Client-sort of fee review queue | Review page takes 3-5s to TTI; browser tab freezes briefly on sort click | Server-side sort via `ORDER BY` with URL param; paginate at DB level | Breaks at ~500 rows in client memory |
| `categorize_fees --force` on 15K+ rows in single transaction | Postgres connection timeout; partial update with no rollback visibility | Batch 1,000 rows per transaction; commit between batches | Breaks at ~5,000 rows in a single transaction |
| `buildIndexEntries()` in-memory grouping on all non-rejected fees | Index page load time grows with `extracted_fees` table size | Add DB-level aggregation (`GROUP BY fee_category`) as an alternative path when row count exceeds 50K | Slows noticeably at ~20K fee rows |
| react-pdf `renderToBuffer()` in Vercel Edge Function | Edge function timeout (50ms CPU limit) | Use Node.js runtime (`export const runtime = 'nodejs'`) for PDF route handlers | Always — Edge runtime cannot run react-pdf |
| LLM fallback classification inline in extraction hot path | Pipeline runs miss 2am-4am window; Modal worker timeout | Keep LLM fallback async/queued; alias lookup inline only | Breaks at ~50 LLM calls per extraction run |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing `canonical_fee_key` remapping logic in a public API endpoint | Competitors can reverse-engineer taxonomy decisions and synonym clusters | Taxonomy mapping lives only in Python crawler and server-side TS; never expose alias table via `/api/v1/` |
| Using `sql.unsafe()` with string-interpolated canonical keys from user input | SQL injection if user-supplied key reaches raw query | Canonical keys are constants from `FEE_FAMILIES` — document this explicitly; never allow user-provided canonical key to reach `sql.unsafe()` |
| PDF report download without auth check | Unauthorized user downloads premium benchmarking reports | PDF generation routes (`/api/reports/[id]/pdf`) must call `getCurrentUser()` and verify `premium` or `admin` role before `renderToBuffer()` |
| Playwright stealth crawling with production DB credentials in Modal environment | Modal worker compromise exposes full Supabase credentials | Use a read-write limited DB user for crawl workers, separate from the admin app credentials |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Sort state lives in local React state (not URL) | Bank executive shares a URL to a sorted fee table; recipient sees unsorted default | All sort state in URL params — `?sort=median_amount&dir=desc` persists across shares and refreshes |
| Category explorer accordion collapses on filter change | User applies a family filter, accordion resets — loses context of which family was open | Persist accordion open state in URL (`?open=Overdraft+%26+NSF`) or use uncontrolled accordion that does not reset on filter changes |
| PDF report fonts differ from web report fonts | Premium PDF looks like a different product from the web view | Embed Geist/Newsreader fonts explicitly in react-pdf using `Font.register()` before rendering any `<Text>` — react-pdf does not inherit system fonts |
| Responsive breakpoint collapses multi-stat hero cards to single column on 13" laptop | Executives on MacBook Pro see one card per row instead of four | Test at 1280px viewport before shipping; set minimum grid breakpoint at `lg:` (1024px) not `md:` (768px) for Pro screens |
| "Loading..." shown during sort on client-sorted table | Instant client sort shows a flash of loading state if incorrectly wrapped in Suspense | Client-side sort must not trigger any Suspense boundary; only server re-fetches need loading states |

---

## "Looks Done But Isn't" Checklist

- [ ] **Taxonomy backfill:** Verify `canonical_fee_key IS NOT NULL` count matches total non-rejected fees before removing fallback — do not assume "matched: X" in categorize script output equals "all rows updated."
- [ ] **Auto-classification live:** Confirm new fees inserted by `crawl.py` and `state_agent.py` actually write `canonical_fee_key` at insert time, not just `fee_category`. The column must be in the `INSERT` statement, not only in the `UPDATE` backfill.
- [ ] **Sortable tables:** Verify sort persists through filter changes — apply a peer filter while sorted by median, then apply another filter; confirm both persist.
- [ ] **PDF reports:** Open generated PDF in Adobe Reader or Preview (not Chrome PDF viewer) — Chrome renders some invalid PDFs that other readers reject.
- [ ] **PDF fonts:** Download the PDF, email it to a device without Geist installed — confirm text renders with the embedded font, not a fallback serif.
- [ ] **Responsive Pro screens:** Test at 1280px (13" MacBook at native resolution), not only at the 1920px development viewport.
- [ ] **Report data piping:** After Call Report data changes, verify the PDF regenerates fresh data — confirm ISR or cache invalidation is wired, not serving a stale cached render.
- [ ] **Stripe billing portal:** After wiring, test with a Stripe test subscription in `past_due` state — confirm the user is gated but not permanently locked out with no recovery path.
- [ ] **categorize_fees.py DB path:** Confirm the production Postgres path uses `$1` placeholders, not the legacy SQLite `?` placeholders visible in the current `categorize_fees.py`.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Taxonomy backfill corrupts index counts | MEDIUM | Roll back by querying from `fee_category` (unchanged); `canonical_fee_key` is additive, so dropping the column restores prior state without data loss |
| False merge of NSF into overdraft | HIGH | Manual review of all fees mapped to `overdraft` in affected crawl batches; re-run categorize with corrected alias table; re-stage affected fees |
| Sort state breaks URL filter pattern | LOW | Fix URLSearchParams clone pattern in filter bar; no data impact; redeploy |
| PDF render crashes in production | LOW | Disable PDF download link; serve web view with print CSS as fallback; fix react-pdf issue in a hotfix |
| Big bank crawl triggers legal concern | HIGH | Immediately pause crawl for affected institutions in `config.yaml`; document what data was collected; do not re-crawl until ToS reviewed |
| Auto-classification runs inline and adds >500ms to extraction | MEDIUM | Move LLM fallback to async post-processing queue; alias lookup stays inline; degraded coverage acceptable temporarily |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Taxonomy backfill breaks live index | Taxonomy consolidation (first phase) | Compare `institution_count` per category before and after backfill; delta must be zero |
| False merge of NSF/Overdraft, Domestic/International | Taxonomy consolidation (before alias expansion) | Run `NEVER_MERGE` guard pytest before any categorize-fees production run |
| Auto-classification adds pipeline latency | Auto-classification phase | Benchmark extraction time per fee with and without inline classification |
| Sortable tables memory blowup | Sortable tables phase | Profile browser memory on review queue at 1,000+ rows |
| Sort state conflicts with URL filters | Sortable tables phase | Manual QA: apply filter, change sort, apply filter again — verify both persist |
| react-pdf cannot render Recharts | Report PDF generation phase | Spike PDF generation with a real Recharts chart before committing to the approach |
| Responsive retrofit breaks desktop density | Hamilton Pro polish phase | Test all Pro screens at 1280px before and after responsive changes |
| Playwright vs. big bank bot detection | Pipeline coverage phase | Track success rate by bank tier; document legal review of ToS for top 250 targets |

---

## Sources

- Codebase: `src/lib/crawler-db/fee-index.ts` — `getNationalIndex()` filters on `CANONICAL_CATEGORIES` array; confirmed current behavior
- Codebase: `src/components/sortable-table.tsx` — client-side sort and pagination confirmed in-memory via `useMemo`
- Codebase: `fee_crawler/commands/categorize_fees.py` — batch update pattern confirmed; SQLite `?` placeholder noted vs. Postgres `$1` required
- Codebase: `fee_crawler/fee_analysis.py` — `FEE_NAME_ALIASES` alias table; `get_fee_family()` lookup confirmed
- Project memory: `project_reextraction_big_banks.md` — 116/250 big banks failed re-extraction, Playwright stealth already at ceiling
- Project memory: `feedback_nsf_overdraft_distinction.md` — explicit never-infer rule for NSF vs Overdraft
- [react-pdf GitHub issue #1050: Charts in PDF](https://github.com/diegomura/react-pdf/issues/1050) — SVG rendering limitation confirmed
- [react-pdf-charts npm package](https://github.com/EvHaus/react-pdf-charts) — workaround library; MEDIUM confidence on coverage
- [Zero-downtime PostgreSQL migrations (Lob Engineering)](https://www.lob.com/blog/meeting-expectations-running-database-changes-with-zero-downtime) — expand-and-contract pattern
- [Playwright stealth limitations against Cloudflare (Scrapfly)](https://scrapfly.io/blog/posts/playwright-stealth-bypass-bot-detection) — advanced bot detection confirmed
- [NCUA NSF/OD reporting policy change 2025](https://ncua.gov/newsroom/press-release/2025/hauptman-announces-changes-ncuas-overdraftnsf-fee-collection) — regulatory context for NSF/OD distinction importance

---
*Pitfalls research for: Bank Fee Index v9.0 — Data Foundation & Production Polish*
*Researched: 2026-04-09*
