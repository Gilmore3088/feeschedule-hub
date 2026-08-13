---
type: lead-research
product: Bank Fee Index (feeinsight.com)
generated: 2026-04-17
methodology: lead-research-assistant skill (ComposioHQ)
---

# Bank Fee Index — Lead Research, April 2026

## Product Context (analyzed from codebase + CLAUDE.md)

**What we sell**
- **Pro subscription** ($2,500/mo): peer benchmarking across 4,200+ US banks and credit unions, 49 fee categories, Fed-district and asset-tier filters, AI research analyst (Hamilton), saved peer sets, exportable PDFs.
- **Consulting engagements**: custom analyses priced per scope; ARS deposit studies, segmentation playbooks, regional fee landscape reports.
- **Revenue mix** (stated direction): subscriptions → ads/affiliates on consumer side → bespoke consulting.

**Defensible wedge**
1. Pipeline covers 49 fee categories across bank + credit union charters (competitors focus on corporate treasury or loan pricing).
2. AI analyst produces reports that "look like McKinsey but cost less than one billable day" — the product's explicit positioning.
3. Hamilton grounds every claim in the DATA payload (no invented statistics — enforced by the NO_FLUFF_RULES in the prompts).
4. Federal Reserve district + FRED + Call Report + Beige Book data correlates fee schedules to actual service-charge revenue (`fee-revenue-correlation` skill).

**Primary pain points we solve**
- Pricing committees at regional banks guessing at peer medians from stale industry reports.
- Bank consultants burning 20+ hours hand-pulling fee schedules per engagement.
- Credit unions losing members over $3 fee gaps they didn't know existed.
- Fintechs pitching boards on "we undercut incumbents" with no defensible data.

---

## Ideal Customer Profile

| Dimension | Target |
|-----------|--------|
| **Primary segment** | US bank/CU consultancies (multiplier effect: they resell the data to every engagement) |
| **Secondary segment** | Banks $1B–$50B and credit unions $500M–$10B with active pricing committees |
| **Tertiary segment** | Corporate treasury platforms that already sell fee analysis — partner integration |
| **Quaternary segment** | Challenger banks + neobanks benchmarking vs incumbents |
| **Geography** | US (FDIC + NCUA regulated institutions) |
| **Budget** | $2,500/mo subscription fits comfortably inside any $100K+ consulting engagement; stand-alone bank procurement under CFO signing authority |
| **Buying trigger** | Annual repricing cycle (usually Q4/Q1), M&A pre-announce, CFPB overdraft guidance update, a peer institution publishing a competitor study |

---

## Tier 1 — Consultancies (highest ROI)

Consultancies are the force multiplier. A $2,500/mo sub plus one retainer covers 10–50 of their downstream bank engagements. Each closed consultancy ≈ 5–10 implied bank logos.

### 1. Cornerstone Advisors — fit score 10/10
- **Site**: crnrstone.com
- **Fit**: Conducts 60+ strategic planning engagements per year for community banks and CUs. Every engagement needs peer benchmarks; they'd use BFI in the first slide of every deck.
- **Decision maker**: Ron Shevlin (Chief Research Officer / Director of Research) or the lead of their "Bold Solutions" pricing practice
- **Opening**: "You run 60 strategic plans a year. The 49-category peer benchmark that usually takes your analysts two days to hand-pull — we return it in Hamilton in 90 seconds, with the Federal Reserve district overlay built in. One link-share with your client on demand. Can we get 20 minutes?"
- **Conversation starters**: reference Shevlin's "What's Going On In Banking 2026" publication; offer to run a live benchmark on a redacted client mid-call.
- **Priority**: close first. If Cornerstone adopts, the other consultancies follow on the reference.

### 2. Capital Performance Group — fit score 9/10
- **Site**: capitalperform.com
- **Fit**: Their "Top Performing Banks with Assets between $2B–$10B" publication IS peer benchmarking. BFI would cut their data-gathering cost materially while expanding coverage (they likely don't track 49 categories).
- **Decision maker**: Managing Director / Head of Research
- **Opening**: "Your Top Performers list covers ROA and efficiency — we cover fee structure across the same cohort. Together, a client sees performance and pricing in one view."
- **Partnership angle**: co-branded quarterly report ("BFI × CPG Mid-Size Fee & Performance Index"). Each side gets distribution the other lacks.

### 3. Darling Consulting Group (DCG) — fit score 8/10
- **Site**: darlingconsulting.com
- **Fit**: 650+ institution clients from de novo to $100B. ALM + strategy focus. Pricing intersects with everything they already advise on.
- **Decision maker**: Ed Krei (Managing Director) or whoever leads their strategic planning practice
- **Opening**: "Your ALM work answers 'can we afford this pricing change?' We answer 'what ARE our peers actually charging?' Complementary data feed."
- **Priority**: warm the lead via LinkedIn engagement first; ALM consultancies buy deliberately.

### 4. Malzahn Strategic — fit score 8/10
- **Site**: malzahnstrategic.com
- **Fit**: Pure-play community bank + CU management consulting. Small firm, nimble — a $2,500/mo sub is a rounding error against any client retainer they hold.
- **Decision maker**: Marcia Malzahn (Founder)
- **Opening**: "You write the pricing deck. We give you the peer data behind it. No more calling 12 banks to ask what they charge for overdraft."
- **Priority**: founder-led firms decide in one call. Book the demo.

### 5. Community Bank Consulting Services (CBCS) — fit score 7/10
- **Site**: bankconsultants.com
- **Fit**: 500+ bank clients in the $20M–$2B range. Smaller institutions than BFI's bank cohort but represents a long tail. Unit economics: cheap customer acquisition, predictable renewals.
- **Decision maker**: President / Managing Partner
- **Opening**: "Your client asks 'how do our fees compare to a $500M peer in a different Fed district?' — you hand them a BFI report they can paste directly into their board pack."

---

## Tier 2 — Direct bank/CU buyers (bigger logos, harder close)

### 6. Regional bank asset tier D ($1B–$5B) — category targets
- **How to source**: FDIC institution directory filtered by asset size 1B–5B, exclude Tier E (already targeted separately), active status.
- **Named candidates** (April 2026 — verify currency before outreach): First Interstate BancSystem, Ameris Bancorp, Renasant Bank, Heartland Financial USA.
- **Fit signal**: listed on S&P's "Community Bank 50" but lacks dedicated pricing research team.
- **Decision maker**: SVP Retail Pricing / Head of Deposit Product / CFO direct reports
- **Contact strategy**: LinkedIn warm intro via Cornerstone engagement (if Cornerstone is already a customer, use them as reference). Failing that, cold-pitch to SVP Retail with a one-page district-specific fee gap chart.

### 7. Large credit unions ($1B–$10B) — category targets
- **How to source**: NCUA 5300 Call Report database, asset size filter.
- **Named candidates**: Alliant Credit Union, PSECU, Suncoast Credit Union, Digital Federal Credit Union.
- **Fit signal**: big enough to have a pricing committee, not big enough to have a captive research team.
- **Decision maker**: VP Retail Banking / Chief Member Experience Officer
- **Opening**: "CFPB has reduced overdraft fees at 9 peer CUs in your district in the last 18 months. Our data shows your position vs each. 90-second demo?"

---

## Tier 3 — Partner/integrate (channel, not direct sale)

### 8. Treasury Suite — fit score 9/10 (partner)
- **Site**: treasurysuite.com
- **What they do**: Corporate treasury fee benchmarking, line-by-line invoice analysis for corporates paying bank fees.
- **Fit**: Their product answers "am I overpaying my bank?" Ours answers "what ARE banks charging?" Pure complement.
- **Pitch**: embed Bank Fee Index peer data inside Treasury Suite's platform as a white-label feed. Revenue share on the lookup volume.
- **Decision maker**: VP Product / Head of Partnerships

### 9. Treasury Intelligence Solutions (TIS Payments) — fit score 8/10 (partner)
- **Site**: tispayments.com
- **What they do**: Bank fee analysis for multinational corporate treasury.
- **Fit**: Corporate-side buyers want a third-party peer anchor for negotiations. We provide it.
- **Pitch**: licensed benchmark data feed — their customers get "you're paying P75, national median is P50" context in every invoice review.

### 10. Corporate Insight — fit score 7/10 (partner)
- **Site**: corporateinsight.com
- **What they do**: Competitive benchmarking research for financial services firms.
- **Fit**: They publish the research; we provide the live, machine-readable data behind it. Content partnership or data licensing.

---

## Tier 4 — Fintechs and challengers (lowest close rate, highest revenue per win)

Challenger banks live and die on "we're cheaper than incumbents." The defensible version of that pitch needs peer data we own.

### Candidates to pursue (April 2026)
- **Chime** — fee-free positioning; would license data to prove "our customers save $X/yr vs Tier D regional bank avg"
- **Varo Bank** — chartered neobank, uses competitive fee messaging in every deck
- **Current** — youth/teen banking, pricing against traditional banks' minor-account fees
- **SoFi Bank** — now full-service; needs fee peer data for Super App cross-sell pitches

**Decision maker**: VP Product, VP Marketing, or Competitive Intelligence lead (usually inside Product Ops)
**Opening**: "Your pitch deck slide 7 says you save customers $Y/yr. We're the defensible third-party source behind that number — every category, every peer set, every Fed district."

---

## Prioritized outreach sequence

| Week | Target | Motion | Goal |
|------|--------|--------|------|
| 1 | Cornerstone Advisors | Ron Shevlin LinkedIn DM + warm intro attempt | 30-min demo |
| 1 | Malzahn Strategic | Founder email + demo link | Direct close |
| 2 | Capital Performance Group | Partnership pitch (co-branded report) | Follow-up meeting |
| 2 | Treasury Suite | VP Product LinkedIn + partnership deck | Discovery call |
| 3 | DCG | Ed Krei warm intro via post-Cornerstone reference | Intro meeting |
| 3 | Large CU cohort (Alliant, PSECU, Suncoast, DCU) | Cold email with pre-run benchmark attached | 4 demos booked |
| 4 | Regional bank cohort | Cornerstone-referral outreach | 2 discovery calls |
| 5 | Chime / Varo / Current / SoFi | VP Product / Comp Intel outbound | 2 discovery calls |
| 6 | TIS Payments / Corporate Insight | Partnership pitch | Data-licensing LOI |

## Outreach assets needed (dev gap list)

- **Consultancy-facing one-pager**: "10 engagements where BFI saves your firm 20 hours."
- **Bank-facing one-pager**: "Your fee position vs your Fed district peers in one PDF."
- **Sample Hamilton report** (anonymized real institution) — blocked on H-3 in the product-input list; needed before Tier 2 outreach goes live.
- **Partnership deck** for Treasury Suite / TIS / Corporate Insight tier.
- **FDIC/NCUA-driven prospect list export** — a one-time script to pull candidate institutions with contact metadata from FDIC's Institution Directory and NCUA 5300 — something the pipeline can generate from existing `crawl_targets`.

## Open questions for the founder

1. Confirm the $2,500/mo subscription price point — some consultancies buy on an annual PO; would a $25K/yr tier with 5 seats land better?
2. Is there a white-label data-licensing tier for Tier 3 partners, or is "embedded in our partner's UI" out of scope?
3. Which of these prospects should the founder sign off on before outbound begins — any conflicts with existing relationships or non-target signals we should know about?

## Sources
- [Bank Fee Index — The National Benchmark for Banking Fees](https://feeinsight.com/)
- [Cornerstone Advisors — Strategic Planning](https://www.crnrstone.com/bold-solutions/strategic-planning)
- [Capital Performance Group — Top Performing Banks $2B–$10B](https://capitalperform.com/top-performing-banks-with-assets-between-2b-10b/)
- [Darling Consulting Group](https://www.darlingconsulting.com/)
- [Malzahn Strategic](https://malzahnstrategic.com/)
- [CBCS — Community Bank Consulting Services](https://bankconsultants.com/about.php)
- [Treasury Suite — Bank Fee Benchmarking](https://www.treasurysuite.com/features/bank-fee-benchmarking/)
- [TIS — Bank Fee Analysis Solution](https://tispayments.com/resources/bank-fee-analysis-solution-highlights/)
- [Corporate Insight — Competitive Benchmarking](https://corporateinsight.com/competitive-benchmarking-for-financial-services-firms/)
- [Top Banking Consulting Firms in the US (consulting.us)](https://www.consulting.us/rankings/top-consulting-firms-in-the-us-by-industry-expertise/banking)
