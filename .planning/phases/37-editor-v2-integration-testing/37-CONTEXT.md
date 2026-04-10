# Phase 37: Editor v2 + Integration Testing - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade the editor to validate thesis alignment, revenue prioritization, and implication presence across all sections. Run a full integration test to confirm the v7.0 quality bar is met end-to-end. This is the milestone's integration gate.

</domain>

<decisions>
## Implementation Decisions

### Editor v2 checks
- **D-01:** Add three new validation checks to the editor system prompt:
  1. **Thesis alignment** (VOICE-02): Does each section's argument support or connect to the global thesis? Flag sections that contradict or ignore it. Severity: major.
  2. **Revenue prioritization** (VOICE-03): When a section's data contains revenue figures, does the first substantive claim address revenue? Flag sections where pricing leads and revenue is buried. Severity: minor (warning, not block).
  3. **"So what?" check** (VOICE-04): Does every section end with an implication for the reader's decisions? Flag sections that end in data description with no actionable takeaway. Severity: minor.

- **D-02:** Editor receives the global thesis (core_thesis + tensions) alongside the sections, so it can evaluate alignment. The thesis is passed as additional context in the editor's user message.

- **D-03:** Existing checks (unsupported claims, voice drift, forbidden phrases) remain unchanged. New checks are additive.

### Integration test
- **D-04:** Run a real quarterly report generation end-to-end (assembler → thesis → sections → editor) using live production data. Not mock data — the test proves the full pipeline works.
- **D-05:** Success criteria: editor returns zero major flags. Minor flags acceptable but logged. Output word count per section falls in 150-200 range. Global thesis is non-empty and structurally valid.

### Claude's Discretion
- Exact prompt wording for the three new checks
- Whether to restructure the editor JSON schema or add new flag types
- Integration test implementation (vitest with real API call vs manual trigger + inspection)

</decisions>

<canonical_refs>
## Canonical References

- `src/lib/report-engine/editor.ts` — Current editor with EDITOR_SYSTEM_PROMPT
- `src/lib/report-engine/assemble-and-render.ts` — Orchestrator that calls editor after sections
- `src/lib/hamilton/generate.ts` — generateGlobalThesis() (thesis output to pass to editor)
- `src/lib/hamilton/voice.ts` — v3.1.0 rules (editor validates against these)

</canonical_refs>

<code_context>
## Existing Code Insights

### Current editor
- `EDITOR_SYSTEM_PROMPT` checks: unsupported claims (major), voice drift (minor), forbidden phrases (minor)
- Returns `EditorReviewResult { flaggedSections[], reviewNote }`
- Uses Haiku model for cost efficiency
- Called after all sections generated, before report finalization

### What changes
- Editor prompt gets 3 new check types + thesis context
- `buildUserMessage()` must include the global thesis alongside sections
- Integration test as a new test file

</code_context>

<deferred>
## Deferred Ideas

None — this is the milestone's final integration gate.

</deferred>

---

*Phase: 37-editor-v2-integration-testing*
*Context gathered: 2026-04-08*
