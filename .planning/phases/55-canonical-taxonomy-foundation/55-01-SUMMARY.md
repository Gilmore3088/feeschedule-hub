---
phase: 55-canonical-taxonomy-foundation
plan: "01"
subsystem: fee-taxonomy
tags: [taxonomy, classification, migration, python, typescript, tdd]
dependency_graph:
  requires: []
  provides: [canonical_fee_key schema, CANONICAL_KEY_MAP, classify_fee, NEVER_MERGE guards, TS mirror]
  affects: [fee_crawler/fee_analysis.py, src/lib/fee-taxonomy.ts, extracted_fees table]
tech_stack:
  added: [CANONICAL_KEY_MAP (Python + TS), classify_fee(), detect_variant_type()]
  patterns: [expand-and-contract migration, NEVER_MERGE guard tests, cross-language sync test]
key_files:
  created:
    - supabase/migrations/20260409_canonical_fee_key.sql
    - fee_crawler/tests/test_never_merge.py
    - fee_crawler/tests/test_classify_fee.py
    - src/lib/fee-taxonomy.test.ts
  modified:
    - fee_crawler/fee_analysis.py
    - src/lib/fee-taxonomy.ts
decisions:
  - "CANONICAL_KEY_MAP uses identity mapping for all 49 base categories; synonym clusters added as extras (8 clusters)"
  - "NEVER_MERGE guard test uses FEE_FAMILIES membership check (not FEE_NAME_ALIASES values) because od_daily_cap/nsf_daily_cap are detected via _detect_cap_category() not alias lookup"
  - "FEE_NAME_ALIASES alias count is 680 unique (708 raw lines with some duplicates); the plan estimate of ~752 was an overcount — no new aliases were needed, synonym clusters added ~35 entries"
  - "CREATE INDEX without CONCURRENTLY is safe on 15K rows — avoids transaction block restriction in Supabase migrations"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-09"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 2
---

# Phase 55 Plan 01: Canonical Taxonomy Foundation — Summary

**One-liner:** Schema migration adding canonical_fee_key/variant_type to extracted_fees, CANONICAL_KEY_MAP (57 entries) with classify_fee() wrapper, NEVER_MERGE guard tests (7 regulatory pairs), and TypeScript mirror with cross-language sync test.

## What Was Built

### Task 1: Schema Migration + NEVER_MERGE Guard Tests

**Migration** (`supabase/migrations/20260409_canonical_fee_key.sql`):
- Idempotent `ALTER TABLE extracted_fees ADD COLUMN IF NOT EXISTS canonical_fee_key TEXT`
- Idempotent `ALTER TABLE extracted_fees ADD COLUMN IF NOT EXISTS variant_type TEXT`
- Partial index `idx_fees_canonical_key` on non-null canonical_fee_key rows
- Column comments documenting the expand-and-contract pattern

**NEVER_MERGE_PAIRS** added to `fee_analysis.py` (7 regulatory pairs):
- `(nsf, overdraft)` — returned vs. paid item distinction
- `(wire_domestic_outgoing, wire_intl_outgoing)` — domestic vs. international
- `(wire_domestic_incoming, wire_intl_incoming)` — domestic vs. international
- `(atm_non_network, card_replacement)` — ATM fee vs. card issuance
- `(od_protection_transfer, overdraft)` — transfer fee vs. item fee
- `(od_daily_cap, overdraft)` — aggregate cap vs. per-item fee
- `(nsf_daily_cap, nsf)` — aggregate cap vs. per-item fee

**Guard tests** (`fee_crawler/tests/test_never_merge.py`): 24 parametrized tests verifying all 7 pairs are present, alias sets are disjoint, and both members are valid FEE_FAMILIES categories.

### Task 2: CANONICAL_KEY_MAP, classify_fee(), detect_variant_type(), TypeScript Mirror

**CANONICAL_KEY_MAP** added to `fee_analysis.py` (57 entries):
- 49 identity-mapped base categories (fee_category == canonical_fee_key)
- 8 synonym cluster mappings: rush_card_delivery, estatement, check_image_charge, skip_a_pay, return_mail, club_account, fax_fee, safe_deposit

**New functions** in `fee_analysis.py`:
- `detect_variant_type(raw_name, fee_category)` — detects rush/express/waived/daily_cap/per_item/temporary
- `classify_fee(raw_name)` — returns `(fee_category, canonical_fee_key, variant_type)` 3-tuple

**FEE_NAME_ALIASES expansion**: 35 new synonym cluster aliases added (skip-a-pay variants, return_mail variants, club_account variants, fax_fee variants)

**TypeScript mirror** (`src/lib/fee-taxonomy.ts`): Added `CANONICAL_KEY_MAP` (57 entries) and `CANONICAL_KEY_COUNT` constant mirroring Python exactly.

**Sync test** (`src/lib/fee-taxonomy.test.ts`): 4 vitest assertions verifying every FEE_FAMILIES category is in CANONICAL_KEY_MAP, count >= 49, identity mapping holds, and all values are non-empty strings.

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| `test_never_merge.py` | 24 | All pass |
| `test_classify_fee.py` | 17 | All pass |
| `fee-taxonomy.test.ts` | 4 | All pass |
| **Total** | **45** | **All pass** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NEVER_MERGE sanity test used wrong membership check**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test asserted `od_daily_cap` and `nsf_daily_cap` exist as values in `FEE_NAME_ALIASES` — but these are classified via `_detect_cap_category()`, not alias lookup, so they never appear as alias targets
- **Fix:** Changed assertion to check `FEE_FAMILIES` membership (which these categories are valid members of)
- **Files modified:** `fee_crawler/tests/test_never_merge.py`
- **Commit:** 37ac2f3

## Known Stubs

None. This plan creates data infrastructure only — no UI stubs.

## Threat Flags

No new network endpoints, auth paths, or trust boundary changes introduced. The `classify_fee()` function operates entirely on in-memory data structures; it does not execute SQL and cannot introduce injection vectors. The migration uses parameterized DDL with no user-controlled input.

## Self-Check: PASSED

All files exist:
- FOUND: supabase/migrations/20260409_canonical_fee_key.sql
- FOUND: fee_crawler/fee_analysis.py (modified)
- FOUND: fee_crawler/tests/test_never_merge.py
- FOUND: fee_crawler/tests/test_classify_fee.py
- FOUND: src/lib/fee-taxonomy.ts (modified)
- FOUND: src/lib/fee-taxonomy.test.ts

All commits exist:
- 37ac2f3: feat(55-01): add canonical_fee_key migration, NEVER_MERGE_PAIRS, and guard tests
- c3142a2: feat(55-01): add CANONICAL_KEY_MAP, classify_fee(), detect_variant_type(), TS mirror
