# Wyoming State Agent Design

End-to-end AI agent that discovers, classifies, extracts, and validates fee schedules for all institutions in a single state. Proof of concept with Wyoming (43 institutions).

## Problem

The existing crawl pipeline fails on JS-rendered pages, uses fragile keyword heuristics for URL discovery, and has no intelligence about document types. Result: only 11 of 43 Wyoming institutions have extracted fees.

## Solution

One Modal job with 5 sequential stages. An AI agent with a Playwright browser finds fee schedules the way a human would — navigate the site, find the right page, read it. No keyword cascades, no 76-path probes. Max 5 page loads per institution for discovery.

## Architecture

```
Admin UI (/admin/scout — "Agent" tab)
  → POST /api/scout/agent         (triggers Modal job, returns run ID)
  → GET  /api/scout/agent/:id     (polls progress from agent_runs table)

Modal Job (state_agent)
  → Stage 1: Inventory     — load WY institutions, assess current state
  → Stage 2: Discover      — AI + Playwright finds fee_schedule_url (5 tries max)
  → Stage 3: Classify      — HTTP HEAD to determine PDF / HTML / JS-rendered
  → Stage 4: Extract       — specialist sub-agent per document type
  → Stage 5: Validate      — AI reviews extracted fees for quality
```

## Why Modal

- Playwright needs a real browser runtime (not Vercel serverless)
- 43 institutions x 2-3 min each = up to 90 min (beyond Vercel's 300s limit)
- Modal already has the Python environment, Playwright, and Supabase access
- Progress written to DB, UI polls — no long-lived SSE connections

## Stage Details

### Stage 1: Inventory

Query `crawl_targets WHERE state_code = 'WY' AND status = 'active'`.

Categorize each institution:
- `complete` — has extracted fees with review_status in (approved, staged)
- `has_url` — has fee_schedule_url but no fees (needs extraction)
- `has_website` — has website_url but no fee_schedule_url (needs discovery)
- `dead` — no website_url (try Google search)

Write inventory to `agent_runs` table. This is the agent's work queue.

### Stage 2: Discover

For each institution in `has_website` or `dead` bucket, plus re-validation of `has_url` bucket:

1. Give Claude the institution name and website URL
2. Claude controls a Playwright browser — navigates the site, follows likely links, looks for fee schedule pages or PDFs
3. Max 5 page loads per institution
4. Claude returns the best URL it found + confidence + reasoning
5. UPDATE `crawl_targets.fee_schedule_url`

For `dead` bucket (no website): Google search `"[institution name]" fee schedule` first to find the site.

For `has_url` bucket: fetch the existing URL, ask Claude "is this actually a fee schedule?" If not, clear it and run discovery.

Goal: 42/43 institutions with a validated fee_schedule_url (1 has no website).

### Stage 3: Classify

For every institution with a fee_schedule_url:

1. HTTP HEAD request — check Content-Type header
2. `application/pdf` or URL ends in `.pdf` → `pdf`
3. `text/html` → fetch with basic HTTP, measure content:
   - Rich text content (500+ chars, 2+ fee keywords) → `html`
   - Thin content (<500 chars text or <5 links) → `js_rendered`
4. UPDATE `crawl_targets.document_type`

### Stage 4: Extract

Route to specialist sub-agent based on document_type:

**PDF specialist:**
- Download PDF
- Extract text via pdfplumber (with OCR fallback via tesseract)
- Send text to Claude: "Extract all fees from this fee schedule"
- Claude returns structured fee data

**HTML specialist:**
- Fetch page with basic HTTP
- Parse with BeautifulSoup, extract text
- Send to Claude for fee extraction

**JS specialist:**
- Render page with Playwright
- If page is a link index (like Space Coast), follow sub-links to actual fee content
- Extract rendered text
- Send to Claude for fee extraction

All specialists write to `extracted_fees` table with:
- fee_name, fee_category, amount, frequency, conditions
- extraction_confidence
- review_status = 'staged'
- source = 'agent_v1'

Also write to `crawl_results` for the crawl record.

### Stage 5: Validate

For each institution with newly extracted fees:

Send to Claude: "Review these extracted fees for [institution_name], a [charter_type] in Wyoming. Check for:
- Completeness: are common fee categories present? (monthly maintenance, overdraft, NSF, ATM, wire)
- Reasonableness: do amounts look normal for this institution type?
- Duplicates: any fees extracted twice?
- Missing data: any amounts that should be numbers but are 'varies'?"

Claude returns:
- data_quality: excellent / good / partial / limited
- issues: list of specific problems found
- missing_categories: fee types that should be present but aren't

Write validation results to `agent_run_results`.

## Data Model

### New table: agent_runs
```sql
CREATE TABLE agent_runs (
  id SERIAL PRIMARY KEY,
  state_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_institutions INTEGER DEFAULT 0,
  discovered INTEGER DEFAULT 0,
  classified INTEGER DEFAULT 0,
  extracted INTEGER DEFAULT 0,
  validated INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  current_stage TEXT,
  current_institution TEXT
);
```

### New table: agent_run_results
```sql
CREATE TABLE agent_run_results (
  id SERIAL PRIMARY KEY,
  agent_run_id INTEGER REFERENCES agent_runs(id),
  crawl_target_id INTEGER NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_run_results_run ON agent_run_results(agent_run_id);
```

## UI

Add "Agent" tab to existing FeeScout at `/admin/scout`.

- State dropdown (start with WY only, expand later)
- "Run Agent" button
- Progress display (polls agent_runs every 2s):
  - Current stage + current institution name
  - Progress bar: N/43 institutions
  - Per-stage counters: discovered / classified / extracted / validated
- Results table after completion:
  - Each institution with status per stage
  - Expandable detail (what the agent found, confidence, issues)

## API Routes

### POST /api/scout/agent
```json
Request:  {"state": "WY"}
Response: {"runId": 123, "status": "started"}
```
Triggers Modal function via HTTP (Modal web endpoint or `modal.Function.spawn()`).

### GET /api/scout/agent/:id
```json
Response: {
  "id": 123,
  "state_code": "WY",
  "status": "running",
  "current_stage": "extract",
  "current_institution": "First National Bank of Wyoming",
  "total_institutions": 43,
  "discovered": 42,
  "classified": 42,
  "extracted": 28,
  "validated": 0,
  "failed": 1,
  "results": [...]
}
```
Reads from agent_runs + agent_run_results tables.

## File Structure

```
fee_crawler/
  agents/
    state_agent.py          <- Main orchestrator: 5 stages
    discover.py             <- Stage 2: AI + Playwright URL discovery
    classify.py             <- Stage 3: document type classification
    extract_pdf.py          <- Stage 4: PDF specialist
    extract_html.py         <- Stage 4: HTML specialist
    extract_js.py           <- Stage 4: JS-rendered specialist
    validate.py             <- Stage 5: fee validation
  modal_app.py              <- Modify: add state_agent endpoint

src/
  lib/
    scout/
      agent-types.ts        <- AgentRun, AgentRunResult types
      agent-db.ts           <- DB queries for agent runs/results
  app/
    api/
      scout/
        agent/
          route.ts           <- POST: trigger agent
        agent/[id]/
          route.ts           <- GET: poll progress
  components/
    scout/
      FeeScout.tsx           <- Modify: add Agent tab
```

## Auth

Admin only: `user.role === "admin"`.

## Dependencies

No new dependencies. Uses existing:
- Modal (Python runtime with Playwright)
- `@anthropic-ai/sdk` / `anthropic` Python SDK (Claude calls)
- `psycopg2` (DB from Modal)
- `pdfplumber`, `beautifulsoup4`, `playwright` (already in Modal image)

## Scope

Building:
- 5-stage agent for Wyoming (43 institutions)
- Modal job with progress tracking
- Agent tab in FeeScout UI
- 7 new Python files, 4 new TypeScript files, 2 modified files

Not building:
- Multi-state orchestration (future — run agent per state)
- Territory assignment (future — agent owns a region permanently)
- Scheduling (future — agents run on 3-6 month cadence)
- The existing crawl pipeline is untouched — this runs alongside it

## Success Criteria

After the Wyoming agent completes:
- 42/43 institutions have a validated fee_schedule_url (1 has no website)
- 42/43 have extracted fees in the database
- 42/43 have quality validation scores
- FeeScout research mode produces good reports for any WY institution
