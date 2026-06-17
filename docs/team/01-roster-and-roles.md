# Team — Roles, Responsibilities, Reporting Structure

The 12-person team assembled for Bank Fee Index, organized around two
chiefs (CTO + CMO) plus a cross-functional consulting+GTM unit
anchored by Hamilton.

```
                           ┌────────────────────────┐
                           │  USER (Founder/CEO)    │
                           │  receives chief reports│
                           └───────────┬────────────┘
                                       │
                ┌──────────────────────┴───────────────────────┐
                │                                              │
        ┌───────▼────────┐                            ┌────────▼───────┐
        │   CTO          │                            │   CMO          │
        │  Tech & Data   │                            │  Marketing &   │
        │                │                            │  Growth        │
        └───────┬────────┘                            └────────┬───────┘
                │                                              │
   ┌────────────┼────────────┐                  ┌──────────────┼──────────────┐
   │            │            │                  │              │              │
┌──▼──┐    ┌────▼────┐  ┌────▼────┐         ┌───▼───┐    ┌─────▼────┐   ┌────▼─────┐
│ TA  │    │  BDA-1  │  │  BDA-2  │         │ SEO   │    │ Web      │   │ Market   │
│Tech │    │ Pricing │  │Coverage │         │Analyst│    │ Designer │   │Researcher│
│Arch │    │  & ROI  │  │ & Data  │         │       │    │          │   │          │
└─────┘    └─────────┘  └─────────┘         └───────┘    └──────────┘   └──────────┘

                  ┌──────────────────────────────────────────┐
                  │   CONSULTING UNIT (cross-functional)     │
                  │                                          │
                  │   ┌───────────┐  ┌──────────────────┐    │
                  │   │ Hamilton  │  │ Sr. Consultant   │    │
                  │   │ (central) │  │ (delivery)       │    │
                  │   └───────────┘  └──────────────────┘    │
                  │   pairs with both Marketing AND GTM      │
                  └─────────────┬────────────────────────────┘
                                │
                  ┌─────────────▼────────────────┐
                  │   GTM UNIT                   │
                  │                              │
                  │   ┌──────────┐  ┌─────────┐  │
                  │   │  AE      │  │  SDR    │  │
                  │   │(enterprise)│ │(outbound)│ │
                  │   └──────────┘  └─────────┘  │
                  └──────────────────────────────┘
```

---

## Tech Side (reports to CTO)

### CTO — Marcus Chen
**Mandate:** Pipeline reliability, data trustworthiness, agent platform,
cost discipline. Owns the production roadmap.

**KPIs:**
- Daily pipeline freshness (publish_index < 26h since last successful run)
- Cost per published fee ($ Anthropic spend / fees_published rows)
- Agent budget utilization (target: 60-80% — high = throttled, low = under-using)
- p95 query latency on `/api/v1/index`

**Owns:** All architectural decisions, agent gateway rules, budget caps,
incident response, deploy gates.

**Reports to:** User. Surfaces top 3 strategic options + recommendation
every cycle.

### Technical Architect — Priya Subramanian
**Mandate:** Translate CTO's strategy into actionable system design. Own
the workflow map, schema migrations, and agent framework primitives.

**Owns:** `docs/WORKFLOW-MAP.md`, schema migrations under
`supabase/migrations/`, the `fee_crawler/agent_base/` primitives,
adversarial gate design.

**Deliverables:** Migration review for every PR; architecture decision
records when crossing service boundaries.

### Business/Data Analyst — Pricing & ROI (BDA-1) — David Park
**Mandate:** Unit economics. How much does each customer cost us to
serve, and what's their value? Pricing tier design.

**Owns:** Cost models (Anthropic spend by report type), customer LTV
projections, peer benchmark on subscription tiers, the `$2,500/mo`
positioning evidence.

### Business/Data Analyst — Coverage & Data Quality (BDA-2) — Aisha Okonkwo
**Mandate:** Data trust. What % of US institutions do we cover? What's
our extraction accuracy? Where are the gaps?

**Owns:** Coverage reporting (8,750 institutions vs 9,000+ total US
chartered banks/credit unions), Knox-rejection rate analysis,
duplicate detection, the data-quality scorecard.

---

## Growth Side (reports to CMO)

### CMO — Reese Holloway
**Mandate:** Position the product, generate qualified pipeline, retain
subscribers. Own brand voice.

**KPIs:**
- Marketing-qualified leads/month (MQL)
- Pipeline coverage (3x quota baseline)
- Brand recall in target segment (annual survey)
- Net revenue retention (NRR)

**Owns:** Positioning ("national authority on fee data"), site copy,
analyst-relations, customer marketing.

**Reports to:** User.

### SEO Analyst — Jordan Reyes
**Mandate:** Organic discovery. We have 8,750 institutions × 49 fee
categories × 50 states = high long-tail SEO surface. Each
institution-detail page should rank.

**Owns:** `/fees`, `/institutions`, `/methodology`, `/guides` SEO. Schema
markup (LocalBusiness, FAQPage). Internal linking strategy.

### Web Designer — Sam Beaumont
**Mandate:** Editorial-grade visual layer. McKinsey/Bloomberg/FT
aesthetic per CLAUDE.md. Owns the dual-brand system (warm consumer
+ cool admin).

**Owns:** Component library (Newsreader serif headlines, terracotta
accents, tabular numbers), Hamilton report templates, admin density
patterns.

### Market Researcher — Linnea Ostberg
**Mandate:** Know the customer. Who buys $2,500/mo subscriptions and
why. Continuous voice-of-customer. Competitive intelligence on the
S&P / Capgemini / consulting firms whose lunch we're eating.

**Owns:** ICP definitions, win/loss interviews, competitor watch,
quarterly market sizing.

---

## Consulting Unit (cross-functional)

### Hamilton — Central Consultant (AI agent, productized)
**Mandate:** The face of the firm. On-demand McKinsey-grade analyst
inside every customer's dashboard. Hamilton's report quality IS the
product differentiator.

**Owns:** Hamilton agent's prompt + tool surface
(`src/lib/hamilton/`, `fee_crawler/agent_tools/tools_hamilton.py`),
template library, report quality bar.

**Reports up to:** Both CTO (technical execution) and CMO (brand).
Cross-functional by design.

### Senior Consultant (Delivery) — Theo Vargas
**Mandate:** White-glove engagements. The $15K consulting tier (per
CLAUDE.md). Translates Hamilton output into board-ready slide decks
when customers need humans-in-the-loop.

**Owns:** Engagement scoping, deliverable customization, customer
success expansion plays.

---

## GTM Unit

### Account Executive (Enterprise) — Camille Reeves
**Mandate:** Close the top-20 US banks + top-10 credit unions. Drive
$2,500/mo subscriptions and $15K consulting engagements.

**Owns:** Enterprise pipeline, multi-stakeholder deals, RFP responses,
ARR retention on named accounts.

### Sales Development Rep (Outbound) — Wes Tanaka
**Mandate:** Generate qualified meetings. Cold outreach to VP-Strategy
and Director-Pricing in mid-size banks.

**Owns:** Outbound cadences, lead-list hygiene, demo qualification.

---

## Collaboration Patterns

**Daily:** Hamilton-the-agent produces reports for any customer query
across the fleet — no human bottleneck. Consulting unit reviews any
sampled report flagged for quality.

**Weekly:**
- CTO + Tech Architect: schema migration review, pipeline health
- CTO + BDAs: cost-per-fee + coverage trend
- CMO + SEO + Web Designer + Market Researcher: messaging review
- Consulting Unit ↔ GTM Unit ↔ CMO: win/loss + pipeline gaps

**Monthly:**
- Both chiefs prepare options-and-tradeoffs report for User
- Cross-unit retro on customer interviews

**Quarterly:**
- Customer survey (≥10 prospects across roles) → market researcher
  consolidates → both chiefs incorporate findings into next-quarter
  roadmap

---

## Reporting to User (you)

Chiefs surface decisions, never raw data. Every report follows the
**Options-and-Tradeoffs** format:

```
Decision: <what needs deciding>
Context: <why this matters now, evidence>
Options:
  A) <option> — pros, cons, cost, time
  B) <option> — pros, cons, cost, time
  C) <option> — pros, cons, cost, time
Recommendation: <which option, with one paragraph of reasoning>
What CTO/CMO will do regardless of choice: <bounded autonomy>
```

This document is the source of truth for who owns what. Updated when
roles change.
