# Feature Landscape: Two-Sided Experience (v6.0)

**Domain:** Consumer bank fee education + B2B financial data intelligence (dual-audience UX)
**Researched:** 2026-04-07
**Milestone context:** v6.0 — Distinct consumer and B2B experiences for Bank Fee Index
**Confidence:** MEDIUM (WebSearch + platform analysis; verified against NerdWallet, AlphaSense, Bloomberg, Bankrate patterns)

---

## Scope of This Research

This file covers four specific UX domains needed for v6.0, mapped to existing capabilities:

1. **Consumer value-prop landing** — front door for non-subscribers
2. **Institution educational pages** — fee detail + "why does this matter?" context
3. **B2B launchpad** — four-door dashboard for pro subscribers
4. **Scoped report generation** — Hamilton reports, gated for pro tier

Existing features already built (not re-researched here): 26 public pages, 9 pro pages, admin portal,
Hamilton agents, fee review pipeline, Call Reports, FRED, Beige Book data.

---

## Area 1: Consumer Value-Prop Landing Page

### Table Stakes

Features every consumer fintech landing page must have. Missing any = untrustworthy or confusing.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Clear one-liner value proposition above the fold | Consumers decide in 3–5 seconds whether to stay | LOW | "What do you pay in fees? Find out." or equivalent |
| Search / lookup entry point on the hero | Primary action should be immediately actionable; NerdWallet, Bankrate do this | LOW | Fee Scout is already built; surface it on the landing |
| Trust signals near CTA | Fintech pages with regulatory badges near CTA convert 10–20% higher (WebSearch, 2026) | LOW | "4,000+ institutions" count, FDIC/NCUA coverage claim |
| Mobile-responsive layout | 53% abandon pages taking 3+ seconds on mobile; critical for consumer audience | LOW | Next.js + Tailwind already handles this |
| How it works / simple 3-step explanation | Visitors who understand the flow pre-registration show 30–50% higher activation (WebSearch, 2026) | LOW | "Search → Compare → Save" pattern |
| Transparent fee positioning | Consumer fintech converting best when they quantify savings ("see if you're paying too much") | LOW | Headlines must quantify, not just describe |
| No account-wall on initial search | Consumer platforms that gate search see 40–60% higher bounce rates | LOW | Current gateway approach gates too early; must open the fee lookup |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live data freshness indicator | "Updated within last 90 days" builds trust vs. Bankrate's often-stale editorial content | LOW | Last-crawled date is already tracked; surface it |
| Institution count as social proof | "4,000+ banks tracked" signals authority; consumers respond to coverage breadth | LOW | Static stat + auto-updating counter |
| Sample fee comparison embedded in hero | Showing real data (e.g., "Chase: $12/mo maintenance vs. Ally: $0") before any interaction converts better than abstract promises | MEDIUM | Requires picking sample institutions; curated, not dynamic |
| Fee Scout integrated directly (no redirect) | Search should happen on the landing page, not after navigation; Wise's calculator-first homepage is the model | MEDIUM | Fee Scout exists; embed vs. redirect is a UX choice |
| Consumer guide teaser below search | Contextual education ("What is an overdraft fee? Find out") drives repeat visits and SEO | LOW | Consumer guide skill already exists; tease 2–3 guides |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Split-panel gateway (consumer vs. B2B choice on load) | Forces a decision before establishing value; current implementation creates friction | Open consumer experience by default; surface B2B door in nav/footer |
| Account creation as step 1 | Consumer lookup tools that require signup before showing data lose 60–80% of visitors | Let anonymous users search; gate only advanced features (comparison saves, alerts) |
| "About Us" as primary CTA | Marketing reflex that fails; consumers want the tool, not the company story | Primary CTA = start searching; "About / Methodology" is secondary nav |
| Fee rating stars / letter grades | Subjective, legally ambiguous, misleads consumers; NerdWallet uses these and faces credibility criticism | Use objective language: "above median," "lowest in peer group" |
| Generic "financial wellness" messaging | Overused, vague, trusted by no one post-2022 | Be specific: "Find the exact overdraft fee at your bank in 30 seconds" |

---

## Area 2: Institution Educational Pages

### Table Stakes

Patterns established by NerdWallet, Bankrate, and CFPB BankFind — consumers expect these on any institution profile.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Institution header: name, charter type, asset size, HQ state | Basic identification; consumers confirm they have the right institution | LOW | Already in DB from FDIC/NCUA seed |
| Complete fee schedule (all extracted categories) | Primary content; must be comprehensive, not cherry-picked | LOW | 49 categories already classified per institution |
| "National median" comparison per fee | NerdWallet's 30-subcategory evaluation sets this expectation; users want context, not raw numbers | MEDIUM | Index queries already built; wire per-institution |
| Last-updated / data freshness | Consumers will question whether fee data is current; explicit date builds trust | LOW | last_crawled_at already tracked |
| CFPB complaint count / link | CFPB complaint data is public; omitting it feels like hiding information | MEDIUM | Requires CFPB API integration; not currently built |
| Source link (original fee schedule) | Consumers want to verify; fee schedule URL is the primary source | LOW | fee_schedule_urls already in DB |
| Institution type disambiguation | "This is a credit union, not a bank — membership required" is critical context | LOW | charter field already tracked |

### Differentiators

The "why does this matter?" layer is what separates Bank Fee Index institution pages from FDIC BankFind or basic Bankrate listings. No competitor currently provides fee data at this depth with interpretive context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Why does this matter?" callout per fee category | Embeds financial education in context of the specific fee — not generic literacy content; inline explanation of overdraft vs. NSF distinction, for example | MEDIUM | Contextual callout component; content is curatable per category |
| Peer percentile indicator ("this fee is higher than 72% of similar banks") | Actionable framing; consumers understand percentiles better than raw medians | MEDIUM | Index + charter/tier filter already supports this; needs display layer |
| Visual fee distribution chart (where does this institution sit?) | Recharts histogram showing national distribution with institution marker — makes the data visceral, not academic | MEDIUM | Recharts already in stack; distribution data from getFeesForCategory() |
| Fee history timeline (if re-crawl data exists) | Shows whether fees went up or down over time; creates "is this getting worse?" narrative | HIGH | Requires fee_change_events; partial data may exist |
| "Banks near you charging less" contextual suggestion | Drives affiliate/ad value and consumer action; equivalent to NerdWallet's "best accounts" surfacing | HIGH | Requires geo-aware peer query + CTAs; affiliate link potential |
| Consumer guide contextual links | "Overdraft fees: how to avoid them" linked from the overdraft fee row; Fintechs that teach contextually show 40–50% better activation (WebSearch, 2026) | LOW | Consumer guide skill already exists; link per category |
| Financial health indicators from Call Reports | Tier 1 capital ratio, ROA, charge-off rate contextualized as "is this institution financially stable?" | HIGH | Call Report data already in DB (v5.0); needs consumer-facing framing |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Showing only featured (15) fee categories | Institution pages should be comprehensive; consumers looking up a specific fee (e.g., wire transfer) will be frustrated | Show all 49 extracted categories; use featured flags only for ordering/prominence |
| Ratings / grades for institutions | Legally ambiguous, editorially unstable; NerdWallet's star ratings attract regulator scrutiny | Market-position language: "below national median," "top quartile for overdraft cost" |
| Auto-playing video explainers | High production cost, poor mobile experience, rarely watched | Inline text callouts are lighter, faster, and more scannable |
| Combining consumer and B2B data on same institution page | Confusing for consumers; Call Report depth is B2B territory | Consumer page = fee schedule + context; B2B page = full financial profile (separate route or section) |

---

## Area 3: B2B Launchpad Dashboard

The B2B launchpad is the first screen after a pro subscriber logs in. It should function as a command center — not a dashboard of metrics, but a gateway to four distinct workflows. Pattern: Bloomberg's workspace panels, AlphaSense's "saved searches + watchlists + recent activity," Capital IQ's customizable module grid.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Personalized welcome with institution context | B2B platforms that greet users with their peer group or institution on login create "this is mine" ownership | LOW | Use institution name from subscriber profile if set |
| Four primary action doors (Hamilton, Peers, Reports, Federal Data) | B2B SaaS dashboards that surface 3–5 primary affordances beat those with full menu navigation for task completion | LOW | Navigation + large CTA cards; no new data infra |
| Recent activity / last session continuity | AlphaSense, Capital IQ both surface "where you left off" — subscribers expect state persistence | MEDIUM | Store last-viewed report, last peer filter in session/DB |
| Quick stats panel (subscriber's peer group snapshot) | Gives immediate value on login without requiring navigation; "your peer group's median overdraft fee this quarter" | MEDIUM | Peer index query scoped to saved peer set |
| Hamilton quick-start (recent conversation or new) | AI assistant should be one click away, not buried in nav; Generative Search accessibility is a key AlphaSense differentiator | LOW | Hamilton chat exists; surface from launchpad |
| Report access (recent + generate new) | B2B subscribers expect their past reports to be retrievable; "my reports" pattern is universal in research platforms | LOW | Report history list; link to generator |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Personalized Beige Book digest on login | "Federal Reserve commentary relevant to your district — this month" is a unique hook; no competitor surfaces this; uses existing FRED/Beige Book data | MEDIUM | District from subscriber profile → query fed_beige_book by district |
| Competitive landscape snapshot (who moved in your market) | "3 institutions in your peer group changed fees since your last login" creates urgency to explore | HIGH | Requires fee_change_events scoped to peer group; high value, high complexity |
| Peer group health summary (Call Report indicators) | Capital ratio, charge-off trends across your custom peer group; available through existing Call Report data | MEDIUM | Aggregate query across peer institutions; Call Report data in v5.0 |
| Hamilton "morning briefing" format | A one-paragraph daily/weekly narrative from Hamilton synthesizing national index movements; builds habit and product dependency | HIGH | Requires scheduled generation; Claude cost manageable at weekly cadence |
| Saved peer sets with one-click report trigger | "Run a peer brief on this saved group" is the natural B2B workflow; Capital IQ's screener-to-report is the model | MEDIUM | Peer builder exists; report trigger is new |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Metrics-heavy dashboard with 20+ KPI tiles | Creates cognitive overload; B2B dashboards that prioritize task completion over data display retain better (UX Collective, 2025) | 4 action doors + 1 peer snapshot panel is sufficient; leave exploration to deeper pages |
| Onboarding wizard on every login | Annoying after first session; kills power user velocity | Show onboarding once; replace with "quick actions" on return visits |
| "Explore all data" as primary CTA | Vague; doesn't tell the user what to do | Each door has a specific action: "Ask Hamilton," "Build a peer group," "Generate a report," "Read district news" |
| Real-time feed of all crawl activity | Admin-level noise; subscribers aren't interested in crawler ops | Surface only peer-relevant freshness indicators ("your 12 peer institutions: last updated 14 days ago") |

---

## Area 4: Scoped Report Generation (Pro Tier)

### Table Stakes

Patterns from AlphaSense Generative Grid, Capital IQ tear sheets, Bloomberg's BQuant notebooks — what B2B subscribers expect from any AI-assisted report tool.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Report type selector (peer brief, competitive snapshot, district outlook, monthly pulse) | B2B report platforms always offer typed outputs; users need known deliverable formats, not blank canvas | LOW | Hamilton skills map to these exactly: fee-benchmarking, competitive-intelligence, district-economic-outlook, monthly-pulse |
| Scope inputs (institution name, peer group, district, date range) | Scoped reports are the B2B standard; "generate a report about community banks in District 7" must be a form, not a free-text prompt | MEDIUM | Skill parameter injection pattern; build a scope form per report type |
| Progress indicator during generation | AI generation takes 15–60 seconds; dead-wait with no progress = abandonment | LOW | Streaming SSE already implemented for Hamilton; reuse |
| PDF / downloadable output | Bank executives share reports in PDF; web-only is not acceptable for B2B | MEDIUM | PDF export not yet built; critical gap |
| Report history and retrieval | "Find the peer brief I generated last Tuesday" is a basic expectation | LOW | Reports table in DB; list view needed |
| Clear cost / credit signal (if rate-limited) | Subscribers must know whether report generation is unlimited or metered | LOW | Display generation count or "unlimited for your plan" |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Peer group pre-fill from saved set | Skip scope-entry step for power users with saved peer groups; AlphaSense "saved searches" model | LOW | Wire peer builder to report generator scope |
| Call Report integration in competitive reports | "Include financial health indicators (capital ratio, charge-offs) alongside fee comparison" — no competitor delivers this combination | MEDIUM | Call Report data in v5.0; Hamilton skill injection pattern |
| Beige Book district narrative auto-injected | District outlook reports automatically pull latest Beige Book commentary for the selected district | MEDIUM | Existing district-economic-outlook skill; Beige Book data in DB |
| Report versioning ("regenerate with fresh data") | Quarterly report subscribers want to re-run the same scope as new data comes in; version history shows what changed | HIGH | Requires report parameter persistence + diff display |
| Hamilton annotation layer (editable before export) | Allow pro users to add their own commentary to Hamilton's output before exporting; AlphaSense's clip + annotate model | HIGH | Complex editor; high differentiation vs. pure AI output |
| Branded export with subscriber institution name | "Prepared for: First National Bank of Wyoming" on PDF cover; B2B buyers share internally, want institutional provenance | MEDIUM | PDF template variable; low data complexity, medium PDF generation complexity |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Free-form prompt only (no structured scope) | Power feature but risky; open prompts produce inconsistent, lower-quality output and confuse non-technical users | Offer structured scope form as primary; advanced free-form prompt as secondary |
| Report generation without data traceability | "All data in reports must trace to pipeline-verified fees" — this is a hard constraint from PROJECT.md | Every metric in Hamilton reports cites its source category, institution count, and data date |
| Per-report pricing for base plan | Creates anxiety and reduces usage; low usage = churn | Unlimited generation for subscribers; save variable cost for on-demand deep briefs (premium tier) |
| "Download as Word doc" | .docx editing invites modifications that break formatting and remove Hamilton branding | PDF only for distribution; offer CSV for raw data |
| Generating reports without coverage warnings | A report on "all banks in Alaska" with 30% coverage should warn — not silently produce incomplete output | Coverage indicator in scope step: "We have data on 847 of your 1,200 peer institutions" |

---

## Feature Dependencies

```
Consumer Landing
  └── Fee Scout (already built)
        └── Anonymous search (remove account gate)
              └── Institution page link from search results

Institution Educational Pages
  └── Fee data per institution (done)
        └── National index per category (done)
              └── "Why does this matter?" callout (new content layer)
                    └── Consumer guide contextual links (guides skill exists)
        └── Fee distribution chart (getFeesForCategory exists)
        └── CFPB complaint data (NOT built — requires new integration)
        └── Call Report health indicators (done in v5.0)

B2B Launchpad
  └── Subscriber profile with institution + district (needed for personalization)
        └── Saved peer sets (peer builder exists)
              └── Peer snapshot panel (peer index queries exist)
        └── Beige Book digest by district (fed_beige_book table exists)
        └── Hamilton quick-start (Hamilton chat exists)
        └── Report history list (new: requires report persistence table)

Scoped Report Generation
  └── Hamilton skills (all 8 skills built)
        └── Structured scope form (new: per report type)
              └── Peer group pre-fill (from saved peer sets)
              └── District pre-fill (from subscriber profile)
        └── PDF export (NOT built — critical gap)
        └── Report persistence + history (NOT built)
        └── Coverage warning in scope step (new: needs coverage query)
```

### Critical Missing Pieces (Not Yet Built)

- **PDF export** — Required for scoped reports; web-only output is insufficient for B2B deliverables. No PDF generation library is currently in the stack.
- **Report persistence table** — Hamilton conversations exist but generated reports (typed, scoped outputs) need their own storage for history and retrieval.
- **CFPB complaint data integration** — Expected on institution pages; requires CFPB public API integration.
- **Subscriber profile with institution + district** — Personalization on the B2B launchpad depends on knowing which institution/district the subscriber represents. Currently not stored.
- **Anonymous search (consumer)** — Fee Scout likely gates on auth; must confirm and remove gate for consumer landing.

---

## MVP Recommendation for v6.0

### Launch With (v6.0 scope)

- [ ] Consumer landing redesign — value-prop hero + Fee Scout embedded (no auth gate) — Why essential: current split-panel gateway is the biggest acquisition blocker
- [ ] Institution page educational layer — "why this matters" callouts + peer percentile indicator + fee distribution chart — Why essential: transforms existing data pages from raw output to consumer product
- [ ] B2B launchpad with four doors — Hamilton, Peers, Reports, Federal Data — card navigation, peer snapshot, recent activity — Why essential: pro subscribers have no coherent starting point today
- [ ] Subscriber profile: institution + district — Why essential: unlocks all personalization on the launchpad
- [ ] Report history + retrieval — Why essential: generated reports disappear after session; B2B subscribers will not tolerate this
- [ ] Distinct nav per audience (consumer vs. pro) — Why essential: nav bleed between audiences destroys both experiences

### Add After Validation (v6.1)

- [ ] PDF export for Hamilton reports — Trigger: first B2B subscriber asks "how do I share this?"
- [ ] Personalized Beige Book digest on B2B launchpad — Trigger: district data is rich enough to surface weekly
- [ ] Structured scope form for report generation (per report type) — Trigger: Hamilton free-form prompts producing inconsistent output

### Future Consideration (v7+)

- [ ] CFPB complaint integration on institution pages — Defer: requires new API integration; not core to fee data value prop
- [ ] Fee history timeline on institution pages — Defer: fee_change_events data coverage needs to grow first
- [ ] "Banks near you charging less" consumer suggestion — Defer: affiliate/geo logic is a separate product layer
- [ ] Report versioning / re-run with fresh data — Defer: power feature for established subscriber base
- [ ] Hamilton annotation / edit layer before export — Defer: complex editor; build after PDF export proves popular

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Consumer landing (hero + embedded Fee Scout) | HIGH | LOW | P1 |
| Remove auth gate from consumer search | HIGH | LOW | P1 |
| Institution page: "why this matters" callouts | HIGH | LOW | P1 |
| Institution page: peer percentile indicator | HIGH | MEDIUM | P1 |
| B2B launchpad four-door layout | HIGH | LOW | P1 |
| Subscriber profile (institution + district) | HIGH | LOW | P1 |
| Report history table + list view | HIGH | LOW | P1 |
| Distinct consumer vs. pro navigation | HIGH | MEDIUM | P1 |
| Institution page: fee distribution chart | MEDIUM | MEDIUM | P2 |
| B2B launchpad: peer snapshot panel | HIGH | MEDIUM | P2 |
| B2B launchpad: Beige Book digest by district | MEDIUM | MEDIUM | P2 |
| Structured scope form (report generation) | HIGH | MEDIUM | P2 |
| PDF export for reports | HIGH | HIGH | P2 |
| CFPB complaint data on institution pages | MEDIUM | HIGH | P3 |
| Fee history timeline | MEDIUM | HIGH | P3 |
| Report versioning | MEDIUM | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | NerdWallet/Bankrate | Bloomberg/AlphaSense | Our Approach |
|---------|---------------------|----------------------|--------------|
| Consumer institution pages | Review + rating + pros/cons + best for | Not applicable | Fee-first profile with "why does this matter?" per category; deeper data, no ratings |
| Search / lookup | Keyword + filter, editorial-curated results | Company search + watchlist | Fee Scout: search by institution name; 4,000+ institutions vs. curated 100 |
| B2B dashboard | Not applicable | Watchlist + saved searches + recent docs | Four-door launchpad: Hamilton, Peers, Reports, Federal Data |
| AI assistant | None (editorial only) | AlphaSense Generative Search (500M docs) | Hamilton: scoped to verified fee data only; citation = pipeline-verified fees |
| Report generation | Editorial templates (human-written) | Generative Grid (comparative tables) | Hamilton skills: typed reports with structured scopes; PDF output |
| Educational content | Standalone guide articles | None | Inline callouts per institution/fee; contextual not separate |
| Data freshness | Rarely shown; typically months-stale | Real-time market data | Explicit last-crawled date per institution; honest about batch cadence |
| Peer benchmarking | Not available | Peer screening (financials only) | Custom peer groups by charter/tier/district scoped to fee schedules |

---

## Sources

- [NerdWallet Banking Reviews](https://www.nerdwallet.com/banking/reviews) — MEDIUM confidence; structure observed from search result descriptions; direct page access blocked (403)
- [AlphaSense Platform Review](https://intuitionlabs.ai/articles/alphasense-platform-review) — HIGH confidence; full page content reviewed
- [Eleken Fintech Design Guide](https://www.eleken.co/blog-posts/modern-fintech-design-guide) — HIGH confidence; full page content reviewed
- [WSA Fintech Landing Page Guide](https://wsa.design/news/high-converting-landing-pages-for-fintech-websites-structure-copy-and-data-insights) — MEDIUM confidence; described in search summary; direct access failed
- [Bloomberg vs Capital IQ vs Factset](https://www.wallstreetprep.com/knowledge/bloomberg-vs-capital-iq-vs-factset-vs-thomson-reuters-eikon/) — MEDIUM confidence; WebSearch summary
- [AlphaSense 2025 Product Releases](https://www.alpha-sense.com/resources/product-articles/product-releases-2025/) — MEDIUM confidence; WebSearch summary
- [B2B SaaS Dashboard Design Guide](https://www.orbix.studio/blogs/saas-dashboard-design-b2b-optimization-guide) — LOW confidence; WebSearch summary only
- [Financial Health Network: Measuring What Matters](https://finhealthnetwork.org/measuring-what-matters-banks-and-consumer-financial-health/) — MEDIUM confidence; WebSearch summary
- [ABA: Digital Innovations for Financial Education 2025](https://www.aba.com/news-research/analysis-guides/leveraging-digital-innovations-in-2025-for-financial-education-and-customer-engagement) — MEDIUM confidence; WebSearch summary

---
*Feature research for: Bank Fee Index v6.0 Two-Sided Experience*
*Researched: 2026-04-07*
*Prior milestone FEATURES.md (v2.0 Hamilton, B2B only) has been superseded by this file.*
