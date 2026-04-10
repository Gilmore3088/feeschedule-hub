# Phase 30: Institution Educational Pages - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform institution detail pages from data tables into educational consumer experiences. Add "why does this matter?" callouts per fee category, peer percentile indicators, fee distribution charts for top fees, and B2B report links for pro users.

Requirements: INST-01, INST-02, INST-03, INST-04

</domain>

<decisions>
## Implementation Decisions

### Callout Content & Tone (INST-01)
- **D-01:** Callouts use both explanation and quantification. Lead with 1 sentence explaining what the fee is in plain language, then follow with data-driven impact using real numbers from the index ("The average overdraft fee nationally is $X. This bank charges $Y.").
- **D-02:** Callout content is curated per fee category -- not AI-generated at runtime. Each of the 49 categories gets a static explainer sentence stored in a data file or component map. The quantified portion uses live index data.
- **D-03:** Tone matches the landing page voice -- human, direct, no jargon. "Your bank charged you $35 for a $4 coffee" not "Overdraft fees represent a significant cost to consumers."

### Percentile Presentation (INST-02)
- **D-04:** Claude's discretion on whether to use a badge next to fee amount or enhance the existing PositionBar component. The key requirement: for each fee, the consumer sees something like "higher than 72% of similar banks" computed against institutions of the same charter type and asset tier.

### Distribution Chart (INST-03)
- **D-05:** Dedicated "Fee Distribution" section showing histograms for the top 3-6 fees (spotlight categories: overdraft, NSF, monthly maintenance, ATM, wire, foreign transaction). Not per-row expandable.
- **D-06:** Reuse or adapt the existing FeeHistogram component which already has bucket computation, bank/CU split, median reference line, and tooltip.
- **D-07:** Each histogram shows where THIS institution's fee sits relative to the national distribution -- institution position visually distinguished (e.g., colored marker or highlighted bucket).
- **D-08:** Consider pro-gating the distribution section or keeping it free as a conversion hook. Claude's discretion.

### B2B Links (INST-04)
- **D-09:** Pro users see both related pre-built reports (if they exist for this institution's tier/district/charter) AND action CTAs ("Generate a competitive brief" + "Ask Hamilton about this institution").
- **D-10:** Related reports query by matching the institution's asset_tier, charter_type, and fed_district against published_reports metadata.
- **D-11:** CTAs are pro-gated via UpgradeGate -- consumers see an upgrade prompt instead.

### Claude's Discretion
- Percentile indicator visual format (badge vs enhanced PositionBar)
- Whether distribution section is free or pro-gated
- Exact layout of B2B links section (sidebar vs bottom section)
- Whether callout explainers live in a JSON data file, a TypeScript map, or inline in a component
- Number of histograms shown (3 vs 6 from spotlight categories)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Institution Page
- `src/app/(public)/institution/[id]/page.tsx` -- Current institution detail page (700+ lines, has PositionBar, DeltaPill, CompetitiveScorecard, UpgradeGate)

### Chart Components
- `src/components/fee-histogram.tsx` -- Existing distribution histogram with buckets, bank/CU split, median ReferenceLine
- `src/components/breakdown-chart.tsx` -- Flexible bar chart pattern
- `src/components/public/distribution-chart.tsx` -- Simpler histogram alternative

### Data Layer
- `src/lib/crawler-db/fee-index.ts` -- getNationalIndex(), getPeerIndex(), IndexEntry with p25/p75/median
- `src/lib/crawler-db/fees.ts` -- computeStats(), computePercentile(), getFeesForCategory()
- `src/lib/crawler-db/core.ts` -- getInstitutionById(), getFeesByInstitution()
- `src/lib/crawler-db/call-reports.ts` -- getInstitutionPeerRanking() peer rank pattern

### Access Control
- `src/lib/access.ts` -- canAccessPremium(), UpgradeGate pattern
- `src/components/upgrade-gate.tsx` -- Pro gating component (compact and full modes)

### Design System
- `src/lib/fee-taxonomy.ts` -- 9 families, 49 categories, spotlight/core/extended/comprehensive tiers
- `src/app/globals.css` -- Consumer-brand CSS, warm palette tokens

### Prior Phase Context
- `.planning/phases/29-consumer-landing-page/29-CONTEXT.md` -- Consumer voice and tone decisions (humanized copy, no AI-sounding language)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PositionBar` (institution page lines 135-184): Already shows P25-P75 range with institution position. Can be extended with percentile label.
- `DeltaPill` (institution page lines 65-81): Inline badge showing delta vs median. Pattern for percentile badge.
- `FeeHistogram` (fee-histogram.tsx): Full distribution chart with buckets, bank/CU split, tooltip. Ready to adapt for institution-specific view.
- `computePercentile()` (fees.ts): Pure function for percentile computation. Can compute rank.
- `UpgradeGate` (upgrade-gate.tsx): Compact and full modes for pro-gating content.
- `CompetitiveScorecard` (institution page): Already computes competitive score from fee comparison.

### Established Patterns
- Institution page is a Server Component with client islands for interactive elements
- Pro-gated sections use `{isPro ? <Content /> : <UpgradeGate />}` pattern
- Fee data displayed via mapped arrays with DeltaPill for median comparison
- Serif headings (Newsreader) for section titles, sans-serif for data

### Integration Points
- Fee table section: add callout below each fee row or as an expandable detail
- After competitive scorecard: add distribution charts section
- After fee table: add B2B reports/Hamilton CTA section
- `getFeesForCategory()`: provides distribution data for histograms
- `getNationalIndex()`: provides percentile benchmarks

</code_context>

<specifics>
## Specific Ideas

- Callouts should feel like the consumer guides -- human voice, real dollar amounts, no hedging
- The distribution section is a visual differentiator vs NerdWallet/Bankrate -- nobody shows this level of data
- B2B CTAs should feel natural, not salesy -- "Want to see how your peer group compares?" not "Upgrade to Pro!"
- The institution page is the most important page for SEO -- every improvement drives organic traffic

</specifics>

<deferred>
## Deferred Ideas

- CFPB complaint integration on institution pages (v6.1 -- requires new API integration)
- Fee history timeline showing changes over time (v6.1 -- needs fee_change_events data)
- "Banks near you charging less" suggestion (v7+ -- geo-aware peer query)

</deferred>

---

*Phase: 30-institution-educational-pages*
*Context gathered: 2026-04-08*
