# URL Audit Pipeline Design

Extend FeeScout with a URL audit mode that validates existing fee schedule URLs, re-discovers missing ones via heuristics, and escalates failures to AI-powered discovery.

## Problem

- 5,005 institutions have a `website_url` but no `fee_schedule_url` (discovery never ran or failed)
- 444 institutions have a `fee_schedule_url` pointing to the wrong page (articles, forms, policies)
- 634 institutions have no `website_url` at all
- The `discovery_cache` table is empty — discovery hasn't run against the current Supabase DB
- The existing `UrlDiscoverer` 6-method cascade is functional but has never been exercised at scale on this DB

## Solution

Add an "Audit" mode to FeeScout (`/admin/scout`) with a 4-agent SSE pipeline that validates, discovers, and AI-escalates fee schedule URLs. Supports single-institution and batch (state/district) scopes.

## Architecture

```
Browser (FeeScout.tsx — audit mode)
  |
  +-- POST /api/scout/audit           <- SSE stream (single institution)
  +-- POST /api/scout/audit-batch    <- SSE stream (state/district batch)
            |
            +-- Agent 1: Validator     (fetch + keyword check existing URL)
            +-- Agent 2: Discoverer    (existing UrlDiscoverer 6-method cascade)
            +-- Agent 3: AI Scout      (Claude evaluates homepage links)
            +-- Agent 4: Reporter      (summarizes changes)
            |
            <- SSE events: agent status, log messages, results
```

## Hybrid Strategy

Phase 1 (heuristics — fast, free):
- Validator checks existing URLs via fetch + content keyword matching
- Discoverer runs the existing 6-method cascade (sitemap, common paths, CMS fingerprint, homepage scan, deep scan, search API)

Phase 2 (AI — slower, ~$0.01-0.03 per institution):
- AI Scout only runs when Phase 1 fails
- Sends homepage + extracted links to Claude
- Claude identifies the most likely fee schedule URL + confidence + reasoning

Expected split: heuristics handle ~60-70% of institutions, AI handles the remaining 30-40%.

## Pipeline Agents

### Agent 1: Validator
- Input: institution with existing `fee_schedule_url`
- If no URL exists: skip, pass to Agent 2
- If URL exists: fetch the page, check content
  - PDF: trust if URL path contains fee-related keywords, reject if it contains non-fee keywords (annual-report, CRA, complaint, privacy, loan)
  - HTML: require 2+ matches from fee content keywords (monthly maintenance fee, overdraft fee, nsf fee, atm fee, etc.)
- On invalid: record as "cleared" in `url_audit_results`, UPDATE `fee_schedule_url = NULL` in DB, log reason
- On valid: log confirmation, record as "validated", skip Agent 2
- On 404/403: record as "cleared", UPDATE `fee_schedule_url = NULL`, log dead URL
- All changes are recorded in `url_audit_results` with `url_before` for traceability. If a URL was incorrectly cleared, it can be restored from the audit history.

### Agent 2: Discoverer
- Input: institution with `website_url` but no valid `fee_schedule_url`
- Runs the existing `UrlDiscoverer.discover()` from `fee_crawler/pipeline/url_discoverer.py`
- 6-method cascade in order: sitemap, common paths (76 paths), CMS fingerprint, homepage link scan, deep scan, search API
- Emits log messages for each method tried and result
- On success: UPDATE `fee_schedule_url` and `document_type` in DB
- On failure: pass to Agent 3

### Agent 3: AI Scout
- Input: institution where heuristic discovery failed
- Fetches homepage HTML, extracts all links with anchor text
- Sends to Claude Sonnet: "Given this institution's homepage links, which URL most likely leads to their fee schedule or schedule of fees? Return the URL, confidence (0-1), and reasoning."
- On success (confidence >= 0.6): UPDATE `fee_schedule_url` in DB
- On low confidence or no result: log "No fee schedule found", leave URL as NULL
- Cost: ~$0.01-0.03 per institution

### Agent 4: Reporter
- Summarizes the audit for this institution:
  - URL status: before -> after
  - Discovery method that succeeded (or "not found")
  - Confidence score
  - Whether re-crawl is needed (URL changed)
- For batch mode: aggregates across all institutions in scope

## Batch Mode

When scope is a state or district, the pipeline iterates through each institution in that scope.

SSE events for batch:
```
data: {type:"batch_progress", current:34, total:127, institution:"First National Bank of Florida"}
data: {type:"agent", agentId:"validator", status:"running"}
... (per-institution agent events) ...
data: {type:"institution_done", id:1234, result:"url_discovered", method:"sitemap", url:"https://..."}
data: {type:"batch_progress", current:35, total:127, institution:"Space Coast FCU"}
...
data: {type:"batch_summary", validated:89, cleared:12, discovered:18, ai_found:6, still_missing:2}
```

Batch request body:
```json
{"scope": "state", "value": "FL"}
{"scope": "district", "value": "4"}
```

**No `scope: "all"` in v1.** State or district only. Largest batch is a single state (~500 institutions max). If needed later, "all" can be added with a job queue pattern.

**Batch limits:**
- `maxDuration = 300` (5 minutes) for batch routes on Vercel Pro
- Max 500 institutions per batch request
- Sequential processing with per-institution timeout of 30s (skip and log on timeout)
- If SSE connection drops, the audit run is recorded in `url_audit_runs` — user can see partial results and re-run the scope
- Cancellation: client closes the SSE connection, server detects via `request.signal.aborted` and stops processing

## UI Changes to FeeScout

Add a mode toggle to the existing FeeScout component:

**Research mode** (current behavior):
- Search by institution name
- Runs research pipeline (Scout -> Classifier -> Extractor -> Analyst)
- Produces fee intelligence report

**Audit mode** (new):
- Search by institution name (single audit) OR select state/district (batch audit)
- Scope selector: state dropdown, fed district dropdown
- Runs audit pipeline (Validator -> Discoverer -> AI Scout -> Reporter)
- Shows per-institution results with before/after URL status
- Batch progress bar for multi-institution runs

## File Structure

```
src/
  lib/
    scout/
      audit-agents.ts       <- Validator, Discoverer, AI Scout, Reporter
      audit-types.ts         <- AuditSSEEvent, AuditResult, BatchSummary
  app/
    api/
      scout/
        audit/
          route.ts           <- POST: single-institution audit SSE stream
        audit-batch/
          route.ts           <- POST: batch audit SSE stream (state/district scope)
  components/
    scout/
      FeeScout.tsx           <- Modify: add mode toggle, audit UI
```

4 new files, 1 modified file.

## Database

### New table: url_audit_runs
```sql
CREATE TABLE url_audit_runs (
  id SERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,         -- 'institution', 'state', 'district', 'all'
  scope_value TEXT,                 -- state code, district number, or institution id
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_institutions INTEGER,
  urls_validated INTEGER DEFAULT 0,
  urls_cleared INTEGER DEFAULT 0,
  urls_discovered INTEGER DEFAULT 0,
  urls_ai_found INTEGER DEFAULT 0,
  still_missing INTEGER DEFAULT 0,
  ai_cost_cents INTEGER DEFAULT 0
);
```

### New table: url_audit_results
```sql
CREATE TABLE url_audit_results (
  id SERIAL PRIMARY KEY,
  audit_run_id INTEGER REFERENCES url_audit_runs(id),
  crawl_target_id INTEGER NOT NULL,
  url_before TEXT,
  url_after TEXT,
  action TEXT NOT NULL,             -- 'validated', 'cleared', 'discovered', 'ai_found', 'not_found'
  discovery_method TEXT,            -- 'sitemap', 'common_path', 'cms', 'homepage', 'deep_scan', 'search', 'ai'
  confidence REAL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Calling Python from Next.js

The Discoverer agent needs to call the existing Python `UrlDiscoverer`. The project deploys on Vercel, which cannot run Python. Two options:

**Option A (recommended): Modal HTTP endpoint.** Create a Modal web endpoint (`@modal.web_endpoint`) that wraps `UrlDiscoverer.discover()` for a single institution. The Node.js route calls it via `fetch()`. Modal already runs the nightly discovery jobs, so the Python environment and dependencies are already configured. The endpoint accepts `{website_url, institution_id}` and returns `{found: bool, url: string, method: string, confidence: number}`.

**Option B:** Rewrite the discovery heuristics in TypeScript. Not recommended — the Python code is 955 lines of battle-tested logic.

## Auth

Requires admin role: `getCurrentUser()` + `user.role === "admin"`. Audit mode writes to the database (clears URLs, inserts audit results), so it needs a higher permission level than the read-only research mode.

## Dependencies

No new dependencies. Uses existing:
- `@anthropic-ai/sdk` (already installed for FeeScout research)
- `postgres` (existing DB connection)
- Python `fee_crawler` package (existing)

## Scope Boundaries

Building:
- Audit mode in FeeScout UI (mode toggle, scope selector, audit pipeline cards)
- Single-institution and batch audit API routes with SSE streaming
- 4 audit agents (Validator, Discoverer, AI Scout, Reporter)
- Thin Python CLI wrapper for UrlDiscoverer
- url_audit_runs and url_audit_results tables
- Audit history view

Not building:
- Territory assignment / geographic ownership model (future spec)
- Automated scheduling (future — for now, manually triggered from UI)
- Full extraction pipeline integration (audit finds URLs; extraction is a separate step)
- CLI interface (UI first, CLI can wrap the same logic later)
