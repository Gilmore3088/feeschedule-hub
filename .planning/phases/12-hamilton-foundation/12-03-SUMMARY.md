---
phase: 12-hamilton-foundation
plan: "03"
subsystem: ui
tags: [html-templates, pdf, report-generation, typography, newsreader, geist, warm-palette]

requires:
  - phase: 12-hamilton-foundation-plan-02
    provides: Hamilton voice.ts and generateSection() API with numeric validator

provides:
  - Pure TypeScript HTML component library for report template composition
  - PALETTE constant with 11 warm-brand color tokens
  - TYPOGRAPHY constant with serif/sans/mono font stacks for standalone HTML
  - REPORT_CSS inline stylesheet with Google Fonts Newsreader import
  - 8 component builder functions: coverPage, sectionHeader, dataTable, chartContainer, pullQuote, footnote, hamiltonNarrativeBlock, pageBreak
  - wrapReport() function producing complete standalone HTML documents for Playwright PDF
  - Public index.ts entry point exporting all components and constants

affects:
  - 12-hamilton-foundation-plan-04 (templates for specific report types use these base components)
  - 12-hamilton-foundation-plan-05 (methodology paper page uses this template system)
  - Phase 13 (Playwright PDF renderer calls wrapReport() output directly)

tech-stack:
  added: []
  patterns:
    - "Pure function HTML composition: all components are (props) => string, no React, no AI calls, no side effects"
    - "PALETTE-interpolated CSS: all color references in REPORT_CSS use PALETTE.* constants, never raw hex strings"
    - "Defensive escapeHtml: all user-supplied strings pass through escapeHtml before HTML insertion"
    - "Standalone HTML output: wrapReport() inlines all CSS so output can be passed to Playwright page.setContent()"

key-files:
  created:
    - src/lib/report-templates/base/styles.ts
    - src/lib/report-templates/base/components.ts
    - src/lib/report-templates/base/layout.ts
    - src/lib/report-templates/index.ts
  modified: []

key-decisions:
  - "PALETTE interpolation in REPORT_CSS: all CSS color values are interpolated from PALETTE const so any future palette change updates the entire stylesheet atomically"
  - "escapeHtml on hamiltonNarrativeBlock: applied defensively on Claude output — prevents XSS if report HTML is ever served in a browser frame (T-12-09 threat mitigation)"
  - "em dash for null cells: dataTable renders null/undefined as U+2014 em dash, not the string 'null' or empty string"
  - "Google Fonts Newsreader import via @import in REPORT_CSS: reports are standalone HTML without Next.js font loading, so Google Fonts CDN is the only option for Newsreader"

patterns-established:
  - "Report components are pure functions: (props) => HTML string — no state, no side effects, no async"
  - "All report HTML composition: import from @/lib/report-templates (index.ts), never from base/ subfiles directly"
  - "dataTable percent format: positive values get explicit + prefix (+23.4%), negatives get natural minus (-5.1%)"

requirements-completed:
  - TMPL-01
  - TMPL-03

duration: 25min
completed: 2026-04-06
---

# Phase 12 Plan 03: Report Template Base Components Summary

**Pure TypeScript HTML component library with PALETTE-interpolated REPORT_CSS, Newsreader serif headings, and 8 composable builder functions for Playwright PDF-ready standalone report documents**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-06T21:16:00Z
- **Completed:** 2026-04-06T21:41:48Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments

- Defined PALETTE (11 color tokens), TYPOGRAPHY (3 font stacks), and REPORT_CSS (complete inline stylesheet with Google Fonts Newsreader import) matching the exact warm brand palette from D-08
- Built 8 pure component functions: coverPage, sectionHeader, dataTable, chartContainer, pullQuote, footnote, hamiltonNarrativeBlock, pageBreak
- Implemented wrapReport() that produces complete standalone HTML documents (DOCTYPE + head + inlined REPORT_CSS + body) ready for Playwright page.setContent() + page.pdf()
- All CSS color references use PALETTE interpolation — no raw hex strings in the CSS template literal
- XSS protection via escapeHtml on all user-supplied strings per T-12-09 threat mitigation

## Task Commits

Each task was committed atomically:

1. **Task 1: styles.ts — palette constants and inline CSS string** - `da208b1` (feat)
2. **Task 2: components.ts + layout.ts + index.ts — pure HTML component functions** - `df6b1b6` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/lib/report-templates/base/styles.ts` - PALETTE (11 tokens), TYPOGRAPHY (3 stacks), REPORT_CSS (complete inline stylesheet)
- `src/lib/report-templates/base/components.ts` - 8 pure HTML builder functions with escapeHtml on all inputs
- `src/lib/report-templates/base/layout.ts` - wrapReport() wrapping component HTML in complete standalone document
- `src/lib/report-templates/index.ts` - Public entry point re-exporting all components, types, and constants

## Decisions Made

- Used PALETTE constant interpolation in REPORT_CSS template literal so changing any color token updates the entire stylesheet — no divergence between PALETTE object and CSS string values
- Applied escapeHtml defensively in hamiltonNarrativeBlock even though Hamilton output is expected to be plain text — mitigates T-12-09 (XSS if report HTML served in browser frame)
- Rendered null/undefined table cells as U+2014 em dash rather than "null" or empty — consistent with editorial standards for missing data
- Chose Google Fonts @import for Newsreader since reports are standalone HTML files without Next.js font loading infrastructure

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in `src/lib/crawler-db/fees.test.ts` and other test files (vitest not installed as dev dependency in this environment) are unrelated to report-templates and existed before this plan. All report-templates files compile with zero TypeScript errors.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All files are pure TypeScript library code with no runtime side effects. The chartContainer src attribute accepts server-side-provided values only (T-12-11 — accepted, no user-controlled src).

## Known Stubs

None — this plan builds infrastructure (component functions), not data-rendering pages. No placeholders or hardcoded empty values that flow to UI.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 04 (specific report type templates) can now import from `@/lib/report-templates` to compose coverPage + sectionHeader + hamiltonNarrativeBlock + dataTable into report-type-specific templates
- Plan 05 (methodology paper) can use wrapReport() + these components for the draft page
- Phase 13 (Playwright PDF renderer) receives complete HTML from wrapReport() — no further layout work needed at PDF generation time
- All 8 components verified: correct CSS classes, null handling, percent formatting, HTML escaping

---
*Phase: 12-hamilton-foundation*
*Completed: 2026-04-06*
