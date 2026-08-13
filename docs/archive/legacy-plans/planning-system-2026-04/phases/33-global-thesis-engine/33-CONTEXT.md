# Phase 33: Global Thesis Engine - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the `generateGlobalThesis()` function that analyzes a condensed data summary and produces a structured thesis (core argument, key tensions, revenue model, competitive dynamics, contrarian insight) plus a 150-word narrative. This thesis gets injected into every subsequent section generation call. Also implement think-then-compress reasoning and tension-framed insight structure. Foundation for all v7.0 phases.

</domain>

<decisions>
## Implementation Decisions

### Thesis data payload
- **D-01:** Two-tier approach. Thesis generator receives a condensed summary payload (~5KB): top 10 fee categories, revenue trend (latest + YoY), FRED snapshot (4 indicators), Beige Book theme summary, top 3 derived analytics tensions. Section generator receives the full payload + thesis output.
- **D-02:** Build a `buildThesisSummary(payload: NationalQuarterlyPayload): ThesisSummaryPayload` function that condenses the full assembler output into the thesis input.

### Thesis output shape
- **D-03:** Hybrid — structured JSON fields PLUS a 150-word narrative summary. JSON shape:
```
{
  core_thesis: string,           // 1-2 sentences
  tensions: Array<{
    force_a: string,
    force_b: string,
    implication: string
  }>,                            // 3-5 tensions
  revenue_model: string,         // 2-3 sentences on revenue dynamics
  competitive_dynamic: string,   // 2-3 sentences on bank vs CU or tier dynamics
  contrarian_insight: string,    // 1 non-obvious finding
  narrative_summary: string      // 150-word flowing summary injected into sections
}
```
- **D-04:** The `narrative_summary` field is injected into every section's context so Hamilton naturally weaves the global argument into each section without forced references.

### Think-then-compress
- **D-05:** Prompt instruction + higher MAX_TOKENS. Raise from 500 to 1500. Tell Hamilton "reason through 5-8 sentences internally, output only the 2-3 most decisive." Trust the model to self-edit. No two-pass generation.
- **D-06:** Remove the 75-word hard limit from `formatContext()` in `generate.ts`. Replace with 150-200 word budget instruction in the voice prompt.

### Thesis per report type
- **D-07:** Every report type gets a thesis tailored to its scope:
  - Quarterly → national thesis from full data
  - Monthly pulse → "what moved this month" thesis from delta data
  - Competitive brief → "this institution's competitive position" thesis from peer data
  - State report → "this state's fee landscape" thesis from state data
- **D-08:** The thesis generator accepts a `scope` parameter that adapts the prompt and expected output depth. Quarterly gets the full treatment. Pulse and briefs get a lighter thesis (core_thesis + 1-2 tensions, no contrarian insight).

### Revenue prioritization
- **D-09:** Add system-level rule to voice prompt: "If revenue implications exist in the data, your first substantive claim must address revenue, not pricing. Pricing is evidence; revenue is the insight."

### Tension model
- **D-10:** Add instruction to thesis and section prompts: "Frame every key insight as a tension between two competing forces or between expectation and reality. 'Pricing converges while revenue diverges' not 'Fees are clustered.'"

### Claude's Discretion
- Exact prompt wording for thesis generation
- Which specific data fields go into the condensed summary
- How to handle reports where some data sources are empty (graceful degradation)
- Whether to use `claude-sonnet` or `claude-opus` for thesis generation (quality vs cost)

</decisions>

<specifics>
## Specific Ideas

- The thesis should feel like the opening paragraph of a McKinsey engagement letter — decisive, specific to this quarter's data, not generic
- Tensions should be genuine oppositions found in the data, not manufactured drama
- The contrarian insight should be something the reader doesn't expect — "despite X, actually Y"
- Revenue prioritization means: when Hamilton has both "$30 median overdraft" and "$778M in service charge income declining 3.6% YoY", the revenue number leads

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Hamilton core
- `src/lib/hamilton/generate.ts` — Current `generateSection()` function. Thesis generator goes here.
- `src/lib/hamilton/voice.ts` — Hamilton voice v2 prompt. 75-word limit and 3-sentence max to be loosened.
- `src/lib/hamilton/types.ts` — `SectionInput`, `SectionOutput` interfaces. New `ThesisInput`, `ThesisOutput` types go here.
- `src/lib/hamilton/index.ts` — Hamilton exports.

### Report orchestration
- `src/lib/report-engine/assemble-and-render.ts` — Orchestrator that calls `generateSection()` 6x for quarterly. Must be updated to call `generateGlobalThesis()` first, then pass thesis to each section.
- `src/lib/report-assemblers/national-quarterly.ts` — Assembles `NationalQuarterlyPayload`. The `buildThesisSummary()` function reads from this payload.

### Master spec
- `docs/specs/hamilton-v2-master-spec.md` — Full vision document for Hamilton V2.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `generateSection()` in generate.ts — pattern for calling Claude with system prompt + user message + data payload
- `HAMILTON_VOICE` in voice.ts — voice rules, forbidden terms, tone definition
- `NationalQuarterlyPayload` — already contains all the data the thesis needs (fees, revenue, FRED, Beige Book, derived analytics)
- Anthropic SDK already configured with API key handling and timeout

### Established Patterns
- System prompt from `HAMILTON_VOICE.systemPrompt`
- User message built with `SECTION TYPE`, `CONTEXT`, `DATA` structure
- JSON.stringify for data payload injection
- Response parsed from `response.content[0].text`

### Integration Points
- `assemble-and-render.ts` line ~146 — where `generateSection()` calls begin. Insert `generateGlobalThesis()` before this block.
- `formatContext()` in generate.ts line ~18 — where the 75-word hard limit is enforced. Remove or raise.
- `MAX_TOKENS` constant in generate.ts line ~11 — raise from 500 to 1500.

</code_context>

<deferred>
## Deferred Ideas

- Thesis caching (store thesis in DB for the quarter, don't regenerate per report) — future optimization
- Thesis comparison across quarters ("last quarter's thesis was X, this quarter shifted to Y") — v8.0 signal layer
- Interactive thesis editing (admin reviews and adjusts thesis before sections generate) — future enhancement

</deferred>

---

*Phase: 33-global-thesis-engine*
*Context gathered: 2026-04-08*
