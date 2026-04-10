# Project Research Summary

**Project:** Bank Fee Index v9.0 — Data Foundation & Production Polish
**Domain:** B2B bank fee intelligence platform — data consolidation, admin UX, consulting-grade PDF reports
**Researched:** 2026-04-09
**Confidence:** HIGH

## Executive Summary

Bank Fee Index v9.0 is a production-hardening milestone for an existing platform that has a working crawl pipeline, admin UI, and Hamilton Pro research surface but carries two structural debts that are now limiting product quality: (1) 15,575 raw fee categories with only ~8% mapped to canonical taxonomy, making peer benchmarking and index accuracy unreliable; and (2) a report output layer that receives real data but renders it poorly — Call Reports show $0 due to a thousands-scaling bug, charts are absent from PDFs, and the visual layout reads like a formatted text file rather than a consulting deliverable. All four research areas confirm the same conclusion: the infrastructure is sound, the gaps are wiring and polish, not architecture.

The recommended approach is to execute in dependency order. Canonical taxonomy consolidation must come first because it unblocks every downstream analytics surface — peer benchmarks, Hamilton report accuracy, and market index delta precision all depend on fees resolving to stable canonical keys. Auto-classification pipeline wiring follows immediately: the taxonomy is worthless if new crawls do not populate it. Sortable table wiring and Hamilton Pro polish are independent and can proceed in parallel with taxonomy work. Report quality upgrade comes last because its primary inputs (Call Report data, FRED indicators) must be fixed at the data layer before the PDF layout upgrade provides any value.

The primary risk is the taxonomy backfill corrupting live index counts during migration. The mitigation is the expand-and-contract pattern: add canonical_fee_key as a nullable column first, leave fee_category untouched as the active query target, backfill and verify, then flip queries to use the new column. A secondary risk is false merges in the alias table — specifically NSF vs Overdraft and domestic vs international wires — which are regulatory distinctions that string similarity cannot reliably detect. Guard tests enforcing a NEVER_MERGE list must precede any alias table expansion.

## Key Findings

### Recommended Stack

The v9.0 stack adds exactly three new packages on top of the already-validated v8.0 foundation (Next.js 16, React 19, Tailwind v4, postgres client, Anthropic SDK, Vercel AI SDK, Stripe, Radix UI, Recharts, @react-pdf/renderer, Zustand). The additions are surgical and purpose-specific.

**Core technologies — new additions only:**
- `fuse.js` ^7.0.0: client-side fuzzy canonical key lookup in admin review UI — 15KB, zero deps, Bitap algorithm, instant in-browser matching against the 200-key taxonomy
- `@tanstack/react-table` ^8.21.3: headless sort engine for admin tables — hooks-based, zero CSS opinion, plugs directly into existing Tailwind markup, React 19 compatible
- `rapidfuzz` >=3.14: Python fuzzy matching for auto-classification pipeline — C++-backed, 10-100x faster than fuzzywuzzy, same API, required for processing 15K+ raw categories in Modal workers without hitting timeouts

**Already present, extended for v9.0:**
- `pg_trgm` Postgres extension (Supabase standard): GIN index on fee_category for similarity-based duplicate detection — sub-second at 15K rows, no new operational dependency
- `@react-pdf/renderer` v4.4 (already installed): report PDF layout upgrade using stat callouts and chapter structure; charts embedded via SVG-to-data-URI path from Recharts, not direct component rendering
- Tailwind v4 container queries (already in core): used for Hamilton Pro screen component responsiveness — no plugin required

**Explicitly rejected:** sentence-transformers (400MB Modal worker weight for a 200-key taxonomy), ag-grid (own CSS conflicts with Tailwind), Elasticsearch/Typesense (overkill for 200 keys), Puppeteer/chromium (already rejected in v8.0, Vercel 250MB limit).

### Expected Features

Research identified five distinct feature areas for v9.0. All are production-hardening or data-wiring work — no new product surface. Two are P1 blockers, three are P1/P2 polish.

**Must have (table stakes):**
- Canonical taxonomy backfill — canonical_fee_key populated on all 15K existing rows via SQL CASE WHEN for matched categories, Python CLI for variant detection on long-tail
- Auto-classification wired inline — new crawled fees classified at INSERT time, not as deferred post-processing; fee_category IS NULL rows silently drop from the national index
- Call Report thousands-scaling bug fixed — reports currently show $0 in service charge revenue; this is a data scaling error, not a missing data problem; must be fixed before any report layout work begins
- SortableTable wired to all 8 un-wired admin pages — component already built and working on /admin/index; adoption is wiring only
- Hamilton Pro demo text stripped — product looks unprofessional with sample data on paid screens

**Should have (differentiators):**
- Districts page wired to Phase 23-24 DB queries — tables exist, queries exist, page exists; data is not flowing
- FRED + Beige Book data piped into report assembler payload structs — Hamilton has the data; assemblers do not inject it
- PDF stat callout boxes — Salesforce Connected FINS visual pattern; @react-pdf/renderer supports styled View boxes; layout work only
- Stripe billing portal surfaced in Pro settings — createPortalSession() and ManageBillingButton already exist; one import away from working

**Defer to v9.x / v10+:**
- Charts in PDF via pre-rendered PNG — high design value, significant implementation effort; spike required to validate react-pdf SVG rendering approach before committing
- LLM-proposed new canonical key review queue — after backfill validates the process
- Variant_type tagging (standard, rush, waived) — after canonical layer is stable
- URL-persisted sort state in admin tables — convenience only; local sort state is acceptable for v9.0
- Multi-category simulation in Hamilton Pro — depends on canonical layer stability

**Dependency chain (non-negotiable ordering):**
1. Canonical taxonomy consolidation must precede auto-classification wiring
2. Call Report scaling bug must be fixed before any report layout upgrade
3. Alias table NEVER_MERGE guard tests must be written before any alias expansion runs in production

### Architecture Approach

The v9.0 architecture requires no structural changes. All work lands as modifications to existing files within the established pattern: Python pipeline owns classification logic (fee_analysis.py is the single normalization source), TypeScript mirrors constants for the UI (fee-taxonomy.ts), server components fetch data and pass it to client components for sort state, and @react-pdf/renderer stays behind a Node.js API route. The canonical fee layer adds two nullable columns to extracted_fees and extends the write path in extraction_worker.py and llm_batch_worker.py to call a new classify_fee() wrapper around the existing normalize_fee_name().

**Major components — what changes:**
1. `fee_analysis.py` — add CANONICAL_KEY_MAP dict (49 entries), detect_variant_type(), classify_fee() wrapper, synonym consolidation for known duplicate clusters (rush_card variants, skipapay variants, fax variants, return_mail variants)
2. `extraction_worker.py` + `llm_batch_worker.py` — call classify_fee() at INSERT time; write canonical_fee_key and variant_type on every new fee row
3. `src/components/sortable-table.tsx` — no change; adopt in 8 additional admin pages by wrapping server-fetched row arrays in page-specific client wrapper components
4. `src/components/hamilton/reports/PdfDocument.tsx` — layout upgrade: stat callouts with styled View boxes, numbered chapter headers, section dividers; parallel design system from web components (Yoga layout engine, not browser CSS)
5. `src/lib/report-assemblers/` — wire Call Report + FRED data into payload structs passed to PDF generation route

**Critical boundary to maintain:** Python is authoritative for taxonomy; TypeScript mirrors. Any drift between CANONICAL_KEY_MAP in fee_analysis.py and fee-taxonomy.ts is a silent bug — add a unit test asserting category count equality across both files.

### Critical Pitfalls

1. **Taxonomy backfill breaks live index** — getNationalIndex() filters on fee_category; if the backfill reassigns categories before code is deployed, the index silently loses coverage. Prevention: expand-and-contract pattern — add canonical_fee_key as nullable column, keep fee_category untouched as the active query key throughout migration, verify row counts match before switching any query reference.

2. **False merges in synonym consolidation** — NSF vs Overdraft and domestic vs international wires must never merge; string similarity cannot distinguish these regulatory categories. Prevention: write a NEVER_MERGE pytest guard that runs in CI before any alias table change ships; add it before expanding any aliases.

3. **Auto-classification blocking the crawl pipeline** — LLM fallback at 300-800ms per fee will cause Modal workers to miss the 2am-4am extraction window at scale. Prevention: alias lookup runs inline (zero latency); LLM fallback for unmatched fees runs async/queued; fees write with canonical_fee_key = NULL when alias lookup genuinely fails, never blocking storage.

4. **SortableTable memory blowup on large tables** — the existing component passes all rows as client props; the review queue can exceed 15K rows. Prevention: audit each admin table's max row count before applying SortableTable; use server-side ORDER BY with URL params for any table that can exceed 200 rows.

5. **react-pdf cannot render Recharts SVGs directly** — react-pdf is a PDF-specific renderer, not a full React renderer; Recharts DOM SVG elements cannot be traversed. Prevention: spike chart embedding strategy before writing any report chart component; use SVG-to-data-URI capture path for v9.0 (one chart per section); do not commit to an approach without a working proof-of-concept.

## Implications for Roadmap

Based on research, the dependency chain is unambiguous. Four execution blocks map to natural phases.

### Phase 1: Canonical Taxonomy Foundation

**Rationale:** Every downstream feature depends on this. Peer benchmarks, Hamilton Pro accuracy, market index delta precision, and report quality all require fees mapped to stable canonical keys. Nothing else in v9.0 improves the product's analytical credibility without this foundation.

**Delivers:** canonical_fee_key column populated on all 15K existing rows; synonym clusters consolidated (rush_card, skipapay, fax, return_mail variants); NEVER_MERGE guard tests in CI; fee-taxonomy.ts mirroring Python constants; backfill verified with zero index count regression.

**Addresses (from FEATURES.md):** Taxonomy backfill (P1), duplicate normalization (P2 but precedes P1 wiring)

**Avoids (from PITFALLS.md):** Taxonomy backfill corrupting live index (expand-and-contract), false merge of NSF/Overdraft (NEVER_MERGE guard tests written first)

**Stack used:** pg_trgm GIN index, SQL CASE WHEN backfill, Python CLI for variant_type, rapidfuzz for alias fuzzy matching

### Phase 2: Auto-Classification Pipeline Wiring

**Rationale:** The taxonomy is worthless if new crawls do not populate it. Every crawl run after v9.0 must land fees in the canonical taxonomy without a manual backfill step — otherwise the index degrades with each run.

**Delivers:** classify_fee() wrapper in fee_analysis.py; extraction_worker.py and llm_batch_worker.py calling classify_fee() at INSERT; classification_method audit column; classification_cache table preventing repeat LLM calls for identical raw strings; new crawls verified to write canonical_fee_key at insert time.

**Addresses (from FEATURES.md):** Auto-classify wired into pipeline (P1), classification audit trail (P2)

**Avoids (from PITFALLS.md):** Classification blocking extraction hot path (alias inline, LLM async), categorize_fees.py SQLite placeholder bug on Postgres path

**Stack used:** rapidfuzz token_set_ratio, Anthropic claude-haiku for LLM fallback, Modal async queue

### Phase 3: Admin UX Polish — Sortable Tables and Districts Data

**Rationale:** Independent of taxonomy work — can run in parallel with Phases 1-2 or sequentially after. High visible polish for low implementation cost. SortableTable component is already built; this is adoption and wiring only. Districts page data wiring resolves wasted Phase 23-24 infrastructure.

**Delivers:** SortableTable wired to all 8 un-wired admin pages (review, institutions, fees, market, peers, leads, ops); row count audited per page with server-side sort applied where needed; districts page consuming district median fees, economic indicators, Beige Book themes, and CFPB complaint data; URL param clone pattern fixed globally before adding sort params.

**Addresses (from FEATURES.md):** SortableTable wiring (P1), districts data consumption (P1)

**Avoids (from PITFALLS.md):** Memory blowup on large tables (row count audit), sort state conflicting with URL filters (clone-first URL mutation pattern)

**Stack used:** @tanstack/react-table v8.21.3 for any tables needing multi-column sort; existing SortableTable component for bounded datasets

### Phase 4: Report Quality Upgrade

**Rationale:** Comes last because its value depends on upstream fixes. Stat callout boxes showing "$0 in service charge revenue" (the current bug) are worse than no stat callouts. Call Report scaling must be fixed, FRED data must flow through assemblers, and canonical taxonomy must be stable before this phase produces meaningful output.

**Delivers:** Call Report thousands-scaling bug fixed; FRED + Beige Book data piped into report assembler payload structs; PdfDocument layout upgraded with stat callout boxes, numbered chapter headers, section dividers; Geist/Newsreader fonts embedded via Font.register(); coverage disclosure section in every report; PDF verified in Adobe Reader (not only Chrome).

**Addresses (from FEATURES.md):** Call Report scaling bug (P1), FRED + Beige Book piping (P2), PDF stat callout boxes (P2)

**Avoids (from PITFALLS.md):** react-pdf Recharts rendering failure (spike chart approach first; SVG-to-data-URI for one chart per section only in v9.0), PDF font fallback (Font.register() required), Edge runtime PDF crash (Node.js runtime confirmed on route handler)

**Stack used:** @react-pdf/renderer v4.4, Recharts SVG-to-data-URI capture, existing report assembler chain

### Phase 5: Hamilton Pro Polish

**Rationale:** Independent of taxonomy and report work. Can run in parallel with any phase. Stripe billing portal wiring is one import. Demo text strip is P1 because it makes the paid product look unprofessional. Responsive layout pass scoped to Pro screens only — admin screens are B2B desktop-only (1024px minimum with overflow-x-auto, not full mobile responsive).

**Delivers:** ManageBillingButton imported into /pro/settings; demo text stripped from all 5 Hamilton Pro screens; responsive layout pass on Analyze and Monitor screens using Tailwind v4 container queries (@container); Pro screens tested at 1280px viewport.

**Addresses (from FEATURES.md):** Hamilton Pro demo text strip (P1), Stripe billing portal in Pro settings (P2), responsive layout (P2)

**Avoids (from PITFALLS.md):** Responsive retrofit breaking desktop density (scope to Pro screens only; admin stays 1024px min-width with overflow-x-auto)

**Stack used:** Tailwind v4 container queries (built into core, no plugin needed)

### Phase Ordering Rationale

- Taxonomy must precede auto-classify: the classification pipeline cannot safely be wired until the canonical key set is finalized; wiring it with an incomplete taxonomy produces a classification cache full of mappings that will need invalidation once the taxonomy stabilizes
- Call Report fix must precede report layout: a stat callout box displaying a wrong number destroys trust faster than a plain-text report; data correctness precedes visual polish
- NEVER_MERGE guard tests are a process gate, not a phase — they must be in CI before any FEE_NAME_ALIASES change ships; NSF/Overdraft and wire confusion are irreversible if they reach the published index
- Sortable tables and Hamilton Pro polish are fully independent; both can proceed in parallel with taxonomy work or sequentially; no shared dependencies with Phases 1-2 or 4
- Expand-and-contract for the backfill: canonical_fee_key is nullable throughout the migration; fee_category remains the active query column until the backfill is verified; the column switch is the final step in Phase 1, not the first

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 4 (Report Quality — chart embedding):** The react-pdf SVG rendering limitation is confirmed but the chart embedding approach (SVG-to-data-URI vs. react-pdf-charts wrapper vs. raw SVG primitives) has not been spiked in this codebase. Required: spike chart embedding before writing any report chart component. Do not plan chart work without a working proof-of-concept.
- **Phase 2 (LLM fallback async queue):** The async queuing pattern for LLM classification fallback has not been prototyped. Modal's async task pattern should be researched before committing to an implementation approach for the fallback queue.

Phases with well-documented patterns (skip research-phase):

- **Phase 1 (Taxonomy backfill):** Expand-and-contract migration is a well-documented zero-downtime Postgres pattern; pg_trgm GIN indexing is standard; no new research needed
- **Phase 3 (Sortable tables):** SortableTable component is already in production; @tanstack/react-table v8 pattern is confirmed; this is adoption work, not engineering
- **Phase 5 (Hamilton Pro polish):** All components exist; Stripe billing portal wiring is a single import; Tailwind v4 container queries are confirmed built-in

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All three new packages verified on npm/PyPI with version compatibility confirmed; no API research needed |
| Features | HIGH | Based on direct codebase inspection of affected files; feature gaps confirmed by code, not assumption |
| Architecture | HIGH | All conclusions drawn from direct codebase inspection; no new patterns introduced |
| Pitfalls | HIGH | Code-grounded; SortableTable in-memory sort confirmed; react-pdf SVG limitation confirmed against GitHub issue; NSF/OD NEVER_MERGE rule from project owner |

**Overall confidence:** HIGH

### Gaps to Address

- **Chart embedding in PDF:** The SVG-to-data-URI approach is documented in react-pdf GitHub discussions but has not been proven in this codebase. Required: a spike that renders one Recharts chart as a data URI and embeds it in a test PDF before Phase 4 planning locks in chart work.
- **LLM fallback async queue pattern in Modal:** The inline alias lookup path is clear, but the async LLM fallback queue design (Modal task queue vs. database-backed queue vs. deferred post-crawl job) needs a decision before Phase 2 implementation. Risk is low — either approach works — but the choice affects pipeline observability and retry behavior.
- **categorize_fees.py Postgres placeholder syntax:** The existing script uses SQLite ? placeholders. The production backfill path must use Postgres $1 syntax. Confirm the correct code path before running any backfill on production Supabase.
- **fee_index_cache table activation threshold:** The architecture notes this cache table exists and is the right materialization target when buildIndexEntries() slows down. The threshold (noted at ~20K rows) should be confirmed with a query plan before Phase 1 closes — if the backfill pushes active row counts past this threshold, the cache may need activation as part of Phase 1, not deferred.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: fee_crawler/fee_analysis.py, extraction_worker.py, llm_batch_worker.py, db.py, categorize_fees.py — normalization pipeline, alias table, write path
- Direct codebase inspection: src/components/sortable-table.tsx, src/app/api/pro/report-pdf/route.ts, src/components/hamilton/reports/PdfDocument.tsx — existing component capabilities and limitations
- Direct codebase inspection: src/lib/crawler-db/fee-index.ts — CANONICAL_CATEGORIES filter; confirmed fee_category is the active query column
- Direct codebase inspection: src/lib/stripe-actions.ts, /account/manage-billing-button.tsx — billing portal gap vs. Pro settings page
- npm: @tanstack/react-table 8.21.3 — React 19 compatibility, "use client" requirement confirmed
- npm: fuse.js 7.0.0 — Bitap algorithm, zero deps confirmed
- PyPI: rapidfuzz 3.14.4 — Python 3.10+ requirement, token_set_ratio confirmed
- PostgreSQL docs: pg_trgm GIN index pattern confirmed
- Tailwind v4 release notes: container queries built into core, no plugin required
- E2E test assertions: test_categorization_stage.py, test_validation_stage.py — NULL handling contract for unclassified fees

### Secondary (MEDIUM confidence)
- Project MEMORY.md: districts data gap, sortable tables feedback, report data piping, Call Report scaling bug — project owner-recorded findings
- LLM-assisted taxonomy classification pattern: established in data enrichment pipelines; batch Haiku classification is cost-safe at current token pricing
- react-pdf SVG-as-Image pattern: documented in react-pdf GitHub discussions — not spiked in this codebase

### Tertiary (LOW confidence)
- react-pdf-charts npm package as chart workaround: library exists; coverage of custom chart components unverified; treat as fallback only
- react-pdf GitHub issue #1050: SVG rendering limitation confirmed; workaround approaches are community-reported, not officially documented
- NCUA NSF/OD reporting policy change 2025: regulatory context for why the NSF/Overdraft distinction is increasing in importance

---
*Research completed: 2026-04-09*
*Ready for roadmap: yes*
