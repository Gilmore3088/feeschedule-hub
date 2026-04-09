# Feature Research

**Domain:** Premium B2B Decision Intelligence Platform — Hamilton Pro 5-Screen Decision System
**Researched:** 2026-04-08
**Milestone context:** v8.0 — Transform Hamilton from chat agent into 5-screen decision system for fee pricing, peer positioning, and regulatory-risk evaluation
**Confidence:** MEDIUM-HIGH — screen specs and product architecture from Hamilton-Design/ (HIGH); comparative platform analysis from Bloomberg Terminal, Palantir Foundry, Curinos Deposit Optimizer, Klue, Rogo AI (MEDIUM); general B2B SaaS UX patterns (LOW-MEDIUM)

---

## Scope of This Research

This file maps each of the 5 Hamilton Pro screens — Home, Analyze, Simulate, Report Builder, Monitor — plus Settings to table stakes, differentiators, and anti-features grounded in comparable premium B2B intelligence products. "Comparable products" means: Bloomberg Terminal (data density + workflow), Palantir Foundry/AIP (decision intelligence + scenario modeling), Curinos Deposit Optimizer (direct competitor for bank pricing intelligence), Klue/Crayon (competitive intelligence signal feeds), and Rogo AI (AI-native financial research workflow).

Existing features already built (not re-researched here): Hamilton unified persona, global thesis engine, Voice v3.1, 12-source queryNationalData + queryRegulatoryRisk tools, Editor v2, fee index (national + peer), streaming research chat, consumer/institution pages, admin portal.

---

## Screen 1: Executive Home / Briefing

### Table Stakes

Features executives expect in any premium briefing product. Missing any = product feels generic or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single dominant thesis statement | Every premium briefing (Klue digest, Bloomberg TOP function) leads with one clear point of view — not a list of observations | LOW | AI-generated from current index payload; not static copy; Hamilton Voice v3.1 already handles this |
| "What Changed" module | Users open the screen to find out what is different since last visit — this is the primary engagement driver | MEDIUM | Delta since last session or last 7 days; requires comparing current snapshot to prior; drives repeat habit |
| Priority alerts list above fold | Bloomberg, Palantir, and every monitoring product surfaces prioritized alerts before body content | LOW | Reads from `hamilton_priority_alerts`; severity-coded; max 3 visible at once |
| Recommended action with one-click CTA | Executive products are judged on whether they tell you what to do, not just what happened | LOW | Primary CTA = "Simulate Change"; must pre-load Simulate with context |
| Institutional context header | User must see their institution name, asset tier, and peer set immediately — confirms the briefing is for them | LOW | Reads institution profile from Settings; critical trust signal; no generic fallback state acceptable |
| Data freshness timestamp | Any data-heavy product must communicate when data was last updated — absence creates distrust | LOW | "Based on index as of [date]" — prevents silent stale-data confusion |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Thesis with tension framing | Curinos and Bloomberg surface data; Hamilton surfaces an argument with stakes — "You are pricing above your market at a moment when complaints are rising" | MEDIUM | Requires Hamilton Voice v3.1 tension model from v7.0; already built |
| Positioning Evidence module | Translates thesis into peer percentile context ("You sit at 73rd percentile for overdraft, above 81% of your peer set") — a claim, not a table | MEDIUM | Draws from existing getNationalIndex + getPeerIndex queries; display only |
| "Why It Matters" revenue narrative | Most platforms stop at what changed; explaining the revenue implication is the consulting-grade differentiator | MEDIUM | One paragraph max; Hamilton Editor v2 revenue-first ordering enforced |
| Monitor Feed preview strip | Surfaces 2-3 live signals from Screen 5 on Home so users see surveillance value without navigating | LOW | Pulls top signals from `hamilton_signals`; no duplication of full Monitor screen; stub-able if Monitor ships later |
| Conviction in zero/empty state | Competing products feel broken with empty states; Hamilton's empty state should say "We are still building your profile — here is what the national index says about your peer segment" — maintains authority even before setup | LOW | Design and copy only, not engineering; high leverage at low cost |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full fee index table on Home | Bank analysts want all data at a glance | Home becomes a dashboard, not a briefing — kills the authority signal; Gartner research shows executive dashboards fail when they show everything | Link from Home to Analyze; show one key stat in hero card only |
| Chat input on Home | Users assume they can ask Hamilton anything anywhere | Blurs the screen boundary that makes each screen authoritative; Home's job is orientation not exploration | Floating chat belongs on Monitor (Screen 5); link from Home to Analyze for exploration |
| Notification bell / unread-count inbox | Familiar from consumer SaaS | Creates anxiety-loop psychology rather than authority; banking executives do not engage with badge counts | Priority Alerts as an information section, not a notification inbox |
| Auto-refresh / live data stream | Real-time feels premium | Fee data is batch/quarterly; live refresh of rarely-changing data creates false urgency and damages trust when nothing updates | "Last updated" timestamp; manual refresh on demand only |

---

## Screen 2: Analyze

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Analysis focus tabs (Pricing / Risk / Peer Position / Trend) | Every premium analytics product (Bloomberg functions, Palantir Workshop) organizes analysis by mode — free-form chat without focus modes produces inconsistent quality | MEDIUM | 4 tabs pre-load Hamilton with screen-appropriate context; tab selection must change the system prompt framing |
| Hamilton's View verdict block at top | Consulting reports lead with the "so what" before evidence; this is the primary UX expectation in any AI-assisted research tool | LOW | Copy rule defined: "Hamilton's View" label; revenue-first; 150-200 words; already enforced by Voice v3.1 |
| Evidence section with data references | Analysts need to trace claims to data; Bloomberg cites source functions, Rogo cites filings — any premium research product provides citation | MEDIUM | Pulls from queryNationalData tool; must cite specific fee categories and percentiles, not vague aggregates |
| "Explore Further" suggested prompts | Rogo and Klue both use pre-built follow-on prompts to guide analysts deeper without requiring them to write queries | LOW | 3-4 suggestions per response; context-aware (changes based on analysis focus); reduces blank-cursor abandonment |
| Saved analyses list | B2B intelligence products must persist work sessions; Klue battlecards, Palantir Vertex scenarios all save state | MEDIUM | Writes to `hamilton_saved_analyses`; list view in sidebar or accessible modal |
| Analysis title / naming | Users returning to saved work need to find specific analyses; unnamed sessions are inaccessible history | LOW | Auto-generated title from first prompt; user can rename; visible in list view |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Peer distribution histogram | Showing where the institution sits on the full distribution (not just vs. median) is more powerful than a number; Curinos surfaces this as its core value prop | HIGH | Recharts dual-overlay histogram (segment blue, national gray); already built in Market Explorer — component reuse |
| "When did we become an outlier?" temporal framing | Most platforms show current state; pulling fee_change_events to show the drift over time is a differentiator no direct competitor offers | HIGH | Depends on fee_change_events data density; flag as needing data coverage validation before shipping |
| Risk driver framing in Pricing analysis | Connects fee outlier position to CFPB complaint trends and Beige Book commentary — nobody else connects pricing analysis to regulatory risk in the same screen | HIGH | Requires queryRegulatoryRisk tool output woven into analysis text; already in v7.0 toolset |
| Screen boundary enforcement | Analyze explores, does not decide — competing AI chat products blur this boundary and produce inconsistent outputs that undermine user trust | LOW | Enforced by system prompt rules in screen-specs; no recommendation language in Analyze responses |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Fee recommendation or "suggested price" in Analyze | Users ask "what should I charge?" | Analyze's job is understanding, not deciding — mixing recommendation here undermines Simulate's authority and the product's clear mental model | CTA: "Simulate a Change" sends them to Screen 3 with fee category pre-loaded |
| Board-ready export from Analyze | Seems like a productivity win | Promotes shallow, unexplored analysis as output-ready; report quality requires the Simulate tradeoff step first | Report screen only exports; Analyze can save, not export to PDF |
| Unlimited persistent chat history | More data = more value (user assumption) | Long chat logs increase cognitive load; analysts lose context of what was the "definitive" finding vs. exploration tangent | Save specific analyses as named artifacts; conversations are session-scoped |
| Competitor fee data scan in Analyze | Interesting but adjacent | Diffuses focus; the job of Analyze is understanding the user's own position, not a competitive scan | Competitive intelligence is a separate Hamilton skill; separate entry point |

---

## Screen 3: Simulate

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Current vs. Proposed side-by-side | Every pricing decision tool (Curinos Optimizer, Simon-Kucher models) shows before/after state — no pricing tool ships without this | MEDIUM | Strong visual contrast required per screen-specs; percentile shifts must be immediately visible |
| Fee input or slider | Tangible interaction is expected in any scenario tool; Palantir Vertex, financial planning tools all use it | LOW | Slider with discrete steps (e.g. $1 increments) + numeric input for precision; slider drives the real-time update |
| Live percentile position update | Users expect immediate feedback as they move the slider; Palantir Vertex updates scenario outputs on interaction | MEDIUM | Client-side computation against pre-fetched peer distribution data; no round-trip to server per slider move |
| Recommendation with rationale | Simulate is the only screen that "owns" a recommendation — the absence of a recommendation makes the screen a visualization, not a decision tool | MEDIUM | Hamilton generates recommendation based on percentile target, risk profile, and tradeoff state |
| Strategic Tradeoffs section | McKinsey reports always surface "what you give up" — expected in any consulting-grade pricing analysis | MEDIUM | Tradeoff pairs: revenue lift vs. complaint risk; peer alignment vs. competitive differentiation |
| Generate Board Scenario Summary CTA | Primary exit from Simulate must be shareable; bankers making pricing recommendations need a committee artifact | LOW | Triggers Report generation pre-filled with Simulate output; primary CTA per spec |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Recommended Position with defensible range | Not just "raise it" but "the defensible range is $X-$Y, with $Z as the strategic sweet spot" — specific, range-bounded, board-ready language | HIGH | Hamilton generates range based on peer distribution + regulatory risk context; draws on all 12 data sources from v7.0 |
| Risk profile indicator for proposed fee | Shows composite regulatory + complaint risk posture for the proposed fee — unique because it connects pricing to regulatory surveillance in real time | HIGH | Feeds from queryRegulatoryRisk output; requires real signal data behind it; validate data coverage before shipping |
| Horizon framing (12-month / 24-month impact) | Most tools show point-in-time; Hamilton can frame the simulation in a planning horizon — "at current trend, this position will become an outlier in 18 months" | MEDIUM | Changes framing of recommendation; v1.x addition after core simulation validates |
| Scenario archive with compare | Saving multiple scenarios and comparing them is a pattern Palantir Foundry uses to build analytical discipline; shows how the institution's thinking evolved | HIGH | Writes to `hamilton_scenarios`; compare UI requires at least 3 scenarios to be meaningful; v1.x |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Broad exploratory chat in Simulate | "Ask Hamilton anything about this fee" | Simulate's job is decision-making with specific inputs; open chat in Simulate creates scope creep and weakens the recommendation's authority | Analyze screen handles exploration; "Explore Further" links back to Analyze from Simulate |
| Multiple fee categories simultaneously (v1) | Power users want to model a full repricing | Tradeoffs multiply non-linearly across categories; Hamilton cannot produce a reliable recommendation across 10 categories at once for v1 | Single-category simulation for v1; multi-category scenario bundle deferred to v2 |
| External benchmark import (CSV upload) | CFOs want to use their own data | Scope explosion; data validation, normalization, and liability issues outweigh benefit | Pre-loaded peer set configuration in Settings provides the right benchmark context |
| Real-time peer alerting during simulation | "Show me if a peer moves this week" | Simulation is a point-in-time model; real-time alerts during a decision session create distraction rather than clarity | Monitor screen handles ongoing surveillance; Simulate uses latest index snapshot |

---

## Screen 4: Report Builder

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Template selection (Quarterly Strategy / Peer Brief / Monthly Pulse / State Index) | Every B2B report platform offers templates; no executive will build a report from scratch; Looker, Power BI, Klue all template-first | MEDIUM | 4 named templates matching existing Hamilton skills; each has a distinct section structure |
| Read-only report view | Report is for communication, not exploration — screen boundary is hard and expected | LOW | No sliders, no chat input, no edit widgets on the report surface; clean reading layout |
| PDF export | Table stakes for any board-facing product since v4.x; bank executives share in PDF | MEDIUM | Headless Chrome / Puppeteer via API route, or WeasyPrint in Python; static SVG charts for print fidelity; McKinsey editorial layout |
| Executive Summary section (first) | First page of any consulting report is a summary; bank executives read this and nothing else unless compelled | LOW | Auto-generated from Simulate recommendation or latest Hamilton thesis; one page max |
| Recommended Position section | Report is the "clean read" version of Simulate output — this section carries the recommendation forward | LOW | Pulled from linked scenario or current thesis; read-only; verbatim from Simulate if scenario-linked |
| Implementation Notes | McKinsey reports include "how to operationalize this" — expected in any strategy-grade output | MEDIUM | Short bullets; Hamilton generates based on fee category and regulatory context |
| Configuration sidebar before generation | Users need to scope the report (peer set, time range, fee categories) — "generate and pray" is not acceptable for board output | MEDIUM | Pre-flight config controls that set the context payload sent to Hamilton |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Scenario-linked report | When a Report is generated from a Simulate run, it carries the scenario's tradeoff analysis and recommended range — creating a chain of evidence from data to recommendation | MEDIUM | `hamilton_reports.scenario_id` FK; reads `result_json` from linked scenario; the highest-value report path |
| Salesforce Connected FINS-style visual hierarchy | Most B2B reports are data dumps with headers; the design differentiator is numbered chapter structure, bold stat callouts, generous whitespace | HIGH | CSS print stylesheet + page layout component; highest design investment of any screen; reference: Connected-FINS_Report_Final.pdf |
| Export tracking with timestamp | `exported_at` timestamp lets users know when they last shared a report — signals accountability and follow-through for board cycles | LOW | Database field already in `hamilton_reports`; display only |
| Coverage disclosure in report body | A report on "community banks in Montana" with 47% coverage should say so — builds trust through honesty rather than hiding data gaps | LOW | Surface institution count and coverage percentage in report scope section |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| In-report editing / rich text editor | Executives want to customize before sending | Turns a precision-generated report into a manual writing task; degrades the "McKinsey-grade output" brand promise | Generate → Export → Edit in Word if needed; report should be good enough to not need edits |
| Drag-and-drop section reordering | Power users want layout control | Undermines editorial structure that makes reports feel authoritative; section order is a design decision not a user preference | 4 opinionated templates; not a blank canvas |
| Unlimited custom templates | Enterprise users will ask for this | Template sprawl makes quality control impossible; each new template requires editorial review | 4 templates, each polished; add 5th only with full design review in a future milestone |
| Interactive charts in PDF | Looks impressive in demos | PDF charts must be static; interactive chart libraries produce blurry rasters when printed — a known failure mode across BI tools | Static SVG or server-rendered chart images for PDF; interactive charts only in Analyze/Simulate screens |

---

## Screen 5: Monitor

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Signal Feed | Every intelligence product (Klue, 6sense, Bloomberg news alerts) has a feed of notable events; absence signals the product is not "watching" | MEDIUM | Reads from `hamilton_signals`; each signal has type, severity, title, body — not raw log lines |
| Priority Alert (promoted signal hero) | The top signal must stand apart from the feed; Klue "Win/Loss alerts", Bloomberg "top stories" both have a hero alert pattern | LOW | Reads from `hamilton_priority_alerts`; single hero card above the feed; severity-coded |
| Watchlist configuration | Users must be able to define what they are watching — competitors, regulatory changes, specific fee categories | MEDIUM | Reads/writes `hamilton_watchlists`; fee_categories and institution_ids as JSONB |
| Status strip showing surveillance activity | A lightweight header showing "Hamilton is watching N institutions, N fee categories, last checked [date]" gives confidence the system is alive | LOW | Communicates freshness; prevents "is this even running?" doubt |
| Review Pricing / Run Scenario CTA | Monitor's job is to surface signals that prompt action; the primary exit must be into the decision workflow | LOW | "Review Pricing" → Analyze; "Run Scenario" → Simulate; per copy rules spec |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Institutional deviation detection | Signals when a competitor crosses a threshold relative to the user's position — not just "this institution changed a fee" but "this institution crossed the outlier line and now matches your rate" | HIGH | Requires comparing signal data to user's current position and peer percentiles; stateful computation; high product value |
| Signal as mini insight, not raw event | The industry failure mode (Bloomberg raw news feed, Klue raw alerts) is log-line data. Hamilton turns a signal into a 2-sentence insight: "First National raised overdraft by $5. This puts them above the 75th percentile and narrows your pricing advantage." | MEDIUM | Hamilton processes raw signals into insight format before storing in `hamilton_signals.body`; pipeline step, not a UI decision |
| Regulatory signal integration | Most competitive intelligence tools track competitor pricing; Hamilton uniquely connects pricing movements to CFPB complaint trends and Beige Book commentary | HIGH | Feeds from existing queryRegulatoryRisk and `fed_beige_book` tables; requires signal classification and severity scoring pipeline |
| Floating chat entry to Analyze | Monitor is a surveillance screen, but users will want to dive deeper; a floating "Ask Hamilton" that opens Analyze with signal context pre-injected bridges Monitor → Analyze without losing context | LOW | Floating button; opens Analyze with signal as initial prompt injection; high UX leverage for low engineering cost |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Heavy trend widget or time-series chart | Data visualization looks impressive in demos | Duplicates what Analyze/Simulate already show; adds cognitive load to a screen whose job is triage, not analysis | Sparklines only in signal cards if needed; redirect to Analyze for chart exploration |
| Real-time streaming feed | Feels like a live Bloomberg terminal | Fee data is batch/quarterly; streaming a rarely-updating feed creates false urgency and notification fatigue — the primary failure mode in B2B surveillance products | Batch refresh (daily); explicit "checked [time] ago" indicator; never pretend data is real-time |
| Email / Slack notification system (v1) | Enterprise customers always ask for this | Significant infrastructure scope: webhook management, email deliverability, unsubscribe flows, suppression lists — adds 2+ weeks minimum and creates ongoing operational burden | Build in-app signal feed first; add outbound notifications in v1.x when usage patterns are understood |
| Full dashboard duplication from Admin | Admin dashboard is thorough; why not reuse panels? | Monitor and Admin Dashboard serve different mental models (surveillance vs. operations); duplicating panels creates maintenance burden and confuses navigation | Monitor reads from `hamilton_signals`; Admin dashboard reads from crawler ops tables — separate data, separate purpose |

---

## Settings Page

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Institution profile (name, charter type, asset tier) | Every B2B platform requires institution context to personalize intelligence; without this, no screen is personalized | LOW | Single form; seeds the context payload for all Hamilton screens; hard dependency for launch |
| Peer set configuration | The core B2B value proposition is peer benchmarking; users must define their peer universe | MEDIUM | Reads/writes peer_sets table; multi-select of tiers, districts, charter type |
| Feature access / subscription status | Users need to know what they have access to and how to upgrade | LOW | Read-only subscription tier view with Stripe portal link for billing management |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Hamilton personality or tone configuration | Some platforms let users configure AI behavior | Undermines Hamilton brand voice consistency that makes reports authoritative; "customizable AI" cheapens the product | Fixed voice by role (consumer/pro/admin) already differentiated in v7.0 |
| Raw data export / download in Settings | Analysts want the underlying data | Data commodity play undercuts the intelligence premium; giving raw data without analysis is not the product | Report export (PDF) is the data exit; raw API access is an Enterprise-tier feature, not a Settings toggle |

---

## Feature Dependencies

```
Institution Profile (Settings)
    └──required by──> Home briefing personalization
    └──required by──> Analyze peer context injection
    └──required by──> Simulate peer distribution + percentile
    └──required by──> Report header / scope
    └──required by──> Monitor watchlist defaults

Peer Set (Settings)
    └──required by──> All 5 screens for peer-filtered data

hamilton_signals pipeline (Monitor data layer)
    └──feeds──> Monitor Signal Feed
    └──feeds──> Home Monitor Feed preview strip
    └──feeds──> Priority Alert on Home and Monitor

hamilton_scenarios (Simulate persistence)
    └──required by──> Report Builder scenario-linked generation
    └──enhances──> Monitor (show active scenario in context strip)

Analyze (exploration screen)
    └──feeds context into──> Simulate (fee category pre-loaded via CTA)

Simulate (decision screen)
    └──feeds into──> Report Builder (scenario-linked generation)

hamilton_saved_analyses (Analyze persistence)
    └──independent of──> Scenarios and Reports (separate artifact type)
```

### Dependency Notes

- **Settings must ship before any personalized screen is usable.** Institution profile and peer set are hard blockers for Home briefing, Simulate peer distribution, and Monitor watchlist baseline. Settings ships first or alongside Home.
- **Simulate must exist before Report has its highest-value path.** A scenario-linked report is significantly more compelling than a thesis-only report. Home → Simulate → Report is the primary demo flow; this ordering must hold in the build sequence.
- **Monitor signal pipeline must be seeded before Monitor screen has value.** An empty signal feed is the worst first impression for a surveillance product. Seed signals from existing queryRegulatoryRisk and fee change history before shipping Monitor.
- **Home Monitor Feed preview is stub-able.** If Monitor ships in a later phase, the Home preview strip can show a placeholder ("Hamilton is monitoring your market — signals coming soon") without blocking Home launch.

---

## MVP Definition

### Launch With (v1 — v8.0 milestone)

- [ ] Settings — institution profile + peer set configuration — hard dependency for all personalized screens
- [ ] Home / Briefing — thesis, what changed, priority alerts, Simulate CTA — the primary demo hook and renewal driver
- [ ] Analyze — 4 focus tabs, Hamilton's View, evidence, explore further, saved analyses — replaces current /pro/research chat
- [ ] Simulate — current vs. proposed, percentile shift, tradeoffs, recommendation, Board Summary CTA
- [ ] Report Builder — 4 templates, configuration sidebar, PDF export, Executive Summary + Recommendation
- [ ] Monitor — signal feed, priority alert, watchlist configuration, status strip (signals seeded from existing data sources)

### Add After Validation (v1.x)

- [ ] Scenario archive with compare — add when users have run at least 3 scenarios; compare UI requires saved scenarios to be meaningful
- [ ] Horizon selector in Simulate (12-month / 24-month) — add when users ask "what about the future?" in post-launch feedback
- [ ] Outbound signals (email / Slack) — add once in-app feed proves signal quality warrants pushing
- [ ] "When did we become an outlier?" temporal analysis — depends on fee_change_events data density; add when re-crawl history is sufficient

### Future Consideration (v2+)

- [ ] Multi-category simulation — wait for single-category simulation to be validated before multiplying complexity
- [ ] Competitor trajectory intelligence (who moved first, competitor timelines) — adjacent product, not core decision support
- [ ] External benchmark CSV import — significant validation and liability surface; justify with enterprise deal requirement

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Settings — institution profile + peer set | HIGH | LOW | P1 |
| Home — thesis + what changed + priority alerts | HIGH | MEDIUM | P1 |
| Home — Simulate Change CTA (pre-loaded) | HIGH | LOW | P1 |
| Analyze — focus tabs + Hamilton's View | HIGH | MEDIUM | P1 |
| Analyze — saved analyses | MEDIUM | MEDIUM | P1 |
| Simulate — current vs. proposed + live percentile | HIGH | MEDIUM | P1 |
| Simulate — tradeoffs + recommendation | HIGH | HIGH | P1 |
| Report — 4 templates + PDF export | HIGH | HIGH | P1 |
| Monitor — signal feed + priority alert | HIGH | MEDIUM | P1 |
| Monitor — watchlist configuration | MEDIUM | MEDIUM | P1 |
| Peer distribution histogram in Analyze | HIGH | MEDIUM | P2 |
| Risk driver framing in Analyze | HIGH | HIGH | P2 |
| Regulatory signal integration in Monitor | HIGH | HIGH | P2 |
| Monitor — floating chat entry to Analyze | MEDIUM | LOW | P2 |
| Scenario archive + compare in Simulate | MEDIUM | HIGH | P2 |
| Horizon selector in Simulate | MEDIUM | MEDIUM | P2 |
| Outbound signal notifications | MEDIUM | HIGH | P3 |
| Multi-category simulation | HIGH | HIGH | P3 |
| Temporal outlier trajectory analysis | MEDIUM | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | Curinos Deposit Optimizer | Klue / Competitive Intel | Rogo AI | Hamilton Pro Approach |
|---------|--------------------------|--------------------------|---------|----------------------|
| Daily briefing / digest | Not offered; analysis-first entry | Daily digest email; in-app feed | Not offered; chat-first | Single thesis screen with recommended action; no email digest in v1 |
| Peer benchmarking | Core feature; percentile vs. $5T account dataset | Not applicable (sales intel) | Not applicable (financial research) | Peer set driven by user configuration; 4,000+ institution dataset |
| Scenario / what-if modeling | Sensitivity analysis and what-if scenarios | Not offered | Not offered | Slider-driven with live percentile + risk profile update; recommendation engine |
| Report export | Not prominently featured | Battlecard + newsletter export | Slide / PPT generation focus | PDF with Salesforce Connected FINS-style layout; scenario-linked |
| Surveillance / monitoring | Rate change alerts | Competitor web change monitoring | Not offered | Signal feed with regulatory + fee movement correlation; insight-not-log-line format |
| AI narrative voice | Data-focused; minimal narrative | AI curator for battlecards | Chat-first analyst; strong narrative | Hamilton persona with thesis, tension, revenue-first voice; screen-boundary rules prevent mode confusion |
| Screen / mode boundaries | N/A — single-purpose tool | N/A — linear workflow | Chat blurs all modes into one surface | Explicit screen boundary rules: Analyze explores, Simulate decides, Report communicates |

---

## Sources

- Hamilton Design Package: `03-screen-specs.md`, `09-copy-and-ux-rules.md`, `10-demo-flow-and-pricing-notes.md`, `01-product-architecture.md`, `05-data-model-and-persistence.md` (HIGH confidence — authoritative project spec)
- Curinos Deposit Optimizer: [Deposit Optimizer Essentials](https://curinos.com/deposit-optimizer-essentials/bank-pricing-strategy/) (MEDIUM confidence — feature descriptions from product page)
- Bloomberg Terminal UX patterns: [How Bloomberg Terminal UX designers conceal complexity](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/) (MEDIUM confidence)
- Palantir Foundry scenario modeling: [Palantir Foundry Platform](https://www.palantir.com/platforms/foundry/) (MEDIUM confidence)
- Klue competitive intelligence platform: [Klue Platform](https://klue.com/competitive-intelligence-platform) (MEDIUM confidence)
- Rogo AI financial research workflow: [Rogo Product](https://rogo.ai/product), [OpenAI Rogo case study](https://openai.com/index/rogo/) (MEDIUM confidence)
- B2B SaaS UX patterns 2025: [B2B SaaS UX Design 2026](https://www.onething.design/post/b2b-saas-ux-design) (LOW-MEDIUM confidence — general patterns, not product-specific)
- Notification design: [Design Guidelines For Better Notifications UX — Smashing Magazine](https://www.smashingmagazine.com/2025/07/design-guidelines-better-notifications-ux/) (MEDIUM confidence)
- Decision intelligence market context: [Domo — Decision Intelligence Platforms 2025](https://www.domo.com/learn/article/decision-intelligence-platforms) (LOW confidence — market sizing only)
- B2B dashboard design: [6 steps to design thoughtful B2B SaaS dashboards](https://uxdesign.cc/design-thoughtful-dashboards-for-b2b-saas-ff484385960d) (MEDIUM confidence)

---
*Feature research for: Hamilton Pro Platform — v8.0 5-screen decision system*
*Researched: 2026-04-08*
*Supersedes: prior FEATURES.md (v6.0 Two-Sided Experience)*
