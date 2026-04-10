# Feature Research

**Domain:** Data consolidation pipeline + production polish for a B2B bank fee intelligence platform
**Researched:** 2026-04-09
**Milestone context:** v9.0 — Canonical fee taxonomy layer, auto-classification pipeline, admin UX polish, consulting-grade PDF reports
**Confidence:** HIGH for what's already built (direct code inspection); MEDIUM for taxonomy/classification design patterns; LOW for PDF design patterns (single source)

---

## Scope of This Research

This file covers v9.0 feature surface only. It does not re-research Hamilton Pro screens (covered in prior FEATURES.md). The four problem areas are:

1. **Canonical taxonomy consolidation** — 15,575 raw fee categories, 92% single-institution, 49 canonical. Bridge the gap.
2. **Auto-classification pipeline** — New crawled fees must route to canonical taxonomy automatically, not manually.
3. **Admin UX polish** — Sortable tables across all admin pages; districts page wired to real data; catalog toggle fix.
4. **Report quality upgrade** — Call Reports, FRED, Beige Book data flowing into PDF output; Salesforce-grade layout.

Code inspection findings that constrain design:
- `fee_analysis.py` `FEE_NAME_ALIASES` dict: ~300 hardcoded string → canonical key mappings. `categorize_fees.py` does exact-match only after `normalize_fee_name()`. Anything not in the alias table falls through as "unmatched."
- `SortableTable` component exists at `src/components/sortable-table.tsx` (client-side sort + pagination). Only wired to `/admin/index`. Not used in market, peers, fees/catalog, districts, institutions, leads, ops, review pages.
- PDF generation uses `@react-pdf/renderer` via `/api/pro/report-pdf`. No charts in PDF (deferred, per D-09 comment). HTML report engine (`assemble-and-render.ts`) is a separate path for public reports.
- District DB tables exist (`fed_beige_book`, `fed_content`, `fed_economic_indicators`). The `/admin/districts` page and detail page exist but may not consume the Phase 23-24 district query functions.

---

## Feature Area 1: Canonical Fee Taxonomy Consolidation

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `canonical_fee_key` column on `extracted_fees` | Every analytics layer downstream (peer index, market, Hamilton) requires a stable key for aggregation; raw `fee_name` is unanalyzable | MEDIUM | Column likely already exists (`fee_category`); the task is populating it for the 92% un-mapped long-tail |
| `fee_family` column populated for all rows | Family-level aggregation ("Overdraft & NSF") is the first grouping level used in every Hamilton output and admin page | LOW | Column exists; already populated for the ~8% that matched. Backfill needed for remainder. |
| Duplicate normalization: obvious synonyms merged | `rush_card` and `rush_card_delivery` appearing as separate categories confuses every downstream consumer; users expect consistency | MEDIUM | Alias table already handles many; the un-mapped 92% may contain duplicate-concept clusters not yet in aliases |
| Variant normalization: suffix inflation collapsed | `fax`, `fax_fee`, `fax_service` are the same economic concept; they must map to one canonical key | MEDIUM | Pattern: strip common suffixes (`_fee`, `_charge`, `_service`) before alias lookup as a normalization step |
| Synonym cluster consolidation | `skipapay`, `skip_a_pay`, `skip_a_payment`, `skip_payment` are institution-naming variants for the same product | HIGH | Requires either an expanded alias table or LLM-assisted grouping pass on the long-tail |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| LLM-assisted canonical mapping for un-matched tail | The 92% long-tail cannot be covered by hand-written aliases alone; a Claude Haiku batch pass that maps each unique `fee_name` to the nearest canonical key (or proposes a new one) is the only scalable path | HIGH | Run once as a backfill batch; output reviewed and committed as alias expansions; not a runtime path |
| Variant_type tagging (`standard`, `rush`, `waived`, `promotional`) | Within a canonical key, variant tagging adds a dimension that makes peer comparison more precise ("First National charges $35 for standard card replacement vs. $75 for rush") | MEDIUM | New column; enriches downstream analysis; not required for basic consolidation but high analytical value |
| Confidence scoring on canonical mapping | Mappings produced by LLM or fuzzy match should carry a confidence field so analysts can triage questionable mappings differently from alias-exact mappings | LOW | Float 0-1 on `canonical_confidence`; parallels existing `extraction_confidence` pattern |
| New canonical key proposal pipeline | When LLM can't map to an existing canonical, it proposes a new key with family assignment; admin reviews + approves to extend the taxonomy | HIGH | Extends the 49-category taxonomy over time as new fee types appear; makes the taxonomy a living asset not a frozen schema |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Map every unique fee_name to canonical in real-time during extraction | Seems cleaner than a backfill | LLM round-trip per fee during crawl doubles extraction cost and latency; errors during classification block fee storage | Batch LLM pass post-extraction; store raw fee_name always; classification is a secondary enrichment step |
| Fully automated taxonomy with no human review | Saves analyst time | LLM classification errors accumulate silently; wrong canonical mapping produces wrong peer benchmarks (downstream trust damage) | LLM-proposed mappings with confidence < 0.8 route to a review queue; high-confidence mappings auto-commit |
| Treat all 15,575 categories as potential canonical keys | Comprehensive | Creates an unusable taxonomy; the value of the canonical layer is compression, not completeness | Hard 49-category cap for v1 with a structured extension process; long-tail that doesn't fit is tagged `uncategorized` not fabricated |

---

## Feature Area 2: Auto-Classification Pipeline

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| New fees classified at extraction time | Every crawl after v9.0 must land in the canonical taxonomy without a manual backfill step; otherwise the index degrades on every run | MEDIUM | Wire `categorize_fees` logic into `pipeline/executor.py` post-extraction, before merge step |
| Alias table as primary classifier | Fast, deterministic, zero-cost; must be the first classification step | LOW | Already exists; the gap is that it's run as a standalone command, not wired into the extraction pipeline automatically |
| LLM fallback for alias misses | When alias table has no match, a Haiku prompt maps the fee to canonical; this is the "always succeeds" guarantee | MEDIUM | Adds cost (~$0.001/fee at haiku rates); acceptable given daily budget circuit breaker already in place |
| Classification result written to `extracted_fees` at insert time | The merge step (`merge_fees.py`) already reads `fee_category` and `fee_family` from the categories/fee_families lists passed to it; the pipeline just needs to populate those correctly | LOW | `merge_institution_fees()` already accepts `categories` and `fee_families` params — this is wiring, not new code |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Incremental alias table expansion from LLM output | Each LLM classification that was validated by an analyst gets committed back to `FEE_NAME_ALIASES`; the alias table grows with each crawl cycle | MEDIUM | Compound knowledge pattern already established for the national.md knowledge system; same principle |
| Classification audit trail per fee | Knowing whether a canonical mapping came from alias-match vs. LLM-fallback vs. manual override is valuable for data quality scoring | LOW | New `classification_method` column: `alias_exact`, `alias_fuzzy`, `llm_haiku`, `manual`; low cost |
| Batch Haiku classification for long-tail backfill | 15K fees x ~100 per batch = ~150 Haiku API calls; at $0.25 per million input tokens this is under $5 total for the entire backfill | MEDIUM | Budget-safe; can run as a one-time Modal job |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Classification as a blocking step in the crawl pipeline | "Fail early" instinct | If classification fails (API timeout, model error), it blocks fee storage entirely; a failed classification should never prevent a fee from being stored | Store with `fee_category = NULL`; classification always runs as a best-effort enrichment step; merge handles NULL categories gracefully |
| GPT-4-class model for classification | Higher accuracy instinct | 10-20x cost; classification is a pattern-matching task, not reasoning; Haiku is sufficient | Haiku for classification; Sonnet/Opus reserved for Hamilton analysis |

---

## Feature Area 3: Admin UX Polish — Sortable Tables

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| All admin list views sortable by key columns | Standard behavior for any data-dense admin panel; Bloomberg, Salesforce, every admin product sorts tables | LOW | `SortableTable` component already built and working; this is a wiring task, not engineering |
| Institutions table (`/admin/institutions`) sortable | Analysts need to find institutions by asset size, name, fee count | LOW | `src/app/admin/institution-table.tsx` — convert to `SortableTable`; server-fetched rows passed as JSON props |
| Leads table (`/admin/leads`) sortable | Operators triage leads by date, source, status | LOW | `src/app/admin/leads/leads-table.tsx` — already likely a simple table; convert |
| Districts table (`/admin/districts`) sortable | Analysts compare districts by median fee, institution count | LOW | `src/app/admin/districts/page.tsx` — needs wiring |
| Fees catalog (`/admin/fees`) sortable | Default view for fee categories; analysts sort by institution count, median | LOW | `src/app/admin/fees/page.tsx` — convert |
| Market table (`/admin/market`) sortable | Core analytics page; delta column sort (largest divergence from national first) is the primary use case | MEDIUM | `src/app/admin/market/page.tsx` — already has category-explorer; sortable delta column is the priority |
| Review queue (`/admin/review`) sortable by confidence, amount | Analysts prioritize high-confidence items first | LOW | `src/app/admin/review/review-table.tsx` — partially done per code inspection; verify sort column coverage |
| Peers page (`/admin/peers`) sortable by name, institution count | Operator manages saved peer sets | LOW | `src/app/admin/peers/page.tsx` |
| Ops table (`/admin/ops`) sortable by run date, status, duration | Operators monitor pipeline health | LOW | `src/app/admin/ops/ops-client.tsx` |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| URL-persisted sort state | Analysts who bookmark a sorted view expect the sort to survive a page reload; `/admin/institutions?sort=asset_size&dir=desc` | MEDIUM | Requires converting client-side sort state to URL params via `useRouter`; `SortableTable` currently uses local `useState` |
| Column visibility toggle on wide tables | Market and institutions tables have many columns; hiding less-used columns reduces cognitive load | MEDIUM | Not in current `SortableTable`; add via column picker dropdown; v1.x not MVP |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Server-side sort for all tables | Correct for large datasets | 15K rows is large; but admin tables already fetch filtered data (LIMIT 200 on peers, etc.); client-side sort on the fetched set is fine and avoids refetch latency | Client-side sort via `SortableTable` for current data volumes; revisit if tables exceed 1K visible rows |
| Drag-to-reorder columns | Power user request | High complexity, low usage frequency in an admin tool; Bloomberg-style customization is a v3+ concern | Fixed opinionated column order per page; sortable by click is the 80% use case |

---

## Feature Area 4: Districts Data Consumption

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| District median fees displayed on `/admin/districts` | The district pages exist and the data exists in `fed_beige_book`, `fed_content`, `fed_economic_indicators` tables; absence makes the page feel empty | MEDIUM | Phase 23-24 district queries were built; wire them into the district page server components |
| District detail page (`/admin/districts/[id]`) with economic summary | Analysts expect each district to show economic context alongside fee data | MEDIUM | Fetch from `fed_economic_indicators` for the district; already have DB queries per `src/lib/crawler-db/fed.ts` |
| CFPB complaint data per district | Risk intelligence per region; ties fee positioning to complaint exposure | MEDIUM | `src/lib/crawler-db/complaints.ts` exists; wire to district detail |
| Beige Book themes per district | Regional economic narrative that contextualizes fee trends | LOW | `getBeigeBankThemes()` or equivalent already built; display on district detail |

---

## Feature Area 5: Report Quality Upgrade

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Call Report financial data in report body | A consulting-grade bank fee report that doesn't reference actual revenue figures ($0 bug) is not credible | HIGH | `src/lib/crawler-db/call-reports.ts` and `fee-revenue.ts` exist; the bug is thousands-scaling (reported in MEMORY.md); fix the scaling, wire to report assemblers |
| FRED economic indicators in report context | Macro context (rate environment, CPI, deposit flows) is expected in any professional fee analysis | MEDIUM | `fed_economic_indicators` table has FRED data; `assemble-and-render.ts` dispatch chain needs FRED data piped through |
| Beige Book commentary used in report narrative | Hamilton has `queryRegulatoryRisk` and Beige Book tables; the report assemblers currently don't inject this into PDF output | MEDIUM | Assembler-level change: include `fed_beige_book` themes in the data payload passed to Hamilton section generation |
| Salesforce Connected FINS-style layout in PDF | The current `PdfDocument.tsx` uses Helvetica, no charts, minimal visual hierarchy; it looks like a formatted text file, not a consulting report | HIGH | Design tokens already defined in `PdfDocument.tsx`; the gap is visual hierarchy: numbered chapters, bold stat callout boxes, section dividers with labels |
| Stat callout boxes in PDF | Consulting reports use large-number callouts ("$35 — median overdraft fee, 3rd quartile nationally") as visual anchors | MEDIUM | `@react-pdf/renderer` supports styled `View` boxes with large `Text`; no dependency gap, this is layout work |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Charts in PDF via pre-rendered PNG | The D-09 decision deferred charts; this is the highest-impact design upgrade; peer distribution histograms in a board-ready PDF is a meaningful differentiator over any competitor | HIGH | Pattern: generate chart as PNG server-side (node-canvas or Recharts to SVG → sharp to PNG), then embed via `@react-pdf/renderer` Image component; significant work |
| Coverage disclosure section | Reports that cite how many institutions the analysis is based on, and what coverage percentage that represents, build trust that competitors don't | LOW | Data already available; add a "Data Scope" footer section to every report template |
| Report generation time under 30 seconds | Executives will close the tab if a report takes longer than 30s; fast generation is a trust signal | MEDIUM | Profile the current assembly pipeline; Hamilton section generation with Sonnet is the bottleneck; parallelize sections where possible |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| In-report editing before PDF export | Executives want to customize content | Report editing is a word processor, not a research product; degrades the authority of the output | Generate → PDF → if edit needed, user annotates in Acrobat; report must be good enough not to need editing |
| Interactive charts in the PDF | Impressive in demos | PDFs are static; interactive chart libraries produce bitmap artifacts when rasterized; the D-09 decision was correct | Static SVG → PNG → embed for print; interactive charts stay in Analyze/Simulate screens only |
| Unlimited report history (all-time archive) | User assumption about SaaS behavior | Storage and retrieval complexity adds operational burden before product proves value | 90-day report retention window; older reports reachable via Stripe billing log if needed |

---

## Feature Dependencies

```
Canonical fee taxonomy (canonical_fee_key populated)
    └──required by──> Auto-classification pipeline (needs the key set to map to)
    └──required by──> Hamilton Pro peer index accuracy (all 5 screens use peer index)
    └──required by──> Report quality (benchmarks must reference canonical keys)
    └──enhances──> Admin market page delta column accuracy

Auto-classification pipeline (new fees classified at insert)
    └──requires──> Canonical taxonomy (key set must exist first)
    └──required by──> Ongoing index accuracy (without auto-classify, every crawl degrades coverage)

SortableTable wiring (admin UX)
    └──independent of──> Taxonomy work
    └──independent of──> Report work
    └──requires──> Existing SortableTable component (already built)

Districts data wiring
    └──requires──> Phase 23-24 DB queries (already built per MEMORY.md)
    └──independent of──> Taxonomy work

Report quality upgrade
    └──requires──> Call Report scaling fix (data exists, bug must be fixed first)
    └──requires──> FRED data piped through assembler chain
    └──enhances by──> Canonical taxonomy (better benchmarks = better reports)
    └──independent of──> SortableTable wiring

Stripe billing portal wiring
    └──independent of──> All technical feature areas
    └──requires──> Existing Stripe subscription shell (already built per PROJECT.md)
```

### Dependency Notes

- **Taxonomy before auto-classify:** The classification pipeline cannot be wired until the canonical key set is finalized. Taxonomy consolidation and duplicate normalization must land first, then the auto-classify pipeline can be wired safely.
- **Call Report scaling fix before report quality:** Stat callout boxes that show "$0 in service charge revenue" (the current bug) are worse than no stat callouts. Fix the thousands-scaling first, then add the stat callout design pattern.
- **Sortable tables are independent:** No taxonomy or report dependency. Can run in parallel with any other work and provides high visible polish for low cost.
- **Districts is independent:** The data and DB queries exist; this is a wiring task independent of other areas.

---

## MVP Definition for v9.0

### Launch With (v9.0 core)

- [ ] Backfill script: expand `FEE_NAME_ALIASES` with LLM-assisted mapping for top-N unmatched fee names (by institution count)
- [ ] Duplicate normalization: merge at least the confirmed duplicate clusters (rush_card variants, fax variants, return_mail variants, skipapay variants)
- [ ] Auto-classify wired into extraction pipeline: new crawls automatically run categorize step before merge
- [ ] SortableTable wired to all 8 un-wired admin pages (institutions, leads, districts, fees, market, peers, ops, review full coverage)
- [ ] Districts page wired to Phase 23-24 DB queries (district medians, economic indicators, Beige Book themes)
- [ ] Call Report scaling bug fixed (thousands not units in service charge revenue)
- [ ] FRED + Beige Book data piped into report assemblers
- [ ] PDF stat callout boxes (design upgrade; no chart dependency)
- [ ] Hamilton Pro demo text stripped from all 5 screens

### Add After Validation (v9.x)

- [ ] LLM-proposed new canonical key review queue — after backfill validates the process
- [ ] Variant_type tagging (`standard`, `rush`, `waived`) — after canonical layer is stable
- [ ] URL-persisted sort state in admin tables — after admin polish proves useful
- [ ] Charts in PDF via pre-rendered PNG — significant effort; justify with report adoption data
- [ ] Stripe billing portal fully wired — after subscription model validates

### Future Consideration (v10+)

- [ ] Multi-category simulation in Hamilton Pro (depends on canonical layer being stable)
- [ ] New canonical key proposal UI for analysts (taxonomy stewardship tooling)
- [ ] Competitor fee data scan (separate product surface)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Taxonomy backfill (alias expansion + LLM pass) | HIGH — unblocks all downstream analytics | MEDIUM | P1 |
| Auto-classify wired into pipeline | HIGH — prevents future degradation | MEDIUM | P1 |
| Call Report scaling bug fix | HIGH — broken data in reports destroys trust | LOW | P1 |
| SortableTable wiring (all admin pages) | MEDIUM — UX polish | LOW | P1 |
| Districts page data wiring | MEDIUM — wasted infrastructure otherwise | MEDIUM | P1 |
| Hamilton Pro demo text strip | HIGH — product looks unprofessional with sample data | LOW | P1 |
| PDF stat callout boxes (design) | MEDIUM — visual upgrade, no data dependency | MEDIUM | P2 |
| FRED + Beige Book in report assemblers | HIGH — consulting-grade credibility | MEDIUM | P2 |
| Stripe billing portal wiring | MEDIUM — required for subscription revenue | MEDIUM | P2 |
| Duplicate normalization (synonym clusters) | MEDIUM — improves index quality | HIGH | P2 |
| Variant_type tagging | MEDIUM — analytical depth | MEDIUM | P3 |
| Charts in PDF | HIGH — design differentiation | HIGH | P3 |
| URL-persisted sort state | LOW — convenience only | MEDIUM | P3 |

---

## Sources

- Direct code inspection of `fee_crawler/fee_analysis.py`, `fee_crawler/commands/categorize_fees.py`, `fee_crawler/commands/merge_fees.py` (HIGH confidence)
- Direct code inspection of `src/components/sortable-table.tsx`, `src/app/admin/` page files (HIGH confidence)
- Direct code inspection of `src/app/api/pro/report-pdf/route.ts`, `src/components/hamilton/reports/PdfDocument.tsx`, `src/lib/report-engine/assemble-and-render.ts` (HIGH confidence)
- Project MEMORY.md — districts data gap, sortable tables feedback, report data piping, Call Report scaling bug (HIGH confidence — project owner recorded)
- PROJECT.md v9.0 milestone requirements (HIGH confidence — authoritative project spec)
- `@react-pdf/renderer` pattern for static chart embedding: standard practice documented in library; PNG embed via Image component (MEDIUM confidence)
- LLM-assisted taxonomy classification pattern: established pattern in data enrichment pipelines; batch Haiku classification is cost-safe at current token pricing (MEDIUM confidence)

---

*Feature research for: Bank Fee Index v9.0 — Data Foundation & Production Polish*
*Researched: 2026-04-09*
*Supersedes: Not applicable — this covers new milestone scope not addressed in prior FEATURES.md*
