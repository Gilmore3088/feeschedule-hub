# Phase 45: Report Builder — Research

**Status:** RESEARCH COMPLETE
**Date:** 2026-04-09

## Executive Summary

Phase 45 builds the Report Builder screen at `/pro/reports`. Key findings:
1. `@react-pdf/renderer` is NOT in package.json — must be installed
2. The reports page stub doesn't exist yet (no `src/app/pro/(hamilton)/reports/` directory)
3. Existing Hamilton infrastructure is mature and ready to leverage
4. `hamilton_reports` table already exists via `ensureHamiltonProTables()` in Phase 39
5. `hamilton_scenarios` table already exists — scenario linking can read from it directly
6. PDF must be server-side only via API route; no client bundle import allowed

## Key Findings

### Existing Infrastructure to Reuse

**hamilton_reports table** (already created by `ensureHamiltonProTables()`):
```sql
hamilton_reports (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL,
  institution_id TEXT NOT NULL,
  scenario_id UUID REFERENCES hamilton_scenarios(id),
  report_type TEXT NOT NULL,
  report_json JSONB NOT NULL,  -- stores ReportSummaryResponse
  exported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

**hamilton_scenarios table** (for scenario linking):
```sql
hamilton_scenarios (
  id UUID,
  user_id INTEGER,
  fee_category TEXT,
  current_value NUMERIC,
  proposed_value NUMERIC,
  result_json JSONB,
  confidence_tier TEXT,
  status TEXT DEFAULT 'active'
)
```

**generateSection()** in `src/lib/hamilton/generate.ts`:
- Takes `SectionInput` { type, title, data, context? }
- Returns `SectionOutput` { narrative, wordCount, model, usage }
- Uses `claude-sonnet-4-20250514` at 1500 max_tokens
- Full 60s timeout — can be parallelized across sections

**ReportSummaryResponse** in `src/lib/hamilton/types.ts`:
```typescript
interface ReportSummaryResponse {
  title: string;
  executiveSummary: string[];
  snapshot: Array<{ label: string; current: string; proposed: string }>;
  strategicRationale: string;
  tradeoffs: Array<{ label: string; value: string }>;
  recommendation: string;
  implementationNotes: string[];
  exportControls: { pdfEnabled: boolean; shareEnabled: boolean; };
}
```

**HamiltonShell** pattern: shell wraps page content in `.hamilton-shell`, left rail is `HamiltonLeftRail`, main content is `<main className="flex-1 min-w-0 p-6">`.

**Analyze screen pattern** (`src/app/pro/(hamilton)/analyze/`):
- `page.tsx` = server component, auth check, passes userId/institutionId to client workspace
- `AnalyzeWorkspace.tsx` = client component with `"use client"`
- `actions.ts` = server actions for persistence

### Missing Infrastructure

1. **`@react-pdf/renderer`** — NOT in package.json. Must `npm install @react-pdf/renderer`.
2. **`/pro/reports` page** — `src/app/pro/(hamilton)/reports/` directory doesn't exist
3. **`/api/pro/report-pdf` route** — doesn't exist, needed for PDF generation
4. **Report components** — `src/components/hamilton/reports/` directory doesn't exist
5. **Report server action** — needs `actions.ts` for generation + saving to `hamilton_reports`

### Architecture Decision

**Report generation approach:** Use a server action that:
1. Fetches index data for the configured scope
2. Calls `generateSection()` for each section (executive_summary, strategic, recommendation)
3. Assembles `ReportSummaryResponse`
4. Saves to `hamilton_reports` table
5. Returns the assembled report JSON to the client

**Streaming vs batch:** Use batch (non-streaming) for report generation — reports have multiple independent sections, streaming doesn't compose well across sections. The loading state shows "Hamilton is writing your report..." with a spinner.

**PDF generation:** Server-side API route `/api/pro/report-pdf` using `@react-pdf/renderer`. Client calls fetch() to this endpoint, which returns a PDF blob for download.

### Report Types & Data Mapping

| Template | SectionTypes | Data Source |
|----------|-------------|-------------|
| Quarterly Strategy Report | executive_summary, peer_comparison, recommendation, strategic | getNationalIndex() + getPeerIndex() |
| Peer Brief | peer_competitive, peer_comparison, recommendation | getPeerIndex() |
| Monthly Pulse | overview, trend_analysis, findings | getNationalIndex() with recent date range |
| State Index | regional_analysis, findings, recommendation | getDistrictMedianByCategory() |

### HamiltonLeftRail Screen Detection

The left rail reads the URL pathname to show screen-specific sections. For the Reports screen, `LEFT_RAIL_CONFIG.Reports` already defines:
- primaryAction: "Export PDF"
- sections: ["Report History", "Templates"]

The left rail shows "Generate your first report" as empty state for Report History.

### next.config.ts Update Needed

Must add `serverExternalPackages: ['@react-pdf/renderer']` to prevent bundling issues with the PDF renderer in Next.js server actions/routes.

## File Inventory

| File | Status | Action |
|------|--------|--------|
| `src/app/pro/(hamilton)/reports/page.tsx` | Missing | Create |
| `src/app/pro/(hamilton)/reports/actions.ts` | Missing | Create |
| `src/app/api/pro/report-pdf/route.ts` | Missing | Create |
| `src/components/hamilton/reports/ReportWorkspace.tsx` | Missing | Create |
| `src/components/hamilton/reports/TemplateCard.tsx` | Missing | Create |
| `src/components/hamilton/reports/ConfigSidebar.tsx` | Missing | Create |
| `src/components/hamilton/reports/ReportOutput.tsx` | Missing | Create |
| `src/components/hamilton/reports/ReportSection.tsx` | Missing | Create |
| `src/components/hamilton/reports/StatCalloutBox.tsx` | Missing | Create |
| `src/components/hamilton/reports/GeneratingState.tsx` | Missing | Create |
| `src/components/hamilton/reports/EmptyState.tsx` | Missing | Create |
| `src/components/hamilton/reports/PdfDocument.tsx` | Missing | Create (server-only) |
| `next.config.ts` | Exists | Update serverExternalPackages |
| `package.json` | Exists | Install @react-pdf/renderer |

## Patterns to Follow

From Analyze screen:
- Server component page → client workspace component pattern
- Server actions in `actions.ts` co-located with page
- Hamilton CSS vars: `--hamilton-surface`, `--hamilton-card`, `--hamilton-accent`, etc.
- `.hamilton-card` class for cards
- Newsreader serif (`--hamilton-font-serif`) for headings
- Geist Sans (`--hamilton-font-sans`) for body

From `HamiltonShell`:
- Two-column layout: left rail (256px) + main content (flex-1)
- The report builder adds a third panel split: config sidebar (280px) + report content (flex-1) inside main

## Risk Assessment

**LOW:** hamilton_reports table already exists, hamilton_scenarios table exists, generateSection() is proven
**MEDIUM:** @react-pdf/renderer not installed — needs npm install and next.config.ts update
**LOW:** No streaming needed — batch generation is simpler and fits the read-only report pattern
**LOW:** Scenario selector can read directly from hamilton_scenarios with a simple DB query
