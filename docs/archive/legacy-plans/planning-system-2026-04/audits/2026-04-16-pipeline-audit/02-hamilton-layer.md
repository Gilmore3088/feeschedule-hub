# Hamilton Intelligence Layer — Current State Map

**Audit Date:** 2026-04-16  
**Scope:** Data consumption, report generation, agent architecture, Pro screens, and pipeline quality impact  
**Version:** 1.0

---

## Executive Summary

Hamilton is a three-tier intelligence system consuming crawled fee data (extracted_fees), Federal Reserve data (FRED, Beige Book, Call Reports), and external research. It produces:
- **Reports** (4 types: national_index, state_index, peer_brief, monthly_pulse) via assemblers + template rendering
- **Research agents** (consumer/pro/admin) with fee-index tools + regulatory/economic data
- **Pro screens** (Monitor, Home, Analyze, Simulate, Reports) backed by 6 Hamilton-specific tables

**Critical finding:** Hamilton's report assemblers read directly from fee_category and amount fields with **no source URL validation**. Missing source traceback (80% of fees) does not break reports—medians still compute—but creates **undocumented data quality risk**. Hamilton has no feedback mechanism to flag problematic fees back to the crawler.

---

## Data Consumption

### Which Crawler Tables Hamilton Reads

Hamilton's core data flows through these queries:

| Layer | Source Table | Queries | Used By |
|-------|--------------|---------|---------|
| **Fee Index** | `extracted_fees` | `getNationalIndex()`, `getPeerIndex()` | All report assemblers, research tools, Pro screens |
| **Charting** | `extracted_fees` | `fee_category`, `amount`, `review_status` | index entry building, peer benchmarks |
| **Revenue** | `call_reports` | `getRevenueTrend()`, `getTopRevenueInstitutions()` | National Quarterly assembler, Hamilton agents |
| **Districts** | `fed_beige_book`, `fed_content`, `fed_economic_indicators` | `getBeigeBookHeadlines()`, `getDistrictContent()`, `getRecentSpeeches()` | National Quarterly, district detail pages |
| **Regulation** | `cfpb_complaints` | `getDistrictComplaintSummary()` | Research tool `queryRegulatoryRisk` |
| **External** | `external_intelligence` | `searchExternalIntelligence()` | Hamilton chat, research agents |
| **User State** | `hamilton_signals`, `hamilton_saved_analyses`, `hamilton_scenarios` | User-initiated reads | Pro screens |

**File references:**
- `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/crawler-db/fee-index.ts:25-112` — Index queries
- `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/crawler-db/call-reports.ts` — Revenue ingestion
- `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/crawler-db/fed.ts:14-150` — Fed data queries

### Which External Tables Hamilton Reads

**FRED (Economic Indicators):**
- `fed_economic_indicators` table via `getFredSummary()`
- Fields: `fed_funds_rate`, `unemployment_rate`, `cpi_yoy_pct`, `consumer_sentiment`, `gdp_growth_yoy_pct`, `personal_savings_rate`, `bank_lending_standards`
- Used in: National Quarterly report (`fred` snapshot), Home briefing (context only)
- Failure mode: Returns `fred: null` if query fails; report renders with missing economic context (not a blocker)
- **File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/report-assemblers/national-quarterly.ts:95-115`

**Beige Book (District Commentary):**
- `fed_beige_book` table via `getBeigeBookHeadlines()`, `getBeigeBookThemes()`
- Fields: `release_date`, `fed_district`, `section_name`, `content_text`
- Used in: National Quarterly report (district headlines + themes), district pages
- Failure mode: Returns empty array if no data; report omits district context
- **File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/crawler-db/fed.ts:13-58`

**Call Reports (Institution Financial Data):**
- `ffiec_call_reports_latest` or similar via `getRevenueTrend()`
- Fields: service charge income by quarter, institution counts
- Used in: National Quarterly (revenue snapshot), revenue correlation analysis
- Failure mode: `revenue: null` if query fails; does NOT prevent report publication
- **File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/crawler-db/call-reports.ts`

**External Intelligence (Curated Research):**
- `external_intelligence` table via `searchExternalIntelligence()`
- Fields: `source_name`, `source_date`, `category`, `tags`, `content_text`, `source_url`
- Used in: Hamilton agent `searchIntelligence` tool, research agents
- Supports full-text search against `search_vector` (tsvector)
- **File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/crawler-db/intelligence.ts`

### Filtering and Aggregation Patterns

**Fee Data Filtering:**
```sql
-- Standard Hamilton query pattern (fee-index.ts:30-35)
SELECT ef.fee_category, ef.amount, ef.crawl_target_id, 
       ef.review_status, ef.created_at, ct.charter_type
FROM extracted_fees ef
JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
WHERE ef.fee_category = ANY(ARRAY[canonical categories])
  AND ef.review_status != 'rejected'
```

**Key observations:**
- Includes `pending`, `staged`, and `approved` fees (rejects only `rejected` status)
- No source URL validation: `source_url` is never queried or checked
- No source_traceback validation: this field is ignored entirely
- Aggregation: `computeStats()` function in `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/crawler-db/fees.ts:62-82` handles null amounts gracefully (filters out nulls, computes percentiles on non-null subset)

**Materialized Cache:**
- `fee_index_cache` table (populated by `publish-index` cron job) stores latest national index snapshot
- Used by `getNationalIndexCached()` for Monthly Pulse comparison (prior period baseline)
- Query: `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/report-assemblers/monthly-pulse.ts:51-54`

**Peer Filtering Pattern:**
Applied in `getPeerIndex()` with optional charter_type, asset_tiers[], fed_districts[], state_code:
- Builds dynamic WHERE clause with parameterized queries
- Used by Peer Brief reports and research tools
- **File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/crawler-db/fee-index.ts:48-112`

### Caching and Cost Management

**Report Caching:**
- **National Quarterly, State Index, Peer Brief**: No ISR caching; fresh on every request
- **Monthly Pulse**: Compares live `getNationalIndex()` against cached snapshot from `fee_index_cache`
- **Home Briefing**: ISR 24h revalidation on thesis data; signal queries bypass cache (fresh every load)

**Budget Controls:**
- No explicit Hamilton API rate limiting in source code
- Research agents inherit Anthropic SDK rate limits (implicit 429 handling in try/catch)
- External intelligence search: limited to `LIMIT 20` per query (intelligence.ts:106)
- Hamilton chat: inherited from `/api/research/[agentId]` streaming endpoint rate limiting

**Classification Cache:**
- No explicit `classification_cache` for fee categories observed
- Canonical categories baked into FEE_TIERS constant at compile time
- Category lookup: O(1) via fee-taxonomy.ts enums

---

## Report Generation

### Assemblers — Inputs, Transformations, Outputs

Four assembler functions serve all report types:

#### 1. National Quarterly (`national-quarterly.ts`)

**Inputs:**
- National index (all 49 categories)
- Bank + CU segment breakdown
- Call Reports service charge revenue
- FRED economic data
- Beige Book themes + headlines
- Derived analytics (IQR spreads, bank vs CU premiums)

**Transformations:**
```typescript
// Stages:
// 1. getNationalIndex() → 49 IndexEntry[] with medians/percentiles
// 2. Parallel: getRevenueTrend(8) → revenue snapshot | try/catch fallback null
// 3. Parallel: getFredSummary() → FRED snapshot | try/catch fallback null
// 4. Parallel: getBeigeBookHeadlines() → per-district headlines
// 5. buildThesisSummary() → NationalQuarterlyPayload + DataManifest
```

**Outputs:**
- `NationalQuarterlyPayload` with:
  - `categories[]`: NationalQuarterlySection with fee_category, display_name, medians, percentiles, institution_count, maturity_tier, bank_median, cu_median
  - `revenue`: quarterly service charges, YoY change, institution counts (or null)
  - `fred`: economic snapshot (or null)
  - `district_headlines`: text + release_date per district
  - `beige_themes`: fee-relevant themes tagged by district
  - `manifest`: DataManifest with SQL queries executed, row counts, timestamps

**Quality Checks Before Publish:**
- Maturity tier assignment: "strong" (10+ approved), "provisional" (10+ obs), "insufficient" — inline in buildIndexEntries()
- Categories with null medians (no approved/staged/pending data) are included but flagged
- No validation that source_url is populated
- No validation that source_traceback exists

**File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/report-assemblers/national-quarterly.ts`

#### 2. Monthly Pulse (`monthly-pulse.ts`)

**Inputs:**
- Current national index
- Cached index from `fee_index_cache`

**Transformations:**
- Compare live vs cached medians per category
- Compute `change_pct = ((current - prior) / prior) * 100`
- Filter movers: only categories where `|change_pct| > 5%` appear in output
- Direction: "up" if change_pct > 1%, "down" if < -1%, "flat" otherwise

**Outputs:**
- `MonthlyPulsePayload` with:
  - `movers_up`, `movers_down`: PulseMover[] sorted by |change_pct| descending
  - `manifest`: queries executed (getNationalIndex + getNationalIndexCached)

**Failure Mode:** If cache == live index, movers lists are empty — correct behavior, signals no movement.

**File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/report-assemblers/monthly-pulse.ts`

#### 3. Peer Competitive (`peer-competitive.ts`)

**Inputs:**
- Peer index (filtered by charter_type, asset_tiers, fed_districts)
- National index
- Fee change events (10 most recent per institution)

**Transformations:**
- Compute delta_pct = ((peer_median - national_median) / national_median) * 100 per category
- Identify tightest/widest spreads within peer segment
- Build segment label from filter combination (e.g., "Banks / District 7")

**Outputs:**
- `PeerCompetitivePayload` with:
  - `data`: PeerCompetitiveData (peer index entries + national deltas)
  - `sections[]`: 3-5 pre-assembled PeerBriefSection objects for Modal worker
  - Each section has `section_type`, `title`, `data`, `include` flag

**File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/report-assemblers/peer-competitive.ts`

#### 4. Monthly Pulse (Simpler, already covered above)

### Templates and PDF Rendering

**Location:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/report-templates/`

**Architecture:**
- Base components: `layout.ts`, `styles.ts`, `components.ts`
- Template renderers: `national-quarterly.ts`, `peer-competitive.ts`, `monthly-pulse.ts`, `state-fee-index.ts`
- Each template function receives the assembler's payload and returns styled HTML/PDF-ready markup
- PDF generation likely via headless browser or library (not shown in scope — separate from Hamilton)

**Voice/Editorial Logic:**
- Resides in `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/hamilton/voice.ts`
- `HAMILTON_SYSTEM_PROMPT` (locked) defines tone: McKinsey-grade, data-first, confidence framing
- Admin mode adds regulatory context requirement: "always check CFPB complaint data and Fed Content for enforcement signals before concluding"
- No section rewrites happen post-assembly; templates apply styling only

**Quality Checks:**
- Maturity tier badges indicate data confidence (strong/provisional/insufficient)
- No "data disclaimer" section about source traceback gaps
- Null values for fred/revenue/beige_book are omitted gracefully (not rendered as empty boxes)

---

## Research Agents and Skills

### Agent Architecture (Public vs Admin)

**Public Consumer Agent:**
- System prompt: plain-language, no jargon
- Tools: `searchFees`, `searchIndex`, `getInstitution` (basic public tool set)
- Model: claude-opus (inferred from role)
- Max tokens: 2000
- Max steps: 5
- Example questions: "What's the national average overdraft fee?"

**Pro/Premium Agent:**
- System prompt: banking professional tone, output structured (HEADLINE → MARKET CONTEXT → INSTITUTION EXAMPLES → STRATEGIC IMPLICATION)
- Tools: public tools + non-ops internal tools (queryNationalData, queryRegulatoryRisk, queryOutliers)
- Confidence framing rule: never say "missing data"; use "observed fee schedules indicate", "patterns suggest"
- Max tokens: 3000
- Max steps: 8

**Admin Agent:**
- System prompt: consulting-grade, mandatory confidence framing with 4 levels (HIGH, MODERATE, EMERGING, uncertainty→insight)
- Tools: ALL internal tools including ops (getCrawlStatus, getReviewQueueStats, triggerPipelineJob, queryDataQuality)
- Authority rules: "The data shows" not "there is a trend"; "institutions must" not "may consider"
- Max tokens: 4000
- Max steps: 10

**File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/research/agents.ts`

### Skill System

**Skill Detection:**
- Reads `.claude/skills/*/SKILL.md` files with frontmatter (name, description, triggers)
- Triggers: comma-separated keywords/phrases that auto-activate skills
- Score: multi-word phrase matches += 3, single-word matches += 2, partial matches += 1
- Best skill by score is injected into agent system prompt

**Skill Registry Location:** `.claude/skills/` directory (not shown in production code, likely populated by user)

**Skill Integration:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/research/skills.ts:75-102` — `detectSkill()` function

### Thesis Engine Role

**Global Thesis Generation:**
- Entry point: `generateGlobalThesis()` in `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/hamilton/generate.ts`
- Input: `ThesisSummaryPayload` (top categories, revenue, FRED, Beige Book themes)
- Process: Calls Claude API with system prompt to synthesize 3-5 "derived tensions" (pattern statements)
- Output: `ThesisOutput` with core_thesis, tensions[], implications
- Usage: Home briefing screen, national quarterly intro

**Error Handling:** Thesis generation failure logged as warning; page renders with thesis: null (graceful degradation)

**File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/hamilton/generate.ts`

### Streaming and Cost Controls

**Streaming Endpoint:**
- `/api/research/[agentId]` — Server-sent Events (SSE) for agent responses
- Agent runs tool calls in loop, streams each tool result + final text
- Hamilton agents inherit Anthropic SDK streaming (not explicit request.controller.abort)

**Tool Costs (Approximate):**
- `searchFees()`: ~1 DB query (10-100ms)
- `searchIndex()`: 1-4 DB queries (50-200ms)
- `queryNationalData(source)`: varies (50-500ms for FRED/Beige Book/Call Reports)
- `searchIntelligence()`: full-text search, tsvector rank (100-300ms), limited to 20 results

**Rate Limiting:**
- Implicit via Anthropic SDK (429 handling in agents.ts try/catch)
- No explicit per-user or per-request Hamilton budget observed
- External intelligence search capped at LIMIT 20

---

## Pro Screens

### Monitor Screen (Live Signals + Watchlist)

**Data Sources:**
- `hamilton_signals`: immutable fee change detection records
- `hamilton_priority_alerts`: user-specific alert instances
- `hamilton_watchlists`: per-user institution/category subscriptions

**Fetcher:** `fetchMonitorPageData(userId)` in `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/hamilton/monitor-data.ts`

**What It Shows:**
- **StatusStrip**: overall status (stable/watch/worsening), new signal count, high-priority alert count
- **SignalFeed**: timeline of hamilton_signals ordered by created_at DESC (limit 20)
- **Floating Chat**: Hamilton agent for answering questions about signals

**Data Dependencies:**
```
hamilton_signals
  ← Signal generation triggers (not shown; likely external process)
  
hamilton_priority_alerts
  ← Joins hamilton_signals by signal_id
  ← Filters by user_id, status = 'active'
  ← Severity ordering: high < medium < low < other
  
hamilton_watchlists
  ← Stores institution_ids[], fee_categories[], regions[], peer_set_ids[]
  ← Joined with signals to show only watched items (in v8.0+)
```

**Failure Modes:**
- If no signals exist: signalFeed = [], status = stable (correct)
- If user has no watchlist: watchlist = [] (correct)
- Database error: try/catch fallback to empty state (graceful)
- **No source URL validation** on signals; signals are purely event-driven (created elsewhere)

### Home Screen (Executive Briefing)

**Data Sources:**
- `fee_index_cache` (cached national index)
- Global thesis via `generateGlobalThesis()` (Claude API call)
- Spotlight categories (6 static: monthly_maintenance, overdraft, nsf, atm_non_network, card_foreign_txn, wire_domestic_outgoing)

**Fetcher:** `fetchHomeBriefingData()` in `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/hamilton/home-data.ts`

**What It Shows:**
- **Thesis**: Core market finding (via Claude, or null if API failure)
- **Positioning**: median/p25/p75 for spotlight categories
- **Confidence Badge**: high/medium/low based on maturity tiers
- **Recommended Category**: Derived from thesis tensions (default: overdraft)

**Data Flow:**
```
getNationalIndexCached() → PositioningEntry[] for spotlight categories
                        → deriveConfidence() from maturity_tiers
generateGlobalThesis()  → ThesisOutput (core_thesis, tensions)
                        → Error handling: thesis = null, page renders empty state
```

**Failure Modes:**
- Thesis API failure: logged, page renders with thesis = null (user sees only positioning cards)
- Missing spotlight categories: filtered out with map().filter()
- Null medians: included in positioning (p25/p75/median may be null)

### Analyze Screen (Ad Hoc Analysis + Save)

**Data Sources:**
- `hamilton_saved_analyses`: JSONB response_json field
- Current user's institution context
- All Hamilton agent tools available (searchFees, queryNationalData, etc.)

**Fetcher:** `loadAnalysis(analysisId)` on optional `?analysis=` param

**What It Shows:**
- Query input field
- Chat-like interface with Hamilton agent
- Response sections: Hamilton's View, What This Means, Why It Matters, Evidence, Explore Further
- Save button → persists to hamilton_saved_analyses

**Data Dependencies:**
- `hamilton_saved_analyses.response_json`: stored as JSONB, includes full markdown response
- `hamilton_saved_analyses.analysis_focus`: user-selected lens (e.g., "competitive_positioning")
- User-persisted state: each analysis links to institution_id

**Failure Modes:**
- Invalid/expired analysisId: loadAnalysis returns null, page renders empty state
- Agent tool failure: Hamilton agent error is streamed to user (not hidden)
- Save operation fails: user sees toast error, analysis not persisted
- **No source validation** on underlying fee data; Hamilton presents analysis as-is regardless of fee source quality

### Simulate Screen (What-If Scenarios)

**Data Sources:**
- `hamilton_scenarios`: scenario definition (institution_id, fee_category, current_value, proposed_value, confidence_tier)
- `hamilton_reports` (optional): linked via scenario_id (one-to-many)

**Fetcher:** `loadScenario(scenarioId)` on optional `?scenario_id=` param

**What It Shows:**
- Scenario editor: fee category, current value, proposed value
- Confidence tier selector (strong/provisional/insufficient)
- Impact analysis (revenue, peer position, competitive reaction)
- Save button → persists to hamilton_scenarios

**Data Dependencies:**
- Scenario input: institution_id, fee_category, peer_set_id (optional), horizon (optional)
- Simulation output: result_json JSONB field with impact metrics
- Confidence derivation: heuristic based on data maturity + scenario distance from observed range

**Failure Modes:**
- Confidence tier mismatch: if insufficient data, confidence_tier forced to "provisional"
- Invalid scenario parameters: validation happens client-side; server returns 400
- **No source validation** on peer benchmarks used in simulation; simulation proceeds with whatever index data is available

### Reports Screen (Generated + Published Library)

**Data Sources:**
- `hamilton_reports`: user-generated reports (status = 'generated') + BFI-authored reports (status = 'published')
- `getPublishedReports()` server-side load → published reports seeded at startup

**What It Shows:**
- Tab 1: Generated Reports (user's own, sorted by created_at DESC)
- Tab 2: Published Library (BFI-authored, public to all Pro users)
- Report preview/export options

**Data Dependencies:**
```sql
-- Query in pro-tables.ts:
SELECT * FROM hamilton_reports 
WHERE status = 'published' 
ORDER BY created_at DESC
```

**Failure Modes:**
- No published reports seeded: getPublishedReports() returns [], library shows "No reports yet"
- Report generation fails: error logged, report never inserted, user sees failed_to_generate state
- Export (PDF): not shown in scope (likely Modal worker or headless browser)

---

## Where Pipeline Gaps Bite Hamilton

### Does Hamilton Query `canonical_fee_key` or `fee_category`?

**Answer: fee_category only.**

Hamilton never queries `canonical_fee_key` column. All index queries, report assemblers, and research tools use:
```sql
WHERE ef.fee_category = ANY(ARRAY[canonical categories])
```

**Implications:**
- If a fee has NULL fee_category but valid canonical_fee_key, it's **excluded from all reports and analyses**
- ~5-10% categorization errors in the pipeline → fees with wrong fee_category appear under wrong category in reports
- Example: a $35 overdraft fee miscategorized as "monthly_maintenance" inflates the monthly_maintenance median, deflates overdraft median

**File references:**
- Query pattern: `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/crawler-db/fee-index.ts:30-35`
- Canonical categories check: `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/fee-taxonomy.ts` (FEE_TIERS constant)

### Are Reports Sensitive to Miscategorization?

**Yes. Strongly.**

Miscategorized fees directly inflate/deflate medians and percentiles. Example scenario:
- True overdraft median: $28 (1000 correct observations)
- Miscategorized as overdraft: 5 fees labeled as "loan_origination" but amount $35 (should be overdraft)
- Result: overdraft median shifts toward $28 +/- impact of mix shift

This affects:
- National Quarterly `categories[]` entries (median_amount, p25_amount, p75_amount)
- Monthly Pulse movers (if mismatch between current and cached categorization)
- Peer Brief delta calculations (peer_median - national_median)
- Research agent queryFees tool (category drill-downs)

**Risk Level:** Medium. Median is robust to outliers, but systematic mislabeling (e.g., 10% of overdraft fees labeled as NSF) is not.

### What Happens When a Fee Has No Source URL?

**Answer: Nothing. Hamilton ignores source_url entirely.**

Source URL is never queried in:
- Fee index queries (`fee-index.ts`)
- Report assemblers (`national-quarterly.ts`, `peer-competitive.ts`, etc.)
- Research tools (`tools.ts`, `tools-internal.ts`)
- Pro screens

**Impact:** Hamilton reports present medians and percentiles with **zero visibility into source quality**. A fee with source_url = NULL contributes equally to the national median as a fee extracted from an official fee schedule PDF.

**Example:** If 200 of 400 overdraft fees have NULL source_url, the national median is computed from 400 amounts (including unmapped ones). A researcher cannot distinguish "median from verified sources" from "median including unverified fees."

### Does Any Hamilton Code Fail Gracefully When Data Is Malformed?

**Yes, but incompletely:**

**Graceful degradation patterns:**

1. **Null medians in index queries:**
   - `computeStats()` filters null amounts before computing (skips nulls, works with non-null subset)
   - Reports include categories with null median (maturity_tier = "insufficient" flags low confidence)
   - **File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/crawler-db/fees.ts:62-82`

2. **Missing FRED/revenue/Beige Book data:**
   - National Quarterly assembler: try/catch → sets fred: null, revenue: null
   - Report renders omitting those sections (no "data not available" placeholder)
   - **File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/report-assemblers/national-quarterly.ts:95-115, 135-180`

3. **Signal/alert database errors:**
   - Monitor screen: try/catch → returns empty arrays (status = stable)
   - **File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/hamilton/monitor-data.ts:90-100`

4. **Thesis generation failure:**
   - Home screen: try/catch → thesis = null, page renders with null thesis
   - Logged but not re-raised (graceful)
   - **File:** `/Users/jgmbp/Desktop/feeschedule-hub/src/lib/hamilton/home-data.ts:150-165`

**NOT graceful:**

- **Missing canonical_fee_key:** Fees are silently excluded from reports (no error logged)
- **Miscategorized fee_category:** Silently included under wrong category (no validation error)
- **Invalid charter_type or asset_tier:** Silently included if present (no enumeration validation)
- **Duplicate fee extraction:** Same source scraped twice → both medians included (no deduplication in Hamilton)

---

## Feedback Loops — Or Lack Thereof

### Does Hamilton Output Ever Flow Back to Improve Crawling or Classification?

**No. There are no feedback loops.**

Hamilton is unidirectional: crawler → database → Hamilton. No mechanism exists to:
- Flag a fee as "suspicious" and trigger re-extraction
- Mark a source URL as "unreliable" (to reduce reliance on it)
- Suggest a category correction to the classifier
- Feed report confidence metrics back to the crawler

### Are There Signals That Could Trigger Re-extraction?

**Theoretically yes, but not implemented:**

Hamilton could signal:
1. **Outliers detected:** `queryOutliers()` tool finds fees > p95 or < p5 → flag for re-review
2. **Maturity tier insufficient:** Category has < 10 observations → trigger targeted re-crawl
3. **Missing source URL:** Fee amount populated but source_url NULL → flag extraction as incomplete
4. **Category confidence low:** Derived analytics show unusual spreads → investigate classification accuracy

**Status:** None of these signals are acted upon. Hamilton reports are read by humans; humans may decide to re-extract, but no automation exists.

### What Should Compound But Doesn't?

**Critical gaps:**

1. **Revenue Correlation → Fee Quality Signal:**
   - `queryFeeRevenueCorrelation()` tool compares published fees to FDIC service charge income
   - If a bank's service charge revenue is $100M but published fees sum to $10M annually → likely missing fees
   - **Should trigger:** targeted re-crawl of that bank
   - **Currently:** no action; insight lives in research tool only

2. **Regulatory Risk → Data Validation:**
   - `queryRegulatoryRisk()` tool flags overdraft/NSF fees with high CFPB complaint rates
   - High complaints + NULL source_url → likely unverified extraction
   - **Should trigger:** manual review or re-extraction
   - **Currently:** flagged in reports but not automated

3. **Month-over-Month Movers → Source Quality Check:**
   - Monthly Pulse detects 20% swing in median overdraft fee month-to-month
   - Could indicate: (a) real market movement, (b) miscategorization spike, or (c) data quality drop
   - **Should trigger:** investigate source URL changes, crawler config changes
   - **Currently:** presented as market signal; no validation loop

4. **Pro User Analysis → Ground Truth Feedback:**
   - Pro user runs "Analyze" and notices reported peer median seems wrong
   - Could save note/feedback → Hamilton learning signal
   - **Currently:** no feedback mechanism in Pro UI; user cannot flag data issues

---

## Cross-Cutting Findings

### Data Dependencies and Traceability

Hamilton's data lineage is **partially documented** in DataManifest:

```typescript
// National Quarterly manifest includes:
manifest: DataManifest = {
  queries: [
    {
      sql: "SELECT ... FROM extracted_fees ef WHERE ef.review_status != 'rejected'",
      row_count: 12500,
      executed_at: "2026-04-16T15:30:00Z"
    },
    // ... more queries
  ],
  data_hash: "sha256_of_input_data",
  assembled_at: "2026-04-16T15:30:00Z"
};
```

**What's Missing from Manifest:**
- Source URL counts (how many fees have source_url = NULL?)
- Categorization confidence (how many fees have extraction_confidence < 0.8?)
- Review status breakdown (how many pending vs staged vs approved?)
- Charter type coverage (are banks/CUs equally represented?)

**Impact:** Hamilton reports are reproducible (same inputs → same outputs) but **not auditable**. Operator cannot inspect "what % of this median came from unverified sources."

### Report Quality Gap Analysis

**Comparison to Production Grade (McKinsey, Bloomberg):**

| Dimension | Hamilton Current | Target |
|-----------|------------------|--------|
| **Data visualization** | Tables only | Charts (median trend, distribution, peer scatter) |
| **Confidence callout** | Maturity tier badges | "XX% of data from verified sources" |
| **Regulatory context** | Optional (if agent uses queryRegulatoryRisk) | Automatic (CFPB complaints, OCC/FDIC guidance) |
| **Source transparency** | None | "Data sourced from X fee schedules, Y regulatory filings" |
| **Caveats** | None | "Median includes Z% fees without source URL" |
| **Drill-down capability** | Via chat agent | UI drill-down to institution-level data |

**Result:** Hamilton reports read as "here's what we measured" not "here's what we know with confidence." This is **acceptable for internal admin use** but **risky for Pro customer deliverables** (Pro reports are sold as intelligence products; customers expect caveats disclosed).

### Pipeline Coupling Risk

Hamilton is **tightly coupled** to crawler output at extraction stage:

```
Fee Crawler (Raw HTML → extraction)
    ↓ (fee_category, amount, review_status, source_url)
    ↓
Hamilton Index Queries (filter by category, aggregate by percentile)
    ↓
Reports & Pro Screens
```

**Failure modes propagate instantly:**
- Crawler categories all wrong → Hamilton categories all wrong, same day
- Crawler source URLs NULL → Hamilton reports not auditable, same hour
- Crawler confidence scores missing → Hamilton maturity tiers untrustworthy, immediate

**Mitigations in place:**
- Manual review stage (analyst approves/rejects fees) before they appear in reports
- Maturity tier degrades to "insufficient" if < 10 observations
- National Quarterly assembler queries with `review_status != 'rejected'` (staging + pending + approved, but no "unreviewed")

---

## Recommendations for Operator

### Immediate Audits Needed

1. **Source URL Coverage by Category:**
   ```sql
   SELECT fee_category, 
          COUNT(*) as total,
          COUNT(CASE WHEN source_url IS NOT NULL THEN 1 END) as with_source,
          ROUND(100 * COUNT(CASE WHEN source_url IS NOT NULL THEN 1 END) / COUNT(*), 1) as pct_sourced
   FROM extracted_fees
   WHERE review_status != 'rejected'
   GROUP BY fee_category
   ORDER BY pct_sourced ASC;
   ```
   **Action:** Categorize as "high-confidence" (>90% sourced) vs "medium" (70-90%) vs "low" (<70%) in reports.

2. **Categorization Confidence by Category:**
   ```sql
   SELECT fee_category,
          AVG(CAST(extraction_confidence AS FLOAT)) as avg_confidence,
          MIN(CAST(extraction_confidence AS FLOAT)) as min_confidence,
          COUNT(*) as count
   FROM extracted_fees
   WHERE review_status IN ('staged', 'approved')
   GROUP BY fee_category
   ORDER BY avg_confidence ASC;
   ```
   **Action:** Flag categories where avg_confidence < 0.7 for re-review or retraining.

3. **Null Amount Prevalence:**
   Count fees where amount IS NULL by review_status. These are silently excluded from medians—transparency needed.

### Data Quality Band-Aids (Hamilton-Specific)

1. **Add source_url validation to index queries:**
   ```typescript
   // In fee-index.ts, add optional sourceTraceback filter:
   export async function getNationalIndex(
     approvedOnly = false,
     sourceTracedbackOnly = false  // NEW
   ): Promise<IndexEntry[]> {
     const statusFilter = approvedOnly ? "ef.review_status = 'approved'" : "ef.review_status != 'rejected'";
     const sourceFilter = sourceTracedbackOnly ? "AND ef.source_url IS NOT NULL" : "";
     
     const rows = await sql.unsafe(
       `SELECT ... FROM extracted_fees ef
        WHERE ef.fee_category = ANY(...) AND ${statusFilter} ${sourceFilter}`
     );
   }
   ```
   **Result:** Pro users can toggle "Show only verified sources" in Analyze/Simulate screens.

2. **Extend DataManifest to include quality metrics:**
   ```typescript
   manifest: DataManifest = {
     queries: [...],
     quality_metrics: {
       total_fees: 12500,
       fees_with_source_url: 2500,  // NEW
       pct_with_source: 20.0,
       fees_with_confidence_gt_08: 11200,
       avg_extraction_confidence: 0.82
     },
     // ... existing fields
   };
   ```
   **Result:** Reports can footnote "based on 2,500 verified sources" automatically.

3. **Add "Caveats" section to National Quarterly template:**
   ```
   ## Data Quality Note
   This report includes X,XXX fee observations from XXX institutions.
   - XX% of observations trace to published fee schedules (source_url populated)
   - XX% extracted from verified HTML with automation confidence > 0.8
   - XX% pending analyst review
   
   [Link to source audit report]
   ```

### Long-Term: Feedback Loops

1. **Hamilton Confidence → Crawler Retrigger:**
   - If maturity_tier = "insufficient" for a category, auto-trigger re-crawl of institutions in that segment
   - Set extraction_confidence weight in retry logic (deprioritize low-confidence sources)

2. **Pro User Annotation:**
   - Add "Report this fee as incorrect" button in Pro screens
   - Feedback → hamilton_fee_annotations table
   - Analyst reviews annotations weekly, corrects extracted_fees, triggers reindex

3. **Revenue Anomaly Signal:**
   - `queryFeeRevenueCorrelation()` computes implied_annual_fee_revenue vs reported service_charges
   - If gap > 20%, flag institution for re-review or manual audit

---

## Summary: Impact of 80% Missing Source Traceback on Hamilton

**Scale:** 80% of crawled fees lack source_url.

**Direct Impact on Reports:**
- ✅ Medians still compute correctly (aggregation logic handles nulls)
- ❌ Operator cannot audit "what % of this number comes from verified sources"
- ❌ Confidence scoring (maturity_tier) based on observation count only, not source quality
- ❌ Reports presented as equally authoritative regardless of sourcing gaps

**Impact on Pro Users:**
- ❌ Analyze screen shows peer benchmarks with hidden source quality gaps
- ❌ Simulate screen proposes fee changes based on indices with 80% unverified data
- ⚠️ Monitor alerts detect signal changes but cannot distinguish "real market move" from "data quality shift"

**Impact on Operator Trust:**
- ✅ Hamilton itself does not break (graceful degradation)
- ❌ Hamilton's credibility with Pro customers unknown (reports lack transparency)
- ❌ Cannot defend report accuracy without source audit trail

**Estimated Risk:** Medium. Hamilton is operationally sound but lacks the transparency guardrails required for a "B2B intelligence product." Fix is implementable (add source quality metrics to reports, create feedback loops) without architectural changes.

---

**End of Audit: Hamilton Intelligence Layer — 2026-04-16**
