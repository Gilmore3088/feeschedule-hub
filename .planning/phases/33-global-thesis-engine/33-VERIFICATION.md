---
phase: 33-global-thesis-engine
generated: 2026-04-07
---

# Phase 33 Completion Checklist

## THESIS Requirements

| Requirement | Status | Evidence |
|-------------|--------|----------|
| THESIS-01 | COMPLETE | `src/lib/hamilton/types.ts` — `ThesisInput`, `ThesisOutput`, `ThesisSummaryPayload` interfaces defined (Plan 01) |
| THESIS-02 | COMPLETE | `src/lib/hamilton/voice.ts` — `HAMILTON_VOICE.systemPrompt` v3.0.0 with revenue-first + tension model (Plan 01) |
| THESIS-03 | COMPLETE | `src/lib/hamilton/generate.ts` — `generateGlobalThesis(input: ThesisInput): Promise<ThesisOutput>` exported; `scope` parameter adapts prompt depth (Plan 02) |
| THESIS-04 | COMPLETE | `src/lib/report-assemblers/national-quarterly.ts` — `buildThesisSummary(payload): ThesisSummaryPayload` exported; condenses full payload to ~5KB (Plan 02) |
| THESIS-05 | COMPLETE | `src/lib/report-engine/assemble-and-render.ts` — `generateGlobalThesis()` called before all 6 `generateSection()` calls; `thesisContext` injected into every section's `context` field; graceful degradation via try/catch (Plan 03) |

## Grep Evidence

```bash
# THESIS-01: types defined
grep -n "ThesisInput\|ThesisOutput\|ThesisSummaryPayload" src/lib/hamilton/types.ts
# Returns: 125, 128, 146, 148, 185, 186, 188

# THESIS-02: voice v3.0.0
grep -n "revenue-first\|tension" src/lib/hamilton/voice.ts
# Returns: voice v3.0.0 comment + tension model instructions

# THESIS-03: generateGlobalThesis exported
grep -n "export async function generateGlobalThesis" src/lib/hamilton/generate.ts
# Returns: line 183

# THESIS-04: buildThesisSummary exported
grep -n "export function buildThesisSummary" src/lib/report-assemblers/national-quarterly.ts
# Returns: line 370 (approx)

# THESIS-05: wired into orchestrator
grep -c "thesisContext" src/lib/report-engine/assemble-and-render.ts
# Returns: 7 (1 definition + 6 section uses)

grep "V3_CONTEXT" src/lib/report-engine/assemble-and-render.ts
# Returns: 0 (removed)
```
