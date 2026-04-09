# Phase 43: Analyze Workspace — Research

## RESEARCH COMPLETE

**Date:** 2026-04-08
**Phase:** 43 — Analyze Workspace
**Researcher:** gsd-phase-researcher

---

## Domain Overview

Phase 43 builds the Analyze screen at `/pro/analyze` — Hamilton's structured deep-analysis workspace. This replaces the stub with a full implementation: streaming AI analysis via focus tabs, explore-further prompts, workspace memory (saved analyses), and the strict "no recommendation" screen boundary.

The phase depends on Phase 42 (Home briefing complete) and Phase 39/40 (hamilton_saved_analyses table + HamiltonShell layout). All infrastructure is in place.

---

## Key Findings

### 1. Existing Infrastructure (Ready to Use)

**Hamilton Shell layout** (`src/app/pro/(hamilton)/layout.tsx`):
- Already fetches `hamilton_saved_analyses` for left rail (top 10 by `updated_at`)
- Already passes `savedAnalyses` to `HamiltonShell` → `HamiltonLeftRail`
- Left rail is already wired up — Phase 43 just needs to populate the DB

**Hamilton API route** (`src/app/api/research/hamilton/route.ts`):
- Uses Vercel AI SDK `streamText` → `toUIMessageStreamResponse()`
- Accepts `UIMessage[]` array from the client
- Role-based system prompt injection (consumer / pro / admin)
- No mode parameter yet — Phase 43 adds `mode: "analyze"` body param to switch system prompt variant

**Database table** (`src/lib/hamilton/pro-tables.ts`):
- `hamilton_saved_analyses` already defined with: `id`, `user_id`, `institution_id`, `title`, `analysis_focus`, `prompt`, `response_json JSONB`, `status`, `archived_at`, `created_at`, `updated_at`
- `ensureHamiltonProTables()` called from layout on cold start (fire-and-forget)

**Type contracts** (`src/lib/hamilton/types.ts`):
- `AnalyzeResponse` interface already exists: `title`, `confidence`, `hamiltonView`, `whatThisMeans`, `whyItMatters[]`, `evidence`, `exploreFurther[]`
- No `recommendedPosition` field — screen boundary rule built into the type

**Navigation constants** (`src/lib/hamilton/navigation.ts`):
- `ANALYSIS_FOCUS_TABS = ["Pricing", "Risk", "Peer Position", "Trend"]`
- `CTA_HIERARCHY["Analyze"] = { primary: "Simulate a Change", secondary: ["Show Peer Distribution", "View Risk Drivers"] }`
- `LEFT_RAIL_CONFIG["Analyze"] = { primaryAction: "Simulate a Change", sections: ["Saved Analyses", "Recent Work", "Pinned Institutions"] }`

**Home screen pattern** (`src/app/pro/(hamilton)/hamilton/page.tsx`):
- Shows how to compose hamilton-card components
- Uses `unstable_noStore()` for fresh data components
- Imports role-scoped data via server functions

### 2. Component Patterns (From Home Screen)

The Home screen at `src/components/hamilton/home/` shows the component architecture:
- `HamiltonViewCard.tsx` — Card with Hamilton's headline thesis
- `WhatChangedCard.tsx` — Card showing changes
- Each card is a separate client or server component

For Analyze, the analogous components are:
- `AnalysisInputBar.tsx` — Chat input at bottom (client component)
- `HamiltonViewPanel.tsx` — Hamilton's View section + confidence badge
- `WhatThisMeansPanel.tsx` — What This Means section
- `WhyItMattersPanel.tsx` — Why It Matters section (bullet list)
- `EvidencePanel.tsx` — Evidence metrics table
- `ExploreFurtherPanel.tsx` — Follow-up prompt pills
- `AnalysisFocusTabs.tsx` — Tab bar (Pricing / Risk / Peer Position / Trend)
- `SavedAnalysisAction.tsx` — Save button + confirmation

### 3. Streaming Implementation Pattern

The Home screen uses `useChat` from `@ai-sdk/react` for client-side streaming. For Analyze:
- Client component owns streaming state via `useChat`
- `api: "/api/research/hamilton"` with `body: { mode: "analyze", analysisFocus: currentTab }`
- Analysis mode needs a specialized system prompt appended to the base Hamilton pro prompt
- After stream completes, save response to DB via server action

**API route modification needed:**
- Read `mode` from request body: `const { messages, mode, analysisFocus } = await request.json()`
- If `mode === "analyze"`: append analyze-specific system prompt override
- The analyze system prompt must enforce: structured JSON response matching `AnalyzeResponse`, no recommendation language

**Structured output approach:**
- Option A: Instruct Hamilton to respond in JSON matching `AnalyzeResponse` schema — parse after stream
- Option B: Stream markdown in sections, parse sections client-side
- Recommendation: Option B (section-based markdown) for better streaming UX. Use delimiters like `## Hamilton's View`, `## What This Means`, etc. Parse sections after stream completes.

### 4. Explore Further Implementation

`exploreFurther: string[]` from the `AnalyzeResponse` type — Hamilton appends 3-4 follow-up questions at the end of its response. Implementation:
- System prompt instructs Hamilton to end every analyze response with: `## Explore Further\n- Question 1\n- Question 2\n- Question 3`
- Client parses this section into `string[]` after stream completes
- Rendered as pill buttons in `ExploreFurtherPanel`
- Clicking a pill pre-fills `useChat`'s input and triggers a new analysis

### 5. Save Analysis Server Action

```typescript
// src/app/pro/(hamilton)/analyze/actions.ts
"use server"
async function saveAnalysis(params: {
  userId: number;
  institutionId: string;
  title: string;
  analysisFocus: string;
  prompt: string;
  responseJson: AnalyzeResponse;
})
```
- Derives title from prompt (first 60 chars or Hamilton's response title)
- Inserts into `hamilton_saved_analyses`
- Returns the new analysis ID
- Called from client after stream completes (`onFinish` callback)

### 6. Screen Boundary Enforcement

Two layers:
1. **System prompt**: "You are in ANALYZE mode. Produce analysis only — do not recommend a position, propose a fee range, or suggest a specific action. The Simulate screen handles decisions."
2. **TypeScript**: `AnalyzeResponse` has no `recommendedPosition` field — if Hamilton tries to include one in JSON, it will fail schema validation silently (field ignored)

### 7. Design Target

- `Hamilton-Design/2-ask_hamilton_deep_analysis_workspace/screen.png` — Reference screenshot
- `Hamilton-Design/hamilton_revamp_package/03-screen-specs.md` — Screen 2 spec
- Left rail: same shell as Home (already rendered by HamiltonShell)
- Main content: tabs at top → analysis response sections → explore further → CTA bar

---

## Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| `hamilton_saved_analyses` table | Ready | Created in Phase 39 via `ensureHamiltonProTables()` |
| `HamiltonShell` layout | Ready | Phase 40, left rail already wired |
| `AnalyzeResponse` type | Ready | `src/lib/hamilton/types.ts` |
| `ANALYSIS_FOCUS_TABS` | Ready | `src/lib/hamilton/navigation.ts` |
| Hamilton API route | Needs mod | Add `mode` + `analysisFocus` params |
| Hamilton pro system prompt | Needs analyze variant | Add analyze-mode prompt to agents.ts |

---

## Files to Create/Modify

### New Files
- `src/app/pro/(hamilton)/analyze/page.tsx` — Replace stub
- `src/app/pro/(hamilton)/analyze/actions.ts` — Server action: save/list analyses
- `src/components/hamilton/analyze/AnalyzeWorkspace.tsx` — Main client shell
- `src/components/hamilton/analyze/AnalysisFocusTabs.tsx` — Tab bar component
- `src/components/hamilton/analyze/AnalysisInputBar.tsx` — Chat input (floating)
- `src/components/hamilton/analyze/AnalysisResponse.tsx` — Response sections container
- `src/components/hamilton/analyze/HamiltonViewPanel.tsx` — Hamilton's View + confidence
- `src/components/hamilton/analyze/WhatThisMeansPanel.tsx` — What This Means section
- `src/components/hamilton/analyze/WhyItMattersPanel.tsx` — Why It Matters bullets
- `src/components/hamilton/analyze/EvidencePanel.tsx` — Evidence metrics
- `src/components/hamilton/analyze/ExploreFurtherPanel.tsx` — Follow-up pill prompts
- `src/components/hamilton/analyze/AnalyzeCTABar.tsx` — CTA hierarchy footer
- `src/components/hamilton/analyze/SaveAnalysisButton.tsx` — Save to workspace

### Modified Files
- `src/app/api/research/hamilton/route.ts` — Add `mode` + `analysisFocus` param handling
- `src/lib/research/agents.ts` — Add analyze-mode system prompt variant (PRO_ANALYZE_PREFIX)

---

## Validation Architecture

Key invariants to verify:
1. All four analysis sections (Hamilton's View, What This Means, Why It Matters, Evidence) render after stream
2. Tab switch triggers new analysis without page reload
3. Explore Further shows >= 3 prompts after analysis completes
4. Saved analyses persist to DB and appear in left rail on next load
5. No recommendation language in rendered UI (no "Recommended Position" text anywhere)
6. Stream continues to display partial content during generation

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Hamilton generates recommendation despite prompt | Low | Medium | Add client-side text scan for "recommended" in response; warn if detected |
| Stream parsing sections incorrectly | Medium | Medium | Use clear delimiter markers; fallback to raw markdown if parse fails |
| Save action races with stream completion | Low | Low | Call save in `onFinish` callback only |
| `hamilton_saved_analyses` table missing | Low | Medium | `ensureHamiltonProTables()` already runs from layout |
