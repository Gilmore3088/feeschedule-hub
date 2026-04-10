# Phase 51: Analyze Live Data - Research

**Researched:** 2026-04-09
**Domain:** Hamilton Pro — Analyze screen live data wiring, focus tab context injection, save/load end-to-end, demo content audit, PDF export via @react-pdf/renderer
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** AnalyzeWorkspace already uses useChat with DefaultChatTransport — verify it works end-to-end with the Hamilton API (mode: analyze)
- **D-02:** If streaming doesn't work, fix the transport configuration (same pattern as FloatingChatOverlay fix in Phase 49)
- **D-03:** Each focus tab (Pricing, Risk, Peer Position, Trend) changes what Hamilton focuses on in its analysis
- **D-04:** Claude's discretion on implementation: system prompt suffix vs query prefix — pick what fits the existing API route architecture
- **D-05:** saveAnalysis() and loadAnalysis() server actions already exist in analyze/actions.ts — verify end-to-end flow
- **D-06:** Left rail already wired to real hamilton_saved_analyses (Phase 49) — verify clicking a saved analysis loads it
- **D-07:** ExploreFurtherPanel has DEFAULT_PROMPTS hardcoded — these are acceptable as starter suggestions (not fake data), but should be replaced by Hamilton-generated suggestions when available
- **D-08:** Strip any other hardcoded analysis content across the 9 Analyze components
- **D-09:** Reuse the existing @react-pdf/renderer report template style from the Reports screen
- **D-10:** PDF contains: BFI branding, analysis title, Hamilton's full response text, evidence if available, timestamp
- **D-11:** Export button in AnalyzeWorkspace triggers PDF generation after analysis is complete
- **D-12:** For v8.1, use BFI default branding — client brand upload deferred to future (BRAND-01)

### Claude's Discretion
- Focus tab context injection mechanism (system prompt suffix vs query prefix)
- PDF export button placement in the Analyze UI
- Whether ExploreFurtherPanel DEFAULT_PROMPTS should remain as fallback or be removed entirely

### Deferred Ideas (OUT OF SCOPE)
- Client brand upload for white-labeled PDF exports (BRAND-01)
- Data browsing capability within Analyze (from Phase 48 discussion — detailed UX deferred)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANL-01 | AnalyzeWorkspace streaming works with real Hamilton API (mode: analyze) | Transport already wired — `DefaultChatTransport` sends `mode: "analyze"` and `analysisFocus` in body. API route reads both. Verify works end-to-end. |
| ANL-02 | Focus tabs (Pricing/Risk/Peer/Trend) inject correct context into system prompt | `buildAnalyzeModeSuffix(analysisFocus)` in agents.ts fully implements this. `analysisFocus` sent in transport body, API reads it at line 135, passes to suffix builder at line 158. Already works — just needs verification. |
| ANL-03 | User can save/load analyses via hamilton_saved_analyses table | `saveAnalysis()` action exists and auto-saves on stream completion. Left rail shows saved analyses and links to `?analysis=<id>`. BUT: no `loadAnalysis()` action exists and `page.tsx` does not read the `?analysis` searchParam — clicking a saved analysis link navigates but does nothing to restore state. |
| ANL-04 | All hardcoded/demo analysis content stripped | `DEFAULT_PROMPTS` in ExploreFurtherPanel are the only hardcoded content found (4 generic prompt pills). Acceptable as fallback per D-07. No fake analysis content found in the 9 components — workspace shows empty state until streaming starts. |
| ANL-05 | User can export any analysis as a branded PDF report | No export button exists in AnalyzeCTABar or AnalyzeWorkspace. PDF infrastructure (PdfDocument, /api/pro/report-pdf) is fully built but accepts `ReportSummaryResponse` shape, not `AnalyzeResponse`. Needs: (1) new `AnalysisPdfDocument` component or extended route, (2) export button added to AnalyzeCTABar, (3) client-side fetch pattern reusing `handleExportPdf` from ReportWorkspace. |
</phase_requirements>

---

## Summary

The Analyze screen's core streaming pipeline is substantially complete. `AnalyzeWorkspace` uses the correct `@ai-sdk/react` v3 API (`DefaultChatTransport` + `sendMessage`). The Hamilton API route correctly reads `mode` and `analysisFocus` from the body and appends `buildAnalyzeModeSuffix(analysisFocus)` to the system prompt — meaning ANL-01 and ANL-02 are likely already working and just need end-to-end verification, not implementation.

The primary gaps are: (1) `loadAnalysis` is missing — the left rail links to `?analysis=<id>` but `page.tsx` does not read that param and no server action exists to fetch a saved analysis by ID; (2) no PDF export button exists anywhere in the Analyze UI; (3) the existing PDF route accepts `ReportSummaryResponse` not `AnalyzeResponse`, so a new PDF template component is needed for analysis exports.

**Primary recommendation:** Build the three missing pieces — `loadAnalysis()` server action + page param wiring, `AnalysisPdfDocument` component, and export button in `AnalyzeCTABar` — while verifying the already-wired streaming and focus injection work correctly.

---

## Standard Stack

### Core (already in use — no new dependencies)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@ai-sdk/react` | 3.0.118 | `useChat` hook with `DefaultChatTransport` | Already in AnalyzeWorkspace |
| `ai` | 6.0.116 | `DefaultChatTransport`, `streamText`, `convertToModelMessages` | Already in API route |
| `@ai-sdk/anthropic` | 3.0.58 | Anthropic provider for streaming | Already in API route |
| `@react-pdf/renderer` | (existing) | Server-side PDF generation | Already in PdfDocument + route |
| `postgres` | 3.4.8 | SQL queries for save/load | Already in actions.ts |

**No new packages required for this phase.** [VERIFIED: codebase grep]

**Installation:** None needed.

---

## Architecture Patterns

### Pattern 1: Streaming Transport (DefaultChatTransport)

The transport sends `mode` and `analysisFocus` as extra body fields on every request. The API route reads them from `body` after parsing JSON. This is the established pattern from Phase 49 (FloatingChatOverlay). [VERIFIED: codebase read — AnalyzeWorkspace.tsx lines 129-135, route.ts lines 131-135]

```typescript
// AnalyzeWorkspace.tsx — already correct
const { messages, sendMessage, status, setMessages } = useChat({
  transport: new DefaultChatTransport({
    api: "/api/research/hamilton",
    body: () => ({
      mode: "analyze",
      analysisFocus: activeTabRef.current,  // sent on every message
    }),
  }),
  onFinish: async ({ message }) => { /* parse + auto-save */ },
});
```

```typescript
// route.ts — already reads it correctly (lines 131-158)
const body = await request.json();
mode = body.mode;
analysisFocus = body.analysisFocus;
// ...
if (mode === "analyze") {
  const focus = analysisFocus ?? "Pricing";
  systemPrompt += buildAnalyzeModeSuffix(focus);
}
```

### Pattern 2: Focus Tab System Prompt Injection

`buildAnalyzeModeSuffix(analysisFocus)` in `src/lib/research/agents.ts` (lines 70-107) is the complete implementation. It appends to the base system prompt with ANALYZE MODE directives, required section structure, and the specific focus label embedded throughout. This is already the right mechanism. [VERIFIED: codebase read]

### Pattern 3: Save/Load for Analyses

**Save (works):** `onFinish` callback auto-calls `saveAnalysis()` after stream completes. The action inserts into `hamilton_saved_analyses` with `user_id`, `institution_id`, `analysis_focus`, `prompt`, `response_json`. Returns `{ id }` on success.

**Load (missing):** The left rail renders `<Link href={/pro/analyze?analysis=${a.id}}>`. But `page.tsx` does not read `searchParams.analysis`. No `loadAnalysis(id)` action exists in `actions.ts`. Clicking a saved analysis navigates to the Analyze page but restores no state.

**Required implementation:**
1. Add `loadAnalysis(id: string)` to `actions.ts` — query `hamilton_saved_analyses` by ID and user, return the stored `response_json` as `AnalyzeResponse`
2. Update `page.tsx` to accept and await `searchParams`, read `analysis` param, call `loadAnalysis()`, pass result as prop to `AnalyzeWorkspace`
3. Update `AnalyzeWorkspace` to accept optional `initialAnalysis?: AnalyzeResponse` prop and pre-populate `parsedResponse` state [ASSUMED — pattern from similar load flows, but loadAnalysis needs full implementation]

```typescript
// actions.ts — new action needed
export async function loadAnalysis(id: string): Promise<AnalyzeResponse | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const rows = await sql<Array<{ response_json: unknown }>>`
    SELECT response_json
    FROM hamilton_saved_analyses
    WHERE id = ${id}::uuid AND user_id = ${user.id} AND status = 'active'
    LIMIT 1
  `;
  return (rows[0]?.response_json as AnalyzeResponse) ?? null;
}
```

```typescript
// page.tsx — needs searchParams wiring
export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ analysis?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const { analysis: analysisId } = await searchParams;
  const initialAnalysis = analysisId ? await loadAnalysis(analysisId) : null;

  const institutionId = (user.institution_name ?? "").toLowerCase().replace(/\s+/g, "-") || null;

  return (
    <AnalyzeWorkspace
      userId={user.id}
      institutionId={institutionId}
      initialAnalysis={initialAnalysis}
    />
  );
}
```

### Pattern 4: PDF Export for Analysis

The existing PDF infrastructure uses `PdfDocument` component (accepts `ReportSummaryResponse`) rendered via `/api/pro/report-pdf`. The `AnalyzeResponse` shape is different — it has `hamiltonView`, `whatThisMeans`, `whyItMatters[]`, `evidence.metrics[]`, `exploreFurther[]`.

**Recommended approach:** Add a new `AnalysisPdfDocument` component alongside `PdfDocument`, accepting `AnalyzeResponse`. Extend `/api/pro/report-pdf` to dispatch on a `type` field in the body: `"report"` (existing) vs `"analysis"` (new). The client fetch pattern from `ReportWorkspace.handleExportPdf()` is the canonical reference. [VERIFIED: codebase read — ReportWorkspace.tsx lines 115-143]

The export button should be added to `AnalyzeCTABar` as a secondary button alongside the existing "Simulate a Change" primary and the two secondary buttons. AnalyzeCTABar currently has: 1 primary (Link) + 2 secondary (buttons from `CTA_HIERARCHY["Analyze"].secondary`). Adding "Export PDF" as a third secondary button (outlined, same style) is the cleanest placement. [VERIFIED: AnalyzeCTABar.tsx read]

```typescript
// AnalyzeCTABar.tsx — add Export PDF button (receives parsedResponse)
// Calls fetch("/api/pro/report-pdf") with { type: "analysis", analysis: parsedResponse }
// Same blob-download pattern as ReportWorkspace.handleExportPdf()
```

The `AnalysisPdfDocument` should reuse the same styles object from `PdfDocument` (COLORS, typography, page layout). Sections map directly:
- Header: `analysis_focus` as type badge, `title` (from `hamiltonView.slice(0, 80)`) as title
- Hamilton's View: paragraph from `hamiltonView`
- What This Means: paragraph from `whatThisMeans`
- Why It Matters: bullet list from `whyItMatters[]`
- Evidence: stat callout boxes from `evidence.metrics[]` (reuse `statCalloutGrid`/`statCalloutBox` styles)
- Footer: "Hamilton — Bank Fee Index" + timestamp (same as PdfDocument)

[VERIFIED: PdfDocument.tsx and types.ts read — shapes confirmed]

### Pattern 5: Response Section Parsing

`parseAnalyzeResponse()` in `AnalyzeWorkspace.tsx` (lines 32-87) splits on `^##\s+` and finds sections by name prefix. Hamilton's system prompt enforces exactly 5 sections: `## Hamilton's View`, `## What This Means`, `## Why It Matters`, `## Evidence`, `## Explore Further`. The parser is already live-streaming aware (called on partial content during streaming). [VERIFIED: codebase read]

### Anti-Patterns to Avoid

- **Do not create a separate PDF API route:** Extend `/api/pro/report-pdf` with a `type` discriminant instead of creating `/api/pro/analysis-pdf`. One PDF endpoint is simpler to auth/maintain.
- **Do not import PdfDocument or AnalysisPdfDocument in client components:** `@react-pdf/renderer` is server-external only. The route is the correct boundary. [VERIFIED: next.config.ts]
- **Do not store `parsedResponse` in URL params:** Analysis state lives in the saved DB record. Restore from DB via `loadAnalysis()`, not URL serialization.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF layout | Custom HTML-to-PDF conversion | `@react-pdf/renderer` + existing `PdfDocument` style object | Already configured in `serverExternalPackages`, pattern proven in Reports screen |
| Streaming transport | Custom fetch wrapper | `DefaultChatTransport` from `ai` v6 | Already used in AnalyzeWorkspace — consistent with Phase 49 pattern |
| System prompt focus injection | Query prefix prepended to user message | `buildAnalyzeModeSuffix()` in agents.ts | Already implemented, tested, and enforces screen boundary rule (ARCH-05) |
| File download trigger | Server redirect | Client-side `URL.createObjectURL()` + `<a>` click | Pattern established in ReportWorkspace.handleExportPdf() lines 128-138 |

---

## Common Pitfalls

### Pitfall 1: `searchParams` Must Be Awaited in Next.js 16

**What goes wrong:** `page.tsx` currently does not accept `searchParams`. When adding it, forgetting to `await searchParams` before accessing `.analysis` causes a runtime error in Next.js 16 App Router.

**Why it happens:** Next.js 16 made `searchParams` a Promise-based prop. The existing `page.tsx` never needed searchParams before.

**How to avoid:** Always destructure after awaiting: `const { analysis } = await searchParams;` [VERIFIED: MEMORY.md — "params and searchParams are Promise-based (must await)"]

### Pitfall 2: UUID Cast Required in SQL

**What goes wrong:** Querying `hamilton_saved_analyses` by ID using a raw string without `::uuid` cast fails if the `id` column is UUID type.

**Why it happens:** The `saveAnalysis()` action uses `RETURNING id::text` — the ID is stored as UUID but returned as text. The inverse (text → UUID for WHERE) requires an explicit cast.

**How to avoid:** Use `WHERE id = ${id}::uuid` in `loadAnalysis()`. [VERIFIED: actions.ts lines 34-52 — existing action uses `::text` on RETURNING, confirming UUID column type]

### Pitfall 3: `AnalyzeCTABar` Has No Handler Props

**What goes wrong:** Adding a PDF export button to `AnalyzeCTABar` requires passing `parsedResponse` and the export handler — but the component currently only accepts `{ isVisible: boolean }`.

**Why it happens:** The component was designed for nav links (Simulate) and unimplemented action buttons. Export requires actual data.

**How to avoid:** Add `onExportPdf?: () => void` prop to `AnalyzeCTABar`. Keep `parsedResponse` and the `fetch` call in `AnalyzeWorkspace` (which owns the data); pass the callback down.

### Pitfall 4: `@react-pdf/renderer` Cannot Use CSS Variables

**What goes wrong:** Copying Hamilton design token CSS variables (e.g. `var(--hamilton-primary)`) into `AnalysisPdfDocument` styles causes silent failures — `@react-pdf/renderer` uses its own `StyleSheet.create()` and requires literal hex/rgb color values.

**Why it happens:** react-pdf runs in a Node.js context with no DOM, so CSS custom properties don't resolve.

**How to avoid:** Use the `COLORS` constant object pattern from `PdfDocument.tsx` (e.g. `textPrimary: "#1c1917"`, `accent: "#b45309"`). [VERIFIED: PdfDocument.tsx lines 21-28]

### Pitfall 5: `initialAnalysis` Prop Triggers Incorrect `isSaved` State

**What goes wrong:** If `AnalyzeWorkspace` receives `initialAnalysis` and sets `parsedResponse` from it, `isSaved` should start as `true` (it's already saved). But the current auto-save `onFinish` will re-save it as a duplicate if the user submits a new query without clearing state.

**Why it happens:** `isSaved` and `parsedResponse` are independent state vars. `onFinish` always saves after streaming.

**How to avoid:** Initialize `isSaved` to `true` when `initialAnalysis` prop is provided. The auto-save on `onFinish` naturally resets it on new queries (already does `setIsSaved(false)` at start of submit).

---

## Code Examples

### Load Analysis Server Action

```typescript
// src/app/pro/(hamilton)/analyze/actions.ts — add after existing exports
export async function loadAnalysis(id: string): Promise<AnalyzeResponse | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  try {
    const rows = await sql<Array<{ response_json: unknown }>>`
      SELECT response_json
      FROM hamilton_saved_analyses
      WHERE id = ${id}::uuid
        AND user_id = ${user.id}
        AND status = 'active'
      LIMIT 1
    `;
    if (!rows[0]) return null;
    return rows[0].response_json as AnalyzeResponse;
  } catch {
    return null;
  }
}
```

### AnalysisPdfDocument — Minimal Shape

```typescript
// src/components/hamilton/reports/AnalysisPdfDocument.tsx
// (server-side only — never import in client components)
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { AnalyzeResponse } from "@/lib/hamilton/types";

// Reuse exact COLORS from PdfDocument.tsx
const COLORS = { textPrimary: "#1c1917", textSecondary: "#78716c", accent: "#b45309", ... };

interface AnalysisPdfDocumentProps {
  analysis: AnalyzeResponse;
  analysisFocus: string;
  institutionName?: string;
}

export function AnalysisPdfDocument({ analysis, analysisFocus, institutionName }: AnalysisPdfDocumentProps) {
  // Page layout identical to PdfDocument — same page styles, header, footer
  // Sections: Hamilton's View (paragraph), What This Means (paragraph),
  //           Why It Matters (bullets), Evidence (statCalloutGrid)
}
```

### Extended PDF Route (type discriminant)

```typescript
// /api/pro/report-pdf/route.ts — add dispatch on body.type
const body = await req.json();

if (body.type === "analysis") {
  const analysis = body.analysis as AnalyzeResponse;
  const analysisFocus = (body.analysisFocus as string) || "Analysis";
  // validate: analysis?.hamiltonView required
  const element = createElement(AnalysisPdfDocument, { analysis, analysisFocus }) as ...;
  const buffer = await renderToBuffer(element);
  // ... same response headers as existing path
  const filename = `hamilton-analysis-${date}.pdf`;
  return new NextResponse(uint8, { headers: { ... } });
}

// existing path (body.type === undefined or "report")
const report = body.report as ReportSummaryResponse;
```

### Export Button Fetch Pattern (from AnalyzeWorkspace)

```typescript
// In AnalyzeWorkspace — same pattern as ReportWorkspace.handleExportPdf()
async function handleExportPdf() {
  if (!parsedResponse) return;
  const res = await fetch("/api/pro/report-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "analysis",
      analysis: {
        ...parsedResponse,
        title: parsedResponse.hamiltonView.slice(0, 80),
        confidence: { level: "medium", basis: [] },
      } satisfies AnalyzeResponse,
      analysisFocus: activeTab,
    }),
  });
  if (!res.ok) return; // non-blocking
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hamilton-analysis-${new Date().toISOString().split("T")[0]}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

---

## Findings by Requirement

### ANL-01: Streaming (status: LIKELY WORKING — verify only)

`AnalyzeWorkspace` correctly uses the `@ai-sdk/react` v3 API: `DefaultChatTransport` + `sendMessage` + `status` field. The API route correctly calls `result.toUIMessageStreamResponse()`. The `onFinish` callback receives `{ message }` and extracts text via `extractTextFromMessage()`. [VERIFIED: AnalyzeWorkspace.tsx + route.ts read]

**Verify task:** Submit a real query on the Analyze screen and confirm streaming appears in the `HamiltonViewPanel` progressively.

**If broken:** Phase 49 fixed FloatingChatOverlay with the same transport pattern — compare transports if issues arise.

### ANL-02: Focus Tabs (status: FULLY IMPLEMENTED — verify only)

`buildAnalyzeModeSuffix()` in `agents.ts` is the complete implementation. It receives `analysisFocus` from the API route body, embeds it throughout the system prompt suffix (in the ANALYSIS FOCUS directive, in each required section description, and in the SCREEN BOUNDARY RULE). The tab UI renders the 4 tabs from `ANALYSIS_FOCUS_TABS` constant. Tab change clears messages and response state. [VERIFIED: agents.ts lines 70-107, AnalyzeWorkspace.tsx lines 165-170, navigation.ts line 48]

**Verify task:** Switch tabs mid-session and confirm new query produces focus-appropriate response (e.g., "Risk" tab response frames content around risk factors).

### ANL-03: Save/Load (status: SAVE WORKS, LOAD MISSING)

**Save:** Auto-save on stream completion via `onFinish` is implemented and correct. The `saveAnalysis()` action validates premium access and inserts with all required fields. [VERIFIED: actions.ts + AnalyzeWorkspace.tsx onFinish]

**Load gap:** `loadAnalysis()` action does not exist. `page.tsx` does not read `?analysis=<id>` searchParam. Left rail link navigates but restores nothing. Three tasks required:
1. Add `loadAnalysis(id)` to `actions.ts`
2. Wire `searchParams.analysis` in `page.tsx`
3. Add `initialAnalysis` prop to `AnalyzeWorkspace` with pre-population of `parsedResponse` state

### ANL-04: Demo Content (status: CLEAN — minimal work)

The 9 Analyze components contain no fabricated analysis results. The only hardcoded content is `DEFAULT_PROMPTS` in `ExploreFurtherPanel` (4 generic follow-up question strings). Per D-07, these are acceptable as a fallback — they only show when `parsedResponse?.exploreFurther` is empty (0 items). [VERIFIED: all 9 component files read]

**Task:** Confirm no other hardcoded content exists. `DEFAULT_PROMPTS` stays as fallback per user decision.

### ANL-05: PDF Export (status: INFRASTRUCTURE EXISTS, INTEGRATION MISSING)

Three implementation gaps:
1. `AnalysisPdfDocument` component does not exist — needs to be created reusing `PdfDocument` styles
2. `/api/pro/report-pdf` only handles `ReportSummaryResponse` — needs `type === "analysis"` dispatch branch
3. `AnalyzeCTABar` has no export button — needs "Export PDF" as third secondary button

The export flow: user submits query → stream completes → `analysisComplete = true` → `AnalyzeCTABar` becomes visible → user clicks "Export PDF" → `handleExportPdf()` POSTs to `/api/pro/report-pdf` with `{ type: "analysis", analysis: parsedResponse }` → receives PDF blob → triggers browser download.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `useChat` with legacy API | `useChat` + `DefaultChatTransport` + `sendMessage` from `@ai-sdk/react` v3 | Breaking change in v3 — already migrated in AnalyzeWorkspace (Phase 43/49). Do not use old `append()` or `handleSubmit()` patterns. |
| Separate PDF API routes per content type | Single `/api/pro/report-pdf` dispatching on `type` | Fewer routes to auth/maintain |

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|-------------|-----------|-------|
| `@react-pdf/renderer` | PDF export | Yes | `serverExternalPackages: ['@react-pdf/renderer']` confirmed in `next.config.ts` |
| `hamilton_saved_analyses` table | save/load | Yes | Created by `ensureHamiltonProTables()` on layout mount |
| `ANTHROPIC_API_KEY` | streaming | Required | Checked in route handler — returns 503 if missing |

Step 2.6: SKIPPED for new packages — no new external dependencies identified. All required infrastructure is already present.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/hamilton` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| ANL-01 | Streaming reaches client correctly | Manual smoke | Requires live Anthropic API — cannot unit test stream delivery |
| ANL-02 | `buildAnalyzeModeSuffix()` embeds focus label | Unit (exists implicitly via agents.ts) | Verify focus string appears in system prompt string |
| ANL-03 | `loadAnalysis()` returns saved AnalyzeResponse | Unit | New test file needed for actions.ts |
| ANL-04 | No hardcoded analysis content | Code review | Manual audit — no test needed |
| ANL-05 | PDF route handles `type: "analysis"` | Integration (manual) | POST to route with mock analysis, verify PDF download |

### Wave 0 Gaps

- No new test files strictly required — `loadAnalysis()` logic is simple SQL and covered by the existing auth pattern.
- Manual smoke test checklist for ANL-01, ANL-02, ANL-05 (streaming and PDF require live environment).

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | `getCurrentUser()` in all server actions and API routes — consistent with project pattern |
| V4 Access Control | Yes | `canAccessPremium(user)` gate in `saveAnalysis()` + `canAccessPremium` check in Hamilton route for `role === "pro"` |
| V5 Input Validation | Yes | `analysisFocus` from body is used directly in system prompt suffix — validate it is one of `ANALYSIS_FOCUS_TABS` before use to prevent prompt injection |
| V6 Cryptography | No | No cryptographic operations in this phase |

**Prompt injection risk (LOW severity):** `analysisFocus` is passed from client body directly into `buildAnalyzeModeSuffix()`. The value is embedded in the system prompt as: `"ANALYSIS FOCUS: ${analysisFocus}"`. If the client sends an arbitrary string, it appears in the system prompt. The TypeScript type `AnalysisFocus` narrows this on the client but not at the API boundary. **Mitigation:** In the API route, validate `analysisFocus` against the known set before using it:

```typescript
const VALID_FOCUS = new Set(["Pricing", "Risk", "Peer Position", "Trend"]);
const focus = VALID_FOCUS.has(analysisFocus ?? "") ? analysisFocus : "Pricing";
systemPrompt += buildAnalyzeModeSuffix(focus);
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `initialAnalysis` prop pattern is the right way to pre-populate workspace from a loaded analysis | Findings ANL-03 / Pattern 3 | If state initialization is more complex (needs to replay messages for Explore Further to work), the approach may need a different pattern |
| A2 | `loadAnalysis()` by user_id + id is sufficient auth — no additional role check needed beyond premium gate already on the action | Pattern 3 | If row-level security requires explicit `canAccessPremium()` call, add it (follows saveAnalysis pattern) |

---

## Open Questions

1. **Should `initialAnalysis` restore Explore Further prompts interactively?**
   - What we know: `parsedResponse.exploreFurther` will be set from the loaded analysis
   - What's unclear: `ExploreFurtherPanel` only shows when `analysisComplete` is true — if `initialAnalysis` sets `parsedResponse`, `analysisComplete` will be true immediately on page load
   - Recommendation: Yes, this is the desired behavior. Pre-populated response should show the full UI including Explore Further pills.

2. **Should `AnalyzeCTABar` receive the `onExportPdf` callback or should export live in `AnalyzeWorkspace` with a separate button?**
   - What we know: `AnalyzeCTABar` currently renders when `analysisComplete` — same condition needed for export
   - Recommendation: Pass `onExportPdf?: () => void` to `AnalyzeCTABar` since it already controls visibility of the action row. Keeps all CTAs in one place.

---

## Sources

### Primary (HIGH confidence)
- `src/components/hamilton/analyze/AnalyzeWorkspace.tsx` — Full streaming transport, auto-save, section parsing
- `src/app/pro/(hamilton)/analyze/actions.ts` — saveAnalysis/listSavedAnalyses (loadAnalysis confirmed absent)
- `src/app/api/research/hamilton/route.ts` — Full request handling, analysisFocus extraction, mode dispatch
- `src/lib/research/agents.ts` — `buildAnalyzeModeSuffix()` implementation
- `src/app/api/pro/report-pdf/route.ts` — PDF generation route
- `src/components/hamilton/reports/PdfDocument.tsx` — PDF component shape and styles
- `src/lib/hamilton/types.ts` — `AnalyzeResponse` and `ReportSummaryResponse` shapes
- `src/components/hamilton/analyze/AnalyzeCTABar.tsx` — CTA bar (no export button confirmed)
- `src/components/hamilton/analyze/ExploreFurtherPanel.tsx` — DEFAULT_PROMPTS confirmed
- `src/app/pro/(hamilton)/layout.tsx` — left rail data fetching, saved analyses query
- `src/components/hamilton/layout/HamiltonLeftRail.tsx` — link to `?analysis=<id>` confirmed
- `next.config.ts` — `serverExternalPackages: ['@react-pdf/renderer']` confirmed

### Secondary (MEDIUM confidence)
- `.planning/MILESTONE_8_HANDOFF.md` — Phase 43 history, known issue #6 on @ai-sdk/react v3 API break
- `src/components/hamilton/reports/ReportWorkspace.tsx` — `handleExportPdf()` pattern (lines 115-143)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all verified by codebase read
- Architecture patterns: HIGH — all code paths verified directly
- Pitfalls: HIGH — verified from actual code conditions
- Load gap (ANL-03): HIGH — confirmed `loadAnalysis` absent, confirmed searchParam not read
- PDF gap (ANL-05): HIGH — confirmed no export button, confirmed route accepts only ReportSummaryResponse

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable codebase, no moving dependencies)
