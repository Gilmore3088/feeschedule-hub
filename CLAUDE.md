<!-- GSD:project-start source:PROJECT.md -->
## Project

**Bank Fee Index**

The national authority on bank and credit union fee data. A B2B platform that collects, analyzes, and publishes fee intelligence across 4,000+ financial institutions, powered by AI agents that crawl fee schedules and an AI research analyst (Hamilton) that produces McKinsey-grade reports. Revenue from subscriptions ($2,500/mo for peer benchmarking), consulting, and consumer-side ads/affiliates.

**Core Value:** Accurate, complete, timely fee data with rich analysis — the kind of insight a bank executive would pay a consulting firm $15K to produce, generated on demand from live pipeline data.

### Constraints

- **Content quality**: Reports must look like they came from McKinsey — not dashboards, not data dumps
- **Accuracy**: All data in reports must trace to pipeline-verified fees
- **Cost**: Claude API calls for Hamilton analysis are acceptable ($5-10 per report)
- **No overlap**: Pipeline/agent work is being done by the owner in parallel — this milestone is content layer only
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5 - Frontend (React/Next.js), server-side code, API routes
- Python 3.12 - Fee crawler pipeline, data extraction, analysis
- JavaScript (ESM modules) - Build config, linting configuration
- SQL (Postgres/SQLite) - Database queries via postgres client
## Runtime
- Node.js 20 (Vercel/Docker deployment) - Primary Next.js runtime
- Python 3.12 - Fee crawler agents and pipeline workers
- npm - JavaScript/TypeScript dependencies
- pip - Python dependencies
- `package-lock.json` - Present, locked versions
- Python uses `requirements.txt` for fee_crawler
## Frameworks
- Next.js 16.1.6 - Full-stack React framework with App Router, server actions, API routes
- React 19.2.3 - UI library with hooks and concurrent features
- Tailwind CSS 4 - Utility-first CSS with v4 @tailwindcss/postcss
- Geist - Font family and design system (via geist package 1.7.0)
- Radix UI 1.4.3 - Unstyled, accessible component primitives
- Lucide React 0.564.0 - Icon library
- Recharts 3.7.0 - React charting library (histograms, sparklines, distribution charts)
- Modal - Serverless workers for scheduled cron jobs (fee extraction, discovery)
- Vercel - Next.js deployment, ISR revalidation
- vitest - Test runner for TypeScript/JS (config: `vitest.config.ts`)
- pytest - Python test framework (`fee_crawler/tests/`)
- TypeScript compiler (strict mode) - Type checking
- ESLint 9 + eslint-config-next - Linting with Next.js/core-web-vitals rules
- Tailwind PostCSS 4 - CSS build pipeline
## Key Dependencies
- `postgres` 3.4.8 - PostgreSQL client for Supabase (TCP, transaction mode pooler at port 6543)
- `@anthropic-ai/sdk` 0.80.0 - Anthropic API client (research agents, fee analysis)
- `ai` 6.0.116 - Vercel AI SDK for streaming text responses
- `@ai-sdk/anthropic` 3.0.58 - Anthropic provider for ai SDK
- `@ai-sdk/react` 3.0.118 - React hooks for AI SDK streams
- `stripe` 20.4.1 - Stripe payment processing (subscriptions, webhooks)
- `zod` 4.3.6 - TypeScript-first schema validation (env vars, API inputs)
- `sanitize-html` 2.17.1 - HTML sanitization for fee descriptions
- `bcryptjs` 3.0.3 - Password hashing for auth
- `clsx` 2.1.1 - Class name concatenation utility
- `class-variance-authority` 0.7.1 - Component variant system
- `tailwind-merge` 3.4.0 - Tailwind class merging for overrides
- pydantic 2.0+ - Data validation, configuration management
- anthropic 0.40+ - Anthropic API client for fee extraction LLM
- beautifulsoup4 4.12+ - HTML parsing
- pdfplumber 0.10+ - PDF text extraction
- boto3 1.34+ - AWS S3/Cloudflare R2 SDK
- psycopg2-binary 2.9+ - PostgreSQL adapter
- playwright 1.40+ - Browser automation for JS-rendered fee schedules
- feedparser 6.0+ - RSS feed parsing (Fed Beige Book, economic data)
- httpx 0.27+ - Async HTTP client
- asyncpg 0.29+ - Async PostgreSQL driver
- requests 2.31+ - Synchronous HTTP client
## Configuration
- Database: `DATABASE_URL` (Postgres), `DB_PATH` (legacy SQLite)
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Storage: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- Modal: `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`
- Auth: `BFI_COOKIE_SECRET`, `BFI_ADMIN_PASSWORD`, `BFI_ANALYST_PASSWORD`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- AI: `ANTHROPIC_API_KEY`, `FRED_API_KEY`
- Deployment: `BFI_APP_URL`, `BFI_REVALIDATE_TOKEN`, `NEXT_PUBLIC_SITE_URL`
- Analytics: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `NEXT_PUBLIC_SENTRY_DSN`
- `tsconfig.json` - ES2017 target, strict mode enabled, path alias `@/*` → `./src/*`
- `next.config.ts` - Standalone output, security headers (CSP, HSTS, XFO, NNAP, Referrer-Policy), Stripe/Plausible domains allowed
- `postcss.config.mjs` - Tailwind v4 PostCSS plugin
- `eslint.config.mjs` - Next.js vitals + TypeScript rules
- `components.json` - Shadcn component configuration
- `fee_crawler/config.yaml` - Database type (sqlite/postgres), crawl concurrency, extraction model (haiku), batch API, daily budget
## Platform Requirements
- Node.js 20+
- Python 3.12+
- System dependencies: `tesseract-ocr`, `poppler-utils` (for PDF extraction fallback)
- Docker (Node 20 slim, ~200MB image for Next.js only)
- Vercel (Next.js 16 compatible)
- Supabase PostgreSQL (13+, transaction mode pooler required)
- Cloudflare R2 (S3-compatible object storage)
- Modal serverless platform (for scheduled Python workers)
- Anthropic API (claude-haiku-4-5-20251001 for fee extraction, claude-sonnet/opus for research)
- Stripe (payment processing, webhooks)
- FRED API (economic data ingestion)
- Plausible Analytics (optional, analytics.js)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Server Components for pages + minimal client interactivity (lowered `"use client"`)
- Server Actions for mutations (fee approvals, search, peer management)
- PostgreSQL-driven data layer with immutable audit tables
- Decoupled Python crawler (Modal workers) feeding via API or direct DB
- Research agents as first-class feature (streaming LLM responses via Vercel AI SDK)
- Role-based admin panel with real-time job monitoring
## Layers
- Location: `src/app/` (Next.js App Router) + `src/components/`
- Contains: Page components, layouts, client components
- Pattern: Server components by default; client components only for interactivity (Cmd+K, dark mode, charts)
- Example entry points:
- Depends on: Server Actions, API routes, DB queries
- Used by: Browser clients (web, mobile)
- Location: `src/app/*/actions.ts` (fee review, search, peer filters, leads)
- Purpose: Handle mutations from forms, buttons, interactivity
- Pattern: Async functions marked `"use server"`, type-safe with Zod validation
- Examples:
- Depends on: DB layer, auth, validation
- Replaces: Traditional REST endpoints for form submissions
- Location: `src/app/api/`
- Contains: REST endpoints, webhooks, internal triggers
- Route groups:
- Depends on: Auth middleware, DB layer, external APIs
- Used by: Public clients, internal crawler, frontend streaming
- Location: `src/lib/crawler-db/` (20+ exported query functions)
- Files by concern:
- Pattern: Template literal SQL with postgres client (no ORM)
- Used by: Server components, server actions, API routes
- Location: `src/lib/` (30+ utility modules)
- Core modules:
- Depends on: DB, external APIs, validation
- Used by: Pages, actions, API routes
- Location: `fee_crawler/`
- Modules:
- Pattern: Config-driven (config.yaml), async/concurrent operations
- Deployment: Modal serverless workers (scheduled + webhook-triggered)
- Used by: Daily cron jobs (2am-4am ET), manual CLI, revalidation triggers
## Data Flow
```
```
- **Public Index**: GET `/api/v1/index?charter=bank&tier=...` → getNationalIndex() → fee aggregation by category
- **Peer Index**: market/district filters → getPeerIndex() with WHERE clause builder
- **Search**: `/admin/search` (Cmd+K) → Server Action → fts-style LIKE query
- **Research**: POST `/api/research/[agentId]` → streaming text via Vercel AI SDK + Anthropic streaming
- **Admin Dashboard**: `/admin` → Server component + Suspense boundaries → concurrent DB queries
## Key Abstractions
- Purpose: Represent aggregated fee statistics for a category
- Files: `src/lib/crawler-db/fee-index.ts`, `src/app/admin/market/`
- Pattern: getNationalIndex() returns IndexEntry[], getPeerIndex() adds segment/delta
- Fields: fee_category, institution_count, median_amount, p25, p75, maturity, peer-filtered flags
- Used by: Dashboard cards, market index tables, category detail pages
- Purpose: Compare segment to national median
- Pattern: Extends IndexEntry with national_median, delta_pct = ((seg-nat)/nat)*100
- Color coding: Emerald (below national = cost advantage), Red (above = cost disadvantage)
- Used by: `/admin/market` two-column layout
- Purpose: URL-based segment selection (charter, asset tiers[], fed districts[])
- Pattern: Parsed from `?charter=bank&tier=a,b&district=1,3,7` via parsePeerFilters()
- Stored as: { charter?: string, tiers?: string[], districts?: number[], range?: string }
- Used by: Index queries, breadcrumb descriptions, peer summary panel
- Purpose: Track fee through approval pipeline
- Pattern: review_status (pending|staged|approved|rejected) + extracted_confidence + reviewed_at/by
- Auto-stage rule: confidence >= extraction.confidence_auto_stage_threshold (default 0.85)
- Used by: Admin review queue, published index computation
- Purpose: Extensible agent capabilities (Fee Benchmarking, Competitive Intelligence, etc.)
- Pattern: Skill object with name, prompt, examples, sample_questions
- Execution: buildSkillExecution() injects context, buildSkillInjection() formats tool definition
- Used by: Research agents in `/admin/research`, `/pro/research`
## Entry Points
- Location: `src/app/page.tsx`
- Triggers: Browser visit to feeinsight.com
- Responsibilities: GatewayClient component routes to public/admin/pro based on auth
- Location: `src/app/admin/layout.tsx`
- Auth: getCurrentUser() checks admin role, redirects non-admin
- Layout: Sticky header (logo, nav, search Cmd+K, dark mode), content grid
- Sub-routes: dashboard, market, index, peers, fees, districts, ops, leads, research
- Location: `/api/v1/fees`, `/api/v1/index`, `/api/v1/institutions`
- Auth: Optional (public tier) or API key based
- Rate limiting: checkPublicRateLimit(ip, path)
- Response: JSON with fee data, index snapshots
- Location: `/api/research/[agentId]`
- Auth: Optional (public shared agents) or session required
- Method: POST with conversation history
- Response: Streaming text (Server-Sent Events via streamText from ai SDK)
- Location: `fee_crawler/modal_app.py`
- Trigger: Cron schedules (2am, 3am, 4am ET) or manual `modal run`
- Execution: Subprocess calls to `python -m fee_crawler crawl`
- Location: `/api/webhooks/stripe`
- Trigger: Stripe event (customer.subscription.updated, invoice.payment_failed, etc.)
- Responsibility: Verify signature, update user subscription_status, handle dunning
## Error Handling
- **Server Actions:** Try-catch wraps DB call, throws message to client via form state
- **API Routes:** NextResponse.json({ status: 'error', message: ... }, { status: 500 })
- **Database:** sql queries throw on connection error, handled by middleware
- **LLM Errors:** Anthropic API errors bubble up to streaming response, client sees error message
- **Auth:** Invalid session → redirect to login, missing role → 403 Forbidden
- **Validation:** Zod schema.parse() throws ZodError → caught in action boundary
## Cross-Cutting Concerns
- Approach: Python logging module (fee_crawler), Next.js console logs (dev only)
- Module: None; logs printed to stdout (Vercel/Docker captures)
- Important events: Crawl start/end, fee extraction counts, validation failures, API errors
- Primary: Zod schemas for API inputs, environment variables
- Examples:
- Session-based with HMAC-SHA256 signed cookies (24-hour TTL)
- Checked on page render via getCurrentUser()
- Roles: viewer (read-only), analyst (review fees), admin (full access), premium (Stripe subscription)
- Stored in: pg users table (username, display_name, email, role, stripe_customer_id, subscription_status)
- Approach: In-memory cache (key = ip:path, value = request count + timestamp window)
- Applied to: `/api/v1/*` public endpoints
- Limits: checkPublicRateLimit() returns boolean, endpoint returns 429 Too Many Requests
- Admin/research streams: Daily cost circuit breaker ($50 limit in cents) to prevent runaway LLM spend
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| audit-data | Run data quality checks on the crawler database and report hygiene issues | `.claude/skills/audit-data/SKILL.md` |
| competitive-intelligence | Market positioning and pricing strategy analysis for competitive fee intelligence | `.claude/skills/competitive-intelligence/SKILL.md` |
| consumer-guide | Generate plain-language fee guides that help consumers understand and reduce banking fees | `.claude/skills/consumer-guide/SKILL.md` |
| data-quality-audit | Assess data hygiene and coverage quality across the fee index with a structured scorecard | `.claude/skills/data-quality-audit/SKILL.md` |
| district-economic-outlook | Regional fee landscape analysis combining Federal Reserve district data with fee trend intelligence | `.claude/skills/district-economic-outlook/SKILL.md` |
| executive-report | Generate McKinsey/Gartner-style professional research reports on banking fee trends | `.claude/skills/executive-report/SKILL.md` |
| fee-benchmarking | Peer comparison methodology for benchmarking bank and credit union fee schedules | `.claude/skills/fee-benchmarking/SKILL.md` |
| fee-revenue-correlation | Analysis framework correlating published fee schedules with actual service charge revenue from Call Reports | `.claude/skills/fee-revenue-correlation/SKILL.md` |
| monthly-pulse | Generate concise monthly summaries of fee index movements and notable trends | `.claude/skills/monthly-pulse/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
