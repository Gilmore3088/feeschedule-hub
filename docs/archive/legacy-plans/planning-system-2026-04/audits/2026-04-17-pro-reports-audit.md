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

---

## Round 2 (2026-04-17, post-deploy verification on screenshot)

After the first round of fixes shipped, a fresh screenshot revealed C-1 had **not** actually resolved (icons still rendered as text) and several additional issues became visible.

### Round 2 — Critical

#### C-1 (revisited). Material Symbols still render as text — root cause is CSP, not link placement
- **Real cause:** `next.config.ts` Content-Security-Policy has `font-src 'self'`. The Material Symbols stylesheet from `fonts.googleapis.com` loaded successfully (so the `.material-symbols-outlined` class definition exists), but the actual font file at `https://fonts.gstatic.com` was blocked by CSP. With no font, the browser falls back to system font and renders the literal ligature text ("group_work", "download", etc.).
- **Fix:** Add `https://fonts.gstatic.com` to `font-src` and `https://fonts.googleapis.com` to `style-src` in next.config.ts. Requires dev-server restart.

### Round 2 — High

#### H-4. "Your Institution" hardcoded in Configuration sidebar
- **Where:** `ReportWorkspace.tsx:385` — `institutionName="Your Institution"` hardcoded.
- **Symptom:** Sidebar shows "INSTITUTION: Your Institution" + "CONFIGURE IN SETTINGS" prompt, even though the user is clearly Space Coast FCU (visible in left rail context bar).
- **Impact:** Looks like a stub. Bankers see "Your Institution" and assume the platform has no idea who they are.
- **Fix:** ReportsPage already calls `getCurrentUser()`. Pass `user.institution_name` (or display_name) to ReportWorkspace.

### Round 2 — Medium

#### M-4. Preview tabs (PREVIEW / BOARD / ANALYST / EXPORT) render before any report exists
- **Where:** `ReportWorkspace.tsx:289-318`
- **Symptom:** All 4 output tabs are visible (active "Preview" underlined) even with no report generated. Tabs are functional UI for output that doesn't exist.
- **Fix:** Hide the tab strip until `reportGenerated === true`.

#### M-5. Empty-state preview placeholder dominates the page
- **Where:** `ReportWorkspace.tsx:332-378`
- **Symptom:** A 12-padding card with a giant italic Hamilton quote, two placeholder paragraphs, "Powered by Hamilton AI Research Analyst" footer — takes ~400px of vertical real estate when no report exists. Bankers see this every time they land on the page.
- **Fix:** Demote to a small inline hint (~80px) — "Pick a template above to begin." Reserve the dominant placeholder for actual generation states.

### Round 2 — Resolutions

All 4 round-2 findings shipped together — see commits `fix(reports):` 2026-04-17 v2 batch.
