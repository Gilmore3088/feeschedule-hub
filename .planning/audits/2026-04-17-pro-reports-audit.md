---
target: /pro/reports (Report Builder)
date: 2026-04-17
reviewer: impeccable:audit
verdict: FAIL on icon rendering, MIXED on layout/content
---

# `/pro/reports` (Report Builder) — Audit Report

**Anti-Patterns Verdict:** FAIL on rendering (Material Symbols broken to literal text), MIXED on layout/content priority.

## Findings

### Critical

#### C-1. Material Symbols icons render as literal text
- **Location:** `src/components/hamilton/reports/ReportWorkspace.tsx:32,40,48,56` template cards + `src/components/hamilton/reports/ReportLibrary.tsx:164` download icon.
- **Symptom:** "group_work" and "map" show as massive terracotta text. "download" appears inline producing the visible "DOWNLOAD DOWNLOAD PDF" double-label.
- **Root cause:** The Material Symbols stylesheet `<link>` is rendered from inside `HamiltonLayout` (a Server Component). Next.js 16 streaming may emit it after the body, leaving the font unloaded when the icons paint. The `material-symbols-outlined` className is correct — the font itself isn't reaching the browser in time, so font-family falls through to the body font and the literal ligature text shows.
- **Impact:** Every icon-heavy surface broken on first paint. Highest priority.
- **Fix:** Move the Material Symbols `<link>` into root `app/layout.tsx` `<head>`.

#### C-2. "DOWNLOAD DOWNLOAD PDF" duplicate label
- **Location:** `ReportLibrary.tsx:164-167`
- **Cause:** Direct consequence of C-1. Resolved together.

### High-Severity

#### H-1. Information hierarchy inverted
- **Location:** `ReportWorkspace.tsx` page-level layout
- **Today:** Published Reports (passive consumption) at top. Generate New Report (the active workflow) at bottom requiring scroll.
- **Why this is wrong:** Page is named "Report Builder." Builders build. Build affordance should be primary.
- **Fix:** Swap order — Generate + Configuration top, Published library below.

#### H-2. All 4 published reports show identical date "March 31, 2026"
- **Symptom:** Every card shows the same publication date.
- **Suspicion:** Seeded fixtures or a `created_at` formatter bug.
- **Impact:** Looks like fake data. Trust hit.
- **Fix:** Verify DB. Surface relative time or include time-of-day if real.

#### H-3. Cards have no content depth
- **Location:** `ReportLibrary.tsx:120-170`
- **Today:** Type label + title + date + 2 buttons. No preview snippet, no page count, no executive summary.
- **Impact:** Bankers can't decide whether to read or download without clicking.
- **Fix:** Add 1–2 sentence summary from `report_json.executive_summary` + page count + "covers N institutions" badge.

### Medium-Severity

#### M-1. "View full archive" link is orphaned
- **Symptom:** Floats above Configuration sidebar with no clear parent.
- **Fix:** Move into Published Reports section header.

#### M-2. Configuration sidebar copy is generic placeholder
- **Symptom:** "Adjust parameters to refine narrative output" — explains nothing.
- **Fix:** Concrete: "Tone, focus area, peer set, period — defaults set from your institution profile."

#### M-3. Template cards lack scannable structure
- **Symptom:** Large icon block + italic title + body + tags — all similar weight.
- **Fix:** Demote icon (smaller, top-right corner). Promote title + 1-line value prop.

## Resolution

This audit is being shipped together with fixes for all 8 findings in commit batch
2026-04-17. See subsequent commits prefixed `fix(reports):` for atomic resolution per finding.
