# Phase 55: Canonical Taxonomy Foundation - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Every existing extracted fee row gets a stable canonical_fee_key. The 49-category taxonomy expands to ~200 canonical keys covering the 15K+ long-tail. NEVER_MERGE guard tests prevent false regulatory category merges. Roomba runs post-backfill to flag suspicious assignments.

</domain>

<decisions>
## Implementation Decisions

### Canonical Key Map Design
- Expand existing FEE_NAME_ALIASES in fee_analysis.py from 752 to ~1500+ aliases covering ~200 canonical keys — Python remains authoritative, TypeScript mirrors
- Unmatched long-tail categories get canonical_fee_key = NULL (same NULL-if-unmatched contract as fee_category today)
- canonical_fee_key coexists with fee_category — fee_category is the raw normalized name, canonical_fee_key is the aggregation key. Different purposes.
- variant_type extraction via regex patterns in fee_analysis.py detecting prefixes/suffixes: "rush", "express", "daily_cap", "per_item", "waived"

### Migration & Backfill Strategy
- Expand-and-contract pattern: add nullable canonical_fee_key + variant_type columns, backfill, verify index counts unchanged, then switch queries
- SQL UPDATE for canonical_fee_key (fast, alias lookup is deterministic); Python loop only for variant_type regex extraction
- Snapshot national index counts before backfill, re-compute after, assert zero regression — automated test
- Port categorize_fees.py to Postgres %s placeholders to match llm_batch_worker.py — single DB path, kill SQLite syntax

### NEVER_MERGE Guards & Roomba
- Guard these 7 distinction pairs (all are regulatory or semantic boundaries):
  1. NSF vs Overdraft (OD)
  2. Domestic vs International wire
  3. ATM vs Card replacement
  4. OD protection transfer vs OD fee
  5. OD daily cap vs OD fee (cap is a policy limit, not a fee amount)
  6. NSF daily cap vs NSF fee (same distinction)
  7. Daily fee caps (od_daily_cap, nsf_daily_cap) vs their base fees (overdraft, nsf)
- pytest parametrized test asserting no two guarded categories share any alias — runs in CI before any alias expansion
- Roomba's amount outlier + inferred fee sweeps run after backfill to flag suspicious canonical assignments
- Extend existing roomba_log table to log canonical_fee_key assignments with old/new values

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- fee_analysis.py: 752 aliases → 49 categories, normalize_fee_name(), get_fee_family(), _detect_cap_category(), _match_regex_patterns()
- fee-taxonomy.ts: TypeScript mirror of Python taxonomy (49 categories, 9 families, 4 tiers, display names, colors)
- roomba.py: 4 sweeps (outliers, duplicates, inferred fees, recategorization) with roomba_log audit trail
- categorize_fees.py: batch classification command (needs SQLite → Postgres port)
- llm_batch_worker.py: production INSERT path via _write_extracted_fees() — already calls normalize_fee_name() + get_fee_family()

### Established Patterns
- fee_category populated at INSERT time by normalize_fee_name() in llm_batch_worker
- fee_family populated at INSERT time by get_fee_family() in llm_batch_worker
- NULL-if-unmatched contract: fees with fee_category IS NULL are skipped by backfill_validation
- Roomba logs all changes to roomba_log table (fee_id, field_changed, old_value, new_value, reason)
- FEE_NAME_ALIASES dict organized by family with inline comments (818 lines)

### Integration Points
- extracted_fees table: add canonical_fee_key TEXT, variant_type TEXT columns
- llm_batch_worker._write_extracted_fees(): add canonical_fee_key to INSERT
- fee_analysis.py: new CANONICAL_KEY_MAP or expanded FEE_NAME_ALIASES
- fee-taxonomy.ts: mirror any new canonical keys for UI display
- getNationalIndex() and getPeerIndex(): optionally use canonical_fee_key for aggregation

</code_context>

<specifics>
## Specific Ideas

- The taxonomy strategy doc proposes 5-phase internal approach: normalize duplicates → consolidate synonyms → populate fee_family → create canonical_fee_key → extract variant_type
- Current data: 15,575 rows, 92% appear at only 1 institution, massive fragmentation
- Known synonym clusters from taxonomy strategy: skipapay variants (3), return_mail variants (3), club account variants (3), fax variants (4), overnight/express variants (3)
- Known duplicates: rush_card/rush_card_delivery, estatement/estatement_fee, check_image/check_image_charge

</specifics>

<deferred>
## Deferred Ideas

- Switching getNationalIndex() queries to use canonical_fee_key instead of fee_category — belongs in a separate query migration after backfill verified
- LLM-assisted classification for unmatched long-tail — Phase 56 (CLS-02)

</deferred>
