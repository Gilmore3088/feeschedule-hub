# Phase 0 — Foundation Setup

> **Duration:** Week 1 (~5 hours)  
> **Goal:** All new infrastructure provisioned and verified before touching a single line of existing code.  
> **Rule:** Do NOT modify any existing code in this phase. Provision only.

---

## Tasks

### 0.1 — Supabase
- [ ] Log into supabase.com. Create project `bank-fee-index` (or confirm existing project is usable).
- [ ] Copy connection string: `postgresql://postgres:[password]@[host]:5432/postgres`
- [ ] Enable `pg_cron` extension: Supabase Dashboard → Database → Extensions → search "pg_cron" → Enable
- [ ] Enable `pg_stat_statements` extension (useful for query performance monitoring)
- [ ] Note: the free tier gives you 500MB storage and 2 CPU. More than sufficient to start.

### 0.2 — Cloudflare R2
- [ ] Log into Cloudflare dashboard. Go to R2 Object Storage.
- [ ] Create bucket: `bank-fee-index-documents`
- [ ] Create R2 API token with `Object Read & Write` on this bucket
- [ ] Note: Account ID, Access Key ID, Secret Access Key, endpoint URL (`https://[account-id].r2.cloudflarestorage.com`)
- [ ] Verify: `aws s3 ls s3://bank-fee-index-documents --endpoint-url [endpoint]` returns empty (new bucket)

### 0.3 — Modal
- [ ] Sign up at modal.com
- [ ] Install CLI: `pip install modal`
- [ ] Authenticate: `modal token new`
- [ ] Verify: `modal run --help` works
- [ ] Create secret group: `modal secret create bfi-secrets` (will populate env vars in Phase 2)

### 0.4 — Vercel
- [ ] Log into vercel.com. Import GitHub repo `Gilmore3088/feeschedule-hub`.
- [ ] Do NOT deploy yet — just link the project.
- [ ] Note the auto-generated Vercel domain (e.g., `bank-fee-index.vercel.app`)
- [ ] Set framework preset: Next.js
- [ ] Set root directory: `/` (default)

### 0.5 — Baseline Audit
Run this against the current SQLite database and save the output to `docs/baseline-YYYY-MM-DD.md`:

```bash
# On Fly.io via SSH:
flyctl ssh console --app bank-fee-index -C "python3 -c \"
import sqlite3, os
db = sqlite3.connect(os.environ['DB_PATH'])
queries = [
    ('total_institutions',   'SELECT COUNT(*) FROM crawl_targets'),
    ('has_website_url',      'SELECT COUNT(*) FROM crawl_targets WHERE website_url IS NOT NULL AND website_url != \"\"'),
    ('has_fee_url',          'SELECT COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL AND fee_schedule_url != \"\"'),
    ('institutions_w_fees',  'SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees'),
    ('total_extracted_fees', 'SELECT COUNT(*) FROM extracted_fees'),
    ('approved_fees',        'SELECT COUNT(*) FROM extracted_fees WHERE review_status = \\\"approved\\\"'),
    ('staged_fees',          'SELECT COUNT(*) FROM extracted_fees WHERE review_status = \\\"staged\\\"'),
    ('total_users',          'SELECT COUNT(*) FROM users'),
    ('total_leads',          'SELECT COUNT(*) FROM leads'),
]
for label, q in queries:
    n = db.execute(q).fetchone()[0]
    print(f'{label}: {n}')
\""
```

### 0.6 — GitHub Secrets
Add the following to the GitHub repo (Settings → Secrets → Actions):

| Secret Name | Value |
|---|---|
| `SUPABASE_URL` | `https://[project-ref].supabase.co` |
| `SUPABASE_ANON_KEY` | From Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase dashboard (server-side only) |
| `DATABASE_URL` | Full Postgres connection string |
| `R2_ENDPOINT` | `https://[account-id].r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | From Cloudflare R2 API token |
| `R2_SECRET_ACCESS_KEY` | From Cloudflare R2 API token |
| `R2_BUCKET` | `bank-fee-index-documents` |
| `MODAL_TOKEN_ID` | From `modal token new` |
| `MODAL_TOKEN_SECRET` | From `modal token new` |

### 0.7 — Pause Existing Crons
- [ ] In `.github/workflows/crawl-pipeline.yml`: comment out the `schedule:` block (leave `workflow_dispatch` so you can still trigger manually)
- [ ] In `.github/workflows/refresh-data.yml`: comment out the `schedule:` block
- [ ] Commit and push. This stops the weekly SSH crawl from running while migration is in progress.

---

## Gate: Phase 0 Complete

All of the following must be true before starting Phase 1:

| Check | How to verify |
|---|---|
| ✅ Supabase project accessible | `psql [DATABASE_URL] -c "SELECT 1"` returns `1` |
| ✅ pg_cron enabled | `psql [DATABASE_URL] -c "SELECT * FROM cron.job LIMIT 1"` returns no error |
| ✅ R2 bucket accessible | `aws s3 ls s3://bank-fee-index-documents --endpoint-url [endpoint]` succeeds |
| ✅ Modal CLI authenticated | `modal run --help` succeeds |
| ✅ Vercel project linked | Vercel dashboard shows repo linked (no deploy yet) |
| ✅ Baseline recorded | `docs/baseline-YYYY-MM-DD.md` committed to this branch |
| ✅ Crons paused | GitHub Actions shows schedules commented out |
