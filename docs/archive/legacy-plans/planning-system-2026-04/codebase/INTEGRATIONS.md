# External Integrations

**Analysis Date:** 2026-04-06

## APIs & External Services

**Anthropic:**
- Claude API - Fee extraction via LLM prompt, research agent conversations, skill execution
  - SDK: `@anthropic-ai/sdk` + `@ai-sdk/anthropic`
  - Models: claude-haiku-4-5-20251001 (extraction, $0.80/$4.00 per 1M tokens), claude-sonnet-4-5-20250929 (analysis), claude-opus-4-5-20250514 (research)
  - Auth: `ANTHROPIC_API_KEY`
  - Usage: `/src/app/api/research/[agentId]/route.ts`, `/src/lib/research/agents.ts`, fee crawler extraction pipeline

**Stripe:**
- Payment processing, subscription management, customer portal
  - SDK: `stripe` 20.4.1
  - Endpoint: `https://api.stripe.com` (CSP configured)
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - Webhook receiver: `/src/app/api/webhooks/stripe/route.ts`
  - Test keys (dev mode) configured for bankfeeindex.com

**FRED (Federal Reserve Economic Data):**
- Economic indicators, district-level employment/housing data
  - Access: Direct API downloads via `fee_crawler ingest-fred` command
  - Auth: `FRED_API_KEY`
  - Ingestion: `fee_crawler/commands/` (district economic indicators)

**Plausible Analytics:**
- Website analytics, privacy-focused alternative to Google Analytics
  - SDK: `https://plausible.io/js/script.js` (CSP allows plausible.io)
  - Domain: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=bankfeeindex.com`
  - Domain whitelist: plausible.io, api.stripe.com (CSP connect-src)

## Data Storage

**Databases:**

*Production:*
- **Supabase PostgreSQL** (13+)
  - Connection: `DATABASE_URL` (tcp via transaction mode pooler port 6543)
  - Client: `postgres` 3.4.8 (Node.js client, SSL required)
  - Schemas: crawl_targets, crawl_runs, extracted_fees, fee_reviews, institutions, users, crawl_events, fed_beige_book, etc.
  - Connection pooling: max=10, idle_timeout=20s, connect_timeout=15s
  - Query pattern: `const [row] = await sql\`SELECT...\`` (postgres template literals)

*Development/Legacy:*
- **SQLite** (fallback)
  - Path: `data/crawler.db`
  - Used when `DATABASE_URL` not set
  - Pragmas: `foreign_keys=ON`, `busy_timeout=5000`, WAL mode

**File Storage:**

- **Cloudflare R2** (S3-compatible object storage)
  - Content-addressed storage: documents stored at SHA-256 hash keys
  - Purpose: Fee schedule PDFs, HTML documents, extracted text
  - SDK: `boto3` 1.34+ (AWS S3 client, S3-compatible)
  - Endpoint: `R2_ENDPOINT` (e.g., https://xxxx.r2.cloudflarestorage.com)
  - Auth: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  - Bucket: `R2_BUCKET` (default: bank-fee-index-documents)
  - Module: `/fee_crawler/pipeline/r2_store.py`
  - Idempotent uploads: same content hash = no re-upload

**Backup (Optional):**
- **Litestream** (SQLite replication to S3-compatible)
  - Purpose: Atomic backups of SQLite to object storage
  - Env vars: `LITESTREAM_REPLICA_BUCKET`, `LITESTREAM_REPLICA_ENDPOINT`, `LITESTREAM_REPLICA_REGION`

**Caching:**
- None. Vercel ISR (Incremental Static Revalidation) via `/api/revalidate` + `BFI_REVALIDATE_TOKEN` for on-demand cache invalidation

## Authentication & Identity

**Auth Provider:** Custom session-based (no OAuth/third-party)

- **Implementation:**
  - Session cookies: `fsh_session` (24-hour TTL, HMAC-SHA256 signed)
  - User table: id, username, display_name, role (viewer/analyst/admin/premium), email, stripe_customer_id, subscription_status
  - Password: bcryptjs hashing
  - Module: `/src/lib/auth.ts`

- **Admin Panel:** Role-based access control
  - Admin role grants access to `/admin/*` routes
  - Session verification on each request via `getCurrentUser()`
  - Cookie secret: `BFI_COOKIE_SECRET` (required in production)

**Subscription Management:**
- Stripe integration for premium/pro tier users
  - User field: `stripe_customer_id`, `subscription_status` (none/active/past_due/canceled)
  - Webhook: `/api/webhooks/stripe` handles subscription state changes
  - Portal access managed via Stripe API

## Monitoring & Observability

**Error Tracking:**
- Sentry (optional)
  - SDK: Configured via `NEXT_PUBLIC_SENTRY_DSN`
  - Automatic error capture in Next.js

**Logs:**
- Local logging via Python `logging` module (fee_crawler)
- Vercel/Docker stdout (Next.js)
- Database event logs: `crawl_events` table (crawl_target_id, event_type, details, created_at)

**Job Monitoring:**
- Modal dashboard: tracks scheduled worker runs (`run_discovery`, `run_pdf_extraction`, `run_browser_extraction`)
- Database: `crawl_runs` table logs trigger, status, counts, timestamps
- Health endpoint: `/api/health` returns fee_count and service status

## CI/CD & Deployment

**Hosting:**
- **Vercel** (Next.js deployment)
  - Standalone output mode (self-contained Node app, no serverless functions needed)
  - Environment: `.env.local` for secrets, `.vercelignore` for exclusions
  - Revalidation: on-demand via POST `/api/revalidate?token=BFI_REVALIDATE_TOKEN`

- **Docker** (alternative)
  - Image: Node 20 slim (~200MB)
  - Build: Copies .next/standalone + .next/static + public
  - User: non-root nodejs:1001
  - Port: 3000

**Scheduled Workers:**
- **Modal** (serverless Python workers)
  - App: `fee_crawler/modal_app.py`
  - Scheduled functions:
    - `run_discovery()` - 2 AM daily (nightly URL discovery, 20 concurrent)
    - `run_pdf_extraction()` - 3 AM daily (fast PDF-only worker, 4 workers)
    - `run_browser_extraction()` - 4 AM daily (Playwright-based, 2 workers)
  - Images: browser_image (Playwright) + pdf_image (no browser, ~smaller)
  - Secrets: `bfi-secrets` (DATABASE_URL, R2 credentials, Anthropic API key)
  - Memory: 1024-2048 MB
  - Timeout: 10800-21600 seconds (3-6 hours)

**Build Pipeline:**
- No GitHub Actions (replaced by Modal scheduled workers)
- Local CLI: `python -m fee_crawler` commands (crawl, ingest-beige-book, ingest-fed-content, ingest-fred, seed-users)

## Environment Configuration

**Required env vars (production):**
- `DATABASE_URL` - Supabase Postgres connection string (transaction mode)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Admin API key
- `ANTHROPIC_API_KEY` - Claude API key
- `BFI_COOKIE_SECRET` - 64-char hex for session signing
- `BFI_APP_URL` - App URL for crawler revalidation (e.g., https://bankfeeindex.com)
- `BFI_REVALIDATE_TOKEN` - Bearer token for revalidation endpoint
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` - Cloudflare R2
- `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` - Modal authentication
- `FRED_API_KEY` - Federal Reserve API key
- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` - Analytics domain (optional)

**Secrets location:**
- `.env.local` (local dev, in .gitignore)
- `.env` (committed example only, contains placeholders)
- Vercel environment variables dashboard
- Modal CLI: `modal secret create bfi-secrets ...`

## Webhooks & Callbacks

**Incoming (Bank Fee Index receives):**
- `/api/webhooks/stripe` - Stripe events (subscription state changes, payment failures)
- `/api/revalidate` - On-demand cache revalidation trigger from crawler
- `/api/scout/agent`, `/api/scout/audit`, `/api/scout/pipeline` - FeeScout agent state polling/triggering

**Outgoing (Bank Fee Index sends):**
- Stripe API calls (create customer, update subscription, portal sessions)
- Anthropic API (streaming text generation for research agents)
- FRED API (fetch economic indicators)

---

*Integration audit: 2026-04-06*
