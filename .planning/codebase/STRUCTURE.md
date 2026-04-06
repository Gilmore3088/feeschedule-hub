# Codebase Structure

**Analysis Date:** 2026-04-06

## Directory Layout

```
feeschedule-hub/
├── src/                          # Next.js source (TypeScript)
│   ├── app/                      # Next.js App Router pages & layouts
│   ├── components/               # React components (server + client)
│   ├── lib/                      # Shared utilities, business logic, DB queries
│   └── ...
├── fee_crawler/                  # Python crawler & extraction pipeline
│   ├── pipeline/                 # Download, extract, classify, validate steps
│   ├── agents/                   # Specialized extraction agents
│   ├── commands/                 # CLI: crawl, ingest-*, seed-users
│   ├── workers/                  # Modal worker definitions
│   ├── tests/                    # pytest test suite
│   ├── config.yaml               # Crawler configuration (model, budget, etc.)
│   ├── requirements.txt           # Python dependencies
│   ├── db.py                     # Database abstraction layer
│   ├── modal_app.py              # Modal serverless app with 3 scheduled jobs
│   ├── fee_analysis.py           # Fee normalization, percentile ranking
│   └── validation.py             # Confidence scoring, quality gates
├── .planning/                    # GSD planning documents
│   └── codebase/                 # Architecture & tech stack docs
├── .github/                      # GitHub workflows (now superseded by Modal)
├── docs/                         # User guides, API docs
├── data/                         # SQLite database & local docs (git-ignored)
└── ...
```

## Directory Purposes

**`src/app/`** - Next.js App Router (12+ top-level routes)
- Purpose: Page routes, API routes, layouts, error boundaries
- Key routes:
  - `(landing)/` - Landing pages (/about, /pricing, /contact)
  - `(public)/` - Public site (index, market, peers, categories, search)
  - `(auth)/` - Authentication (login, logout, waitlist)
  - `admin/` - Admin dashboard (12 pages: dashboard, market, index, fees, etc.)
  - `api/` - REST endpoints (v1 public API, webhooks, internal routes)
  - `pro/` - Premium user hub (research, news, saved peers)
  - `account/` - User account settings, subscription
- Contains: Page.tsx, layout.tsx, actions.ts, error.tsx, route.ts files
- Example structure: `/admin/dashboard` = `/src/app/admin/dashboard/page.tsx` server component

**`src/components/`** - React Components (50+ files)
- Purpose: Reusable UI and layout building blocks
- Subdirectories:
  - `ui/` - Shadcn/Radix primitives (button, card, dialog, input, select, separator, badge, label)
  - `public/` - Public site components (header, footer, hero, feature cards)
  - `scout/` - FeeScout-specific components (audit results, pipeline status, institution list)
  - Root: Shared components (breadcrumbs, pagination, nav, chart wrappers)
- Examples:
  - `src/components/peer-filter-panel.tsx` - Segment filter UI
  - `src/components/fee-histogram.tsx` - Recharts distribution
  - `src/components/command-palette.tsx` - Cmd+K search dialog
- Pattern: Server components by default, minimal `"use client"`

**`src/lib/`** - Business Logic & Utilities (30+ modules)
- Purpose: Shared helpers, DB queries, business rules, external integrations
- Core modules:
  - `crawler-db/` - PostgreSQL query layer (20 exported modules)
    - `connection.ts` - Singleton postgres client, `sql` template literal tag
    - `fees.ts` - Fee extraction, review, statistics queries
    - `dashboard.ts` - Aggregate metrics (review queue, crawl status)
    - `fee-index.ts` - getNationalIndex(), getPeerIndex(), index snapshots
    - `market.ts` - Market index with segment deltas
    - `peers.ts` - Saved peer sets, institution filtering
    - `types.ts` - Shared TypeScript interfaces (Institution, Fee, Review, etc.)
  - `auth.ts` - Session management, getCurrentUser(), permission checks
  - `stripe.ts` - Stripe client singleton, webhook secret access
  - `fee-taxonomy.ts` - 9 families, 49 categories, tier system (constants only)
  - `fed-districts.ts` - District metadata, PeerFilter parsing, breadcrumb builders
  - `format.ts` - formatAmount, formatAssets, formatPct, timeAgo (display helpers)
  - `fee-actions.ts` - Approve/reject/stage fees with transactions
  - `api-rate-limit.ts` - In-memory rate limit tracking
  - `api-auth.ts` - API key validation (if used)
  - `research/` - Research agents, skills, history, rate limiting
  - `job-runner.ts` - Modal job triggering, state polling
  - `brief-generator.ts` - AI-generated summaries via Anthropic
- Organization: Grouped by domain (DB, auth, business logic, integrations)

**`fee_crawler/`** - Python Extraction Pipeline (23 modules)
- Purpose: Download fee schedules, extract via LLM, validate, stage for approval
- Subdirectories:
  - `pipeline/` (10 files) - Core extraction steps:
    - `download.py` - Fetch URLs, R2 uploads
    - `extract_llm.py` - Claude API calls for fee extraction
    - `extract_html.py` - BeautifulSoup parsing for HTML tables
    - `classify_document.py` - Detect PDF vs HTML vs JS-rendered
    - `completeness_score.py` - Compute extraction completeness
    - `evaluate_accuracy.py` - Confidence scoring via validation rules
    - `validate.py` - Data quality gates
    - `executor.py` - Orchestrate download → classify → extract → validate pipeline
  - `agents/` (3 files) - Specialized extractors:
    - `bank_routing_agent.py` - Extract routing numbers
    - `document_classifier_agent.py` - Classify document type/bank
    - `llm_batch_agent.py` - Batch API integration
  - `commands/` (5 files) - CLI entrypoints:
    - `crawl.py` - Main fee extraction (--limit, --workers, --doc-type, --include-failing)
    - `ingest_beige_book.py` - Parse Fed Beige Book releases
    - `ingest_fed_content.py` - Fetch Fed district economic commentary
    - `ingest_fred.py` - Download FRED economic indicators
    - `seed_users.py` - Initialize admin/analyst users
  - `workers/` (4 files) - Modal worker definitions:
    - `discovery_worker.py` - Find fee schedule URLs
    - `llm_batch_worker.py` - Batch API for cost efficiency
    - Others as needed
  - `tests/` (60+ tests) - pytest test suite
    - Test fee analysis normalization, validation rules, DB migrations
  - Root: Core modules:
    - `modal_app.py` - Modal App definition with 3 scheduled functions (2am/3am/4am cron)
    - `config.py` - Configuration management (loads config.yaml)
    - `db.py` - Database abstraction (SQLite fallback, Postgres primary)
    - `fee_analysis.py` - Fee name normalization, fee families, percentile ranking
    - `validation.py` - Confidence scoring, outlier detection
    - `review_status.py` - Enum: pending, staged, approved, rejected
    - `job_result.py` - Job execution result type

**`.planning/codebase/`** - Architecture & Design Docs
- Purpose: Reference documents for codebase navigation and pattern consistency
- Files (written by GSD):
  - `STACK.md` - Technology versions and dependencies
  - `INTEGRATIONS.md` - External APIs, databases, auth, webhooks
  - `ARCHITECTURE.md` - Layers, data flow, abstractions, entry points
  - `STRUCTURE.md` - This file; directory organization and file locations

**`data/`** - Local Data & Documents (git-ignored)
- Purpose: Development database, document cache
- Contents:
  - `crawler.db` - SQLite database (local dev only)
  - `documents/` - Fee schedule PDFs cached locally (large, git-ignored)

## Key File Locations

**Entry Points:**

- `src/app/page.tsx` - Root landing page (GatewayClient)
- `src/app/admin/page.tsx` - Admin dashboard (requires admin role)
- `src/app/api/v1/index/route.ts` - Public API for fee index
- `src/app/api/research/[agentId]/route.ts` - Streaming research agent endpoint
- `fee_crawler/modal_app.py` - Scheduled crawler workers (Modal deployment)

**Configuration:**

- `next.config.ts` - Next.js build config, security headers (CSP, HSTS)
- `tsconfig.json` - TypeScript compiler config (strict, ES2017 target)
- `package.json` - Node.js dependencies
- `fee_crawler/config.yaml` - Crawler settings (model, concurrency, budget)
- `.env.example` - Environment variable template
- `eslint.config.mjs` - Linting rules (Next.js + TypeScript)
- `postcss.config.mjs` - Tailwind v4 PostCSS pipeline

**Core Logic:**

- `src/lib/crawler-db/connection.ts` - PostgreSQL singleton, template literal sql tag
- `src/lib/auth.ts` - Session management, role checking
- `src/lib/fee-taxonomy.ts` - Fee category system (families, tiers)
- `src/lib/fed-districts.ts` - District filters, peer segmentation
- `fee_crawler/fee_analysis.py` - Fee normalization, family grouping, percentile stats
- `fee_crawler/pipeline/executor.py` - Orchestrates extraction pipeline steps

**Testing:**

- `src/lib/crawler-db/fees.test.ts` - vitest suite for fee queries
- `fee_crawler/tests/` - pytest test suite (60+ tests)

## Naming Conventions

**Files:**
- Components: PascalCase (e.g., `PeerFilterPanel.tsx`, `Breadcrumbs.tsx`)
- Utilities/helpers: kebab-case (e.g., `fee-taxonomy.ts`, `fed-districts.ts`)
- Pages: `page.tsx`, `layout.tsx`, `error.tsx`, `route.ts` (Next.js convention)
- Server actions: `actions.ts` (grouped in feature directory)
- Tests: `.test.ts` or `.spec.ts` suffix

**Directories:**
- Feature routes: lowercase kebab-case (e.g., `/admin-dashboard`, `/pro-research`)
- Dynamic routes: brackets (e.g., `[id]`, `[agentId]`)
- Layout groups: parentheses (e.g., `(auth)`, `(landing)`, `(public)`)

**Functions & Variables:**
- Functions: camelCase (getIndex, formatAmount, checkRateLimit)
- Constants: UPPER_SNAKE_CASE (SITE_URL, BRAND_NAME, SESSION_TTL_HOURS)
- Types/Interfaces: PascalCase (User, Institution, FeeInstance, IndexEntry)

**Database:**
- Tables: snake_case (crawl_targets, extracted_fees, fee_reviews)
- Columns: snake_case (institution_name, review_status, created_at)
- Enums: lowercase with underscores (pending, staged, approved, rejected)

## Where to Add New Code

**New Public API Endpoint:**
- Directory: `src/app/api/v1/[resource]/`
- File: `route.ts` with GET/POST handlers
- Example: `/api/v1/msas/[code]/route.ts` for MSA data
- Pattern: NextResponse.json(), authentication optional, rate limiting via checkPublicRateLimit()

**New Admin Page:**
- Directory: `src/app/admin/[feature]/`
- File: `page.tsx` (server component), optional `layout.tsx`
- Add nav item: `src/app/admin/admin-nav.tsx` (update route list)
- Query location: `src/lib/crawler-db/` (add new module if needed, e.g., `msa.ts`)
- Pattern: Use `Suspense` boundaries, `AdminNav` in layout, breadcrumbs

**New Component:**
- UI primitive: `src/components/ui/[component].tsx` (Radix-based)
- Feature component: `src/components/[feature]/[component].tsx`
- Public site: `src/components/public/[component].tsx`
- Admin specific: Inline in page, no `src/components/admin/` directory

**New Crawler Command:**
- Directory: `fee_crawler/commands/[command].py`
- Export function: `async def run(config: Config) -> dict` (for CLI integration)
- Add to: `fee_crawler/__main__.py` CLI parser
- Example: `ingest_fed_content.py` for economic data ingestion

**New Fee Taxonomy Category:**
- Edit: `src/lib/fee-taxonomy.ts` (FEE_FAMILIES object)
- Sync: `fee_crawler/fee_analysis.py` (must mirror)
- Add to: Appropriate family (Account Maintenance, Overdraft & NSF, etc.)
- Update DB: No schema change needed (fee_category is string)

**Database Migration:**
- Directory: `src/lib/crawler-db/migrations/`
- File: `NNN-description.sql` (numbered sequentially)
- Execution: Manual via psql or embedded in deployment script (not auto-run)
- Example: `001-payments.sql` (historical, payment-related changes)

**New Utility/Helper:**
- Location: `src/lib/[domain].ts` or `src/lib/[domain]/index.ts`
- Export from: `src/lib/index.ts` (if shared across features)
- Pattern: Pure functions, no side effects, type-safe with TypeScript

**New Server Action:**
- Location: `src/app/[feature]/actions.ts`
- Pattern: `"use server"` directive, Zod schema validation, try-catch with error return
- Example: `/src/app/pro/peers/actions.ts` (save/delete peer sets)

## Special Directories

**`src/lib/crawler-db/migrations/`:**
- Purpose: SQL schema changes (Postgres)
- Generated: No (manual SQL)
- Committed: Yes
- Apply: Via CLI or Vercel SQL Editor during deployment

**`data/documents/`:**
- Purpose: Cached fee schedule PDFs/HTML (local dev + R2 production)
- Generated: Yes (by crawler download step)
- Committed: No (git-ignored, large files)
- Note: Production uses Cloudflare R2 content-addressed storage

**`.next/`:**
- Purpose: Next.js build output (standalone + static)
- Generated: Yes (npm run build)
- Committed: No (.gitignore)
- Contains: Server files for standalone deployment

**`.planning/`:**
- Purpose: GSD planning and documentation
- Generated: Yes (by GSD tools)
- Committed: Yes (planning history, phase docs)

**`fee_crawler/tests/`:**
- Purpose: Python test suite (pytest)
- Generated: No (manual test files)
- Committed: Yes
- Run: `python -m pytest fee_crawler/tests/`

## Import Paths & Aliases

**Path alias:** `@/` → `src/`

- Good: `import { sql } from "@/lib/crawler-db/connection"`
- Avoid: `import { sql } from "../../../lib/crawler-db/connection"`

**Module organization:**
- `@/lib/crawler-db` - All database queries (barrel export from `index.ts`)
- `@/lib/research` - Research agents, skills, history
- `@/components/ui` - Shadcn/Radix primitives
- `@/app` - Next.js pages (not imported directly, use relative paths)

---

*Structure analysis: 2026-04-06*
