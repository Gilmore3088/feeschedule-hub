# Architecture

**Analysis Date:** 2026-04-06

## Pattern Overview

**Overall:** Next.js full-stack monolith with Python crawler microservices

**Key Characteristics:**
- Server Components for pages + minimal client interactivity (lowered `"use client"`)
- Server Actions for mutations (fee approvals, search, peer management)
- PostgreSQL-driven data layer with immutable audit tables
- Decoupled Python crawler (Modal workers) feeding via API or direct DB
- Research agents as first-class feature (streaming LLM responses via Vercel AI SDK)
- Role-based admin panel with real-time job monitoring

## Layers

**Presentation Layer:**
- Location: `src/app/` (Next.js App Router) + `src/components/`
- Contains: Page components, layouts, client components
- Pattern: Server components by default; client components only for interactivity (Cmd+K, dark mode, charts)
- Example entry points:
  - `src/app/page.tsx` - Landing page (gateway)
  - `src/app/(public)/` - Public index/market/peer pages
  - `src/app/admin/` - Admin dashboard (12 sub-pages)
  - `src/app/(auth)/` - Login/waitlist
- Depends on: Server Actions, API routes, DB queries
- Used by: Browser clients (web, mobile)

**Server Actions Layer:**
- Location: `src/app/*/actions.ts` (fee review, search, peer filters, leads)
- Purpose: Handle mutations from forms, buttons, interactivity
- Pattern: Async functions marked `"use server"`, type-safe with Zod validation
- Examples:
  - `src/app/admin/fees/catalog/actions.ts` - Approve/reject fees
  - `src/app/admin/index/actions.ts` - Export CSV, manage index preferences
  - `src/app/admin/search/actions.ts` - Cmd+K search query
- Depends on: DB layer, auth, validation
- Replaces: Traditional REST endpoints for form submissions

**API Routes Layer:**
- Location: `src/app/api/`
- Contains: REST endpoints, webhooks, internal triggers
- Route groups:
  - `/api/v1/*` - Public API (fees, index, institutions)
  - `/api/health` - Liveness check
  - `/api/research/[agentId]` - Streaming research agent responses
  - `/api/scout/*` - FeeScout agent state (audit, pipeline, institutions)
  - `/api/webhooks/stripe` - Payment processing
  - `/api/revalidate` - ISR trigger from crawler
- Depends on: Auth middleware, DB layer, external APIs
- Used by: Public clients, internal crawler, frontend streaming

**Database Query Layer:**
- Location: `src/lib/crawler-db/` (20+ exported query functions)
- Files by concern:
  - `connection.ts` - Singleton postgres client, `getSql()`, `sql` template literal
  - `core.ts` - Institutions, crawl targets, state
  - `fees.ts` - Fee extraction, review, statistics
  - `dashboard.ts` - Aggregate metrics for admin dashboard
  - `fee-index.ts` - National/peer index computation
  - `market.ts` - Market index with deltas
  - `peers.ts` - Peer set queries, saved filters
  - `fed.ts` - Federal district data, Beige Book
  - `geographic.ts` - State/district/MSA queries
  - `pipeline.ts` - Crawl run tracking, job history
  - `articles.ts` - Fed/economic news
  - `types.ts` - Shared TypeScript interfaces
- Pattern: Template literal SQL with postgres client (no ORM)
- Used by: Server components, server actions, API routes

**Business Logic Layer:**
- Location: `src/lib/` (30+ utility modules)
- Core modules:
  - `fee-taxonomy.ts` - 9 families, 49 categories, tier system (spotlight/core/extended/comprehensive)
  - `fed-districts.ts` - District metadata, peer filtering (charter, tier, districts array)
  - `format.ts` - formatAmount, formatAssets, timeAgo, formatPct
  - `fee-actions.ts` - Approve/reject/stage fee reviews (transactions)
  - `auth.ts` - Session management, role checking
  - `stripe.ts` - Singleton Stripe client, webhook validation
  - `api-rate-limit.ts` - Per-IP rate limiting for public API
  - `research/agents.ts` - Agent registry (Analyst Hub, Consumer Insights, etc.)
  - `research/skills.ts` - Skill detection, execution framework
  - `job-runner.ts` - Modal job triggering, polling
  - `brief-generator.ts` - AI summaries via Anthropic
- Depends on: DB, external APIs, validation
- Used by: Pages, actions, API routes

**Python Crawler Layer:**
- Location: `fee_crawler/`
- Modules:
  - `pipeline/` - Download, extract, classify, validate
  - `agents/` - Specialized extraction agents (bank routing, document classification)
  - `commands/` - CLI: crawl, ingest-beige-book, ingest-fred, seed-users
  - `db.py` - SQLite/Postgres adapter
  - `modal_app.py` - Modal worker definitions (3 scheduled jobs)
  - `fee_analysis.py` - Fee normalization, outlier detection
  - `validation.py` - Confidence scoring, quality gates
- Pattern: Config-driven (config.yaml), async/concurrent operations
- Deployment: Modal serverless workers (scheduled + webhook-triggered)
- Used by: Daily cron jobs (2am-4am ET), manual CLI, revalidation triggers

## Data Flow

**Fee Extraction Pipeline (Nightly):**

1. **Discovery (2 AM, Modal `run_discovery`)**
   - Query: crawl_targets with website_url but no fee_schedule_url
   - Action: Fetch website HTML, extract candidate fee schedule URLs (heuristic + LLM)
   - Result: Write fee_schedule_url, update crawl_target, log to crawl_events

2. **Download (embedded in extraction workers)**
   - Fetch document from fee_schedule_url (PDF/HTML/etc)
   - Content-addressed upload to Cloudflare R2 (by SHA-256 hash)
   - Dedup: same document = skip re-download

3. **Classification & Extraction (3 AM & 4 AM, two workers)**
   - PDF extraction (3 AM, `run_pdf_extraction`) - pdfplumber + OCR fallback
   - Browser extraction (4 AM, `run_browser_extraction`) - Playwright for JS-rendered
   - LLM prompt: claude-haiku-4-5 with detailed fee extraction instruction
   - Output: extracted_fees (fee_category, amount, frequency, conditions, confidence)

4. **Validation & Auto-Staging**
   - Confidence > 0.85: auto-stage (reviewed_status = 'staged')
   - Confidence 0.7-0.85: pending (reviewed_status = 'pending')
   - Confidence < 0.7: extracted only (needs manual review)
   - Outlier detection: 3+ std devs flagged for analyst review

5. **Approval Workflow (Admin Panel)**
   - Analyst/admin views pending fees in review queue
   - Approve: sets review_status='approved', marks reviewed_at
   - Reject: review_status='rejected', optional note
   - Transaction: all changes in db.transaction() for atomicity

6. **Publication & Revalidation**
   - POST `/api/revalidate?token=BFI_REVALIDATE_TOKEN`
   - Vercel ISR rebuilds: /admin/*, /pro/*, / (top-level pages)
   - National index recomputed from approved + staged + pending fees

**Data State Transitions:**

```
crawl_targets (institutions)
  ├─ website_url (from FDIC/NCUA)
  ├─ fee_schedule_url (discovered or seeded)
  └─ status: active | inactive

Fee schedule download → content-addressed R2 storage (sha256)
  ↓
extracted_fees (one row per fee, per institution)
  ├─ review_status: pending | staged | approved | rejected
  ├─ extraction_confidence: 0.0-1.0
  ├─ created_at, reviewed_at, reviewed_by
  └─ comment (if rejected)

Fee reviews (audit table)
  ├─ action: approve | reject | stage
  ├─ reviewer_id, timestamp
  └─ read-only for compliance
```

**User Query Paths:**

- **Public Index**: GET `/api/v1/index?charter=bank&tier=...` → getNationalIndex() → fee aggregation by category
- **Peer Index**: market/district filters → getPeerIndex() with WHERE clause builder
- **Search**: `/admin/search` (Cmd+K) → Server Action → fts-style LIKE query
- **Research**: POST `/api/research/[agentId]` → streaming text via Vercel AI SDK + Anthropic streaming
- **Admin Dashboard**: `/admin` → Server component + Suspense boundaries → concurrent DB queries

## Key Abstractions

**IndexEntry (Fee Benchmark):**
- Purpose: Represent aggregated fee statistics for a category
- Files: `src/lib/crawler-db/fee-index.ts`, `src/app/admin/market/`
- Pattern: getNationalIndex() returns IndexEntry[], getPeerIndex() adds segment/delta
- Fields: fee_category, institution_count, median_amount, p25, p75, maturity, peer-filtered flags
- Used by: Dashboard cards, market index tables, category detail pages

**MarketIndexEntry (Benchmark with Delta):**
- Purpose: Compare segment to national median
- Pattern: Extends IndexEntry with national_median, delta_pct = ((seg-nat)/nat)*100
- Color coding: Emerald (below national = cost advantage), Red (above = cost disadvantage)
- Used by: `/admin/market` two-column layout

**PeerFilter (Segment Definition):**
- Purpose: URL-based segment selection (charter, asset tiers[], fed districts[])
- Pattern: Parsed from `?charter=bank&tier=a,b&district=1,3,7` via parsePeerFilters()
- Stored as: { charter?: string, tiers?: string[], districts?: number[], range?: string }
- Used by: Index queries, breadcrumb descriptions, peer summary panel

**ReviewState (Fee Approval Workflow):**
- Purpose: Track fee through approval pipeline
- Pattern: review_status (pending|staged|approved|rejected) + extracted_confidence + reviewed_at/by
- Auto-stage rule: confidence >= extraction.confidence_auto_stage_threshold (default 0.85)
- Used by: Admin review queue, published index computation

**Skill (Research Agent Plugin):**
- Purpose: Extensible agent capabilities (Fee Benchmarking, Competitive Intelligence, etc.)
- Pattern: Skill object with name, prompt, examples, sample_questions
- Execution: buildSkillExecution() injects context, buildSkillInjection() formats tool definition
- Used by: Research agents in `/admin/research`, `/pro/research`

## Entry Points

**Web Application:**
- Location: `src/app/page.tsx`
- Triggers: Browser visit to feeinsight.com
- Responsibilities: GatewayClient component routes to public/admin/pro based on auth

**Admin Panel:**
- Location: `src/app/admin/layout.tsx`
- Auth: getCurrentUser() checks admin role, redirects non-admin
- Layout: Sticky header (logo, nav, search Cmd+K, dark mode), content grid
- Sub-routes: dashboard, market, index, peers, fees, districts, ops, leads, research

**Public API:**
- Location: `/api/v1/fees`, `/api/v1/index`, `/api/v1/institutions`
- Auth: Optional (public tier) or API key based
- Rate limiting: checkPublicRateLimit(ip, path)
- Response: JSON with fee data, index snapshots

**Research Agent:**
- Location: `/api/research/[agentId]`
- Auth: Optional (public shared agents) or session required
- Method: POST with conversation history
- Response: Streaming text (Server-Sent Events via streamText from ai SDK)

**Modal Workers:**
- Location: `fee_crawler/modal_app.py`
- Trigger: Cron schedules (2am, 3am, 4am ET) or manual `modal run`
- Execution: Subprocess calls to `python -m fee_crawler crawl`

**Stripe Webhooks:**
- Location: `/api/webhooks/stripe`
- Trigger: Stripe event (customer.subscription.updated, invoice.payment_failed, etc.)
- Responsibility: Verify signature, update user subscription_status, handle dunning

## Error Handling

**Strategy:** Explicit error propagation with try-catch at boundaries

**Patterns:**

- **Server Actions:** Try-catch wraps DB call, throws message to client via form state
  ```typescript
  try {
    await db.approveFee(feeId);
  } catch (e) {
    return { error: String(e) };
  }
  ```

- **API Routes:** NextResponse.json({ status: 'error', message: ... }, { status: 500 })

- **Database:** sql queries throw on connection error, handled by middleware

- **LLM Errors:** Anthropic API errors bubble up to streaming response, client sees error message

- **Auth:** Invalid session → redirect to login, missing role → 403 Forbidden

- **Validation:** Zod schema.parse() throws ZodError → caught in action boundary

## Cross-Cutting Concerns

**Logging:**
- Approach: Python logging module (fee_crawler), Next.js console logs (dev only)
- Module: None; logs printed to stdout (Vercel/Docker captures)
- Important events: Crawl start/end, fee extraction counts, validation failures, API errors

**Validation:**
- Primary: Zod schemas for API inputs, environment variables
- Examples:
  - `src/lib/crawler-db/types.ts` - TypeScript interfaces (not Zod, but type-safe)
  - Fee extraction confidence validation (0.0-1.0)
  - PeerFilter URL param validation (charter enum, district number array)

**Authentication:**
- Session-based with HMAC-SHA256 signed cookies (24-hour TTL)
- Checked on page render via getCurrentUser()
- Roles: viewer (read-only), analyst (review fees), admin (full access), premium (Stripe subscription)
- Stored in: pg users table (username, display_name, email, role, stripe_customer_id, subscription_status)

**Rate Limiting:**
- Approach: In-memory cache (key = ip:path, value = request count + timestamp window)
- Applied to: `/api/v1/*` public endpoints
- Limits: checkPublicRateLimit() returns boolean, endpoint returns 429 Too Many Requests
- Admin/research streams: Daily cost circuit breaker ($50 limit in cents) to prevent runaway LLM spend

---

*Architecture analysis: 2026-04-06*
