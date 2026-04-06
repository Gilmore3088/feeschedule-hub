---
phase: "12"
plan: "01"
name: "Hamilton Voice, generateSection API, and Numeric Validator"
subsystem: "hamilton"
tags: [ai-analyst, voice, validation, methodology]
dependency_graph:
  requires: []
  provides: [hamilton-voice, generate-section-api, numeric-validator, methodology-draft]
  affects: [src/lib/hamilton, src/app/admin/methodology]
tech_stack:
  added:
    - "@anthropic-ai/sdk (already installed) — used by generateSection() via Anthropic client"
  patterns:
    - "versioned voice file as single source of truth for AI persona"
    - "typed contract (SectionInput → SectionOutput) for all report generation"
    - "numeric validator with tolerance-aware cross-check"
key_files:
  created:
    - src/lib/hamilton/voice.ts
    - src/lib/hamilton/types.ts
    - src/lib/hamilton/generate.ts
    - src/lib/hamilton/validate.ts
    - src/lib/hamilton/index.ts
    - src/lib/hamilton/validate.test.ts
    - src/lib/hamilton/voice.test.ts
    - src/app/admin/methodology/page.tsx
    - .planning/phases/12-hamilton-foundation/12-01-PLAN.md
  modified:
    - src/app/admin/admin-nav.tsx
decisions:
  - "HAMILTON_VOICE v1.0.0 locked in voice.ts — 6 rules, 14 forbidden terms, built system prompt"
  - "generateSection() uses claude-sonnet-4-20250514 with REQUEST_TIMEOUT_MS=60000"
  - "Numeric validator tolerance: currency ±$0.01, percentages ±0.05, integers ±0.5"
  - "Methodology page is admin-only draft; published URL deferred to Phase 16"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-06"
  tasks_completed: 5
  tasks_total: 5
  files_created: 9
  files_modified: 1
  tests_added: 32
---

# Phase 12 Plan 01: Hamilton Voice, generateSection API, and Numeric Validator Summary

**One-liner:** Hamilton AI analyst module with versioned McKinsey-voice definition, typed `generateSection()` API grounded in source data, zero-tolerance numeric validator, and 8-section methodology paper draft.

## What Was Built

### Hamilton Module (`src/lib/hamilton/`)

Five files forming the complete Hamilton foundation:

- **`voice.ts`** — `HAMILTON_VOICE` v1.0.0 with 6 concrete stylistic rules (encoding D-01 through D-05), 14 forbidden terms with regex patterns, and a system prompt built from the rules array. Single source of truth — all templates import from here.

- **`types.ts`** — TypeScript contract: `SectionType` union (8 types), `SectionInput`, `SectionOutput`, `ValidationResult`, `ValidatedSection`. Clean separation of input/output/validation concerns.

- **`generate.ts`** — `generateSection(input: SectionInput): Promise<SectionOutput>` calling `claude-sonnet-4-20250514`. User message includes labeled DATA block with hard grounding instruction ("use only the figures provided below"). Returns narrative, wordCount, model, and token usage. Throws explicitly on missing API key, API failure, or empty response.

- **`validate.ts`** — `validateNumerics(narrative, sourceData)` extracts all numeric tokens (currency, percentage, integer, decimal) from narrative text, flattens sourceData recursively to collect all numeric leaf values, and cross-checks each narrative number against source values within tolerance. `validateSection()` composes generation output with validation result. No invented statistics pass through.

- **`index.ts`** — Barrel export for clean imports throughout the application.

### Unit Tests (32 passing)

- **`validate.test.ts`** — 22 tests: token extraction (integers, currency, percentages, comma-formatted numbers), source flattening (flat, nested, arrays), validation pass/fail, rounding tolerance at each tier (currency ±$0.01, percentage ±0.05, integer ±0.5), empty inputs, nested source data.

- **`voice.test.ts`** — 12 tests: semver version format, rules count (≥6), forbidden terms count (≥5), D-05 compliance (might, I think, I believe, very, really, quite all present), system prompt contains all rules and data integrity instruction.

### Methodology Paper Draft (`src/app/admin/methodology/page.tsx`)

Eight-section methodology paper accessible at `/admin/methodology`:

1. Introduction — what the index is and why methodology transparency matters
2. Data Sources — FDIC/NCUA APIs, institution websites, FRED, Beige Book (table)
3. Collection Process — deterministic discovery, AI-assisted fallback, Playwright, PDF extraction
4. Fee Categorization — 49 categories, 9 families, 4-tier table (spotlight/core/extended/comprehensive)
5. Confidence Scoring — 0.85 threshold, auto-stage rate, human review queue
6. Validation Process — outlier detection, peer review for anomalies, numeric cross-check
7. Coverage Metrics — maturity classification table (strong/provisional/insufficient)
8. Limitations — 5 named caveats (point-in-time, published vs actual, crawl failures, obfuscation, categorization ambiguity)

Added Methodology nav item to the Research group in `admin-nav.tsx`.

## Commits

| Task | Description | Hash |
|------|-------------|------|
| 1 | Hamilton voice definition, types, barrel export, plan file | a0e72e3 |
| 2 | generateSection() with Claude integration | 09bdd79 |
| 3 | Numeric validator (validateNumerics, validateSection) | a4ca8a3 |
| 4 | Unit tests (32 tests, all passing) | c65a3b4 |
| 5 | Methodology paper draft + admin nav link | f6401a5 |

## Verification

- [x] `npx vitest run src/lib/hamilton/` exits 0 — 32 tests pass (2 test files)
- [x] `src/lib/hamilton/voice.ts` exports `HAMILTON_VOICE` with version 1.0.0, 6 rules, 14 forbidden terms, system prompt
- [x] `src/lib/hamilton/generate.ts` exports `generateSection` with correct TypeScript signature
- [x] `src/lib/hamilton/validate.ts` exports `validateNumerics` and `validateSection`
- [x] `src/app/admin/methodology/page.tsx` created with all 8 sections
- [x] `npx tsc --noEmit` — zero errors in production code (only pre-existing test file vitest type declaration warnings)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the methodology page uses hardcoded content constants (not database-driven), which is intentional: it is a static document, not a dynamic report.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. `generateSection()` is a server-side function requiring `ANTHROPIC_API_KEY` env var (already in env schema). Methodology page is behind `requireAuth("view")`.

## Self-Check: PASSED

All created files confirmed readable. All 5 commits confirmed in git log. 32 unit tests pass.
