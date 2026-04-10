# Phase 34: Voice v3 + Section Generator v2 - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify and tune the voice v3 + section generator changes already built in Phase 33. Ensure sections actually receive cross-source context, reference FRED/Beige Book/CFPB when relevant, and produce 150-200 word output. This is a verification + tuning phase, not a greenfield build.

</domain>

<decisions>
## Implementation Decisions

### Phase 33 already delivered
- **D-01:** Voice v3 (revenue-first, tension model, think-then-compress) — already in voice.ts v3.0.0
- **D-02:** MAX_TOKENS raised to 1500, 75-word limit removed — already done in generate.ts
- **D-03:** Global thesis narrative_summary injected into all section contexts — already wired in assemble-and-render.ts

### What this phase adds
- **D-04:** Audit each of the 6 national quarterly section calls to verify they receive cross-source context (not just narrative_summary string but also structured data from FRED, Beige Book, Call Reports in their `data` payload)
- **D-05:** Add FRED snapshot + Beige Book themes + CFPB summary to each section's `data` payload where relevant (not all sections need all sources — executive_summary gets everything, fee_differentiation gets just fee data)
- **D-06:** Add prompt instruction to section generation: "When your DATA block contains FRED indicators, Beige Book themes, or CFPB complaint data, you MUST reference at least one in your analysis."
- **D-07:** Validate output length — run a test generation and assert 150-200 word range. If model consistently overshoots or undershoots, tune the prompt.

### Claude's Discretion
- Which specific sections get which cross-source data (executive summary vs individual chapters)
- Exact prompt wording for cross-source referencing instruction
- Whether to add a post-generation word count check or trust the model

</decisions>

<canonical_refs>
## Canonical References

### Modified in Phase 33 (read before planning)
- `src/lib/hamilton/voice.ts` — Voice v3.0.0 with revenue-first + tension model
- `src/lib/hamilton/generate.ts` — generateGlobalThesis() + generateSection() with 1500 MAX_TOKENS
- `src/lib/report-engine/assemble-and-render.ts` — thesis injection before sections
- `src/lib/report-assemblers/national-quarterly.ts` — NationalQuarterlyPayload + buildThesisSummary()

### Data sources to inject into sections
- `src/lib/crawler-db/fed.ts` — getNationalEconomicSummary(), getBeigeBookThemes()
- `src/lib/crawler-db/complaints.ts` — getDistrictComplaintSummary()
- `src/lib/crawler-db/call-reports.ts` — getRevenueTrend()

</canonical_refs>

<code_context>
## Existing Code Insights

### What's already done
- Voice v3 prompt with all three rules (revenue, tension, think-then-compress)
- narrative_summary string passed to all 6 sections
- MAX_TOKENS 1500, no 75-word limit

### What's missing
- Sections currently get narrative_summary as a context string, but their `data` payloads may not include FRED/Beige Book/CFPB data objects
- No prompt instruction forces sections to reference cross-source data when available
- No output length validation

</code_context>

<deferred>
## Deferred Ideas

None — this is a focused tuning phase.

</deferred>

---

*Phase: 34-voice-v3-section-generator-v2*
*Context gathered: 2026-04-08*
