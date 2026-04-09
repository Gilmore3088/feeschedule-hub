# Phase 38: Architecture Foundation - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the foundational type system, CSS isolation boundary, mode behavior config, and navigation contract that all 5 Hamilton Pro screens depend on. No screen UI is built in this phase — only the contracts, tokens, and isolation layers that prevent downstream rework.

</domain>

<decisions>
## Implementation Decisions

### Design System & CSS Isolation
- **D-01:** The 5 HTML prototype screenshots are the visual target. The design system implementation must match them — warm parchment palette (#fbf9f4 base), Newsreader serif headlines, Inter sans body, tonal layering (no 1px borders for sectioning), burnished gradient CTAs.
- **D-02:** CSS isolation uses `.hamilton-shell` scoping class (mirrors existing `.admin-content` pattern in globals.css). Hamilton editorial styles MUST NOT bleed into admin portal or consumer pages.
- **D-03:** Design tokens should be implemented as CSS custom properties within `.hamilton-shell` scope. Where Tailwind v4 utility classes can express the intent (e.g., stone-50), use them. Where the editorial aesthetic requires custom values (Newsreader font, parchment backgrounds, burnished gradients), add custom tokens. Elevating the core system is acceptable if it advances the product.
- **D-04:** Dark mode for Hamilton: follow the existing `.admin-content` dark mode override pattern in globals.css. Hamilton dark mode uses the same tonal layering principle but with dark parchment tones.

### Branding
- **D-05:** NO "Sovereign Intelligence" branding anywhere in code or UI. That was the design document's internal codename only.
- **D-06:** Brand hierarchy: **FeeInsight.com** (website/domain) > **Bank Fee Index** (company/data authority) > **Hamilton** (Pro feature/analyst tool). Hamilton is a premium feature within the Bank Fee Index platform, not a separate product.
- **D-07:** Hamilton nav logo says "Hamilton" — understood as the Pro tool within FeeInsight.com.
- **D-08:** Consistent label language across all screens: "Hamilton's View", "What Changed", "What This Means", "Why It Matters", "Recommended Position", "Priority Alert", "Signal Feed", "Analysis Focus" (from 09-copy-and-ux-rules.md).

### Product Architecture
- **D-09:** Hamilton's backend already exists (voice v3.1, thesis engine, 12-source intelligence, 17 tools, editor v2). This milestone is the FRONTEND revolution — giving the already-powerful backend a world-class delivery surface.
- **D-10:** The new 5-screen Hamilton UI replaces the current chat-only Hamilton experience for BOTH pro and admin users. Admin gets the same 5 screens PLUS their existing admin tools (pipeline ops, review queue, crawl monitoring) which remain separate.
- **D-11:** Hamilton reporting (quarterly, monthly pulse, state index, peer brief, category reports) IS part of the Hamilton experience and lives in the Report Builder screen (Phase 45). Admin pipeline tools are NOT part of this milestone.
- **D-12:** The bar is "award-winning $5,000/yr consulting tool." Not a dashboard, not a data dump — an experience that makes a bank executive say "this is worth every dollar."

### TypeScript Types & Mode System
- **D-13:** Screen-specific DTOs (AnalyzeResponse, SimulationResponse, ReportSummaryResponse, MonitorResponse) extend the existing `src/lib/hamilton/types.ts` file. New types are additive — do not break existing report/thesis types.
- **D-14:** `HamiltonMode` type ("home" | "analyze" | "simulate" | "report" | "monitor") and `MODE_BEHAVIOR` config are new additions. The existing `HamiltonRole` ("consumer" | "pro" | "admin") in agents.ts remains unchanged — mode and role are orthogonal.
- **D-15:** Screen ownership enforced at type level where practical: Simulate owns `recommendedPosition` field, Report owns `exportControls`, Analyze response type has no recommendation fields. Runtime validation is acceptable as fallback where compile-time enforcement is impractical.

### Navigation
- **D-16:** Hamilton top nav locked to: Home | Analyze | Simulate | Reports | Monitor | Admin. Single source of truth in a `navigation.ts` file.
- **D-17:** Navigation source file also defines left rail structure per screen and CTA hierarchy per screen (from 09-copy-and-ux-rules.md).

### Claude's Discretion
- CSS custom property naming convention (e.g., `--hamilton-surface`, `--hamilton-primary` vs `--h-surface`, `--h-primary`)
- Whether to use a separate CSS file (`hamilton.css`) or extend `globals.css` with `.hamilton-shell` block
- Exact Tailwind v4 integration approach for custom tokens (CSS variables in `@theme` layer vs inline)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design System
- `Hamilton-Design/hamilton_sovereign/DESIGN.md` — Full editorial design system spec (colors, typography, elevation, components, do's/don'ts). Ignore the "Sovereign Intelligence" naming — use "Hamilton" branding only.
- `Hamilton-Design/1-executive_home_briefing_final_polish/screen.png` — Visual target for Home screen
- `Hamilton-Design/2-ask_hamilton_deep_analysis_workspace/screen.png` — Visual target for Analyze screen
- `Hamilton-Design/3-simulation_mode_interactive_decision_terminal/screen.png` — Visual target for Simulate screen
- `Hamilton-Design/4-report_builder/screen.png` — Visual target for Report Builder screen
- `Hamilton-Design/5-monitoring_alerts/screen.png` — Visual target for Monitor screen

### Product Architecture
- `Hamilton-Design/hamilton_revamp_package/01-product-architecture.md` — Screen ownership rules, non-negotiable boundaries
- `Hamilton-Design/hamilton_revamp_package/02-navigation-and-information-architecture.md` — Nav structure, left rail, tab conventions
- `Hamilton-Design/hamilton_revamp_package/09-copy-and-ux-rules.md` — Label language, CTA rules, screen boundary rules

### API Contracts
- `Hamilton-Design/hamilton_revamp_package/06-api-and-agent-contracts.md` — Typed response interfaces per screen
- `Hamilton-Design/hamilton_revamp_package/stub/types-revamp.ts` — Starter TypeScript interfaces
- `Hamilton-Design/hamilton_revamp_package/stub/modes.ts` — Mode enum and MODE_BEHAVIOR config
- `Hamilton-Design/hamilton_revamp_package/stub/navigation.ts` — Navigation source of truth

### Existing Code
- `src/lib/hamilton/types.ts` — Current Hamilton type definitions (report sections, thesis, validation). New DTOs extend this.
- `src/lib/research/agents.ts` — Current HamiltonRole type and role-based system prompts. Mode enum is additive.
- `src/app/globals.css` — Current `.admin-content` CSS scoping pattern. `.hamilton-shell` follows the same approach.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/hamilton/types.ts` — 190-line type file with SectionType, ThesisOutput, NationalOverviewData, PeerCompetitiveData. New screen DTOs extend this naturally.
- `Hamilton-Design/hamilton_revamp_package/stub/modes.ts` — Ready-to-use HamiltonMode type and MODE_BEHAVIOR config.
- `Hamilton-Design/hamilton_revamp_package/stub/navigation.ts` — Ready-to-use HAMILTON_NAV array.
- `Hamilton-Design/hamilton_revamp_package/stub/types-revamp.ts` — Starter AnalyzeResponse, SimulationResponse, MonitorResponse interfaces.

### Established Patterns
- `.admin-content` CSS scoping in globals.css with dark mode overrides — `.hamilton-shell` follows this pattern
- `HamiltonRole` in agents.ts ("consumer" | "pro" | "admin") — mode enum is orthogonal, not replacing
- Geist font loaded via `geist` package in layout.tsx — Newsreader needs to be added (Google Fonts or local)

### Integration Points
- `src/app/globals.css` — Hamilton design tokens and `.hamilton-shell` scoping added here (or in separate file)
- `src/lib/hamilton/types.ts` — Screen DTOs added here
- `src/lib/hamilton/modes.ts` — New file for mode enum and behavior config
- `src/lib/hamilton/navigation.ts` — New file for nav source of truth

</code_context>

<specifics>
## Specific Ideas

- The 5 HTML prototype screenshots are the gold standard — implementation must visually match them
- "Award-winning $5,000/yr consulting tool" is the quality bar, not "ship a feature"
- Hamilton is a feature within FeeInsight.com/Bank Fee Index, not a standalone product
- Admin and Pro share the same Hamilton 5-screen experience; admin just has additional admin tools

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 38-architecture-foundation*
*Context gathered: 2026-04-08*
