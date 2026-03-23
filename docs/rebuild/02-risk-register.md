# Risk Register

> Ranked by severity. Each risk has a mitigation plan. Review before starting each phase.

---

## Risk Matrix

| # | Risk | Probability | Impact | Severity | Phase |
|---|---|---|---|---|---|
| R1 | 190 sync DB calls — async rewrite harder than expected | Medium | High | 🔴 High | 1 |
| R2 | Stripe webhook breaks during domain cutover | Low | High | 🔴 High | 2 |
| R3 | SQLite → Postgres migration loses data or breaks FK constraints | Low | High | 🔴 High | 1 |
| R4 | Bot protection blocks 15–20% of bank sites | High | Medium | 🟡 Medium | 3 |
| R5 | Vercel free tier 10s timeout too short for heavy admin queries | Medium | Medium | 🟡 Medium | 2 |
| R6 | Supabase free tier storage limit hit during full sweep | Medium | Medium | 🟡 Medium | 3–4 |
| R7 | tesseract/poppler not in Modal image — OCR fails silently | Medium | Medium | 🟡 Medium | 4 |
| R8 | Anthropic Batch API 24hr turnaround blocks rapid iteration | Low | Low | 🟢 Low | 4 |
| R9 | Modal cold start adds latency to nightly jobs | Low | Low | 🟢 Low | 2 |

---

## R1 — 190 Sync DB Calls Need Async Rewrite

**What:** `better-sqlite3` is synchronous. Every `db.prepare().get()` must become `await db.query()`. 190 call sites across 21 files in `src/lib/crawler-db/`.

**Why it's high impact:** If the rewrite stalls, Phase 1 blocks everything downstream. The entire infrastructure migration depends on Next.js working against Postgres.

**Mitigation:**
- DB access is already centralized in `src/lib/crawler-db/` — not scattered in components. This is the good news.
- Work file by file. Start with `connection.ts` (the root), then `core.ts`, then each module.
- Run `npm run build` after each file. Catch type errors early.
- The conversion pattern is mechanical:
  ```typescript
  // Before
  export function getFees() { return db.prepare('SELECT ...').all(); }
  
  // After  
  export async function getFees() { return await sql`SELECT ...`; }
  ```
- Estimate: 3–5 focused days. Not a rewrite — a find/replace with async/await.
- Keep a running count: track `// MIGRATED` comments per file to measure progress.

---

## R2 — Stripe Webhook Breaks During Domain Cutover

**What:** Stripe sends webhook events to a URL. When we move from `bank-fee-index.fly.dev` to `feeinsight.com` (now on Vercel), the endpoint URL changes. Any in-flight webhook events may be lost.

**Why it's high impact:** Failed webhooks can leave subscriptions in `none` status even after successful payment. Revenue impact.

**Mitigation:**
- Update Stripe Dashboard webhook endpoint URL **before** cutting over DNS — not after.
- Keep Fly.io alive for 48 hours after Vercel goes live to catch any delayed webhook deliveries.
- Stripe queues undelivered webhooks for 72 hours and retries. Monitor Stripe Dashboard > Webhooks > Recent deliveries.
- Test with `stripe listen --forward-to localhost:3000/api/webhooks/stripe` before cutover.
- Server-side fallback (checking Stripe session on page load) already exists in the codebase — this covers the gap even if webhook fires late.

---

## R3 — Data Migration Loses Data or Breaks Constraints

**What:** Moving 22 tables, ~136K rows from SQLite to Postgres. Type differences (TEXT dates → TIMESTAMPTZ, INTEGER booleans → BOOLEAN, JSON strings → JSONB) can cause silent data loss or FK violations.

**Mitigation:**
- Run migration script in a **test Supabase project first** — not the production one.
- Validate row counts for all 12 core tables after migration. They must match SQLite exactly.
- Run FK integrity check: `SELECT * FROM extracted_fees ef WHERE NOT EXISTS (SELECT 1 FROM crawl_targets ct WHERE ct.id = ef.crawl_target_id)` — must return 0 rows.
- Keep SQLite file as `chmod 444` read-only backup for 30 days. Don't delete it.
- Use explicit column mapping in migration script — never rely on column order.
- Migration script is in [09-appendix.md](./09-appendix.md).

---

## R4 — Bot Protection Blocks Discovery

**What:** ~15–20% of bank sites return 403, CAPTCHA pages, or empty responses to automated requests. This includes some major banks.

**Why it's medium impact:** Affects coverage ceiling, but not the core pipeline. These institutions can be added manually or via community submission.

**Mitigation:**
- Playwright + `playwright-stealth` handles JS-rendered SPAs (already in codebase, just not in Modal image yet).
- Rotate User-Agent strings. Don't use `FeeScheduleHub/1.0` for all requests — looks robotic.
- Respect `robots.txt` and `Crawl-delay` (already implemented in `rate_limiter.py`).
- Per-domain rate limiting already prevents hammering (also already implemented).
- Accept that some % of institutions require manual URL entry via admin hub. Not every institution needs to be fully automated.
- Build community submission flow (already in schema: `community_submissions` table) to crowdsource missing URLs.

---

## R5 — Vercel Serverless Function Timeout

**What:** Vercel free tier has a 10-second timeout on serverless functions. Some admin dashboard queries (peer analysis, geographic aggregations) currently take 2–5 seconds against SQLite. Against Postgres with proper indexing they should be faster, but complex queries could still time out.

**Mitigation:**
- Audit slow queries **before** migration. Run `EXPLAIN ANALYZE` on any query > 500ms.
- Add indexes: `idx_extracted_fees_target`, `idx_extracted_fees_category_status`, `idx_crawl_targets_state_tier` — these are in the schema.
- Pre-compute heavy aggregations into `analysis_results` table (already designed for this).
- If needed, upgrade to Vercel Pro ($20/mo) — extends timeout to 60 seconds.
- Heavy admin operations (triggering crawls, bulk operations) move to Modal anyway — they're no longer in Next.js.

---

## R6 — Supabase Free Tier Storage

**What:** Supabase free tier has 500MB storage. Current data: ~71K crawl_targets + ~65K extracted_fees + 22 supporting tables ≈ ~50–100MB. After full sweep: ~350K extracted_fees ≈ ~200–300MB total. Should fit in free tier — but monitor.

**Mitigation:**
- Monitor storage in Supabase dashboard during Phase 4 sweep.
- If approaching 400MB: upgrade to Supabase Pro ($25/mo) — 8GB storage.
- Move `raw_llm_response` TEXT column (large) to R2 if storage becomes an issue.
- `fed_economic_indicators`, `community_submissions`, `research_usage` tables can be pruned if needed.

---

## R7 — tesseract/poppler Not in Modal Image

**What:** OCR fallback for scanned PDFs requires `tesseract-ocr` and `poppler-utils` as system packages. If not in the Modal image definition, scanned PDFs fail silently with "no text extracted" — same failure as today.

**37% of current extraction failures are scanned PDFs.** This is a significant coverage lever.

**Mitigation:**
- Include in Modal image definition from day one:
  ```python
  image = modal.Image.debian_slim()
      .apt_install("tesseract-ocr", "poppler-utils")
      .pip_install_from_requirements("requirements.txt")
  ```
- Test OCR explicitly in Phase 4 with a known scanned PDF before declaring the pipeline working.
- Add `ocr_attempted` and `ocr_success` fields to crawl_results to track OCR usage.

---

## R8 — Batch API 24hr Turnaround

**What:** Anthropic Batch API takes up to 24 hours to return results. This is fine for scheduled weekly crawls but means you can't iterate quickly during development (e.g., testing a prompt change).

**Mitigation:**
- Keep real-time mode available via `use_batch_api: false` in config.
- Use real-time (Haiku) for development and testing. Use batch for production runs.
- Cost of real-time Haiku for 100 test institutions: ~$0.44. Fine for iteration.

---

## R9 — Modal Cold Start

**What:** Modal functions have a ~2–5 second cold start when they haven't run recently. For a 6-hour nightly discovery job, this is irrelevant. Mentioned for completeness.

**Mitigation:** None needed. Not a real issue for batch/scheduled workloads.
