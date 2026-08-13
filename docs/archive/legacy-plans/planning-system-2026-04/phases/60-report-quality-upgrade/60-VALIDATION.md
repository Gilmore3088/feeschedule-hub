---
phase: 60-report-quality-upgrade
created: 2026-04-11
---

# Phase 60: Validation Strategy

## Requirements to Test Map

| Req ID | What to Test | Type | Command | Status |
|--------|-------------|------|---------|--------|
| RPT-01 | `total_service_charges * 1000` in `getRevenueTrend()` | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | Exists (check coverage) |
| RPT-01 | Dollar columns multiplied, ratio columns unchanged | unit | `npx vitest run src/lib/crawler-db/financial.test.ts` | Wave 0 |
| RPT-02 | `getFredSummary()` returns non-null `gdp_growth_yoy_pct` when GDPC1 present | unit | `npx vitest run src/lib/crawler-db/fed.test.ts` | Exists (extend) |
| RPT-02 | `getBeigeBookThemes()` topic filter returns fee-relevant themes | unit | `npx vitest run src/lib/crawler-db/fed.test.ts` | Exists (extend) |
| RPT-02 | National quarterly assembler includes `beige_themes` in payload | unit | `npx vitest run src/lib/report-assemblers/national-quarterly.test.ts` | Exists (extend) |
| RPT-03 | `renderNationalQuarterlyReport()` HTML contains `class="so-what-box"` per chapter | unit | `npx vitest run src/lib/report-templates/` | Wave 0 |

## Sampling Rate

- **Per task commit:** `npx vitest run src/lib/crawler-db/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

## Wave 0 Gaps

- [ ] `src/lib/crawler-db/financial.test.ts` -- covers RPT-01 scaling, dollar vs ratio columns
- [ ] `src/lib/report-templates/national-quarterly.test.ts` -- HTML output structure assertions (so-what-box count, pullQuote usage)

Existing `call-reports.test.ts`, `fed.test.ts`, and `national-quarterly.test.ts` exist and can be extended rather than created from scratch.

## Risk Areas

- FRED series availability (GDPC1, PSAVERT, DRCBLACBS) -- mitigated by null handling in getFredSummary()
- beige_book_themes table may be empty -- mitigated by fallback to getBeigeBookHeadlines()
- Thousands scaling must NOT apply to ratio columns -- TDD test explicitly asserts ratio columns unchanged
