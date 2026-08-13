# Technology Stack

**Analysis Date:** 2026-04-06

## Languages

**Primary:**
- TypeScript 5 - Frontend (React/Next.js), server-side code, API routes
- Python 3.12 - Fee crawler pipeline, data extraction, analysis

**Secondary:**
- JavaScript (ESM modules) - Build config, linting configuration
- SQL (Postgres/SQLite) - Database queries via postgres client

## Runtime

**Environment:**
- Node.js 20 (Vercel/Docker deployment) - Primary Next.js runtime
- Python 3.12 - Fee crawler agents and pipeline workers

**Package Manager:**
- npm - JavaScript/TypeScript dependencies
- pip - Python dependencies

**Lockfiles:**
- `package-lock.json` - Present, locked versions
- Python uses `requirements.txt` for fee_crawler

## Frameworks

**Core Web:**
- Next.js 16.1.6 - Full-stack React framework with App Router, server actions, API routes
- React 19.2.3 - UI library with hooks and concurrent features

**UI/Styling:**
- Tailwind CSS 4 - Utility-first CSS with v4 @tailwindcss/postcss
- Geist - Font family and design system (via geist package 1.7.0)
- Radix UI 1.4.3 - Unstyled, accessible component primitives
- Lucide React 0.564.0 - Icon library

**Data Visualization:**
- Recharts 3.7.0 - React charting library (histograms, sparklines, distribution charts)

**Backend/API:**
- Modal - Serverless workers for scheduled cron jobs (fee extraction, discovery)
- Vercel - Next.js deployment, ISR revalidation

**Testing:**
- vitest - Test runner for TypeScript/JS (config: `vitest.config.ts`)
- pytest - Python test framework (`fee_crawler/tests/`)

**Build/Dev:**
- TypeScript compiler (strict mode) - Type checking
- ESLint 9 + eslint-config-next - Linting with Next.js/core-web-vitals rules
- Tailwind PostCSS 4 - CSS build pipeline

## Key Dependencies

**Critical:**
- `postgres` 3.4.8 - PostgreSQL client for Supabase (TCP, transaction mode pooler at port 6543)
- `@anthropic-ai/sdk` 0.80.0 - Anthropic API client (research agents, fee analysis)
- `ai` 6.0.116 - Vercel AI SDK for streaming text responses
- `@ai-sdk/anthropic` 3.0.58 - Anthropic provider for ai SDK
- `@ai-sdk/react` 3.0.118 - React hooks for AI SDK streams
- `stripe` 20.4.1 - Stripe payment processing (subscriptions, webhooks)
- `zod` 4.3.6 - TypeScript-first schema validation (env vars, API inputs)

**Infrastructure:**
- `sanitize-html` 2.17.1 - HTML sanitization for fee descriptions
- `bcryptjs` 3.0.3 - Password hashing for auth
- `clsx` 2.1.1 - Class name concatenation utility
- `class-variance-authority` 0.7.1 - Component variant system
- `tailwind-merge` 3.4.0 - Tailwind class merging for overrides

**Python (fee_crawler):**
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

**Environment Variables:**
- Database: `DATABASE_URL` (Postgres), `DB_PATH` (legacy SQLite)
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Storage: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- Modal: `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`
- Auth: `BFI_COOKIE_SECRET`, `BFI_ADMIN_PASSWORD`, `BFI_ANALYST_PASSWORD`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- AI: `ANTHROPIC_API_KEY`, `FRED_API_KEY`
- Deployment: `BFI_APP_URL`, `BFI_REVALIDATE_TOKEN`, `NEXT_PUBLIC_SITE_URL`
- Analytics: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `NEXT_PUBLIC_SENTRY_DSN`

**TypeScript/Next.js Config:**
- `tsconfig.json` - ES2017 target, strict mode enabled, path alias `@/*` → `./src/*`
- `next.config.ts` - Standalone output, security headers (CSP, HSTS, XFO, NNAP, Referrer-Policy), Stripe/Plausible domains allowed
- `postcss.config.mjs` - Tailwind v4 PostCSS plugin
- `eslint.config.mjs` - Next.js vitals + TypeScript rules
- `components.json` - Shadcn component configuration

**Python Config:**
- `fee_crawler/config.yaml` - Database type (sqlite/postgres), crawl concurrency, extraction model (haiku), batch API, daily budget

## Platform Requirements

**Development:**
- Node.js 20+
- Python 3.12+
- System dependencies: `tesseract-ocr`, `poppler-utils` (for PDF extraction fallback)

**Production:**
- Docker (Node 20 slim, ~200MB image for Next.js only)
- Vercel (Next.js 16 compatible)
- Supabase PostgreSQL (13+, transaction mode pooler required)
- Cloudflare R2 (S3-compatible object storage)
- Modal serverless platform (for scheduled Python workers)

**External Services Required:**
- Anthropic API (claude-haiku-4-5-20251001 for fee extraction, claude-sonnet/opus for research)
- Stripe (payment processing, webhooks)
- FRED API (economic data ingestion)
- Plausible Analytics (optional, analytics.js)

---

*Stack analysis: 2026-04-06*
