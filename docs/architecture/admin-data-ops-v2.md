# Admin Data Operations — V2 Architecture

## Philosophy

Every action the admin takes should:
1. **Show what's happening** in real-time
2. **Show what happened** with clear results
3. **Show what needs attention** with actionable next steps
4. **Never lose information** between steps

The admin should never have to:
- Guess whether a job is still running
- Wonder if detected issues were actually addressed
- Visit multiple pages to complete one workflow
- Use CLI arguments or remember command names

---

## The Data Lifecycle

Every piece of fee data flows through these stages. Each stage is visible, actionable, and connected to the next.

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  SEED   │ ──→ │ DISCOVER │ ──→ │  CRAWL   │ ──→ │ EXTRACT  │ ──→ │ VALIDATE │ ──→ │  SERVE   │
│         │     │          │     │          │     │          │     │          │     │          │
│ 8,750   │     │ Find fee │     │ Download │     │ LLM +    │     │ Bounds + │     │ Public   │
│ instit. │     │ schedule │     │ page or  │     │ Categor. │     │ Review + │     │ API +    │
│         │     │ URLs     │     │ PDF      │     │ + Rules  │     │ Approve  │     │ Index    │
└─────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
     │               │                │                │                │                │
     ▼               ▼                ▼                ▼                ▼                ▼
  crawl_targets   crawl_targets    crawl_results   extracted_fees   extracted_fees    Public
  (seeded)        (fee_schedule_   (document_url,  (fee_name,       (review_status    pages,
                   url set)        content_hash)   amount, etc.)    = approved)       API
```

---

## Admin Experience: The Single Dashboard

One page. One place. Everything visible.

### `/admin/pipeline` — The Command Center

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  DATA OPERATIONS                                          [Run Full Pipeline]│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PIPELINE STATUS BAR (clickable stages)                             │    │
│  │                                                                     │    │
│  │  [Seed]   →  [Discover]  →  [Crawl]   →  [Extract]  →  [Approve]  │    │
│  │  8,750       2,578          2,127         58,146        53,884     │    │
│  │  100%        29%            24%           89% cat'd     82% appr   │    │
│  │                                                                     │    │
│  │  Click any stage to see details + take action                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐      │
│  │  ACTIVITY LOG                 │  │  ISSUES & ACTIONS             │      │
│  │  (what happened, when, what   │  │  (what needs your attention)  │      │
│  │   changed — always visible)   │  │                               │      │
│  │                               │  │  ⚠ 4,935 fees need review    │      │
│  │  2m ago  Crawl Truist → 48    │  │    [Review Queue →]          │      │
│  │          fees (43 approved)   │  │                               │      │
│  │  15m ago Auto-Review → 6,331  │  │  ⚠ 454 institutions have     │      │
│  │          approved, 1,916      │  │    URLs but no fees           │      │
│  │          rejected             │  │    [Crawl Gaps →]            │      │
│  │  1h ago  Outlier-Detect →     │  │                               │      │
│  │          307 rejected, 766    │  │  ⚠ 40 outliers flagged       │      │
│  │          flagged              │  │    [Review Outliers →]       │      │
│  │  Today   Coverage: 24.2%     │  │                               │      │
│  │          (+3 institutions)    │  │  ℹ 11 data sources current   │      │
│  │                               │  │    CFPB overdue (7 days)     │      │
│  │  [View full history]          │  │    [Refresh Weekly →]        │      │
│  └───────────────────────────────┘  └───────────────────────────────┘      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  QUICK ACTIONS (one-click, smart defaults)                          │    │
│  │                                                                     │    │
│  │  [Crawl Gaps]  [Categorize]  [Auto-Review]  [Detect Outliers]      │    │
│  │  [Validate]    [Enrich]      [Refresh Data]  [Run Full Pipeline]   │    │
│  │                                                                     │    │
│  │  Filters: [State ▼] [Charter ▼] [Tier ▼]                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  CATEGORY COVERAGE (grouped by family, expandable)                  │    │
│  │  [Grouped/Flat] [Search] [Family ▼] [Tier ▼]                      │    │
│  │                                                                     │    │
│  │  ▸ Account Maintenance (6 cats)    12,345 obs   1,234 inst   87%   │    │
│  │  ▸ Overdraft & NSF (7 cats)         8,234 obs     987 inst   91%   │    │
│  │  ▸ ATM & Card (6 cats)              6,123 obs     876 inst   84%   │    │
│  │  ...                                                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  DATA SOURCES (refresh status)                                      │    │
│  │  FRED ✓ 2h ago | BLS ✓ 2h ago | NY Fed ✓ 2h ago | CFPB ⚠ 7d ago  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  COVERAGE GAPS TABLE (existing - sortable, filterable)              │    │
│  │  [State ▼] [Charter ▼] [Status: No URL / No Fees / Failing]       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Principles

### 1. Every Job Reports What It Did

When any job completes (crawl, auto-review, outlier-detect, etc.), it writes a structured `result_summary` JSON to the `ops_jobs` table:

```json
{
  "action": "crawl",
  "institutions_processed": 50,
  "fees_extracted": 476,
  "auto_approved": 412,
  "staged": 34,
  "flagged": 30,
  "failures": 17,
  "unchanged": 21,
  "coverage_before": "24.1%",
  "coverage_after": "24.3%"
}
```

This powers the Activity Log. The admin always knows exactly what happened.

### 2. Every Detection Flows to Review

When outlier-detect, validate, or any quality check finds an issue:
- `decimal_error` → auto-rejected (with reason in activity log)
- `statistical_outlier` → `review_status = 'flagged'` (visible in review queue)
- `amount_out_of_range` with severity "error" → auto-rejected
- `amount_out_of_range` with severity "warning" → flagged

The review queue shows the source of each flag so the admin knows WHY it was flagged.

### 3. Source Documents Are Always Accessible

Every extracted fee links to:
- The institution's fee schedule URL (`crawl_targets.fee_schedule_url`)
- The specific crawl result document (`crawl_results.document_url`)
- A "View source" button that opens the PDF/page in a new tab

On the review page, the admin can see the extracted data AND the source side by side.

### 4. No Invisible State Changes

If auto-review approves 6,331 fees, the activity log says:
```
Auto-Review: 6,331 approved, 1,916 rejected, 4,930 still need manual review
```

If outlier-detect rejects 307 decimal errors, the activity log says:
```
Outlier-Detect: 307 decimal errors auto-rejected, 766 statistical outliers flagged for review
```

Nothing happens silently.

---

## Admin Workflows

### Workflow 1: "Increase Coverage"

**Goal**: Get fee data from more institutions

```
Admin sees: Pipeline bar shows Crawl stage at 24%
Admin clicks: [Crawl Gaps]
System does: Crawl 454 institutions with URLs but no fees (skip-with-fees default)
Activity log: "Crawl complete: 454 processed, 287 succeeded (6,234 fees), 167 failed"
Admin sees: Crawl stage updates to 27%
Admin sees: Issues panel shows "167 crawl failures — View failures"
Admin clicks: "View failures" → filtered gaps table showing why each failed
Admin fixes: Updates URLs for institutions with wrong URLs
Admin clicks: [Crawl Gaps] again (only targets the remaining gaps)
```

### Workflow 2: "Clean Up Data Quality"

**Goal**: Review and fix bad data

```
Admin sees: Issues panel shows "4,935 fees need review"
Admin clicks: [Auto-Review] button
Activity log: "Auto-Review: 3,200 approved, 800 rejected, 935 still staged"
Admin sees: Issues panel now shows "935 fees need review" (reduced from 4,935)
Admin clicks: [Detect Outliers]
Activity log: "Outlier-Detect: 45 decimal errors rejected, 120 statistical outliers flagged"
Admin sees: Issues panel shows "1,055 fees need review" (935 staged + 120 newly flagged)
Admin clicks: [Review Queue →]
Review page: Shows all 1,055 items, sortable by amount, confidence, category
Admin reviews: Approves/rejects one by one, or bulk-approves high-confidence items
```

### Workflow 3: "Add a Specific Institution"

**Goal**: Found a fee schedule PDF for a specific bank

```
Admin goes to: /admin/peers/[id] (institution detail)
Admin sees: "Fee Schedule Source" card with URL input
Admin pastes: https://example.com/fees.pdf
Admin clicks: [Crawl Now]
Activity log: "Crawl #29: Example Bank → 23 fees (18 approved, 3 staged, 2 flagged)"
Admin sees: Fees appear on the institution page immediately
Admin clicks: "View source" to verify extracted data against PDF
```

### Workflow 4: "Daily Operations"

**Goal**: Routine data maintenance

```
Admin opens: /admin/pipeline
Admin sees: Activity log from overnight GitHub Actions cron:
  "Daily refresh: FRED ✓, BLS ✓, NY Fed ✓, OFR ✓"
  "Weekly crawl: 100 processed, 62 succeeded (1,847 fees)"
  "Auto-review: 1,234 approved, 456 rejected"
Admin sees: Issues panel:
  "87 fees need review"
  "CFPB data overdue (last refresh: 8 days ago)"
Admin clicks: [Refresh Weekly] → triggers refresh-data --cadence weekly
Admin clicks: [Review Queue →] → reviews 87 remaining fees
Done in 15 minutes.
```

### Workflow 5: "Investigate a Problem"

**Goal**: Something looks wrong with a category's data

```
Admin sees: Category coverage shows "Overdraft: 88% approval" (lower than expected)
Admin clicks: Overdraft family → expands to see individual categories
Admin sees: "continuous_od: 56% approval" — low
Admin clicks: continuous_od → goes to /admin/fees/catalog/continuous_od
Admin sees: Fee distribution chart shows cluster at $5-$10 but outliers at $200+
Admin sees: Institution table shows 3 institutions with $200+ continuous OD fees
Admin clicks: those institutions → sees the fee detail
Admin sees: "View source" → opens the PDF → the $200 is actually a daily cap, not a per-occurrence fee
Admin rejects: the misextracted fees
Admin notes: This is an extraction prompt issue — continuous_od needs better guidance
```

---

## Data Flow Diagram

```
SEED (FDIC + NCUA APIs)
  │
  ▼
crawl_targets (8,750 rows)
  ├── institution_name, state, charter, asset_size
  ├── website_url
  ├── fee_schedule_url (set by discover or manual)
  └── last_crawl_at, consecutive_failures
  │
  │  [DISCOVER] searches website for fee schedule URL
  │  Result: fee_schedule_url set or failure logged
  │
  │  [CRAWL] downloads URL, extracts text
  ▼
crawl_results (per crawl attempt)
  ├── document_url, content_hash
  ├── status (success/failed/unchanged)
  └── error_message
  │
  │  [EXTRACT] LLM extracts structured fee data
  │  Chunks >40K chars for better extraction
  ▼
extracted_fees (65,000+ rows)
  ├── fee_name, amount, frequency, conditions
  ├── extraction_confidence (0.0-1.0)
  ├── fee_category (mapped by categorize)
  ├── review_status (pending → staged → approved/rejected/flagged)
  └── validation_flags (JSON array of issues)
  │
  │  [CATEGORIZE] maps fee_name to 49 categories via aliases
  │  [VALIDATE] checks amount bounds per category
  │  [OUTLIER-DETECT] finds statistical outliers + decimal errors
  │  [AUTO-REVIEW] approves/rejects based on confidence + bounds
  │
  │  Result: review_status updated, validation_flags set
  │  Activity log: summary of what changed
  │
  ▼
SERVE (approved fees power the public site)
  ├── Fee catalog (/fees)
  ├── National index (/research/national-fee-index)
  ├── Institution detail (/institution/[id])
  ├── State reports (/research/state/[code])
  └── API (/api/v1/fees)
```

---

## What Changes from V1

| V1 (Current) | V2 (Redesigned) |
|---|---|
| 5 separate pages for data ops | 1 unified pipeline command center |
| Jobs report "success" with no detail | Every job writes structured result summary |
| Outlier-detect writes flags but doesn't change status | Every detection flows to review queue |
| No activity log | Real-time activity log showing what happened |
| Admin guesses if jobs are running | Live log streaming for active jobs |
| Manual CLI args needed | One-click buttons with smart defaults |
| No visibility into why things failed | Failure reasons shown in gaps table |
| Source documents not linked | Every fee links to its source PDF/page |
| No "what needs attention" summary | Issues panel with counts and action buttons |
| Separate ops page for triggering jobs | Actions embedded in pipeline page |

---

## Pages After Redesign

| Page | Purpose | Keeps/Removes |
|---|---|---|
| `/admin/pipeline` | **THE** data operations hub | Redesigned as command center |
| `/admin/ops` | Advanced job control | Keep for power-user access, not primary |
| `/admin/quality` | Merged into pipeline | Remove as standalone page |
| `/admin/review` | Fee review queue | Keep, linked from pipeline issues panel |
| `/admin/fees/catalog` | Per-category drill-down | Keep, linked from category coverage |
| `/admin/peers/[id]` | Institution detail + URL edit + crawl | Keep, enhanced with source links |
| `/admin/leads` | Lead management | Keep as-is |

---

## Implementation Approach

**Create `feat/admin-ops-v2` branch.** Don't patch V1 anymore.

### Phase 1: Data flow fixes (backend)
- Every job writes `result_summary` JSON
- Outlier-detect changes review_status
- Auto-review reports what it did
- Source URL propagated to review table

### Phase 2: Pipeline command center (frontend)
- Merge pipeline + quality + ops actions into one page
- Activity log component
- Issues & actions panel
- One-click action buttons

### Phase 3: Workflow refinement
- Failure diagnosis (why did this crawl fail?)
- Source document side-by-side in review
- Coverage tracking over time
- Per-institution quality score

---

## Success Criteria

The admin can:
1. Open `/admin/pipeline` and instantly know the state of everything
2. See what happened in the last 24 hours without checking multiple pages
3. Take action on any issue with one click
4. Verify extracted data against source documents
5. Never encounter a job that ran but produced invisible results
