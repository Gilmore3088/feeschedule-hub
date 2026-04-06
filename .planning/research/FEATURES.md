# Feature Landscape: B2B Bank Fee Intelligence Platform

**Domain:** B2B financial research and fee benchmarking platform
**Researched:** 2026-04-06
**Milestone context:** v2.0 Hamilton — Adding content/report layer to existing fee data pipeline

---

## Table Stakes

Features that bank executives and consultants expect from any credible fee intelligence product.
Missing any of these signals an incomplete or unserious product.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Peer benchmarking by custom group | Core use case — "how do I compare to banks like me?" | Medium | Define peers by charter, asset tier, geography |
| National median / P25/P75 per fee category | Standard statistical framing banks use internally | Low | Already built in National Fee Index |
| Historical trend lines (12–24 months) | One data point is noise; movement is signal | Medium | Requires re-crawl preservation; fee_change_events table |
| Coverage across major fee categories | Overdraft, NSF, maintenance, ATM, wire are minimum | Low | 49 categories already classified |
| Downloadable / exportable data | Excel and CSV are the universal format for bank analysts | Low | CSV export exists in admin; needs public-facing version |
| Methodology documentation | Institutional buyers require knowing how data is collected | Low | "Methodology paper" is in active requirements |
| Report / PDF deliverable format | B2B buyers share findings internally; dashboards don't circulate | Medium | Core deliverable of Hamilton milestone |
| Geographic segmentation (state, Fed district) | Banks plan regionally; national only is too blunt | Low | Already built in pipeline and admin |
| Charter / institution type segmentation | Banks and credit unions have structurally different fee strategies | Low | Already in peer filter system |
| Asset tier segmentation | Community vs. regional vs. mega-bank dynamics are distinct | Low | Tier system already built |
| Named, consistent analyst voice | Credibility: reports should read like they were written by someone | Medium | Hamilton persona — core of this milestone |

---

## Differentiators

Features that set Bank Fee Index apart from FDIC call reports, Bankrate editorial, or generic benchmarking tools.
These justify the $2,500/mo price point and the "national authority" positioning.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI-generated narrative analysis (Hamilton) | Turns data into conclusions an executive can act on, not just tables | High | Primary differentiator; McKinsey-grade prose from live data |
| Fee change event tracking ("who moved first") | Shows which institutions led market repricing vs. followed | Medium | Requires fee_change_events history; peer-relevant signal |
| On-demand competitive brief for specific institution | "Give me a report on First National Bank of Wyoming" | High | Premium product; Hamilton-heavy; $500–$1K per report |
| Coverage freshness indicators | Knowing data is 3 months old vs. 3 years old changes trust level | Low | Last-crawled date per institution already tracked |
| Outlier flagging ("who is priced above market") | Actionable for pricing strategy — not just where you stand, but who is extreme | Low | Outlier queries already built in Market index |
| State-level fee environment reports | "What does the Montana competitive landscape look like?" | Medium | State Agent already running; state reports in active requirements |
| Fed district economic context layered into fee reports | Connects fee strategy to macro environment (Beige Book, FRED data) | High | Beige Book + FRED ingestion already built |
| Fee revenue correlation analysis | Ties fee strategy to non-interest income performance | High | Listed as existing skill in project context |
| Monthly pulse (automated recurring) | Keeps subscribers engaged between deep reports; builds habit | Medium | In active requirements; template-driven = cheap to run |
| Hamilton byline and consistent persona | Memorable brand anchor; human-readable reports signal quality | Low | Naming + voice design, not technical complexity |

---

## Anti-Features

Features to explicitly NOT build in this milestone. Each has a reason and a better alternative.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Real-time fee monitoring / alerts | Batch crawl cadence makes real-time misleading; creates alert fatigue | Show last-crawled date prominently; re-crawl on demand for premium tier |
| Fee calculators / "what would my bank save" tools | Consumer UX, not B2B research positioning; muddies the brand | Keep Bank Fee Index focused on market intelligence, not advisory tools |
| League tables / "best bank" rankings | SEO bait that erodes credibility with institutional buyers | Produce ranked findings within context (e.g., "lowest overdraft in Midwest community banks") |
| Self-serve dashboard with 40+ filters | Enterprise dashboards require sales, onboarding, support; out of scope | Lead with reports and published benchmarks; add portal as Phase 3+ |
| Integration with core banking systems | Complex, compliance-heavy, multi-year sales cycle | Provide exports (CSV/Excel/PDF) that integrate via copy-paste |
| Automated email alerts on competitor fee changes | Requires near-real-time crawl pipeline; current cadence cannot support it reliably | Monthly pulse email is the right cadence; flag "notable movers" in each issue |
| Ratings / grades for institutions | Subjective, liability-creating, off-brand for research positioning | Use objective market position language ("above median", "top quartile") |

---

## Feature Dependencies

The dependency chain that governs build order:

```
Fee data pipeline (done)
  └── National index (done)
        └── Peer index (done)
              └── Peer benchmark report (Hamilton template)
                    └── On-demand competitive brief (Hamilton deep)

State agent + coverage (done)
  └── State index data (done)
        └── State Fee Report (Hamilton template)

fee_change_events table
  └── Historical trend data
        └── "Who moved first" analysis
              └── Fee change alert language in monthly pulse

Beige Book + FRED ingestion (done)
  └── District economic context
        └── District + macro layering in Hamilton reports

Hamilton persona design
  └── Report template system
        └── All report types (national, state, pulse, competitive brief)
```

---

## MVP Recommendation for v2.0 Hamilton Milestone

Build in this priority order based on dependency chain and highest B2B value:

**Phase 1 — Foundation (must ship before any reports)**
1. Hamilton persona definition (voice, byline, tone document)
2. Report design system (PDF-grade template: cover, sections, data tables, charts)
3. Methodology paper (how the index works, what the data covers)

**Phase 2 — Recurring reports (template-driven, low ongoing cost)**
4. National Fee Index quarterly report (Hamilton narrative + index data)
5. State Fee Index reports (per-state, Hamilton prose + State Agent data)
6. Monthly pulse report (automated, "notable movers" + national snapshot)

**Phase 3 — Premium products (Hamilton-heavy, high-value)**
7. On-demand competitive peer brief (single institution or named peer set)
8. Fee change trend analysis ("who moved and when")

**Defer:**
- Consumer-facing institution fee lookup: Consumer traffic value is real but splits the product's identity at launch. Build once B2B product has traction.
- Self-serve dashboard portal: Requires UX/onboarding investment out of scope for content milestone.
- API access for data subscribers: Real differentiator at scale, but premature before report product is proven.

---

## Competitive Positioning Map

| Platform | Data Source | Report Output | Peer Benchmarking | Fee Focus | Price Signal |
|----------|-------------|---------------|-------------------|-----------|--------------|
| **Bank Fee Index** | AI crawl of 4,000+ live fee schedules | Hamilton narrative PDF + web | Custom (charter/tier/geo) | Primary | $2,500/mo |
| Curinos | Proprietary FI data partnerships | Analyst reports + platform | Deep (product-level) | Deposit pricing, not fee schedules | $50K+/yr |
| Raddon (Fiserv) | Client data + proprietary surveys | Semiannual performance reports | FI-submitted data | Non-interest income; no schedule-level | $10K–$20K/yr |
| ProSight (BAI/RMA) | Member-submitted data | Monthly pulse + semiannual reports | Deposit/rate focus | Rate benchmarking; minimal fee detail | Membership-based |
| McKinsey Finalta | Client + partner data | Annual deep-dive studies | Global peer sets | Digital performance; not fees | $100K+ engagements |
| FDIC/FFIEC tools | Call report data | Peer ratio reports | Basic financial ratios | No consumer fee schedule data | Free |
| Visbanking | FDIC/FFIEC data | Dashboard + analysis | 4,600+ institutions | Financial performance ratios | $299–$999/mo |

**Bank Fee Index sustainable advantage:** The only platform with crawled, current, institution-level consumer fee schedule data across 4,000+ institutions. No competitor has this primary data source. Curinos has product-level rate data but not fee schedule text. FDIC has reported financials but not granular fee categories. This data moat is only valuable if the product wraps it in deliverables B2B buyers recognize as worth paying for — which is what Hamilton does.

---

## What B2B Buyers Actually Pay For

Based on ProSight, Curinos, Finalta, and Raddon research:

1. **Actionable peer context** — not national averages, but "banks like you." Custom peer groups are a table-stakes expectation among bank strategy teams. ProSight, Curinos, and FFIEC all offer this. Bank Fee Index already has the filter infrastructure.

2. **Narrative synthesis** — executives pay for analysis, not data. Finalta's annual deep-dives and Raddon's performance reports are valued precisely because they convert numbers into strategy. This is Hamilton's entire reason for existing.

3. **Recurring cadence** — monthly or quarterly touchpoints justify subscription renewal. ProSight Consumer Pulse+ is specifically monthly to maintain engagement. One-time reports churn; recurring reports build dependency.

4. **Credibility signals** — methodology papers, named analysts, institutional partner logos. These exist because the B2B buyer has an internal audience to convince. Hamilton byline and methodology paper are both credibility features, not just marketing.

5. **Export / shareability** — bank analysts circulate findings in Excel and PDF. Every platform provides export. Locked-in web views lose subscribers.

---

## Sources

- [Curinos Digital Banking Analyzer](https://curinos.com/digital-banking-analyzer/) — Medium confidence (WebSearch summary)
- [ProSight Consumer Deposits Benchmarking](https://www.prosightfa.org/research-benchmarking/consumer/) — Medium confidence
- [McKinsey Finalta Overview](https://www.mckinsey.com/industries/financial-services/how-we-help-clients/finalta/overview) — Medium confidence
- [Raddon Research Insights](https://www.raddon.com/en/insights/raddon_research_insights.html) — Medium confidence
- [Visbanking Competitive Benchmarking Guide](https://visbanking.com/what-is-competitive-benchmarking) — Medium confidence
- [FFIEC Custom Peer Group Report](https://www.ffiec.gov/CustomPeerGroupReport.htm) — High confidence (official source)
- [ABA Bank Performance Benchmarking Tool](https://www.aba.com/news-research/analysis-guides/bank-performance-benchmarking-tool) — Medium confidence
- [Bank Fee Analysis Software Market](https://market.us/report/bank-fee-analysis-software-market/) — Low confidence (market research aggregator)
- [Inflexion B2B Data Sector Spotlight](https://www.inflexion.com/news-and-insights/insights/2024/spotlight-b2b-data/) — Medium confidence
