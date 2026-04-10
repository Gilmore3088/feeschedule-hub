# Phase 53: Reports Library + Generation - Research

**Researched:** 2026-04-09
**Domain:** Hamilton Pro Reports screen — dual-purpose library + generator, scenario linking, PDF export
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Reports screen shows published report library as the PRIMARY view (top of page)
- **D-02:** Template gallery for generating new reports appears BELOW the library
- **D-03:** Published reports are browsable with title, date, report type, and download button
- **D-04:** Clicking a published report shows its content inline — no generation step needed
- **D-05:** Seed an initial set of published reports into hamilton_reports table (quarterly, monthly pulse, etc.)
- **D-06:** Reports are generated via the admin report engine and stored in hamilton_reports with status='published'
- **D-07:** Library queries hamilton_reports WHERE status='published' ORDER BY created_at DESC
- **D-08:** Template gallery keeps existing templates but reframes for CLIENT context:
  - Peer Benchmarking Report (compare institution vs peer set)
  - Regional Fee Landscape (fees by Fed district or state)
  - Category Deep Dive (single fee category analysis)
  - Competitive Positioning (institution vs specific competitors)
- **D-09:** Generation calls real generateSection() pipeline with user's institution + peer context
- **D-10:** PDF export via existing @react-pdf/renderer route works end-to-end
- **D-11:** Arriving at /pro/reports?scenario_id=X auto-opens the report generator pre-filled with the scenario's category and values
- **D-12:** The scenario data is loaded from hamilton_scenarios by ID

### Claude's Discretion
- Visual layout of published reports library (cards vs table vs list)
- How many initial reports to seed
- Whether to show report generation progress inline or as a separate view

### Deferred Ideas (OUT OF SCOPE)
- Scheduled report generation (AUTO-02)
- Client brand upload for white-labeled reports (BRAND-01)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RPT-01 | Report library displays curated Hamilton publications (annual, quarterly, Fed, monthly pulse) | `hamilton_reports` table exists; needs `status='published'` column + seed data |
| RPT-02 | User can browse, read, and download published reports | Inline viewer via ReportOutput + PDF export via /api/pro/report-pdf already wired |
| RPT-03 | Report generation uses real generateSection() with client-specific data context | generateSection() in generate.ts is fully implemented; actions.ts calls it but templates are admin-flavored — need client-oriented prompts |
| RPT-04 | PDF export via @react-pdf/renderer works end-to-end | Route exists at /api/pro/report-pdf; PdfDocument.tsx renders ReportSummaryResponse — already functional |
| RPT-05 | Scenario-linked reports pull from hamilton_scenarios when user comes from Simulate | page.tsx does NOT read searchParams; actions.ts has scenarioId param but ReportWorkspace ignores URL — needs wiring |
</phase_requirements>

---

## Summary

Phase 53 transforms the Reports screen from a pure template-gallery into a two-part page: a curated published report library at the top, and the existing template generator gallery below. The codebase is well-prepared: `generateSection()` is fully implemented and wired into `actions.ts`; the PDF export API route at `/api/pro/report-pdf` works; `ReportOutput.tsx` renders `ReportSummaryResponse` beautifully. The primary work is architectural and data-layer, not UI from scratch.

Three gaps require new code. First, `hamilton_reports` has no `status` column — D-06 requires `status='published'` but the current schema has no such field. The column must be added via `ALTER TABLE` in `ensureHamiltonProTables()` and the existing `INSERT` in `saveHamiltonReport()` updated to default to `'generated'`. Second, the page component (`page.tsx`) does not read `searchParams`, so `?scenario_id=X` from Simulate is silently dropped — this requires reading `searchParams` server-side and passing the initial scenario ID into `ReportWorkspace`. Third, the four generation templates in `TEMPLATES` array and `generateReport()` action use admin-flavored prompts (capital allocation, EMEA) instead of client-oriented ones (peer benchmarking, regional fee landscape). Those must be replaced and the `generateSection()` context strings updated with peer/institution-specific data.

**Primary recommendation:** Add `status` column to `hamilton_reports`, seed 3-5 published reports, reframe the 4 templates for client context, wire `?scenario_id=` from URL into `ReportWorkspace`, and leave PDF export untouched — it already works.

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@react-pdf/renderer` | (in next.config.ts serverExternalPackages) | PDF generation server-side | Wired and working at `/api/pro/report-pdf` |
| `@anthropic-ai/sdk` | 0.80.0 | Calls Claude for section narratives | Used by `generateSection()` in generate.ts |
| `postgres` (sql tag) | 3.4.8 | DB queries via Supabase pooler | All hamilton_* table operations |

No new libraries needed for this phase.

**Installation:** None required.

---

## Architecture Patterns

### Existing Component Inventory

```
src/app/pro/(hamilton)/reports/
├── page.tsx               — Server component; passes userId to ReportWorkspace (NO searchParams read)
└── actions.ts             — generateReport(), loadRecentReports(), loadActiveScenarios(), loadReport()

src/components/hamilton/reports/
├── ReportWorkspace.tsx    — Main client component; template selection, config sidebar, generation flow
├── TemplateCard.tsx       — Single template card (selected state, icon, tags)
├── ConfigSidebar.tsx      — Institution/peer set/focus area/tone config + Generate button
├── ReportOutput.tsx       — Renders ReportSummaryResponse inline (sections, stat callouts)
├── PdfDocument.tsx        — @react-pdf/renderer document; server-side only
├── AnalysisPdfDocument.tsx — Phase 51 analysis PDF (separate branch in report-pdf route)
├── GeneratingState.tsx    — Spinner/loading state shown during generation
├── EmptyState.tsx         — Empty state component
├── ReportSection.tsx      — Section wrapper with heading
└── StatCalloutBox.tsx     — Current→Proposed stat display

src/lib/hamilton/
├── generate.ts            — generateSection() and generateGlobalThesis() — the real LLM pipeline
├── pro-tables.ts          — ensureHamiltonProTables(), saveHamiltonReport(), getRecentHamiltonReports(),
│                            getActiveScenarios(), getHamiltonReportById()
└── types.ts               — ReportSummaryResponse, SectionInput, SectionOutput, SectionType

src/app/api/pro/report-pdf/route.ts — POST; dispatches on body.type ('analysis' vs 'report')
```

### Pattern 1: Dual-Section Page Layout

The page restructuring follows a scroll-order pattern: published library at top (server-loaded, static), template generator below (client-interactive). Page component must read `searchParams` Promise and pass values down.

```typescript
// Source: [VERIFIED: codebase — src/app/pro/(hamilton)/reports/page.tsx]
// Current state — needs searchParams added:
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario_id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const { scenario_id } = await searchParams;

  const publishedReports = await getPublishedReports();   // new query
  return (
    <ReportWorkspace
      userId={user.id}
      publishedReports={publishedReports}
      initialScenarioId={scenario_id ?? null}
    />
  );
}
```

### Pattern 2: status Column on hamilton_reports

`hamilton_reports` currently has NO `status` column. D-06 requires `status='published'` for library entries. The fix requires:

1. Add `status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'published'))` to the `CREATE TABLE IF NOT EXISTS` DDL in `ensureHamiltonProTables()`.
2. Add `ALTER TABLE hamilton_reports ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'generated'` as a safe migration guard in the same function (for existing tables that already exist without the column).
3. New query `getPublishedReports()` — `SELECT ... WHERE status = 'published' ORDER BY created_at DESC`.
4. Seed function `seedPublishedReports()` — inserts 3-5 rows with `status='published'` and pre-generated `report_json` values matching `ReportSummaryResponse` shape.

```typescript
// Source: [VERIFIED: codebase — src/lib/hamilton/pro-tables.ts pattern]
export async function getPublishedReports(): Promise<Array<{
  id: string;
  report_type: string;
  title: string;
  created_at: string;
  report_json: ReportSummaryResponse;
}>> {
  const rows = await sql`
    SELECT id, report_type, created_at, report_json->>'title' AS title, report_json
    FROM hamilton_reports
    WHERE status = 'published'
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return rows as unknown as Array<{...}>;
}
```

### Pattern 3: Scenario-Linked Pre-fill

`?scenario_id=X` arrives from Simulate screen. The scenario row from `hamilton_scenarios` contains `fee_category`, `current_value`, `proposed_value`, `confidence_tier`. These map to:
- Auto-select a template (Category Deep Dive maps naturally)
- Pre-populate config sidebar with `fee_category` as focus area

`loadActiveScenarios()` already exists and returns these fields. The page component reads `scenario_id` from URL and passes it as a prop. `ReportWorkspace` uses a `useEffect` to fire `loadReport` / scenario fetch on mount when `initialScenarioId` is set.

```typescript
// Source: [VERIFIED: codebase — src/lib/hamilton/pro-tables.ts]
// getActiveScenarios() returns: id, fee_category, current_value, proposed_value,
//   confidence_tier, created_at
// Use getHamiltonReportById() or a new getScenarioById() to fetch scenario context
```

### Pattern 4: Client-Oriented Template Reframing (RPT-03)

Current `TEMPLATES` in `ReportWorkspace.tsx` has admin labels. D-08 specifies four new templates. These are ONLY label/description/icon changes in the array — the `ReportTemplateType` union in `actions.ts` must be extended to include the new types:

| Old type | New type | New title | Icon |
|----------|----------|-----------|------|
| `quarterly_strategy` | `peer_benchmarking` | Peer Benchmarking Report | `group_work` |
| `peer_brief` | `regional_landscape` | Regional Fee Landscape | `map` |
| `monthly_pulse` | `category_deep_dive` | Category Deep Dive | `analytics` |
| `state_index` | `competitive_positioning` | Competitive Positioning | `leaderboard` |

The `generateReport()` action in `actions.ts` uses `TEMPLATE_TITLES` and calls `generateSection()` with `context` strings. Each new template type needs its own context strings referencing peer/fee/institution data. The `getNationalIndex()` call already provides grounding data — `getPeerIndex()` should be added for peer-specific templates.

### Pattern 5: generateSection() Contract

[VERIFIED: codebase — src/lib/hamilton/generate.ts]

```typescript
generateSection({
  type: "peer_comparison",   // one of SectionType union
  title: "Fee Position vs Peer Set",
  data: {
    institution_name: "...",
    fee_category: "monthly_maintenance",
    peer_median: 12.50,
    national_median: 14.00,
    delta_pct: -10.7,
    peer_count: 47,
  },
  context: "Write 2-3 sentences comparing this institution's fee to peer median. Use exact figures.",
})
// Returns: SectionOutput { narrative: string, wordCount: number, model: string, usage: {...} }
```

The function throws if `ANTHROPIC_API_KEY` is not set. All three sections in `generateReport()` (executive_summary, strategic, recommendation) use `Promise.all`-style sequential calls — Phase 53 should consider `Promise.allSettled` for resilience.

### Pattern 6: PDF Export (already working)

[VERIFIED: codebase — src/app/api/pro/report-pdf/route.ts]

- POST `/api/pro/report-pdf` with `{ report: ReportSummaryResponse, reportType: string }`
- Returns `application/pdf` blob
- `PdfDocument.tsx` renders all `ReportSummaryResponse` sections including `snapshot`, `tradeoffs`, `implementationNotes`
- The `snapshot` array (Current vs Proposed) is only rendered when non-empty — this is where scenario data should populate
- No changes needed to route or PdfDocument for basic PDF export (RPT-04 is already satisfied)

### Anti-Patterns to Avoid

- **Reading searchParams synchronously:** Next.js 15+ requires `await searchParams` (it's a Promise). Attempting `searchParams.scenario_id` directly causes a type error. [VERIFIED: CLAUDE.md — `params` and `searchParams` are Promise-based (must await)]
- **Importing PdfDocument in client components:** It uses `@react-pdf/renderer` which is server-only. It's already in `serverExternalPackages`. Never import from client code.
- **Adding status to hamilton_reports without IF NOT EXISTS guard:** The table already exists in production without a status column. The `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guard is mandatory in `ensureHamiltonProTables()`.
- **Using `db.close()` on the read singleton:** CLAUDE.md and project memory both flag this as a critical gotcha — singleton `getDb()` must never be closed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF rendering | Custom HTML-to-PDF | `@react-pdf/renderer` via `/api/pro/report-pdf` | Already wired, serverExternalPackages configured, PdfDocument component exists |
| LLM text generation | Direct Anthropic fetch | `generateSection()` in `src/lib/hamilton/generate.ts` | Voice enforcement, numeric validation, error handling, timeout all built in |
| Report persistence | New table or localStorage | `hamilton_reports` with status column | Schema exists; only needs `status` column addition |
| Scenario fetch | New API route | `getActiveScenarios()` in `pro-tables.ts` | Already returns `fee_category`, `current_value`, `proposed_value` |
| Published report query | New table | `hamilton_reports WHERE status='published'` | Extend existing table with status column |

---

## Common Pitfalls

### Pitfall 1: hamilton_reports Has No status Column

**What goes wrong:** D-07 requires `WHERE status='published'` but the column does not exist in the current schema or in any deployed database. Querying it without adding the column first causes a Postgres error at runtime.

**Why it happens:** The table was created in Phase 39 without a `status` column (soft-delete was intentionally omitted for reports per the schema comment: "Reports... have NO soft-delete (D-09)").

**How to avoid:** In `ensureHamiltonProTables()`, add both a `CREATE TABLE IF NOT EXISTS` DDL update (for cold starts) AND an `ALTER TABLE hamilton_reports ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'published'))` call immediately after. The `IF NOT EXISTS` makes it idempotent.

**Warning signs:** `column "status" does not exist` Postgres error on page load.

### Pitfall 2: page.tsx Does Not Accept searchParams

**What goes wrong:** `?scenario_id=X` is ignored silently because `page.tsx` has no `searchParams` prop and passes nothing to `ReportWorkspace`. Users arriving from Simulate see no pre-fill.

**Why it happens:** The page was built as a minimal auth gate before scenario linking was planned.

**How to avoid:** Add `searchParams: Promise<{ scenario_id?: string }>` to the page props, `await` it, and pass `initialScenarioId` to `ReportWorkspace`. In `ReportWorkspace`, a `useEffect` dependent on `initialScenarioId` auto-selects the matching template and fetches the scenario.

**Warning signs:** No `searchParams` in page function signature; `scenario_id` query param disappears.

### Pitfall 3: Scenario Fetch Needs a New Query

**What goes wrong:** There is no `getScenarioById(id, userId)` function in `pro-tables.ts`. `getActiveScenarios()` returns all scenarios but not a single one by ID.

**Why it happens:** The scenario-by-ID lookup was never needed before Phase 53.

**How to avoid:** Add `getHamiltonScenarioById(scenarioId, userId)` to `pro-tables.ts` returning the full scenario row. Pass the resolved scenario's `fee_category` and values into the template pre-fill logic.

**Warning signs:** `loadActiveScenarios()` called in `useEffect` then scanning for matching ID — inefficient and may not find archived scenarios.

### Pitfall 4: Template Types Must Match ReportTemplateType

**What goes wrong:** Replacing the 4 template types breaks `generateReport()` action if `TEMPLATE_TITLES` and the `switch`/`if` logic don't cover the new types. TypeScript will surface this at compile time if `ReportTemplateType` is updated, but the runtime logic may silently fall through.

**Why it happens:** `ReportTemplateType` is a string union; adding new values requires updating the union, `TEMPLATE_TITLES`, and `generateReport()` dispatch logic together.

**How to avoid:** Update `ReportTemplateType` union first. TypeScript exhaustiveness checking in `generateReport()` will flag any missing case immediately.

### Pitfall 5: Seeded Reports Must Match ReportSummaryResponse Shape

**What goes wrong:** Manually-crafted seed data that omits required fields (`exportControls`, `snapshot`, etc.) causes `ReportOutput.tsx` to crash with undefined access.

**Why it happens:** `ReportSummaryResponse` has 8 fields — hand-seeded JSON may skip optional-looking ones that the component accesses unconditionally.

**How to avoid:** Use the same `generateReport()` server action to generate seed reports programmatically (run once as a script or one-time API call). Store the resulting `report_json` verbatim. Alternatively, hardcode seed JSON that matches the full interface shape exactly.

---

## Code Examples

### Adding status Column Safely

```typescript
// Source: [VERIFIED: codebase — src/lib/hamilton/pro-tables.ts pattern]
// Add inside ensureHamiltonProTables() after the CREATE TABLE block:
await sql`
  ALTER TABLE hamilton_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'generated'
`;
// Then add CHECK constraint if Postgres version supports ADD CONSTRAINT IF NOT EXISTS:
// (Postgres 9.6+ supports ADD COLUMN IF NOT EXISTS but CHECK constraint
//  must be added separately or inline in CREATE TABLE)
```

### Seeding Published Reports

```typescript
// Source: [VERIFIED: codebase — ReportSummaryResponse shape in src/lib/hamilton/types.ts]
const seedReport: ReportSummaryResponse = {
  title: "Q1 2026 National Fee Landscape — Hamilton Intelligence",
  executiveSummary: [
    "Median monthly maintenance fees held at $12.00 across 4,200+ institutions tracked by Bank Fee Index.",
    "Credit unions continue to price 23% below bank peers on overdraft, while NSF fees show convergence.",
  ],
  snapshot: [],
  strategicRationale: "...",
  tradeoffs: [
    { label: "Monthly Maintenance", value: "$12.00 national median" },
    { label: "Overdraft Fee", value: "$30.00 national median" },
  ],
  recommendation: "...",
  implementationNotes: [
    "Data covers 4,200+ institutions across all 50 states",
    "Pipeline-verified from published fee schedules as of Q1 2026",
  ],
  exportControls: { pdfEnabled: true, shareEnabled: false },
};

await sql`
  INSERT INTO hamilton_reports
    (user_id, institution_id, report_type, report_json, status)
  VALUES
    (1, 'bfi-hamilton', 'quarterly_strategy', ${JSON.stringify(seedReport)}, 'published')
`;
```

### Client-Oriented generateReport Context Strings

```typescript
// Source: [VERIFIED: codebase — src/app/pro/(hamilton)/reports/actions.ts generateReport()]
// For peer_benchmarking template:
const summarySection = await generateSection({
  type: "peer_comparison",
  title: "Fee Position vs Peer Set",
  data: {
    institution_name: user.institution_name ?? "Your Institution",
    peer_categories: peerIndex.slice(0, 10).map(c => ({
      fee_category: c.fee_category,
      peer_median: c.median_amount,
      national_median: c.national_median,
      delta_pct: c.delta_pct,
      peer_count: c.institution_count,
    })),
  },
  context: "Compare this institution's fees to their configured peer set. Use exact figures. Call out the 2-3 categories where the gap is widest.",
});
```

### Scenario Pre-fill in ReportWorkspace

```typescript
// Source: [VERIFIED: codebase — pattern from ReportWorkspace.tsx useEffect]
useEffect(() => {
  if (!initialScenarioId) return;
  loadActiveScenarios().then((scenarios) => {
    const scenario = scenarios.find(s => s.id === initialScenarioId);
    if (scenario) {
      setSelectedTemplate("category_deep_dive");
      setFocusArea(scenario.fee_category);
      setActiveScenarioId(scenario.id);
    }
  });
}, [initialScenarioId]);
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Reports page = template gallery only | Reports page = library (top) + generator (below) | D-01/D-02 layout restructure |
| Admin-flavored templates (quarterly_strategy, peer_brief) | Client-oriented templates (peer_benchmarking, category_deep_dive) | D-08 reframe required |
| hamilton_reports has no status column | Add status='generated'/'published' | Enables library query (D-07) |
| page.tsx ignores searchParams | page.tsx reads ?scenario_id= | Enables Simulate→Report flow (D-11/D-12) |

**No deprecated patterns in this phase's stack** — all existing code (generateSection, PdfDocument, report-pdf route) is current and working.

---

## Open Questions

1. **Who populates 'published' reports in production?**
   - What we know: D-05 says to seed initial published reports; D-06 says they are generated "via the admin report engine"
   - What's unclear: Is the seed a one-time SQL migration script, a dev CLI command, or should admin report generation automatically set `status='published'` for certain report types?
   - Recommendation: Seed 3-5 published reports as static JSON inserts in `ensureHamiltonProTables()` or a separate `seedPublishedReports()` call. Production admin report engine seeding is a future enhancement (AUTO-02 deferred).

2. **Does getPeerIndex() need to be called inside generateReport()?**
   - What we know: `generateReport()` currently calls `getNationalIndex()` only. Peer benchmarking templates need peer-filtered data.
   - What's unclear: The user's peer set configuration lives in `saved_peer_sets` — the `ConfigSidebar` currently has hardcoded "Tier 1 Banks" placeholder. Is the peer set ID available at generation time?
   - Recommendation: Pass the active peer set from the user's settings profile into `generateReport()`. If no peer set is configured, fall back to national index with a note in the narrative.

3. **Should 'published' reports be visible to ALL pro users or only the owning user?**
   - What we know: D-07 says library queries `hamilton_reports WHERE status='published'` — no user_id filter mentioned
   - What's unclear: Are published reports shared content (BFI-authored, visible to all subscribers) or per-user?
   - Recommendation: Published reports seeded as BFI content should use a sentinel `user_id = 0` or a dedicated `bfi_content` institution_id, and the query should return all published rows regardless of user_id. User-generated reports should default to `status='generated'` (private).

---

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — all tools already in stack and verified working)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/hamilton/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RPT-01 | `getPublishedReports()` returns only status='published' rows | unit | `npx vitest run src/lib/hamilton/pro-tables.test.ts` | Wave 0 — add test case |
| RPT-02 | Published report opens inline (ReportOutput receives report_json) | smoke | Manual browser check | N/A |
| RPT-03 | `generateReport()` with peer_benchmarking type calls generateSection with peer_comparison type | unit | `npx vitest run src/lib/hamilton/generate.test.ts` | Wave 0 — mock generateSection |
| RPT-04 | PDF route returns 200 with application/pdf Content-Type | integration | Manual curl or Playwright smoke | N/A |
| RPT-05 | page.tsx passes initialScenarioId to ReportWorkspace when ?scenario_id present | unit | `npx vitest run src/app/pro` | Wave 0 |

### Sampling Rate
- Per task commit: `npx vitest run src/lib/hamilton/`
- Per wave merge: `npx vitest run`
- Phase gate: Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/hamilton/pro-tables.test.ts` — add test for `getPublishedReports()` and `getHamiltonScenarioById()`
- [ ] Mock for new template types in generate.test.ts

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `getCurrentUser()` called in page.tsx and all actions |
| V3 Session Management | yes | Session cookie `fsh_session` — existing pattern |
| V4 Access Control | yes | All pro table queries filter by `user_id` from session |
| V5 Input Validation | yes | `scenarioId` from URL param should be validated as UUID before SQL query |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR via scenario_id URL param | Tampering | `getHamiltonScenarioById(scenarioId, userId)` — always filter by authenticated user_id |
| Published reports expose other users' data | Information Disclosure | Published BFI-authored reports use sentinel user_id; user-generated reports never set status='published' |
| Prompt injection via focusArea/institution inputs | Tampering | generateSection() passes these as JSON data fields, not raw string concatenation into prompt — low risk |

---

## Sources

### Primary (HIGH confidence)
- `src/lib/hamilton/pro-tables.ts` — complete hamilton_reports schema verified; confirmed no status column
- `src/lib/hamilton/generate.ts` — generateSection() contract verified; uses claude-sonnet-4-20250514
- `src/app/pro/(hamilton)/reports/actions.ts` — full server action inventory verified
- `src/components/hamilton/reports/ReportWorkspace.tsx` — TEMPLATES array, state management, PDF export flow verified
- `src/app/api/pro/report-pdf/route.ts` — PDF route dispatch logic verified; report branch confirmed working
- `src/lib/hamilton/types.ts` — ReportSummaryResponse shape confirmed (8 required fields)
- `.planning/MILESTONE_8_HANDOFF.md` — Screen 6: Reports section confirmed

### Secondary (MEDIUM confidence)
- `Hamilton-Design/4-report_builder/code.html` — HTML prototype confirmed current layout = what's in ReportWorkspace.tsx; no library section in prototype (library section is new for this phase)

### Tertiary (LOW confidence)
- None

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is supported by the Supabase Postgres version in use | Pitfall 1 | If unsupported, migration strategy must change (likely fine — Postgres 13+ supports it) [ASSUMED] |
| A2 | Published BFI-authored seed reports should be visible to all pro users (not per-user) | Open Questions | If wrong, library shows empty for users who haven't generated anything |

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project and working
- Architecture: HIGH — codebase fully read; schema, actions, components all verified
- Pitfalls: HIGH — schema gap (missing status column) confirmed by direct code read; searchParams gap confirmed by reading page.tsx

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable stack; no fast-moving dependencies)
