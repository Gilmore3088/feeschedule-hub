# feat: Admin Operations Center — Trigger, Monitor, and Manage Crawler from Admin UI

## Overview

Build an admin Operations Center (`/admin/ops`) that provides full visibility and control over the Python web scraper from the Next.js admin panel. Currently, all 17 crawler commands are CLI-only — there's no way to trigger, monitor, cancel, or review scraper jobs from the web UI.

The ops center turns the admin panel into a complete scraper management dashboard: trigger crawls, watch live progress, review extracted fees, edit institution URLs, test URLs before crawling, and manage the entire pipeline lifecycle.

## Problem Statement

**The crawler is a black box.** There's no visibility into what it's doing, no way to trigger it without SSH access, and no connection between triggering a crawl and reviewing its output.

Current workflow for a single institution re-crawl:
1. SSH into server
2. `python -m fee_crawler crawl --target-id 270 --limit 1`
3. Wait for completion, read terminal output
4. Navigate to `/admin/review`, manually find the new fees
5. Approve/reject individually

This should be: click "Re-crawl" on institution page → watch progress → click "Review N new fees."

**Additional pain points:**
- No way to know if a crawl is running, failed, or stuck
- No audit trail of who triggered what and when
- No way to test a fee schedule URL before committing to a full crawl
- Coverage is low (16-33% across tiers) and there's no systematic way to work through gaps from the admin UI
- The `run_pipeline` orchestrator is "cron-ready" but no cron exists — everything is manual

## Proposed Solution

### Architecture

```
Admin clicks "Start Crawl"
  │
  ▼
Server Action (triggerJob)
  ├── Validate params (strict allowlists, bounds checking)
  ├── Check permissions (requireAuth("trigger_jobs"))
  ├── Check rate limits + concurrent job caps
  ├── INSERT into ops_jobs (status: 'queued')
  ├── spawn("python3", ["-u", "-m", "fee_crawler", ...args], { detached: true })
  ├── UPDATE ops_jobs (status: 'running', pid)
  └── return { jobId }
  │
  ▼
Detached Python process (survives server restart)
  ├── stdout/stderr → data/job-logs/job-{id}.log
  ├── Writes to crawl_runs, crawl_results, extracted_fees (existing tables)
  └── on close → UPDATE ops_jobs (status: completed|failed, exit_code)
  │
  ▼
Client polls GET /api/ops/jobs/[id] every 3s
  ├── Reads ops_jobs + tail of log file
  ├── Shows status badge, progress, recent log lines
  └── Stops polling when terminal status reached
```

**Key decisions:**
- `child_process.spawn()` with `detached: true` + `child.unref()` — survives server restarts
- Python invoked with `-u` flag for unbuffered stdout (real-time log capture)
- SQLite `ops_jobs` table as lightweight job queue (no Redis/Bull needed for single-admin use)
- Polling over SSE — simpler, more resilient, adequate for 3s update interval
- All params validated server-side with strict allowlists before being passed as array args to `spawn` (never string interpolation)

### Implementation Phases

#### Phase 1: Foundation — Job Runner + Ops Dashboard (MVP)

Build the core job execution engine and a minimal ops dashboard.

**1a. Database: `ops_jobs` table**

```sql
-- fee_crawler/db.py — add to ensure_tables()
CREATE TABLE IF NOT EXISTS ops_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command TEXT NOT NULL,              -- crawl, discover, categorize, pipeline, validate, etc.
    params_json TEXT NOT NULL,          -- JSON: {"limit": 10, "state": "TX", "workers": 4}
    status TEXT NOT NULL DEFAULT 'queued',  -- queued | running | completed | failed | cancelled | crashed
    triggered_by TEXT NOT NULL,         -- username
    target_id INTEGER,                  -- optional: specific crawl_target_id
    crawl_run_id INTEGER,              -- FK to crawl_runs (set by Python on start)
    pid INTEGER,                        -- OS process ID
    log_path TEXT,                      -- data/job-logs/job-{id}.log
    started_at TEXT,
    completed_at TEXT,
    exit_code INTEGER,
    stdout_tail TEXT,                   -- last ~50 lines for quick status
    error_summary TEXT,                 -- human-readable error if failed
    result_summary TEXT,               -- JSON: {fees_extracted: 15, institutions_processed: 3}
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ops_jobs_status ON ops_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ops_jobs_command ON ops_jobs(command, created_at DESC);
```

**Files to create/modify:**
- [x] `fee_crawler/db.py` — add `ops_jobs` table to `ensure_tables()`
- [x] `src/lib/crawler-db/ops.ts` — new query file: `getJobs()`, `getJobById()`, `getActiveJobs()`, `getJobHistory()`
- `src/lib/crawler-db/index.ts` — re-export ops queries
- `src/lib/crawler-db/types.ts` — add `OpsJob` type (defined in ops.ts instead)

**1b. Job runner module**

```typescript
// src/lib/job-runner.ts
import { spawn } from "child_process";

export function spawnJobProcess(jobId: number, command: string, args: string[]): void {
  // 1. Create log file at data/job-logs/job-{id}.log
  // 2. spawn("python3", ["-u", "-m", "fee_crawler", command, ...args], { detached: true, stdio })
  // 3. UPDATE ops_jobs SET status='running', pid=?, started_at=datetime('now')
  // 4. Pipe stdout/stderr to log file + capture tail in memory
  // 5. On close: UPDATE ops_jobs SET status=completed|failed, exit_code, stdout_tail, completed_at
  // 6. child.unref() — allow Node.js to exit
}

export function buildCliArgs(command: string, params: Record<string, unknown>): string[] {
  // Map validated params to CLI flags
  // e.g., { limit: 10, state: "TX", dryRun: true } → ["--limit", "10", "--state", "TX", "--dry-run"]
}

export function cleanupStaleJobs(): void {
  // On server startup: find ops_jobs with status='running', check if PID is alive
  // Mark dead PIDs as 'crashed'
}
```

**Files to create:**
- [x] `src/lib/job-runner.ts` — process spawning, log capture, cleanup

**1c. Server actions**

```typescript
// src/app/admin/ops/actions.ts
"use server"

export async function triggerJob(command: string, params: Record<string, unknown>): Promise<TriggerResult>
  // 1. requireAuth("trigger_jobs")
  // 2. Validate command against ALLOWED_COMMANDS allowlist
  // 3. Validate params with strict bounds (limit 1-5000, workers 1-8, state 2-char uppercase)
  // 4. Check rate limits (max 10 crawls/hour, 2 pipelines/hour)
  // 5. Check concurrent job limit (max 3 running)
  // 6. Check duplicate (same command + target_id already running)
  // 7. INSERT into ops_jobs
  // 8. spawnJobProcess(jobId, command, buildCliArgs(command, params))
  // 9. revalidatePath("/admin/ops")
  // 10. return { success: true, jobId }

export async function cancelJob(jobId: number): Promise<{ success: boolean; error?: string }>
  // 1. requireAuth("cancel_jobs")
  // 2. Look up job, verify status is 'running' or 'queued'
  // 3. If running: process.kill(-pid, "SIGINT"), wait 10s, then SIGTERM if needed
  // 4. UPDATE ops_jobs SET status='cancelled', completed_at=datetime('now')

export async function retryJob(jobId: number): Promise<TriggerResult>
  // 1. requireAuth("trigger_jobs")
  // 2. Look up original job params
  // 3. triggerJob(original.command, JSON.parse(original.params_json))

export async function getJobStatus(jobId: number): Promise<OpsJob | null>
  // Read from ops_jobs table (used by polling client)

export async function getJobLogs(jobId: number, offset: number): Promise<{ lines: string[]; nextOffset: number }>
  // Read log file from offset, return new lines
```

**Files to create:**
- [x] `src/app/admin/ops/actions.ts`

**1d. Permissions**

Extend the role system:

```typescript
// src/lib/auth.ts — add to ROLE_PERMISSIONS
admin: [...existing, "trigger_jobs", "cancel_jobs"],
// analyst and viewer: no job permissions (read-only access to ops page via "view")
```

**Files to modify:**
- [x] `src/lib/auth.ts` — add `trigger_jobs`, `cancel_jobs` to Permission type and admin role

**1e. Ops Dashboard page**

```
/admin/ops (server component)
  ├── Header: "Operations Center" + breadcrumbs
  ├── Active Jobs strip (running/queued count, animated pulse)
  ├── Quick Actions grid (6 cards):
  │   ├── Crawl (batch)
  │   ├── Crawl Single Institution
  │   ├── Discover URLs
  │   ├── Run Pipeline
  │   ├── Categorize Fees
  │   └── Validate Fees
  ├── Job Trigger Form (client component, shown on card click)
  │   ├── Command-specific param fields
  │   ├── Dry-run checkbox
  │   ├── Estimated cost display
  │   └── "Start Job" button
  ├── Running Jobs panel (client component, polls every 3s)
  │   ├── Per-job: status badge, command, progress, elapsed time
  │   ├── Expandable log viewer (last 50 lines)
  │   └── Cancel button
  └── Job History table (server component, paginated)
      ├── Columns: ID, Command, Status, Triggered By, Started, Duration, Result
      ├── Sortable, filterable by command/status
      └── Row click → job detail with full log viewer
```

**Files to create:**
- [x] `src/app/admin/ops/page.tsx` — main page (server component)
- [x] `src/app/admin/ops/loading.tsx` — skeleton
- [x] `src/app/admin/ops/ops-client.tsx` — unified client component (trigger form, active jobs, job history)
- [x] `src/app/admin/ops/api/route.ts` — polling endpoint for job status updates

**Files to modify:**
- [x] `src/app/admin/admin-nav.tsx` — add "Operations" nav item

**1f. Input validation**

```typescript
// src/lib/job-validation.ts
const ALLOWED_COMMANDS = ["crawl", "discover", "categorize", "run-pipeline", "validate", "outlier-detect"] as const;
const VALID_STATES = new Set(["AL", "AK", "AZ", ...]); // all 50 + DC

const PARAM_RULES: Record<string, ParamRules> = {
  crawl: {
    limit: { type: "int", min: 1, max: 5000, default: 50 },
    workers: { type: "int", min: 1, max: 8, default: 4 },
    state: { type: "state", optional: true },
    target_id: { type: "int", min: 1, optional: true },
    dry_run: { type: "bool", default: false },
    include_failing: { type: "bool", default: false },
  },
  "run-pipeline": {
    limit: { type: "int", min: 1, max: 5000, default: 100 },
    workers: { type: "int", min: 1, max: 8, default: 4 },
    max_llm_calls: { type: "int", min: 1, max: 2000, default: 500 },
    max_search_cost: { type: "float", min: 0.01, max: 100, default: 10 },
    state: { type: "state", optional: true },
    skip_discover: { type: "bool", default: false },
    skip_crawl: { type: "bool", default: false },
    skip_categorize: { type: "bool", default: false },
  },
  // ... other commands
};

export function validateJobParams(command: string, params: Record<string, unknown>): { valid: boolean; errors: string[]; sanitized: Record<string, unknown> }
```

**Files to create:**
- [x] `src/lib/job-validation.ts`

#### Phase 2: Institution Integration + Review Link

Connect the ops center to existing admin pages.

**2a. Re-crawl button on institution detail page**

Add a "Re-crawl" button to `/admin/peers/[id]` that triggers a single-institution crawl:
- Button shows only for admin role
- Disabled if a crawl is already running for this institution
- On click: calls `triggerJob("crawl", { target_id: id, limit: 1 })`
- Shows inline status badge after triggering (polls for job status)

**Files to modify:**
- `src/app/admin/peers/[id]/page.tsx` — add Re-crawl button
- `src/app/admin/ops/actions.ts` — reuse `triggerJob` with `target_id`

**2b. Edit fee schedule URL**

Add an inline edit for the `fee_schedule_url` field on institution detail:
- Click pencil icon → input field with save/cancel
- Server action: `updateFeeScheduleUrl(targetId, url)` — validates URL format, updates `crawl_targets`
- After save: show "Test URL" and "Re-crawl" buttons

```typescript
// src/app/admin/peers/actions.ts — add
export async function updateFeeScheduleUrl(targetId: number, url: string): Promise<{ success: boolean }>
```

**Files to modify:**
- `src/app/admin/peers/[id]/page.tsx` — add URL editor
- `src/app/admin/peers/actions.ts` — add `updateFeeScheduleUrl`

**2c. Review page: filter by crawl run**

Add `?run=<crawl_run_id>` filter to the review page:
- When navigating from ops center after a crawl completes, pre-filter to show only fees from that run
- Join: `extracted_fees → crawl_results → crawl_runs` via `crawl_result_id`
- Add breadcrumb link back to the job detail

```sql
-- Add to getReviewableFees query when run param is present:
JOIN crawl_results cr ON cr.id = ef.crawl_result_id
WHERE cr.crawl_run_id = ?
```

**Files to modify:**
- `src/app/admin/review/page.tsx` — accept `run` search param, pass to query
- `src/lib/crawler-db/core.ts` — add `crawl_run_id` filter to `getFeesByStatus()`

**2d. Post-crawl summary in ops center**

When a job completes, show a results card:
- Institutions processed: X
- Fees extracted: Y (Z auto-staged, W flagged)
- Link: "Review Y new fees →" (to `/admin/review?run=<crawl_run_id>`)
- Link: "View crawl results →" (to `/admin/quality` or inline)

Parse results from the Python process stdout (the crawl command prints a summary line at the end).

**Files to modify:**
- `src/app/admin/ops/active-jobs-panel.tsx` — show result summary on completion

**2e. Crawl run tracking in Python**

Modify the Python `crawl` command to accept a `--job-id` argument and write the `crawl_run_id` back to the `ops_jobs` table:

```python
# fee_crawler/commands/crawl.py — add
parser.add_argument("--job-id", type=int, help="Ops job ID for UI tracking")

# After creating crawl_run, update ops_jobs:
if args.job_id:
    db.execute("UPDATE ops_jobs SET crawl_run_id = ? WHERE id = ?", (run_id, args.job_id))
```

**Files to modify:**
- `fee_crawler/commands/crawl.py` — accept `--job-id`, write `crawl_run_id` to `ops_jobs`
- `fee_crawler/commands/run_pipeline.py` — same pattern
- `fee_crawler/commands/discover_urls.py` — accept `--job-id` for tracking

#### Phase 3: URL Testing + Config View + Polish

**3a. URL test (dry-run with preview)**

Add a "Test URL" feature:
- Admin enters a URL → system downloads the document, extracts text, shows a preview
- Shows: document type (PDF/HTML), page count, text length, first 2000 chars, detected fee keywords
- No LLM call (saves API cost) — uses the pre-screen logic from `crawl.py`
- If test passes, offer "Save as fee schedule URL" + "Run full crawl"

```typescript
// src/app/admin/ops/actions.ts — add
export async function testUrl(url: string): Promise<UrlTestResult>
  // Spawns: python3 -u -m fee_crawler crawl --target-url <url> --dry-run --job-id <id>
  // Returns: { downloadable, documentType, textLength, preview, feeKeywordCount, dollarAmountCount }
```

This requires a new `--target-url` flag on the crawl command (or a dedicated `test-url` command).

**Files to create/modify:**
- `fee_crawler/commands/test_url.py` — new command: download + extract + pre-screen, output JSON
- `fee_crawler/__main__.py` — register `test-url` command
- `src/app/admin/ops/url-test-panel.tsx` — client component for URL testing
- `src/app/admin/ops/actions.ts` — add `testUrl` action

**3b. Config viewer (read-only)**

Show current crawler configuration in the ops center as a read-only reference panel:
- Display: crawl delay, max retries, user agent, LLM model, confidence threshold, auto-stage threshold
- Exclude: API keys, passwords, sensitive env vars
- Load from: `python3 -m fee_crawler config --json` (new command that prints safe config as JSON)

**Files to create/modify:**
- `fee_crawler/commands/show_config.py` — new command: print safe config as JSON (exclude secrets)
- `fee_crawler/__main__.py` — register `config` command
- `src/app/admin/ops/config-viewer.tsx` — read-only config display

**3c. Cost estimation**

Before triggering a job, show estimated API cost:
- Crawl: `limit * $0.03` (avg cost per LLM call with claude-sonnet-4-5)
- Pipeline: `limit * $0.05` (discover + crawl + categorize)
- Display as: "Estimated cost: ~$1.50 for 50 institutions"

**Files to modify:**
- `src/app/admin/ops/job-trigger-form.tsx` — add cost estimation display

**3d. System health check**

Add a health check that verifies the Python environment is ready:
- Check: Python is installed, `fee_crawler` module importable, config file exists, API key set
- Display: green/red status indicators in the ops center header
- Run: on page load via `python3 -m fee_crawler stats` (already exists, fast)

**Files to create:**
- `src/app/admin/ops/system-health.tsx` — health check display

**3e. Stale job recovery on startup**

Call `cleanupStaleJobs()` on the first request to `/admin/ops`:
- Find `ops_jobs` with `status = 'running'`
- Check if PID is alive with `process.kill(pid, 0)`
- Mark dead PIDs as `status = 'crashed'`

**Files to modify:**
- `src/lib/job-runner.ts` — `cleanupStaleJobs()` implementation
- `src/app/admin/ops/page.tsx` — call cleanup on load

## Acceptance Criteria

### Phase 1: Foundation (MVP)
- [ ] `ops_jobs` table created in SQLite schema
- [ ] Server action `triggerJob()` spawns Python process with validated params
- [ ] `spawn()` uses array args (never string interpolation) — no command injection
- [ ] All params validated: limit 1-5000, workers 1-8, state = 2-char uppercase
- [ ] Rate limiting: max 10 crawls/hour, max 2 pipelines/hour
- [ ] Concurrent job limit: max 3 running simultaneously
- [ ] Duplicate prevention: same command + target_id cannot run twice
- [ ] `trigger_jobs` and `cancel_jobs` permissions added to admin role
- [ ] Analyst and viewer can view job history but not trigger/cancel
- [ ] Job logs captured to `data/job-logs/job-{id}.log`
- [ ] Client polls for job status every 3 seconds, stops on terminal status
- [ ] Cancel button sends SIGINT to Python process
- [ ] Stale jobs (orphaned PIDs) marked as 'crashed' on page load
- [ ] Ops page added to admin nav
- [ ] Build passes, no TypeScript errors

### Phase 2: Integration
- [ ] "Re-crawl" button on institution detail page (`/admin/peers/[id]`)
- [ ] Inline fee schedule URL editor on institution detail
- [ ] Review page accepts `?run=<crawl_run_id>` filter
- [ ] Post-crawl summary shows fees extracted with link to review
- [ ] Python crawl command accepts `--job-id` and writes `crawl_run_id` back to `ops_jobs`

### Phase 3: Polish
- [ ] URL test feature downloads + extracts + previews without LLM call
- [ ] Config viewer shows safe config values (no secrets)
- [ ] Cost estimation displayed before job trigger
- [ ] System health check verifies Python environment
- [ ] `/frontend-design` treatment applied to ops center

## Dependencies & Risks

**Dependencies:**
- Python 3 must be available on the server (same machine as Next.js)
- `fee_crawler` module must be importable (virtualenv or system install)
- `ANTHROPIC_API_KEY` environment variable must be set for LLM-dependent commands
- `data/job-logs/` directory must be writable

**Risks:**
- **SQLite write contention**: Long-running Python crawl transactions could block admin fee approvals. Mitigated by Python's per-institution commits (short transactions) + WAL mode + busy_timeout
- **Detached process orphans**: If the Python process crashes without updating `ops_jobs`, the status stays 'running'. Mitigated by PID-based stale job detection on page load
- **API cost**: An admin could trigger expensive crawls. Mitigated by rate limits, parameter caps, cost estimation, and dry-run mode
- **Security**: Command injection via malformed params. Mitigated by strict allowlists, `spawn()` with array args, and server-side validation

## Key References

| File | Purpose |
|------|---------|
| `fee_crawler/__main__.py` | All 17 CLI commands and their argument definitions |
| `fee_crawler/commands/crawl.py` | Core crawl logic, ThreadPoolExecutor, per-institution processing |
| `fee_crawler/commands/run_pipeline.py` | Multi-stage pipeline orchestrator |
| `fee_crawler/commands/discover_urls.py` | URL discovery with search API cost controls |
| `fee_crawler/db.py` | Full database schema (17 tables) |
| `fee_crawler/config.py` | Pydantic config model (CrawlConfig, ClaudeConfig, ExtractionConfig) |
| `src/lib/auth.ts` | Authentication, roles (viewer/analyst/admin), permissions |
| `src/lib/fee-actions.ts` | Server action pattern: requirePermission + getWriteDb + try/finally |
| `src/lib/crawler-db/connection.ts` | Singleton read DB + write-per-action pattern |
| `src/lib/crawler-db/dashboard.ts` | Existing crawl health queries (getCrawlHealth, getRecentCrawlActivity) |
| `src/components/crawl-status-strip.tsx` | Existing crawl status UI component |
| `src/app/admin/review/page.tsx` | Review queue (target for crawl_run_id filter) |
| `src/app/admin/peers/[id]/page.tsx` | Institution detail (target for re-crawl button) |
