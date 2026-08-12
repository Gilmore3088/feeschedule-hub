# Phase 2 — Infrastructure Split

> **Duration:** Week 3 (~8 hours)  
> **Goal:** Fly.io fully decommissioned. Vercel serves the web app. Modal hosts Python workers.  
> **Risk:** See [R2](./02-risk-register.md#r2) (Stripe webhook), [R5](./02-risk-register.md#r5) (Vercel timeout)  
> **Prerequisite:** Phase 1 gate must pass. Postgres must be live and stable.

---

## 2A — Vercel: Deploy Next.js

### Create `Dockerfile.web` (Node only — no Python)

```dockerfile
# Dockerfile.web
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

Note: No Python, no pdfplumber, no crawler code. ~200MB vs ~800MB current image.

### Add Environment Variables to Vercel
In Vercel project settings → Environment Variables, add all of the following for Production:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string |
| `SUPABASE_URL` | `https://[ref].supabase.co` |
| `SUPABASE_ANON_KEY` | From Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase dashboard |
| `ANTHROPIC_API_KEY` | Existing key |
| `BFI_COOKIE_SECRET` | Existing secret |
| `STRIPE_SECRET_KEY` | Existing key |
| `STRIPE_WEBHOOK_SECRET` | Will update in step 2A.4 |
| `BFI_APP_URL` | `https://feeinsight.com` |
| `BFI_REVALIDATE_TOKEN` | Existing token |
| `COMING_SOON` | `true` (keep coming soon gate during migration) |

### Tasks
- [ ] Create `Dockerfile.web` (Node only)
- [ ] Add all env vars to Vercel project
- [ ] Push to branch → verify preview deploy builds successfully
- [ ] Merge to main → Vercel auto-deploys
- [ ] Verify Vercel deploy URL (`bank-fee-index.vercel.app`) — all 50 pages load
- [ ] Verify admin hub functions against Postgres data
- [ ] Verify auth: login, session, account page work
- [ ] Verify `/api/webhooks/stripe` route is accessible

### Update Stripe Webhook Endpoint
- [ ] Go to Stripe Dashboard → Developers → Webhooks
- [ ] Add new endpoint: `https://feeinsight.com/api/webhooks/stripe`
- [ ] Copy new webhook signing secret → update `STRIPE_WEBHOOK_SECRET` in Vercel env vars
- [ ] Keep old Fly.io webhook endpoint active for 48 more hours (do not delete yet)

### Update DNS
- [ ] In DNS provider: point `feeinsight.com` → Vercel
- [ ] In DNS provider: confirm `bankfeeindex.com` and `thebankfeeindex.com` redirects still work
- [ ] Verify SSL certificates propagate on all 3 domains (can take up to 24 hours)
- [ ] Verify Vercel shows all 3 domains as "valid"

---

## 2B — Modal: Deploy Python Workers

### Create `fee_crawler/modal_app.py`

```python
"""
Modal worker definitions for Bank Fee Index.

Deploy: modal deploy fee_crawler/modal_app.py
Run manually: modal run fee_crawler/modal_app.py::run_discovery
"""

import modal

# Image with all system deps for OCR + PDF extraction
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install(
        "tesseract-ocr",    # OCR for scanned PDFs
        "poppler-utils",    # pdftoppm for PDF → image conversion
    )
    .pip_install_from_requirements("fee_crawler/requirements.txt")
)

app = modal.App("bank-fee-index-workers", image=image)
secrets = [modal.Secret.from_name("bfi-secrets")]


@app.function(
    schedule=modal.Cron("0 2 * * *"),  # 2am UTC nightly
    timeout=21600,                      # 6 hour max
    secrets=secrets,
    memory=2048,
)
async def run_discovery():
    """Sweep institutions with website_url but no fee_schedule_url."""
    from fee_crawler.workers.discovery_worker import run
    await run(concurrency=20)


@app.function(
    schedule=modal.Cron("0 3 * * *"),  # 3am UTC nightly (after discovery)
    timeout=14400,                      # 4 hour max
    secrets=secrets,
    memory=2048,
)
async def run_extraction():
    """Download + text-extract newly discovered fee schedule URLs."""
    from fee_crawler.workers.extraction_worker import run
    await run(concurrency=8)


@app.function(
    schedule=modal.Cron("0 1 * * *"),  # 1am UTC nightly
    timeout=7200,                       # 2 hour max (batch submission is fast)
    secrets=secrets,
    memory=1024,
)
async def run_llm_batch():
    """Submit pending LLM extraction jobs to Anthropic Batch API."""
    from fee_crawler.workers.llm_batch_worker import run
    await run(daily_budget_usd=20.0)


@app.function(
    schedule=modal.Cron("0 6 * * *"),  # 6am UTC (after batch results arrive)
    timeout=3600,
    secrets=secrets,
    memory=1024,
)
async def run_post_processing():
    """Validate, categorize, auto-review, and analyze new fees."""
    import subprocess
    for cmd in ["validate", "categorize-fees", "auto-review", "detect-outliers"]:
        subprocess.run(
            ["python3", "-m", "fee_crawler", cmd],
            check=True, env={"DATABASE_URL": __import__("os").environ["DATABASE_URL"]}
        )


# Ingest commands — run on their respective cadences
@app.function(schedule=modal.Cron("0 10 * * *"), timeout=3600, secrets=secrets)
async def ingest_daily():
    """Daily data refreshes: FRED, NYFED, BLS, OFR."""
    import subprocess
    for cmd in ["ingest-fred", "ingest-nyfed", "ingest-bls", "ingest-ofr"]:
        subprocess.run(["python3", "-m", "fee_crawler", cmd], check=False,
                       env={"DATABASE_URL": __import__("os").environ["DATABASE_URL"]})


@app.function(schedule=modal.Cron("0 10 * * 1"), timeout=7200, secrets=secrets)
async def ingest_weekly():
    """Weekly data refreshes: FDIC, NCUA, CFPB, SOD, Beige Book."""
    import subprocess
    for cmd in ["ingest-fdic", "ingest-ncua", "ingest-cfpb", "ingest-sod", "ingest-beige-book"]:
        subprocess.run(["python3", "-m", "fee_crawler", cmd], check=False,
                       env={"DATABASE_URL": __import__("os").environ["DATABASE_URL"]})
```

### Populate Modal Secrets
```bash
# Set all secrets in Modal
modal secret create bfi-secrets \
    DATABASE_URL="postgresql://..." \
    ANTHROPIC_API_KEY="sk-ant-..." \
    R2_ENDPOINT="https://[id].r2.cloudflarestorage.com" \
    R2_ACCESS_KEY_ID="..." \
    R2_SECRET_ACCESS_KEY="..." \
    R2_BUCKET="bank-fee-index-documents"
```

### Tasks
- [ ] Create `fee_crawler/modal_app.py` (skeleton above)
- [ ] Create `fee_crawler/workers/` directory with `__init__.py`
- [ ] Create `fee_crawler/workers/discovery_worker.py` (Phase 3 will fill this in)
- [ ] Create `fee_crawler/workers/extraction_worker.py` (Phase 4 will fill this in)
- [ ] Create `fee_crawler/workers/llm_batch_worker.py` (Phase 4 will fill this in)
- [ ] Populate Modal secrets: `modal secret create bfi-secrets ...`
- [ ] Deploy: `modal deploy fee_crawler/modal_app.py`
- [ ] Verify deployment: `modal app list` shows `bank-fee-index-workers` as deployed
- [ ] Test manual run: `modal run fee_crawler/modal_app.py::ingest_daily` (safe, no side effects)

---

## 2C — Set Up pg_cron Jobs

Run in Supabase SQL editor:

```sql
-- Seed discovery queue nightly (new institutions only, ordered by asset size)
SELECT cron.schedule('seed-discovery-queue', '30 1 * * *', $$
    INSERT INTO jobs (queue, entity_id, priority, status)
    SELECT
        'discovery',
        id::TEXT,
        COALESCE(asset_size, 0) / 1000000,
        'pending'
    FROM crawl_targets
    WHERE website_url IS NOT NULL
    AND fee_schedule_url IS NULL
    AND id::TEXT NOT IN (
        SELECT entity_id FROM jobs
        WHERE queue = 'discovery'
        AND status IN ('pending', 'running', 'completed')
        AND created_at > NOW() - INTERVAL '30 days'
    )
    ON CONFLICT DO NOTHING;
$$);

-- Clean up old completed jobs weekly (keep DB lean)
SELECT cron.schedule('cleanup-old-jobs', '0 3 * * 0', $$
    DELETE FROM jobs
    WHERE status = 'completed'
    AND completed_at < NOW() - INTERVAL '7 days';
$$);

-- Verify cron jobs are registered:
SELECT * FROM cron.job;
```

### Tasks
- [ ] Run both pg_cron setup queries in Supabase SQL editor
- [ ] Verify: `SELECT * FROM cron.job` shows both jobs

---

## 2D — Update GitHub Actions

```yaml
# .github/workflows/deploy.yml — updated for Vercel
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

- [ ] Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` to GitHub secrets
- [ ] Update `deploy.yml` to use Vercel action
- [ ] Delete `crawl-pipeline.yml` (replaced by Modal)
- [ ] Delete `refresh-data.yml` (replaced by Modal)

---

## 2E — Decommission Fly.io

**Wait 48 hours after Vercel is live and DNS has propagated before doing this.**

- [ ] Confirm Vercel has been live for 48 hours with no errors
- [ ] Confirm all Stripe webhooks firing to Vercel endpoint (check Stripe Dashboard → Webhooks → Recent deliveries)
- [ ] Remove old Fly.io webhook endpoint from Stripe Dashboard
- [ ] `flyctl apps destroy bank-fee-index` (type the app name to confirm)
- [ ] Cancel Fly.io subscription (if on paid plan)
- [ ] Remove `FLY_API_TOKEN` from GitHub secrets
- [ ] Delete `fly.toml`, `run.sh`, `litestream.yml` from repo
- [ ] Delete current `Dockerfile` (replace with `Dockerfile.web` and `Dockerfile.workers`)

---

## Gate: Phase 2 Complete

| Check | How to verify |
|---|---|
| ✅ Fly.io destroyed | `flyctl apps list` returns empty or shows no bank-fee-index |
| ✅ All 3 domains on Vercel | `feeinsight.com`, `bankfeeindex.com`, `thebankfeeindex.com` all resolve and show SSL |
| ✅ Modal workers deployed | `modal app list` shows bank-fee-index-workers as deployed |
| ✅ Manual ingest test passes | `modal run fee_crawler/modal_app.py::ingest_daily` completes without error |
| ✅ Payments flow end-to-end | Stripe test checkout completes, subscription written to Postgres |
| ✅ Auth works on production domain | Login on `feeinsight.com` → session → account page → logout |
| ✅ Admin hub loads production data | `/admin` shows real fee counts from Postgres |
| ✅ GitHub Actions deploy to Vercel | Push to main → Vercel auto-deploys |
| ✅ pg_cron jobs registered | `SELECT * FROM cron.job` shows 2 scheduled jobs |
