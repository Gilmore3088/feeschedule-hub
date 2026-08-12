# Bank Fee Index — Comprehensive Roadmap
# Rebuild + Product + Revenue Path to $100K ARR

> **Written:** 2026-03-22 — rebuild mode starts today  
> **North star:** The authoritative, independent source on what US banks charge consumers — serving regulators, fintechs, consultants, and the institutions themselves  
> **Revenue target:** $100K ARR within 12 months of launch

---

## What You Have Right Now (Honest Baseline)

```
Data
  71,923 institutions seeded (FDIC + NCUA)
  ~2,115 with extracted fees (3% coverage)
  65,000+ fee extractions across 49 categories
  229K+ research data rows (FRED, BLS, NYFED, OFR, SOD, Census, Beige Book)
  MSA market concentration (HHI) already computed for all MSAs ← underused asset
  Call report financial data (service charge income, ROA, ROE, assets)

Infrastructure
  Fly.io (migrating to Vercel + Supabase + Modal)
  SQLite (migrating to Postgres)
  3 domains: feeinsight.com, bankfeeindex.com, thebankfeeindex.com
  Coming soon page with lead capture

Revenue
  $0 MRR
  Stripe configured (test mode)
  3 Stripe products: $499.99/mo, $5K/yr, $250 one-time report
  Unknown number of leads in DB
```

---

## Before You Build Anything: The One Non-Technical Task

**Resolve the CSI employment question today.**

You work at CSI. CSI's NuPoint platform serves 10.1% of US banks. You are building a financial intelligence product that could compete with or complement CSI's analytics offerings — and you're using industry knowledge developed on the job.

This is not a theoretical risk. It's the most important thing you're not doing.

**Actions (this week, not next month):**
1. Read your employment agreement. Find: IP ownership clause, outside activities clause, non-compete scope
2. Three possible outcomes — each has a different action:
   - **No conflict:** Bank Fee Index uses only public data, no CSI proprietary anything. You're fine. Document this clearly and move on.
   - **Potential conflict:** Disclose it proactively to CSI HR or your manager. Frame it as a personal data project. Most employers are fine with clearly separate side projects when disclosed.
   - **Strategic opportunity:** CSI's open banking marketplace needs a fee intelligence layer. You could pitch this internally as a CSI product or data partnership. That path leads to a promotion, a license deal, or a buyout — not a lawsuit.

Everything below assumes the conflict question is resolved. Do not raise venture money, sign customer contracts, or quit your job until it is.

---

## The Stack (After Rebuild)

```
Web:       Vercel (Next.js)
Database:  Supabase Postgres
Workers:   Modal (Python, serverless)
Documents: Cloudflare R2 (content-addressed PDF/HTML store)
Payments:  Stripe (already configured)
Email:     Resend (set up, per outstanding-tasks.md)
LLM:       Claude Haiku + Batch API (extraction) / Sonnet (research agent)
```

Full migration plan: `docs/rebuild/` (already on this branch)

---

## What the Product Actually Is (Positioning Clarity)

You are not building Bankrate. You are not building NerdWallet. Those are affiliate referral engines dressed up as comparison tools. They have no incentive to give accurate fee data — they get paid when you click.

**You are building the Bloomberg Terminal for US bank fees.**

- Systematic, independent, institution-level data
- 49 fee categories across 70K+ institutions
- Historical time series (as of Phase 3)
- MSA-level market analysis (competitive density + fees)
- Call report cross-reference (fee income as % of revenue, by institution and peer group)
- No affiliate relationships. No ads. No conflict of interest.

That positioning is your moat. It's also your sales pitch to regulators, researchers, and serious B2B buyers who have been burned by biased comparison sites.

---

## The Revenue Model

### What You're Selling

| Product | Price | Who Buys It |
|---|---|---|
| **Professional Seat** | $499/mo or $5K/yr | Bank consultants, fintech analysts, compliance teams |
| **Institutional License** | $10K–$25K/yr | Banks and credit unions benchmarking themselves |
| **Research Report** | $250–$500 each | One-off competitive analysis, peer benchmarking |
| **Data API** | $200/mo (paid) + free tier | Fintechs, comparison apps, developers |
| **Fee Change Alerts** | $50/mo per institution monitored | Competitor intelligence teams |
| **MSA Market Report** | $500–$1K each | Banks entering new markets, regulators |

### The $100K Path

This is 2 enterprise contracts, not 200 consumer subscribers:

```
Month 1–3:   3 consultant/fintech early adopters × $5K/yr   = $15K ARR
Month 3–6:   Fee change alert product launch, 20 customers   = $12K ARR
Month 4–6:   10 research reports × $350 avg                  = $3.5K one-time
Month 6–9:   1 bank/CU institutional license                  = $15K ARR
Month 9–12:  1 state regulator or Fed district data contract  = $20–50K
             1 fintech API license                            = $10–20K ARR
─────────────────────────────────────────────────────────────────────────
             Total at 12 months:                              ~$75–115K ARR
```

The regulator or fintech contract is the swing factor. One of those closes and you're there.

---

## Roadmap: Six Phases

Phases 0–2 are infrastructure (rebuild). Phases 3–5 are coverage + data quality. Phases 4–6 are product + revenue. They run in parallel after Phase 2.

```
Week 1        Weeks 1-2     Week 3        Weeks 3-8     Weeks 6-12    Ongoing
──────────    ──────────    ──────────    ──────────    ──────────    ──────────
Phase 0       Phase 1       Phase 2       Phase 3       Phase 4       Phase 5
Foundation    Database      Infra Split   Discovery     Extraction    Coverage
Setup         Migration     Fly→Vercel    at Scale      + MSA         50%+
                            Fly→Modal
                                          ↓             ↓             ↓
                                          Product A     Product B     Product C
                                          Time Series   Fee Alerts    MSA Reports
                                          (always on)   (month 4)     (month 6)
```

---

## Phase 0 — Foundation Setup
**Duration:** Today (~5 hours)  
**Gate:** All services connected, CSI question documented, baseline recorded

### Technical
- [ ] Provision Supabase (or confirm existing). Copy connection string.
- [ ] Create Cloudflare R2 bucket: `bank-fee-index-documents`
- [ ] Create Modal account. `modal token new`
- [ ] Link Vercel project to GitHub repo (do not deploy yet)
- [ ] Add all new secrets to GitHub: `SUPABASE_URL`, `DATABASE_URL`, `R2_*`, `MODAL_*`
- [ ] Pause GitHub Actions cron schedules (comment out `schedule:` blocks)
- [ ] Run baseline audit — save to `docs/baseline-2026-03-22.md`

### Non-Technical
- [ ] Read employment agreement. Document conclusion.
- [ ] Check leads table: `SELECT * FROM leads ORDER BY created_at DESC LIMIT 20`
- [ ] Email every lead personally. Subject: "Quick question about Bank Fee Index." Get one call.

---

## Phase 1 — Database Migration
**Duration:** Weeks 1–2 (~15 hours)  
**Gate:** All 50 pages load from Postgres. Stripe works. Fly.io still running.

See `docs/rebuild/04-phase-1-database.md` for full task list.

**The core work:**
- Postgres schema (new tables: `jobs`, `platform_registry`)
- SQLite → Postgres data migration with validation
- Replace `better-sqlite3` with `postgres.js` across 21 files, 190 call sites
- Update Python pipeline to support `DATABASE_URL`

**The one thing that trips people up:** Do not start Phase 2 until every page loads correctly from Postgres. It's tempting to jump ahead. Don't.

---

## Phase 2 — Infrastructure Split
**Duration:** Week 3 (~8 hours)  
**Gate:** Fly.io destroyed. Vercel live. Modal deployed.

See `docs/rebuild/05-phase-2-infrastructure.md` for full task list.

**Critical sequence:**
1. Deploy to Vercel first
2. Update Stripe webhook endpoint URL
3. Cut over DNS
4. Wait 48 hours
5. Destroy Fly.io

**After Phase 2:** You have a clean, scalable stack. The rebuild is done. Everything from here is growth.

---

## Phase 3 — Discovery at Scale + Time Series Foundation
**Duration:** Weeks 3–5 development, 5–10 days compute  
**Gate:** 12,000+ institutions have a fee URL. Time series writing is live.

### 3A — Async Discovery (the coverage unlock)
- Rewrite `discover_urls.py` as async (httpx + asyncio, 20 concurrent tasks)
- Seed 63,000 institutions into jobs queue, ordered by asset size DESC
- Run NCUA website enrichment for ~5,900 CUs with no website URL
- Expected yield: 8,000–15,000 new fee URLs

### 3B — Time Series (start this the day Phase 2 ships — never stop)

This is the most important non-obvious thing to build. Start capturing history now, even with 2,115 institutions. Every month you wait is a month of irreplaceable data you'll never have.

**What to add to every re-crawl:**

```sql
-- After every successful fee extraction, write a snapshot
INSERT INTO fee_snapshots (
    crawl_target_id, fee_category, amount, frequency,
    snapshot_date, extraction_confidence
)
SELECT
    crawl_target_id, fee_category, amount, frequency,
    NOW(), extraction_confidence
FROM extracted_fees
WHERE crawl_target_id = $1
  AND review_status = 'approved'
ON CONFLICT DO NOTHING;

-- When a fee amount changes, record the event
INSERT INTO fee_change_events (
    crawl_target_id, fee_category,
    previous_amount, new_amount, change_type, detected_at
)
VALUES ($1, $2, $3, $4,
    CASE WHEN $4 > $3 THEN 'increase'
         WHEN $4 < $3 THEN 'decrease'
         ELSE 'unchanged' END,
    NOW());
```

**After 6 months of snapshots, you can answer:**
- "Which banks raised OD fees in Q3 2026?"
- "What % of community banks followed Chase's OD fee cut within 90 days?"
- "Show me fee trends in District 6 over the past year"

That's the data that justifies a $25K annual contract. You cannot go back and manufacture it retroactively.

---

## Phase 4 — Extraction Pipeline + MSA Analysis
**Duration:** Weeks 5–8 development, 3–5 days compute  
**Gate:** 12,000+ institutions with fees. MSA fee analysis live. Nightly batch running.

### 4A — Extraction Pipeline (see `docs/rebuild/07-phase-4-extraction.md`)
- Cloudflare R2 document store
- Async extraction worker
- LLM batch worker (Haiku + Batch API, ~$0.002/institution)
- Switch model to Haiku, reduce max_tokens to 2048
- Verify tesseract/poppler in Modal image for scanned PDFs

### 4B — MSA Analysis Layer (the underused asset)

You already have:
- `branch_deposits` table (FDIC SOD data — branch-level deposits per institution per MSA)
- `market_concentration` table (HHI already computed per MSA)
- `crawl_targets` with `cert_number` linking to SOD data

What you don't have: fee data joined to MSA context.

**The query that unlocks MSA analysis:**

```sql
-- Fee landscape for a given MSA
SELECT
    ct.institution_name,
    ct.asset_size_tier,
    ct.charter_type,
    ef.fee_category,
    ef.amount,
    mc.hhi,
    mc.institution_count,
    mc.total_deposits,
    -- Market share of this institution in this MSA
    bd.deposits::float / mc.total_deposits AS msa_deposit_share
FROM crawl_targets ct
JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
JOIN branch_deposits bd ON bd.cert = ct.cert_number
    AND bd.msa_code = :msa_code
    AND bd.year = (SELECT MAX(year) FROM branch_deposits)
JOIN market_concentration mc ON mc.msa_code = :msa_code
    AND mc.year = bd.year
WHERE ef.fee_category = 'overdraft_fee'
  AND ef.review_status = 'approved'
ORDER BY bd.deposits DESC;
```

**What this produces:**
- Fee schedule for every institution competing in a given MSA
- Their market share within that MSA
- Market concentration (HHI) — is this a competitive or concentrated market?
- How fees correlate with market position (do dominant institutions charge more?)

**New public pages to build:**
- `/research/market/[msa-slug]` — "Atlanta Metro Bank Fee Landscape"
- Shows all institutions competing in that MSA, their fees by category, market concentration
- 384 MSAs × some are high-traffic search terms = meaningful SEO footprint
- Premium: full breakdown, trends. Free: top 5 institutions, OD fee median only.

**New B2B product:**
- MSA Entry Analysis Report — for a bank considering expanding to a new market
- "Here are the 23 institutions already competing in the Austin MSA, their fee structures, and how concentrated the market is"
- Price: $500–$1,000 per report
- Target: bank M&A teams, de novo applications, expansion planning

**Add to admin hub:**
- `/admin/market/[msa]` — drill-down view with all institutions, fee heatmap by category, HHI trend

---

## Phase 5 — 50% Coverage + Platform Rules
**Duration:** Weeks 8–12, ongoing compute  
**Gate:** 35,000+ institutions with approved fees

See `docs/rebuild/08-phase-5-coverage.md` for full task list.

**Platform rule priority:**
1. Jack Henry / Banno (~1,100 institutions) — validate 20 sites, flip switch
2. Q2 Banking (~450 institutions)
3. WordPress PDF pattern (~2,000+ institutions)
4. Drupal (~800 institutions)

Each platform you validate = free extraction forever for all future institutions on that platform.

---

## Phase 6 — Revenue Products (run parallel to Phases 3–5)
**Start:** Immediately after Phase 2 (infrastructure stable)

### 6A — Fee Change Alerts (Month 4 target)

The highest-leverage product you're not building. Banks want to know when competitors change fees. Consultants want it for clients. Compliance teams need it for regulatory monitoring.

**How it works:**
- User selects institutions to monitor (up to 50 per subscription)
- When `fee_change_events` records a change for a monitored institution, send alert
- Email first, then webhook option for API subscribers

**What to build:**
```sql
CREATE TABLE fee_alert_subscriptions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    crawl_target_id BIGINT NOT NULL REFERENCES crawl_targets(id),
    fee_categories  TEXT[],  -- null = all categories
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, crawl_target_id)
);
```

After each monthly re-crawl, Modal function queries `fee_change_events` for the past 30 days, joins to `fee_alert_subscriptions`, sends digest emails via Resend.

**Pricing:** $50/month for 20 institutions monitored. $150/month for 100. Include in Professional seat license.

### 6B — Institution Fee Report Card (Month 5 target)

One-page PDF. A bank or credit union can see how their fee schedule compares to their peer group.

**Content:**
- Your OD fee vs. median for your asset tier and state
- Your monthly maintenance fee vs. peers
- Your wire transfer fee vs. peers
- 3 categories where you're above median (risk of customer complaints)
- 3 categories where you're below median (potential revenue opportunity)
- Peer group: 50 closest institutions by asset size, charter type, state

**Delivery:** Generated on-demand by a Modal function. PDF via Cloudflare R2. Delivered by email within 5 minutes.

**Pricing:** $250 per report (consumer). Included in Professional seat license. Could be resold by consultants.

**Why it works as a sales tool:** The institution you generate it for is now a prospect. They've seen their data. They want to know more. That's the foot in the door.

### 6C — Public API + Free Tier (Month 6 target)

Right now your API requires payment and has no documentation users can find easily. That's backwards for growth.

**Free tier:** 100 API calls/month, national medians only, 6 spotlight categories  
**Paid tier:** $200/month, full access, all categories, institution-level data  
**Enterprise:** Custom, includes MSA data, bulk export, webhook alerts

**Why the free tier matters:** Every fintech that builds on your free tier is distribution. They tell other fintechs. When they need more data they upgrade. When they get acquired, their buyer asks what data stack they're using. That's how Clearbit grew from API to acquisition.

**What to build:**
- Rate limiting by API key (already have `api_keys` table)
- Usage metering (already have `research_usage` table — extend for API)
- Public API docs at `/api-docs` (page exists, needs content)
- OpenAPI spec at `/api/v1/openapi.json`

### 6D — MSA Market Reports (Month 6 target)

On-demand PDF report for a given MSA. Content:
- All institutions in the MSA with extracted fees
- Fee comparison by category (which institution is cheapest/most expensive for each fee type)
- Market concentration (HHI) and what it means for consumers
- Trend data if time series has been running long enough

**Target buyers:**
- Banks doing competitive analysis before opening a new branch
- De novo bank applicants (OCC requires market analysis)
- State banking regulators reviewing merger applications
- Local journalists covering banking
- Consumer advocacy organizations

**Pricing:** $750 per report. Custom research for regulators: $2,500+.

---

## The SEO Play (Undervalued, Runs Itself)

You have 3,000+ programmatic public pages already. Here's what to add that will compound:

**MSA pages** (`/research/market/[msa-slug]`): 384 MSAs. "Austin Texas Bank Fees" is a real search term. Fees in "Austin Metro Area" is something a consumer, journalist, or bank analyst actually searches for.

**City pages** (`/fees/city/[state]/[city]`): Already partially built. Needs fee data to populate. Once coverage hits 30%, these pages are genuinely useful.

**"Best low-fee banks in [state]"** articles: Generated by the LLM article pipeline you already have. Rank for high-intent search terms. No affiliate links — that's the differentiator.

**Trend reports**: "Bank Fees Are Rising in District 7" — publish quarterly, cite your own data, get linked by local news.

None of this requires paid acquisition. It compounds over 12–18 months into the dominant organic presence for bank fee data searches.

---

## The Institutional Sales Strategy

**Who to contact first (this month, before coverage is 50%):**

1. **Bank consultants** — search LinkedIn for "bank fee consultant" or "community bank pricing strategy". They need your data daily. 10–20 prospects within reach. Offer 3-month free trial, get feedback, convert.

2. **Fintech comparison apps** — companies like Deposits.com, DepositAccounts.com, Bankrate's tech team. They have fee data problems. Reach out to their data or product teams.

3. **CFPB** — They publish fee data research. Contact their research division. Not a customer but a potential data partner and credibility signal.

4. **State banking regulators** — Find 2-3 state banking departments that have published fee-related policy guidance. Offer a complimentary MSA report for their state. Get a meeting.

5. **Academic researchers** — Google Scholar: "bank fees overdraft consumer". Find researchers actively publishing. Offer academic licensing. They cite you. You get credibility.

**Your sales pitch (one sentence):** "We're the only source of systematic, independent, institution-level fee schedule data across 70K US banks and credit unions — with MSA market analysis and historical trend tracking."

**Your demo:** The admin dashboard. Show them the fee catalog, peer comparison, MSA view, research agent. This is better than any slide deck.

---

## What to Build First Today

You said rebuild mode starts today. Here's the exact sequence:

### Today (Hours 1–5): Phase 0
1. Provision Supabase. Copy connection string. 30 min.
2. Create R2 bucket. 15 min.
3. Create Modal account. `modal token new`. 15 min.
4. Link Vercel to GitHub repo. 15 min.
5. Add all secrets to GitHub. 20 min.
6. Comment out cron schedule blocks in both GitHub Actions workflows. 10 min.
7. Run baseline audit query. Save to `docs/baseline-2026-03-22.md`. 20 min.
8. Read employment agreement. Write one paragraph conclusion. 30 min.
9. Log into Supabase → Enable pg_cron extension. 5 min.
10. `psql [DATABASE_URL] -c "SELECT 1"` — confirm it works. Done.

### This Week: Phase 1A + 1B
- Create Postgres schema (run migration script from `docs/rebuild/09-appendix.md`)
- Run data migration (SQLite → Postgres)
- Validate row counts

### This Week (parallel): First Revenue Action
- Pull leads from DB: `SELECT name, email, company, role FROM leads ORDER BY created_at DESC`
- Email every one personally. Not a newsletter. A real email: "Hi [name], you signed up for early access to Bank Fee Index. I'm about to launch and would love 20 minutes to show you what we've built. Does [day] work?"
- One call booked = more valuable than 1,000 lines of code this week

---

## Timeline Summary

| Week | Primary Work | Revenue Action |
|---|---|---|
| 1 | Phase 0 complete, Phase 1 DB migration starts | Email all leads, book calls |
| 2 | Phase 1 complete (Postgres live, all pages work) | First customer call(s) |
| 3 | Phase 2 complete (Fly.io dead, Vercel + Modal live) | Offer 3-month trial to first interested customer |
| 4–5 | Phase 3: async discovery running, time series enabled | Prepare MSA demo |
| 6–7 | Phase 4: extraction pipeline, 5K+ institutions with fees | First paying customer target |
| 8–10 | Phase 5: 15K+ institutions, platform rules building | Fee alert product launch |
| 10–12 | Phase 5 continued: 25K+ institutions | MSA report product launch |
| 12–16 | 35K+ institutions, 50% coverage | $100K ARR target window |

---

## What Not to Build Right Now

Things in your plans folder that are real but should wait:

- **Mobile nav** — B2B customers are on desktop. Not now.
- **Community submissions** — Good idea, but needs coverage first to have credibility
- **Full consumer experience suite** — Consumer is the long game. B2B pays the bills first.
- **Branded output / white-label** — Wait until you have 2+ paying customers asking for it
- **More LLM article generation** — You have enough content infrastructure. Coverage first.
- **Docling / IBM TableFormer** — Haiku handles tables well enough. Don't gold-plate extraction yet.

---

## The Moat (What Makes This Hard to Copy)

By month 12, if you execute the roadmap, you have:

1. **12 months of fee change history** across 35,000 institutions — nobody can buy this retroactively
2. **MSA competitive analysis** combining fee data + deposit market share — unique dataset
3. **Call report cross-reference** — fee income ratio segmented by peer group
4. **Validated platform extraction rules** — Banno, Q2, etc. — free extraction forever
5. **SEO authority** on bank fee search terms — built over 12 months of content

Items 1 and 2 are the real moat. They compound with time. Everything else can theoretically be replicated with money. Historical data and market analysis cannot.

---

## The Single Most Important Decision

**Choose your first customer carefully.**

A consumer-facing customer shapes you toward comparison features, SEO, and low price points. A bank consultant customer shapes you toward peer analysis, export quality, and premium pricing. A regulator customer shapes you toward data integrity, methodology documentation, and government procurement processes.

The first customer you close will define your product roadmap for 18 months whether you intend it to or not.

Based on what you've built — the admin hub, the research agent, the peer analysis, the district-level data — this product was designed for a sophisticated B2B user, not a consumer comparing checking accounts. Sell to that user first.
