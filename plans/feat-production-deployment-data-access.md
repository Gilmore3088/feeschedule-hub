# Production Deployment & Paid Data Access

## Overview

Deploy Bank Fee Index as a professional consulting platform with paid API/data access. The project already has Fly.io + Litestream + Docker infrastructure built -- this plan completes the remaining 10% and adds monetization.

## What's Already Built (Don't Rewrite)

| Component | Status | Files |
|-----------|--------|-------|
| Dockerfile (multi-stage, Litestream built in) | Ready | `Dockerfile` |
| Fly.io config (iad region, persistent volume) | Ready | `fly.toml` |
| Litestream S3 replication (10s sync, 1h snapshot) | Ready | `litestream.yml` |
| Startup script (restore + replicate + serve) | Ready | `run.sh` |
| `next.config.ts` output: standalone | Ready | `next.config.ts` |
| Auth system (roles: viewer/premium/analyst/admin) | Ready | `src/lib/auth.ts` |
| API routes (fees, index, institutions, research) | Ready | `src/app/api/v1/` |
| Admin ops panel (job spawning) | Ready | `src/app/admin/ops/` |
| Cache revalidation webhook | Ready | `src/app/api/revalidate/` |
| Research agent cost circuit breaker ($50/day) | Ready | `src/app/api/research/` |

## Decision: Fly.io (Not Vercel)

**Fly.io wins because you already built it and it solves every problem:**

- SQLite + `better-sqlite3` works unchanged (persistent volume at `/data`)
- Litestream provides continuous S3 backup (already configured)
- Python crawler can run on the same box or via SSH/GitHub Actions
- Admin ops panel works as-is (`child_process.spawn` on the server)
- Zero migration of 264 DB call sites
- Zero migration of 16 DB query files
- No sync-to-async rewrite
- No new database vendor

**Vercel would require:**
- Turso migration: rewrite 264 call sites to async `@libsql/client`
- Rewire ops panel (no subprocess spawning on serverless)
- New database vendor dependency
- ~2 weeks of migration work for zero user-facing benefit

**Fly.io cost:** ~$5-7/month (shared-cpu-1x, 512MB, persistent volume)

## Architecture

```
Fly.io (iad region)
├── Next.js app (standalone, port 3000)
├── SQLite database (/data/crawler.db, persistent volume)
├── Litestream → S3 (continuous backup, 10s sync)
└── Python crawler (installed on same image or via GitHub Actions)

GitHub Actions (scheduled)
├── refresh-data --cadence daily    (6am UTC)
├── refresh-data --cadence weekly   (Monday 7am UTC)
├── refresh-data --cadence quarterly (manual trigger)
└── run-pipeline --limit 100        (weekly fee crawl)

S3-Compatible Storage (Backblaze B2 / R2 / AWS S3)
└── Litestream replicas (disaster recovery)

Stripe
├── Checkout (subscription signup)
├── Billing (recurring charges)
└── Webhooks → /api/webhooks/stripe (activate/deactivate keys)
```

## Phase 1: Deploy to Fly.io (1 day)

Everything is built. Just need to provision and push.

### 1.1 Provision Fly.io Resources

```bash
fly apps create bank-fee-index
fly volumes create bfi_data --region iad --size 1
```

### 1.2 Set Secrets

```bash
# Auth
fly secrets set BFI_ADMIN_PASSWORD="..." BFI_ANALYST_PASSWORD="..."
fly secrets set BFI_COOKIE_SECRET="$(openssl rand -hex 32)"
fly secrets set BFI_REVALIDATE_TOKEN="$(openssl rand -hex 16)"

# Litestream (use Backblaze B2 or Cloudflare R2 for cheapest S3)
fly secrets set LITESTREAM_REPLICA_BUCKET="bfi-backup"
fly secrets set LITESTREAM_REPLICA_ENDPOINT="https://s3.us-east-005.backblazeb2.com"
fly secrets set LITESTREAM_REPLICA_REGION="us-east-1"
fly secrets set LITESTREAM_ACCESS_KEY_ID="..."
fly secrets set LITESTREAM_SECRET_ACCESS_KEY="..."

# AI Research
fly secrets set ANTHROPIC_API_KEY="..."

# Data APIs
fly secrets set FRED_API_KEY="..."
fly secrets set BLS_API_KEY="..."
fly secrets set CENSUS_API_KEY="..."
```

### 1.3 Upload Initial Database

```bash
# Copy local crawler.db to the Fly volume
fly ssh console -C "mkdir -p /data"
fly sftp shell
> put data/crawler.db /data/crawler.db
```

### 1.4 Deploy

```bash
fly deploy
```

### 1.5 Seed Users & Verify

```bash
fly ssh console -C "node /app/server.js &; sleep 5; curl -s http://localhost:3000/api/health"
```

## Phase 2: GitHub Actions for Scheduled Data Refresh (1 day)

### 2.1 Create Workflow

```yaml
# .github/workflows/refresh-data.yml
name: Refresh Research Data

on:
  schedule:
    - cron: '0 6 * * *'    # daily at 6am UTC
    - cron: '0 7 * * 1'    # weekly Monday 7am UTC
  workflow_dispatch:
    inputs:
      cadence:
        description: 'Cadence tier (daily/weekly/quarterly/annual/all)'
        required: false
        default: 'daily'

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Download database from Fly
        run: |
          # Use Litestream to restore from S3 replica
          curl -sL https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz | tar xz -C /usr/local/bin
          litestream restore -config litestream.yml data/crawler.db
        env:
          LITESTREAM_REPLICA_BUCKET: ${{ secrets.LITESTREAM_REPLICA_BUCKET }}
          LITESTREAM_REPLICA_ENDPOINT: ${{ secrets.LITESTREAM_REPLICA_ENDPOINT }}
          LITESTREAM_REPLICA_REGION: ${{ secrets.LITESTREAM_REPLICA_REGION }}
          LITESTREAM_ACCESS_KEY_ID: ${{ secrets.LITESTREAM_ACCESS_KEY_ID }}
          LITESTREAM_SECRET_ACCESS_KEY: ${{ secrets.LITESTREAM_SECRET_ACCESS_KEY }}

      - name: Determine cadence
        id: cadence
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "tier=${{ github.event.inputs.cadence }}" >> $GITHUB_OUTPUT
          elif [ "$(date +%u)" = "1" ]; then
            echo "tier=weekly" >> $GITHUB_OUTPUT
          else
            echo "tier=daily" >> $GITHUB_OUTPUT
          fi

      - name: Run data refresh
        run: python -m fee_crawler refresh-data --cadence ${{ steps.cadence.outputs.tier }}
        env:
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          BLS_API_KEY: ${{ secrets.BLS_API_KEY }}
          CENSUS_API_KEY: ${{ secrets.CENSUS_API_KEY }}

      - name: Upload database back to S3
        run: |
          # Replicate updated DB back to S3 for Fly to pick up
          litestream replicate -config litestream.yml &
          LITESTREAM_PID=$!
          sleep 30  # let it sync
          kill $LITESTREAM_PID
        env:
          LITESTREAM_REPLICA_BUCKET: ${{ secrets.LITESTREAM_REPLICA_BUCKET }}
          LITESTREAM_REPLICA_ENDPOINT: ${{ secrets.LITESTREAM_REPLICA_ENDPOINT }}
          LITESTREAM_REPLICA_REGION: ${{ secrets.LITESTREAM_REPLICA_REGION }}
          LITESTREAM_ACCESS_KEY_ID: ${{ secrets.LITESTREAM_ACCESS_KEY_ID }}
          LITESTREAM_SECRET_ACCESS_KEY: ${{ secrets.LITESTREAM_SECRET_ACCESS_KEY }}

      - name: Revalidate cache
        run: |
          curl -X POST "${{ secrets.BFI_APP_URL }}/api/revalidate" \
            -H "Authorization: Bearer ${{ secrets.BFI_REVALIDATE_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"paths": ["/", "/fees", "/research"]}'
```

### 2.2 Alternative: Run Crawler Directly on Fly via SSH

Simpler option -- skip Litestream round-trip, run commands on the server:

```yaml
# Trigger crawler on the Fly VM itself
- name: Run refresh on Fly
  run: |
    fly ssh console -C "cd /app && python -m fee_crawler refresh-data --cadence $CADENCE"
  env:
    FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
    CADENCE: ${{ steps.cadence.outputs.tier }}
```

This requires Python installed in the Docker image (add a stage for it) but avoids the download/upload DB dance.

## Phase 3: Paid API Access (1-2 weeks)

### 3.1 API Key Schema

Add to `fee_crawler/db.py`:

```sql
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT NOT NULL UNIQUE,      -- SHA-256 of the key
    key_prefix TEXT NOT NULL,            -- first 8 chars for display (bfi_live_)
    owner_email TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free',   -- free/starter/pro/enterprise
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 10,
    daily_limit INTEGER NOT NULL DEFAULT 100,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id),
    endpoint TEXT NOT NULL,
    response_status INTEGER,
    response_time_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.2 Tier Structure

| Tier | Price | Rate Limit | Daily Limit | Features |
|------|-------|------------|-------------|----------|
| Free | $0 | 10/min | 100/day | Public endpoints, JSON only |
| Starter | $49/mo | 60/min | 5,000/day | + CSV export, historical data |
| Pro | $199/mo | 300/min | 50,000/day | + bulk export, all 49 categories, district data |
| Enterprise | Custom | Custom | Unlimited | + raw DB access, SLA, custom reports |

### 3.3 Key Files to Create/Modify

- `src/lib/api-keys.ts` -- key generation, hashing, validation, rate check
- `src/app/api/v1/middleware.ts` -- shared auth middleware for API routes
- `src/app/api/webhooks/stripe/route.ts` -- Stripe webhook handler
- `src/app/api/v1/keys/route.ts` -- key management (create, list, revoke)
- Modify `src/app/api/v1/fees/route.ts` -- add API key auth
- Modify `src/app/api/v1/index/route.ts` -- add API key auth (if exists)
- Modify `src/app/api/v1/institutions/route.ts` -- add API key auth (if exists)

### 3.4 Stripe Integration

- `src/app/api/webhooks/stripe/route.ts` -- handle `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- `src/app/(public)/pricing/page.tsx` -- pricing page with Stripe Checkout buttons
- Environment: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## Phase 4: Professional Polish (ongoing)

- Custom domain with SSL (Fly.io handles this)
- Plausible analytics (already configured in `.env.example`)
- Sentry error tracking (already configured in `.env.example`)
- API documentation page (already exists at `/api-docs`)
- Rate limit headers on all API responses
- Usage dashboard for paying customers

## Cost Summary

| Component | Monthly Cost |
|-----------|-------------|
| Fly.io (shared-cpu-1x, 512MB, 1GB volume) | $5-7 |
| S3 backup (Backblaze B2, <1GB) | $0.01 |
| GitHub Actions (private repo, ~4k min/mo) | $0-8 |
| Domain | ~$1 |
| Stripe | 2.9% + $0.30/txn |
| **Total before revenue** | **~$7-16/month** |

## What NOT to Do

- **Don't migrate to Turso/Postgres** -- you have 264 sync call sites across 16 files that work perfectly with `better-sqlite3` on a persistent volume. The migration buys you nothing.
- **Don't move to Vercel** -- you lose subprocess spawning (ops panel), SQLite access, and persistent storage. Fly.io gives you all of these.
- **Don't over-engineer the crawler schedule** -- GitHub Actions cron + `refresh-data` command is enough. Don't add Redis/Bull/Celery queues.
- **Don't build a custom billing system** -- Stripe handles everything. Don't store credit cards or build invoicing.

## Acceptance Criteria

- [ ] App running on Fly.io at custom domain
- [ ] Litestream backing up to S3 every 10 seconds
- [ ] GitHub Actions running `refresh-data` daily/weekly
- [ ] API key auth on `/api/v1/*` endpoints
- [ ] Stripe checkout flow for Starter/Pro tiers
- [ ] Rate limiting enforced per tier
- [ ] Admin can manage API keys from ops panel

## References

- Existing Dockerfile: `Dockerfile`
- Existing Fly config: `fly.toml`
- Existing Litestream config: `litestream.yml`
- Existing startup script: `run.sh`
- Auth system: `src/lib/auth.ts`
- API routes: `src/app/api/v1/`
- Ops panel: `src/app/admin/ops/`
- Job runner: `src/lib/job-runner.ts`
- DB connection: `src/lib/crawler-db/connection.ts`
