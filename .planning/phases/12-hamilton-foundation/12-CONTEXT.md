# Phase 12: Hamilton Foundation - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Hamilton AI analyst persona, the generateSection() API with numeric validator, the shared report template system, and a methodology paper draft. This is the foundation everything else builds on — no report can ship without these.

</domain>

<decisions>
## Implementation Decisions

### Hamilton's Voice
- **D-01:** McKinsey Partner tone — authoritative narrative with strategic implications. Not just what happened, but what it means for the reader.
- **D-02:** Subtle authority personality — "Our analysis shows..." Confident but not flashy. Occasional strong language ("notably," "warrants attention") but never casual. No first person singular.
- **D-03:** Narrative-first structure: situation → complication → key finding → recommendation → supporting data. Section titles state the conclusion ("Montana overdraft fees run 23% above national median"), not the topic ("Overdraft Fee Analysis").
- **D-04:** Hamilton voice locked in a single versioned file (`src/lib/hamilton/voice.ts`) before any template is written. All report types import from that one file. Define 5-7 concrete stylistic rules, not vague adjectives.
- **D-05:** Forbidden: casual language, first person singular, opinions without data backing, emojis, exclamation marks, hedging ("might," "could potentially").

### Report Design
- **D-06:** Use the existing consumer brand palette — NOT navy + gold. The warm editorial system is already built and appropriate for reports.
- **D-07:** Typography: Newsreader (serif) for headings and pull quotes, Geist Sans for body text, Geist Mono with tabular-nums for data.
- **D-08:** Color palette: `#1A1815` warm black text, `#FDFBF8` cream backgrounds, `#C44B2E` terracotta accent, `#E8DFD1` warm borders, `#F5EFE6` warm gray sections.
- **D-09:** Magazine editorial layout — large typography, hero charts, pull quotes, generous whitespace. HBR/Economist special report style.
- **D-10:** Existing `.prose-hub` CSS classes for table styling (already defined in globals.css).

### Methodology Paper
- **D-11:** Bank executive audience — accessible, 5-8 pages. "Here's how we collect and verify data." Enough to trust the numbers, not enough to replicate.
- **D-12:** Focus areas: data sources (FDIC/NCUA APIs, web crawling), coverage metrics, fee categorization (49 categories), confidence scoring, validation process, limitations.
- **D-13:** Draft in Phase 12, publish at public URL in Phase 16.

### Template Architecture
- **D-14:** Rigid structure — every report of a given type looks identical. Same sections in same order. Brand consistency builds recognition. Hamilton fills narrative slots in a fixed layout.
- **D-15:** Each report type gets its own template file. Templates are pure functions: `(data, narratives) => HTML`. No AI calls inside templates.
- **D-16:** Shared base layout components: cover page, section header, data table, chart container, footnote, Hamilton narrative block. But composed rigidly per report type, not mix-and-match.

### Numeric Validator
- **D-17:** Post-generation validator cross-checks every number in Hamilton's output against the source data JSON. Zero tolerance for invented statistics.
- **D-18:** Hamilton receives typed JSON and is prompted "use only the figures provided below." Validator confirms compliance before any report is finalized.

### Claude's Discretion
- Exact stylistic rules for voice.ts (the 5-7 rules)
- generateSection() API design (TypeScript function signature, input/output types)
- Numeric validator implementation approach
- Methodology paper section structure

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Brand System
- `src/app/globals.css` — Consumer brand palette (lines 426-578), `.prose-hub` styles (564-572), `.consumer-brand` class
- `src/app/layout.tsx` — Newsreader + Geist Sans + Geist Mono font setup
- `src/components/customer-nav.tsx` — Consumer nav using Newsreader serif

### Existing Report Infrastructure
- `src/lib/brief-generator.ts` — Existing HTML brief generator (foundation to build on)
- `src/app/pro/brief/route.ts` — Existing brief API route

### Research
- `.planning/research/STACK.md` — Playwright PDF, Claude Sonnet for Hamilton
- `.planning/research/ARCHITECTURE.md` — Hamilton as separate src/lib/hamilton/ module
- `.planning/research/PITFALLS.md` — Hallucination prevention, voice drift, narrative-first structure

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `brief-generator.ts` — already produces HTML strings server-side, foundation for PDF pipeline
- Consumer brand CSS — warm palette, Newsreader headings, `.prose-hub` table styles all ready
- Geist font family already loaded with mono variant for tabular data

### Established Patterns
- `.consumer-brand` wrapper class applies warm palette overrides
- `.prose-hub` class provides table/heading styling for generated content
- `tabular-nums` class wired to Geist Mono for data display

### Integration Points
- `src/lib/hamilton/` — new module for persona, generateSection(), validator
- Templates will produce HTML consumed by Playwright PDF renderer (Phase 13)
- Methodology paper will be a Next.js page (draft) then published (Phase 16)

</code_context>

<specifics>
## Specific Ideas

- Hamilton's voice should feel like reading a McKinsey partner's internal memo — confident, data-backed, strategic, never academic
- Reports should look like they belong in the same visual family as the consumer site — warm, editorial, premium
- The methodology paper is a sales tool disguised as transparency — it should make a bank executive say "these people are serious"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-hamilton-foundation*
*Context gathered: 2026-04-06*
