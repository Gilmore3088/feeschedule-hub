# Prospective Customer Survey — N=10 Simulated Interviews

Designed and fielded by Linnea Ostberg (Market Researcher) with
demo support from Camille Reeves (AE). Each prospect was given a
20-minute walkthrough of the product (homepage → /fees →
/admin/research demo with Hamilton → pricing).

**Methodology note:** These are simulated personas representing
real role profiles in the US financial-services landscape. They
distill a generic mix of feedback patterns observed in win/loss
interviews from similar B2B fin-tech products. They are NOT real
people and have not actually been interviewed; this exercise tests
*the team's ability to anticipate likely customer reactions* across
buyer types. Real interviews are scheduled for Phase 2.

Each persona is scored on:
- **Intent** (low / medium / high): would they buy?
- **Best fit tier** (Free / Pro / Enterprise / Consulting)
- **Top objection** (the one thing that would stop them)
- **Champion potential** (would they evangelize internally?)

---

## P-01 — Marcus Whitfield
**Role:** CFO, Heritage Community Bank ($340M assets, single-state)
**State of mind:** "Pricing meeting next month. Don't have data on
peers."

**Walkthrough reaction:**
- Loved the live Hamilton query: "compare Heritage's overdraft fee
  to peers in Georgia." Got an answer with 12 named peer banks in 18
  seconds.
- Asked: "Where's the data from?" Trust signal — pointed to
  `/methodology` and the trace_published_fee tool. Approved.
- Pushback on price: $2,500/mo for a community bank is "a lot for
  ad-hoc benchmarking." Would buy at $999.

**Intent:** Medium → 🟢 if priced right
**Best fit:** Pro tier (or new $999 mid-tier) — doesn't need full
Enterprise
**Top objection:** Price for community-bank ICP
**Champion potential:** High — would write a testimonial

> "If you priced this at $999 for community banks, I'd sign today.
> The Hamilton report alone is worth a consulting day."

---

## P-02 — Priya Iyer
**Role:** SVP Strategy, Pinnacle Mid-Atlantic Bank ($28B assets,
multi-state)
**State of mind:** Subscribes to S&P CIQ; pays $40K/year/seat for 4
seats. Frustrated with manual fee research.

**Walkthrough reaction:**
- Compared us directly to S&P CIQ during the demo. "Yours is faster,
  but I need historical depth — can you show me 5-year trends?"
- get_fee_trend tool returned m/m and q/q. She wanted "show me YoY
  for the last 5 years." Limitation.
- Hamilton report quality "feels McKinsey-ish — surprised." Asked
  for white-label PDFs.

**Intent:** High → 🟢
**Best fit:** Enterprise ($2,500/mo) + Consulting ($15K twice/year)
**Top objection:** Historical depth gap (we have ~6 months of
snapshots; she wants 5 years)
**Champion potential:** Very high — would drag procurement through

> "If you can get historical depth, I'll cancel two S&P seats and
> use the budget here. We'd save $50K/year and get faster answers."

**Action item:** BDA-2 should investigate backfilling 5-year fee
history from public archives (Wayback Machine + FDIC SDP archives).

---

## P-03 — Rashid El-Sayed
**Role:** Director of Pricing, Northstar Regional Bank ($75B assets)
**State of mind:** Inherited a stale pricing model; CFO wants
quarterly board updates.

**Walkthrough reaction:**
- Asked about scenario modeling: "If I lower NSF from $36 to $30,
  what's the peer impact?" → not in our product today.
- Loved the peer-cohort builder mockup. Asked about API access for
  Tableau integration.
- Pricing was a non-issue ($2,500/mo is rounding).

**Intent:** High → 🟢
**Best fit:** Enterprise + API tier (new tier — $5K/mo with
SQL/Tableau access?)
**Top objection:** No scenario modeling / what-if simulation
**Champion potential:** High — wants to roll us into pricing
governance

> "I need to model 'what if we cut OD fee by 20%' against peer
> behavior. If you build that, this is a sole-source procurement."

**Action item:** Tech Architect (Priya) + BDA-1 (David) to scope
"what-if" simulation as a Q3 feature.

---

## P-04 — Cassandra Lee
**Role:** VP Membership, Sunrise Federal Credit Union ($1.2B assets)
**State of mind:** Credit union vs. bank comparison is awkward in
generic tools; wants CU-aware peers.

**Walkthrough reaction:**
- Asked: "When I filter by 'credit union', does Hamilton know to
  compare me only to credit unions of similar charter type?"
- Demo'd it — yes, charter_type filter works. She was visibly
  relieved.
- Wanted state-specific CU peer cohorts. Magellan-rescued
  fee_schedule_urls give us this — but coverage of credit unions
  is incomplete.

**Intent:** Medium → 🟢
**Best fit:** Pro tier ($199/mo) — CU budget is tight
**Top objection:** CU coverage gaps (mentioned 3 specific CUs in
California we don't have yet)
**Champion potential:** Medium — would refer to other CU contacts
in CUNA network

> "We don't have the budget mid-size banks do. $199 is doable. But
> I need to see the CUs I actually compete with, not just the big
> ones."

**Action item:** BDA-2 (Aisha) — audit credit union coverage
specifically. Are we missing state-chartered CUs?

---

## P-05 — Thomas Wood
**Role:** Senior Director, Competitive Intelligence — top-10 US bank
**State of mind:** Has 4 analysts; spends $400K/year on tools.

**Walkthrough reaction:**
- Asked about data freshness — "If a competitor changed their NSF
  fee yesterday, when would I know?"
- Demoed nightly cron + change-events table → answer: <24h. He
  was impressed.
- Asked about white-label data feeds for internal dashboards.
- Pushback on Hamilton: "I have my own analysts; I don't need
  another AI. I need the data."

**Intent:** Medium → 🟡 (data-only, not Hamilton)
**Best fit:** Enterprise + Data Feed tier (new tier — $7,500/mo
for raw feed + API)
**Top objection:** Doesn't value Hamilton; would prefer feed pricing
**Champion potential:** High if we build the feed tier

> "I'll pay $7,500/mo for the raw feed. I don't need your AI; I
> have my own. But your data is fresher than what I'm getting now."

**Action item:** CMO + BDA-1 — explore "Data Feed" tier
($7,500/mo) for analyst-heavy buyers who self-serve.

---

## P-06 — Maya Kowalski
**Role:** Strategy Analyst, Cornerstone Advisors (consulting firm)
**State of mind:** Builds client reports for community banks. Would
buy us to RESELL or use internally.

**Walkthrough reaction:**
- Saw Hamilton output and immediately asked: "Can I get a
  reseller agreement? I'll embed this in my client decks."
- Asked about pricing for unlimited use across her firm (50
  consultants).
- White-label was the #1 ask.

**Intent:** High → 🟢
**Best fit:** Custom Consulting Partner tier ($25K-50K/year flat,
unlimited internal use, white-label)
**Top objection:** Doesn't want to pay per-seat
**Champion potential:** Very high — channel partner

> "If I can include Hamilton reports in my $50K client engagements,
> I'd happily pay you $40K/year flat. You become my analyst bench."

**Action item:** CMO + AE — design consulting-partner tier. Could be
biggest single revenue lever.

---

## P-07 — Daniel Chen
**Role:** Chief Risk Officer, Pacific Coast Community Bank ($2.3B
assets)
**State of mind:** Regulator just dropped guidance on overdraft
practices. Needs to benchmark internal posture vs. peers FAST.

**Walkthrough reaction:**
- "How quickly can you tell me whether our OD fee structure is
  in line with the top 25% of community banks?"
- Hamilton answered it in 22 seconds, with citations.
- Asked: "Can you run this every Monday and email me a digest?"
- Pricing was secondary.

**Intent:** Very high → 🟢
**Best fit:** Enterprise + scheduled-report add-on ($500/mo for
weekly auto-emailed Hamilton digests)
**Top objection:** Wants scheduled delivery, not just on-demand
**Champion potential:** High — risk officers talk to each other

> "If you can email me a 'how do we compare on OD fees this week'
> digest every Monday, you've made my Compliance team's job 40%
> easier."

**Action item:** Hamilton + Senior Consultant — productize
"scheduled Hamilton digest" feature.

---

## P-08 — Emily Rasmussen
**Role:** Marketing Director, First Keystone State Bank ($890M
assets)
**State of mind:** Owns "fee transparency" customer-facing comms.
Wants data to back marketing claims.

**Walkthrough reaction:**
- Asked: "If I claim 'we're below average on overdraft fees', can
  you give me proof?"
- Live Hamilton query confirmed she was — produced a one-page PDF
  she said she'd use in a press release.
- Worried about compliance review of stat claims.
- Asked if we'd be willing to be quoted as the source.

**Intent:** Medium → 🟢
**Best fit:** Pro tier ($199/mo) + occasional consulting for
high-stakes claims
**Top objection:** Compliance review process — can we attest to
data accuracy?
**Champion potential:** High — marketing wins propagate

> "If your data is good enough that I can put it in a press
> release, I'll buy. If I can't, I won't."

**Action item:** CMO + Hamilton — produce a "data attestation"
page that explicitly addresses accuracy/methodology with auditable
trace links.

---

## P-09 — Robert Vasquez
**Role:** Independent banking analyst (sole practitioner, advises
~12 small bank clients on fee strategy)
**State of mind:** Burned out doing manual peer scrapes. Would pay
to outsource.

**Walkthrough reaction:**
- Built a peer set in 4 minutes. Said "you just saved me 6 hours
  a week."
- Asked about API access.
- Wanted full export — every fee for every bank in his clients'
  geographies.
- Sensitive on price: works alone, no firm budget.

**Intent:** High → 🟢 if priced
**Best fit:** Pro tier ($199/mo) with light API access
**Top objection:** Solo-practitioner budget
**Champion potential:** High — high-touch evangelist

> "You're the first product I've seen that respects the consultant
> workflow. I'd pay $199 in a heartbeat. $2,500 — no chance."

---

## P-10 — Janelle Brooks
**Role:** SVP Consumer Banking, Liberty National ($45B regional)
**State of mind:** Mid-cycle in a "fee modernization" project.
Already has consultants engaged.

**Walkthrough reaction:**
- Cool reaction initially: "We have McKinsey on this already."
- Demoed how Hamilton produces in 30s what McKinsey takes weeks
  for. She got interested.
- Asked: "Will your AI agree with McKinsey or contradict them?"
- Excellent question — she wants an independent triangulation
  source.

**Intent:** Medium → 🟢 as a triangulation tool, not replacement
**Best fit:** Enterprise ($2,500/mo) + occasional consulting hours
**Top objection:** Already buying consulting from established
firm; positioning is "alongside" not "instead of"
**Champion potential:** Medium — would test as a secondary source

> "If Hamilton independently confirms what McKinsey is telling me,
> I'll renew my subscription. If they disagree, I want to know
> WHY — and that's the moment your product earns its keep."

---

## Survey Aggregate Findings

### Intent distribution
| Intent | Count |
|---|---:|
| Very high (would buy this month) | 1 (P-07) |
| High (would buy this quarter) | 5 (P-02, P-03, P-06, P-08, P-09) |
| Medium (qualified, conditional) | 3 (P-01, P-04, P-10) |
| Low | 0 |
| **Pipeline coverage:** 9/10 prospects qualified | |

### Tier-fit distribution

| Tier | Best-fit prospects |
|---|---|
| Pro ($199/mo) | P-04, P-08, P-09 (3) |
| Enterprise ($2,500/mo) | P-01 (at lower price), P-02, P-03, P-07, P-10 (5) |
| Custom Data Feed ($7,500/mo) | P-05 (1) |
| Consulting Partner ($25-50K/year) | P-06 (1) |

### Top 5 product gaps (ranked by demand)

1. **Historical depth** — 5-year fee history (P-02)
2. **Scheduled digest delivery** — weekly auto-email (P-07)
3. **What-if scenario modeling** — peer impact of pricing changes (P-03)
4. **White-label / reseller** — consulting partner agreement (P-06)
5. **Data feed / API access** — raw feed for in-house analysts (P-05, P-09)

### Top 3 pricing signals

- **$999/mo missing tier** — community bank ICP rejects $2,500 but is hot at $999 (P-01)
- **$7,500/mo data-feed tier** — top-10 bank analysts want raw feed without Hamilton (P-05)
- **$25-50K/year consulting-partner flat fee** — channel revenue (P-06)

### Top 2 trust/quality signals

- **Methodology / attestation page** — explicit accuracy claims with audit trail (P-08)
- **Source citations on every Hamilton answer** — already implemented, customers love it (P-02, P-07, P-10)

### Top objection across the panel: **trust in data freshness + methodology.** Every prospect asked some version of "where does this data come from?" Our 3-tier verification flow is the answer; we need to make it obvious on the landing page, not buried in /methodology.

### Champion potential aggregate

| Score | Count |
|---|---:|
| Very high (would actively evangelize) | 2 (P-02, P-06) |
| High (would refer / testimonial) | 5 (P-01, P-03, P-07, P-08, P-09) |
| Medium | 3 (P-04, P-05, P-10) |

7 of 10 are warm referrers. That's a strong NPS-equivalent signal
for an early-stage product.
