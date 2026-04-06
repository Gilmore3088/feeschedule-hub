# Phase 13: Report Engine Core - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the report generation pipeline: Modal render worker (Playwright HTML→PDF), R2 artifact storage with presigned URLs, Supabase report_jobs table for job state tracking, Next.js API routes for trigger/poll/download, data freshness gate, and editor review (second Claude pass). This is the infrastructure that all report types from Phase 14+ will use.

</domain>

<decisions>
## Implementation Decisions

### Modal Render Worker
- **D-01:** Add a `generate_report` function to Modal using the existing Playwright image. Receives assembled HTML, renders to PDF via `page.pdf()`, uploads to R2, updates Supabase job status.
- **D-02:** No new Modal image needed — reuse the existing one that has Playwright installed for the State Agent.

### R2 Storage
- **D-03:** Store PDF artifacts in R2 with key pattern `reports/{report_type}/{job_id}.pdf`. Never store public URLs — only object keys.
- **D-04:** Generate short-TTL presigned URLs (1 hour) at download time after verifying user auth/subscription tier.

### Job Queue (Supabase)
- **D-05:** `report_jobs` table: id, report_type, status (pending→assembling→rendering→complete|failed), params (JSONB), data_manifest (JSONB — source queries + row counts), artifact_key (R2 key), created_at, completed_at, user_id.
- **D-06:** `published_reports` table for reports that are published to the catalog (Phase 16). Separate from jobs — a job can complete without being published.

### Next.js API
- **D-07:** POST `/api/reports/generate` — enqueue job, return job_id
- **D-08:** GET `/api/reports/[id]/status` — poll job status
- **D-09:** GET `/api/reports/[id]/download` — presigned R2 URL (auth required)

### Data Freshness Gate
- **D-10:** Before assembling any report, query median `last_crawled_at` for the target geography. If median > 120 days (national) or > 90 days (state), return error with clear message. No stale reports published.

### Editor Review
- **D-11:** After Hamilton generates narrative sections, a second Claude pass reviews for: consistency, unsupported claims, tone drift from voice.ts rules. Flagged sections get status `needs_review` instead of `complete`.
- **D-12:** Editor agent uses a different system prompt than Hamilton — it's a critic, not a writer.

### Data Manifest
- **D-13:** Every report job stores a data_manifest: list of SQL queries run, row counts returned, data hash. This is the audit trail that answers "where did this number come from?"

### Claude's Discretion
- All implementation details
- Editor agent prompt design
- Migration SQL for report_jobs/published_reports tables
- API route implementation patterns

</decisions>

<canonical_refs>
## Canonical References

### Existing Infrastructure
- `fee_crawler/modal_app.py` — Existing Modal app with Playwright image
- `fee_crawler/modal_preflight.py` — Modal function pattern (from v1.0 Phase 11)
- `src/lib/hamilton/` — Hamilton module (Phase 12)
- `src/lib/report-templates/` — Template system (Phase 12)

### Research
- `.planning/research/ARCHITECTURE.md` — Report engine architecture, 5-layer pipeline
- `.planning/research/PITFALLS.md` — Hallucination prevention, freshness gates, audit trail
- `.planning/research/STACK.md` — Playwright PDF, R2 presigned URLs, Supabase job queue

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable
- Modal Playwright image already exists for State Agent
- R2 client (boto3 S3-compatible) already in pipeline
- Supabase client already configured in Next.js app
- `wrapReport()` from Phase 12 produces complete HTML ready for Playwright

### Integration Points
- Modal worker receives HTML string + metadata, returns R2 key
- Next.js API routes trigger Modal function, poll Supabase, serve presigned URL
- Phase 14 report templates call Hamilton, pass output to render worker

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond research recommendations.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 13-report-engine-core*
*Context gathered: 2026-04-06*
