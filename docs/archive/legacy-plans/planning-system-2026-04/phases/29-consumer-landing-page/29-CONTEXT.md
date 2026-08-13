# Phase 29: Consumer Landing Page - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the split-panel GatewayClient at `/` with a value-prop-first, minimal consumer landing page. Fee Scout search is the hero action. The page is the universal entry point for all visitors (consumer and B2B). No URL changes to existing routes.

Requirements: CLND-01, CLND-02, CLND-03, CLND-04, CLND-05, CLND-06, CLND-07, CLND-08

</domain>

<decisions>
## Implementation Decisions

### Hero Design & Messaging (CLND-02, CLND-03)
- **D-01:** Question-based headline: "What is your bank really charging you?" -- keep the current hook from consumer home. Creates curiosity, personal, direct.
- **D-02:** Fee Scout search bar (InstitutionSearchBar) embedded directly in the hero as the primary action. No auth gate -- anyone can search immediately.
- **D-03:** Subheadline or supporting text should quantify the value prop ("Compare fees across 8,000+ banks and credit unions").

### Page Sections & Flow (CLND-01, CLND-05, CLND-06)
- **D-04:** Minimal landing page with depth on click. Sections:
  1. **Hero** -- question headline + Fee Scout search bar + supporting text
  2. **Value prop cards** -- 3 cards (Find Your Fees / Compare Banks / Learn About Fees) linking to `/institutions`, `/fees`, `/guides`
  3. **Trust stats** -- institution count, observation count, data freshness, data source provenance (FDIC/NCUA)
  4. That's it. No spotlight fees table, no state grid, no bank vs CU comparison on the landing page.
- **D-05:** All detailed content lives on linked pages (consumer home `/consumer`, fees `/fees`, guides `/guides`, institutions `/institutions`). Landing page is a gateway, not a magazine.
- **D-06:** Consumer guide teasers appear as the third value prop card ("Learn About Fees") linking to `/guides`, not as a separate section with multiple guide previews.

### Visual Quality Bar (CLND-08)
- **D-07:** Typography and data carry equal weight. Newsreader serif headlines set the editorial tone. Real fee data (medians, institution counts) proves authority.
- **D-08:** Consulting-grade presentation: generous whitespace, editorial hierarchy, FT Weekend / Monocle feel. No clutter, no stock photography, no generic SaaS patterns.
- **D-09:** Trust stats should use real data from `getPublicStats()` and `getDataFreshness()` -- not hardcoded numbers.

### B2B Upgrade Path (CLND-07)
- **D-10:** No dedicated B2B section on the landing page. The page is 100% consumer-focused.
- **D-11:** "Professional" link lives in ConsumerNav (from Phase 28). Contextual upgrade prompts appear when consumers hit gated features (all 49 categories, peer builder, Hamilton).
- **D-12:** CLND-07 is satisfied by the nav link + contextual upgrade pattern, not by a page section.

### Architecture (CLND-01)
- **D-13:** Replace `gateway-client.tsx` (the "use client" split-panel) with a Server Component landing page. This fixes SEO -- the root URL gets server-rendered, indexable HTML with proper `generateMetadata()`.
- **D-14:** Keep existing `/consumer` route as-is (with its 9 sections). The landing page is a new, simpler entry point. `/consumer` becomes a secondary "explore more" destination.
- **D-15:** No changes to `(public)` route group URLs. All existing routes stay stable.

### Claude's Discretion
- Exact wording of value prop cards (Find Fees / Compare Banks / Learn -- or better alternatives)
- Whether trust stats appear as a horizontal bar, card grid, or inline with the hero
- Whether the Fee Scout search shows a dropdown preview or navigates to `/institutions?q=` on submit
- Animation/motion on the hero (staggered reveal from existing admin-fade-up, or simpler)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Pages to Replace/Reference
- `src/app/page.tsx` -- Root page metadata (keep/update generateMetadata)
- `src/app/gateway-client.tsx` -- Split-panel gateway (REPLACE with new landing)
- `src/app/consumer/page.tsx` -- Current consumer home (reference for content patterns, NOT the replacement target)

### Search Components
- `src/app/(public)/institutions/page.tsx` -- Institution search page with SearchBar
- `src/app/(public)/institutions/search-bar.tsx` -- Autocomplete search bar component (EMBED in hero)

### Data Queries
- `src/lib/crawler-db/core.ts` -- `getPublicStats()`, `getDataFreshness()` for trust signals
- `src/lib/crawler-db/fee-index.ts` -- `getNationalIndex()` if any fee data shown

### Design System
- `src/app/globals.css` -- Consumer-brand CSS (lines 427-582), shadow system, skeleton animations
- `src/app/layout.tsx` -- Root layout with Newsreader font variable

### Phase 28 Context (Carry Forward)
- `.planning/phases/28-audience-shell-separation/28-CONTEXT.md` -- ConsumerNav design decisions (editorial-style, warm palette)

### Research
- `.planning/research/FEATURES.md` -- Consumer landing page table stakes and anti-features
- `.planning/research/PITFALLS.md` -- SEO regression warnings, no URL restructuring contract

### Quality Reference
- `Reports/Connected-FINS_Report_Final.pdf` -- Salesforce Connected FINS report (visual quality benchmark)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `InstitutionSearchBar` (`institutions/search-bar.tsx`): Autocomplete component with debounce, click-outside detection. Can be extracted and embedded in hero.
- `getPublicStats()`: Returns total_observations, total_institutions, total_categories, total_states. Ready for trust signals.
- `getDataFreshness()`: Returns last_crawl_at, last_fee_extracted_at, total_observations. Ready for freshness indicator.
- Consumer home page content: 9 sections of proven content that can be referenced for messaging patterns.

### Established Patterns
- Consumer pages use `mx-auto max-w-6xl px-6 py-16 lg:py-20` spacing
- Headings: text-[1.5rem] to text-[2.5rem], tracking-[-0.02em], Newsreader serif
- Body: text-[14px] to text-[15px], leading-relaxed
- Colors: #FAF7F2 (cream bg), #1A1815 (dark text), #C44B2E (terracotta accent), #E8DFD1 (borders)
- `.consumer-brand` wrapper applies warm palette overrides

### Integration Points
- `src/app/page.tsx` -- Replace GatewayClient import with new landing component
- `src/app/gateway-client.tsx` -- Delete or archive after replacement
- ConsumerNav (from Phase 28) -- Landing page uses this nav
- SearchModal (Cmd+K) -- Keep available alongside hero search

</code_context>

<specifics>
## Specific Ideas

- The landing page must be "the best at conveying value" -- this is the entire sales funnel compressed into one scroll
- Think of it as a single-purpose page: convince a visitor to search their bank's name
- The trust stats should feel earned, not promotional -- real numbers from live data, not marketing copy
- The value prop cards should each lead to a distinct experience (lookup, comparison, education)
- Quality bar reference: Salesforce Connected FINS Report (clean editorial, bold stats, generous whitespace)

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 29-consumer-landing-page*
*Context gathered: 2026-04-07*
