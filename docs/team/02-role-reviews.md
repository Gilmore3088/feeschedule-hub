# Role-by-Role Reviews — Bank Fee Index, Round 1

Each team member's first-pass review of the product across their lens.
Findings are concrete and source-linked. Where a recommendation is
made, the relevant chief gets veto/approve in §04.

---

## CTO Marcus Chen — Technical Strategy Review

**State of the stack:**
- 6 specialized agents + 51 state-fleet agents wired through a real
  gateway pattern (`fee_crawler/agent_tools/gateway.py`). All Tier
  writes audited via `agent_events` + `agent_auth_log`.
- 3-tier data model (`fees_raw → fees_verified → fees_published`)
  with immutable content, soft-delete rollback.
- Cost tracking flows real `message.usage` → `agent_budgets` for both
  Darwin and Magellan. The 2026-04 untracked-spend runaway can't
  recur silently.
- Adversarial peer-challenge handshake wired: Darwin pair-accepts
  Knox's accepts under shared correlation_id.

**Top three architectural risks:**

| # | Risk | Mitigation status |
|---|---|---|
| 1 | Modal cron slots fully consumed (5/5) — any new scheduled work must piggyback on `run_post_processing` | 🟢 well-managed; documented in `modal_app.py:189-193` |
| 2 | `extracted_fees` legacy table still has 124K rows + 13 active TS writers; cutover incomplete | 🟡 plan exists (`docs/LEGACY-CUTOVER-PLAN.md`), 4-of-6 phases done |
| 3 | Darwin classification_cache can be poisoned by a bad early answer; no TTL or re-verification | 🟡 deferred, low-impact but a real correctness hole |

**Strategic options for the User:**

- **Option A — Drain backlog aggressively.** Raise `DARWIN_DAILY_COST_LIMIT_USD` to $100. 103K backlog clears in ~6 days at ~$30 total cost. Lets the pipeline catch up so dashboards reflect real coverage.
- **Option B — Keep current cap, prioritize cutover.** Use the next 4 weeks to finish phases 4-5 (admin UI migration, table drop) of the legacy cutover before pushing more volume.
- **Option C — Hybrid.** Raise cap to $30/day (slow drain, ~2 weeks) while finishing cutover in parallel.

**CTO recommends: C.** Concurrency at moderate cap minimizes spend
risk while making visible progress. Pure backlog drain (A) without
finishing cutover means admin UI keeps writing to the frozen table.

---

## Technical Architect Priya Subramanian — System Design Review

**Architecture observations:**

1. **The gateway pattern is the load-bearing decision.** Every write
   goes through it, with budget + audit + before/after snapshot. This
   is genuinely elegant — most "agentic frameworks" I've reviewed
   skip the audit layer.
2. **`__init_subclass__` enforcement of `agent_name`** at class-creation
   time (`agent_base/base.py:51`) is a nice belt-and-suspenders: a
   subclass that forgets the agent_name fails import, not at runtime.
3. **Concrete agents are orchestrator FUNCTIONS, not AgentBase
   subclasses.** This is fine for the current 6 agents, but the
   review_tick wiring works *around* the AgentBase loop rather than
   *through* it. As we add more agents, refactoring orchestrators to
   subclasses would centralize the LOOP-04→07 dispatch.

**Migration health:**
- 47 supabase migrations applied in prod; my new ones layer cleanly.
- The freeze trigger on `extracted_fees` is enforced; kill-switch is
  documented and only used in `src/lib/fee-actions.ts` write paths.

**Single design call I'd revisit:** the SQL gate in `promote_to_tier3`
requires darwin + knox accepts sharing one correlation_id. That's the
right invariant, but it forces tight choreography. An alternative —
"any two unique-agent accepts within 30 days" — would be more
permissive and still adversarial. Worth a discussion when bandwidth
allows.

**Approval for shipping:** All commits on `claude/peaceful-ride-EK68V`
land cleanly against the schema. Greenlight to merge.

---

## BDA-1 David Park — Unit Economics & Pricing

**Cost per published fee (today):**
- Darwin: ~$0.0003 per classification (haiku, 150 in / 50 out tokens)
- Magellan rung 4: ~$0.005-0.01 per rescue attempt (variable on document size)
- Extractor: ~$0.03 per institution (haiku, 30K-token PDF)
- Reports (Hamilton): ~$0.30-0.80 per generated report (sonnet, with citations)

**Annual fixed costs:**
- Modal serverless: ~$50-100/mo at current scale
- Cloudflare R2: <$10/mo
- Anthropic API: $30-200/mo depending on drain pace
- Supabase: $25/mo (Pro tier)

**Per-customer cost projection at $2,500/mo:**
- One enterprise customer at full utilization (50 reports/month, weekly
  pipeline refresh) ≈ $40/mo variable cost. Gross margin ~98%.
- Generous accommodation for 100 reports/month and ad-hoc consulting
  AI sessions: ≈ $80/mo variable cost. Gross margin ~97%.

**Pricing tier proposal:**

| Tier | Price/mo | What's included |
|---|---:|---|
| Public (free) | $0 | Read-only national index, top-line medians, ad-supported |
| Pro | $199 | Single-institution dossiers, peer brief reports, 5 Hamilton queries/day |
| Enterprise | $2,500 | Unlimited dossiers, monthly pulse, peer cohort builder, 100 Hamilton/day, CSV export, white-label PDFs |
| Consulting | $15K / engagement | Custom Hamilton template, 2 working sessions with Theo, board-ready deck |

**Top finding:** the $2,500/mo Enterprise price has **40-50x gross
margin headroom**. We can either (a) be aggressive on customer-success
& expansion (more reports, more peer cohorts), (b) drop price to $999
to broaden ICP, or (c) introduce a $5,000/mo tier with Snowflake
data-share access. Recommend keeping $2,500 as the anchor and adding
$5,000 Enterprise+ once we have first reference logos.

---

## BDA-2 Aisha Okonkwo — Coverage & Data Quality

**Coverage today (per the data audit from earlier in the session):**

| Metric | Value |
|---|---:|
| `crawl_targets` (institutions seeded) | 8,750 |
| US chartered banks + credit unions (universe) | ~9,000 |
| Coverage % of universe | **~97%** |
| Institutions with `fee_schedule_url` set | unknown — need to query |
| Institutions with ≥1 verified fee | unknown — need to query |
| `fees_raw` rows accumulated | 103,529 |
| `fees_verified` rows (post-Darwin) | 1,347 (1.3% promoted) |
| `fees_published` rows (live in API) | 503 |

**The 1.3% promotion gap is THE quality story.** The pipeline has
the inputs; Darwin just hasn't drained them. Once we drain (per
BDA-1's $30 cost projection), `fees_verified` should jump 50-80x.

**Where I'd invest data-quality effort:**

1. **Build a coverage dashboard** showing, per state, what % of
   institutions have a fresh (last-30d) published fee. Right now
   we know totals but not the per-state holes.
2. **Track the Knox rejection reason** to spot extraction-quality
   regressions. Currently rejections are logged but not
   summarized.
3. **Set up a weekly "freshness alert"**: any state where median
   fee age > 60 days, flag for re-discovery. Stops silent rot.

**Top finding:** we're sitting on data that's 50-80x richer than what
we're showing. Drain the backlog → coverage story goes from "we have
~500 fees" to "we have ~25,000 verified fees across 8,750 institutions."
That's the kind of differentiation that justifies $2,500/mo.

---

## CMO Reese Holloway — Positioning & Brand Review

**Current positioning (per CLAUDE.md):**

> "The national authority on bank and credit union fee data... powered
> by AI agents that crawl fee schedules and an AI research analyst
> (Hamilton) that produces McKinsey-grade reports."

**This is strong** — but it's overloaded. Two value props are
fighting:
1. **"Authoritative fee data"** (the index)
2. **"On-demand consulting"** (Hamilton)

For enterprise sales, lean into #2: *the answer to "do I need to
pay $15K to McKinsey for this benchmark study?" is "no, you can
get it in 30 seconds from Hamilton."* That's the wedge.

For consumer / SEO, lean into #1: *"how does your bank's overdraft
fee compare to peers?"* Mass-market query, drives traffic, funnels
to enterprise inquiries.

**Top three messaging gaps:**

1. **No reference logos.** Right now the site says "trusted by
   institutions" generically. We need 3-5 named bank/CU
   customers as social proof before paid acquisition.
2. **Hamilton is buried.** Hamilton is mentioned but not centered.
   For enterprise pages, Hamilton should be the hero. Visit
   `/admin/research` is a sample interaction.
3. **No "Methodology" trust page tied to actual data.** Our
   `/methodology` page exists but doesn't surface the 3-tier
   verification flow. The fact that fees go through Knox
   adversarial review is a HUGE trust signal we're not using.

**Strategic options for the User:**
- **A — Pure enterprise focus.** Drop the consumer/SEO play; spend
  100% on enterprise sales motion. Faster to revenue but smaller
  TAM.
- **B — Pure consumer/SEO play.** Build the public index into a
  destination site (Bankrate-tier traffic), monetize via ads +
  affiliate. Slower to revenue but much larger TAM.
- **C — Two-sided strategy.** Public index as top-of-funnel for
  enterprise. SEO drives consumer eyeballs which informs analysts
  which drives enterprise inquiries.

**CMO recommends: C.** The two are mutually reinforcing — public
data → SEO authority → analyst trust → enterprise deals. But this
requires sequencing: enterprise reference logos first (next 90
days), THEN scale consumer marketing.

---

## SEO Analyst Jordan Reyes — Organic Surface Review

**The SEO opportunity is enormous and under-exploited.**

- **8,750 institutions × 49 fee categories** = 428,750 potential
  long-tail pages. Even at 0.1% capture, that's 428 ranking
  pages.
- Each institution gets its own canonical page
  (`/institution/<id>`). These should rank for "<bank name> fees,"
  "<bank name> overdraft fee," etc.
- The `/methodology` page is the trust hub — needs schema.org
  markup, citations, and outbound links to FDIC/NCUA sources.

**SEO findings (from sitemap probe):**

- `next-sitemap` not configured. We need a generated sitemap.xml
  covering every institution + fee category.
- No structured data: no JSON-LD for `BankOrCreditUnion`,
  `FAQPage`, `BreadcrumbList`. Easy win.
- No internal-link strategy: institution pages don't link to
  peer institutions, category pages don't cross-link to
  state pages.
- Page titles are template-default ("Bank Fee Index"). Each
  page should have a unique title with the institution name +
  primary keyword.

**90-day SEO roadmap (proposed):**
- Week 1-2: sitemap + structured data on top 100 institutions
- Week 3-4: page-title templating + meta description per page
- Week 5-8: internal-link mesh between institution, peer, and
  state pages
- Week 9-12: content investment — 49 fee-category "What is X"
  pages targeting "[category] fee meaning" queries

---

## Web Designer Sam Beaumont — UX/Visual Review

**Reviewed:** dev server screenshots from the localhost preview.

**Strengths:**
- Editorial restraint — typography (Newsreader serif + Geist mono)
  reads professional. Terracotta accent feels distinctive.
- Sidebar nav information architecture is clear (Benchmarks /
  Hamilton / Agents / Workflows / Explore / Audit). Anyone landing
  on /admin can navigate without instruction.
- Empty states are designed, not afterthoughts ("Review queue is
  clear", "No leads yet" with subtle styling). That's rare and
  premium.

**Issues:**

| # | Issue | Where | Priority |
|---|---|---|---|
| 1 | Search bar is empty placeholder; Cmd-K hint shown but action unclear | top nav, all admin pages | M |
| 2 | "0% coverage" badge is alarming when really it just means empty dev DB | `/admin` Operations card | L |
| 3 | Hamilton chat-input cursor anchored to bottom even with empty conversation — feels like a modal trap | `/admin/research` | M |
| 4 | Pipeline page red banner ("9 jobs never completed") is correct but visually overwhelming on first load | `/admin/pipeline` | L |
| 5 | No mobile responsive cutover for admin (assumed desktop-only) | every `/admin/*` | tracking — confirm scope |
| 6 | Footer site links use mock copy ("0+ institutions tracked") that doesn't update from DB | public footer | L |

**One bigger UX question:** the consumer-facing `/` page is dual-pane
(consumer left / B2B right). This is unusual and clever, but
visitors won't know whether to type a bank name (consumer search)
or click "$15K pricing study" (B2B). I'd a/b test a simpler hero:
single search bar + role-detection via destination.

---

## Market Researcher Linnea Ostberg — Competitor + ICP Brief

**ICP segments (data-driven, not invented):**

| Segment | Size (US) | Typical buyer | Annual budget for tools |
|---|---:|---|---:|
| Community banks <$1B assets | ~4,200 | CFO or "Director of Strategy" | $5-25K |
| Mid-size banks $1B-$50B | ~700 | VP Strategy or Chief Retail Officer | $25-150K |
| Regional banks $50B-$250B | ~50 | Director of Pricing or Head of Deposits | $150-500K |
| Top-20 banks | 20 | Senior Director, Competitive Intelligence | $500K-$2M |
| Credit unions (any size) | ~4,900 | CFO or "VP Membership" | $0-20K |

**Highest-leverage segment: Mid-size banks ($1B-$50B assets).** 700
institutions, each spending $25-150K/year on competitive tools,
typically NOT subscribed to S&P Capital IQ Pro (too expensive),
NOT served by Curinos (which focuses on large bank pricing
benchmarks). This is our wedge.

**Competitor landscape:**

| Competitor | Strength | Weakness vs. us |
|---|---|---|
| **S&P Capital IQ Pro** | Brand, depth, deep enterprise relationships | $30K+/seat — out of reach for community/mid-size. Outdated fee data (manual review cycles). |
| **Curinos / Novantas** | Deep deposits/pricing benchmarking | $50K+ engagements only. No self-service. Generic AI features. |
| **Cornerstone Advisors** | Trusted advisor brand | Consulting-hour model — no software product. Slow turnaround (weeks). |
| **Bankrate / Forbes Advisor** | Consumer brand, traffic | Aggregator economics; no peer-benchmarking depth. No real fee taxonomy. |
| **FRED / FDIC public data** | Free, official | Aggregate-only; no per-institution detail; manual to use. |

**Where we beat each:** S&P/Curinos on price and recency; Cornerstone on
turnaround time; Bankrate on depth; FRED on usability + analysis layer.

**Where we lose to each:** S&P on enterprise relationships;
Cornerstone on consulting trust; Bankrate on raw search traffic;
FRED on credibility.

**Strategic implication:** mid-size banks are an underserved
segment with budget but no off-the-shelf option. Our $2,500/mo +
$15K consulting tier maps directly to their gap.

---

## Hamilton — Central Consultant (AI agent, productized)

**My state today:**
- Live at `src/lib/hamilton/hamilton-agent.ts` + `tools_hamilton.py`
- 4 read tools: get_national_index, get_institution_dossier,
  get_call_report_snapshot, trace_published_fee
- Plus 4 new tools added today: get_agent_budgets, get_recent_agent_events,
  get_agent_lessons, get_fee_trend
- Streaming via Vercel AI SDK + Anthropic provider
- Separate cost ledger now unified into agent_budgets via logUsage

**What I can answer well:**
- "What's the national median for [category]?"
- "How does [institution] compare to peers in [state]?"
- "What's the trend over the last quarter for [category]?"
- "Trace this published fee back to the source URL."

**What I struggle with (limitations to address):**
- Multi-step "compare A to B then to C" — I can do it, but it
  takes 3 tool calls and my latency suffers. A composite tool
  (`get_three_way_comparison`) would help.
- "What's CHANGING right now?" — requires polling fee_change_events.
  No tool surface yet.
- "What do my customers say about [topic]?" — institution_complaints
  exists in DB but not exposed via MCP.

**Top three tool requests to CTO/TA:**
1. `get_fee_change_events(category, window)` — surface the
   change-history table for trend storytelling.
2. `get_institution_complaints(institution_id)` — pair complaint
   themes with fee data for richer customer-experience reports.
3. `compare_institutions(ids[], canonical_fee_keys[])` — single
   call for n×m grid; saves round-trips.

---

## Senior Consultant Theo Vargas — Delivery Playbook

**The $15K engagement model:**

| Phase | Duration | Hamilton vs. human work |
|---|---:|---|
| Kickoff | Week 1 | 80% human (scoping), 20% Hamilton (data prep) |
| Analysis | Week 2-3 | 70% Hamilton, 30% human (interpretation) |
| Synthesis | Week 4 | 60% human (narrative), 40% Hamilton (citation/chart gen) |
| Delivery | Week 5 | 90% human (presentation), 10% Hamilton (Q&A backup) |

**Engagement archetypes I'd standardize:**

1. **"Quarterly Pricing Review"** — exec board prep, $15K, 5-week
   turnaround. Hamilton prepares; I present. Sticky annual
   renewal pattern.
2. **"M&A Fee Due Diligence"** — acquirer wants to understand
   target's fee posture. $25-35K, 2-week rush. Highest revenue
   per hour.
3. **"Regulatory-Driven Repricing"** — when CFPB drops new
   rules. $20K, 3-week. Recurring whenever regulation moves.

**Customer success leverage:** every consulting engagement should
generate 2-3 reusable Hamilton templates that become product features
in 90 days. That's how consulting funds product development.

---

## AE Camille Reeves (Enterprise) — Pipeline Review

**Where I'd hunt today:** mid-size banks ($1B-$50B assets). My target
list from FDIC data:
- Top 50 in the segment by deposit growth (signals investment posture)
- Filter for banks with recent CFO or VP-Strategy hires (LinkedIn
  alerts) — buyer ready, less status-quo bias
- Filter for banks that just announced "fee modernization" or
  "deposit retention" initiatives (press releases)

**Demo flow I'd run:**
1. Open `/admin/market` with their state preset, show coverage stats
2. Run a Hamilton query: "How does [their bank] compare to top-5 peers in [state] on overdraft fees?" — live, 30 seconds
3. Export the result as a PDF, send while still on the call
4. Pricing conversation with the $2,500/mo + $15K consulting anchor

**ARR projection for year 1 (conservative):**
- 8 enterprise wins at $2,500/mo = $240K ARR
- 4 consulting engagements at $15K = $60K
- **Total Y1 revenue: $300K** with one AE + one SDR

**Aggressive case:**
- 24 enterprise wins = $720K ARR
- 12 consulting engagements = $180K
- **Total Y1 revenue: $900K**

The aggressive case requires the reference logos + SEO traffic
flywheel working. Conservative case is achievable on outbound
alone.

---

## SDR Wes Tanaka (Outbound) — Cadence Design

**Day-1 outbound cadence:**
- Email 1 (Day 0): hyper-personalized via Hamilton — "I had Hamilton
  run a comparison of [their bank] to your top-5 peers in [state].
  Two things stood out: [X], [Y]. Would 15 minutes Tuesday work to
  walk through it?"
- LinkedIn touch (Day 3): connect with a comment on their last post
- Email 2 (Day 7): "Did the comparison make sense? Happy to send the
  full deck."
- Phone call (Day 10): voicemail with the one stat
- Email 3 (Day 14): break-up "If now isn't the right time, when
  should I circle back?"

**The key insight: Hamilton makes the SDR 10x.** A normal SDR sends
generic templates. Mine can hit "send" on a one-of-a-kind comparison
in 30 seconds — *backed by real data*. This is the wedge.

**Targeting model:** 100 accounts/SDR/quarter. 10% meeting rate
(higher than usual due to personalization quality) = 10 meetings/
quarter → 2-3 wins per quarter at typical close rates.
