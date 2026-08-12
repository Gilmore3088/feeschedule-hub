# Auto-Review Rules for Fee Extraction Pipeline

## Overview

The review queue has 6,448 flagged fees — 87% flagged solely for `duplicate_fee_name` (legitimate variants like safe deposit box sizes), 92.5% with extraction confidence >= 90%. The user bulk-approved thousands manually. This plan makes the existing validation pipeline smarter: demote `duplicate_fee_name` to non-blocking, add category-specific amount bounds, and enhance `determine_review_status()` to auto-approve high-confidence fees that pass all checks.

## Problem Statement

The current validation pipeline in `fee_crawler/validation.py` uses a flat $0-$500 amount range for all 49 fee categories and treats `duplicate_fee_name` as a `warning` severity — which causes every duplicate to be flagged. This creates two problems:

1. **Mass false flags**: 5,620 fees flagged only for `duplicate_fee_name` are overwhelmingly valid (tiered safe deposit box sizes, per-account-type maintenance fees). The `warning` severity on line 111 of `validation.py` is the root cause — changing it to `info` solves 87% of the backlog instantly.
2. **Missed bad data**: Fees at $150,000 (misextracted platform payments), $10,000 (minimum balance requirements), and $2,500 (money market opening deposits) pass the flat $500 ceiling because they're uncategorized. Category-specific bounds would catch these.

**Current data snapshot:**

| Status | Count | Notes |
|--------|-------|-------|
| Approved | 56,993 | Bulk approved by admin |
| Flagged | 6,448 | 87% are duplicate-only flags |
| Rejected | 1 | Essentially unused |

| Flag Type | Count | Resolution |
|-----------|-------|------------|
| `duplicate_fee_name` only | 5,620 | Demote to `info` severity → auto-stage |
| `amount_null_suspicious` only | 4,065 | Already `info` severity → no change needed |
| `low_confidence` combos | 288 | Keep for human review |
| Amount outliers (>$200) | ~20 | Category bounds catch these |

## Proposed Solution

### The One-Line Fix (Phase 1)

Change `duplicate_fee_name` severity from `"warning"` to `"info"` in `validation.py` line 111. Since `determine_review_status()` only flags fees with `error` or `warning` severity, this single change means 5,620 duplicate-only fees will be `staged` instead of `flagged` on the next backfill. This captures 87% of the value.

### Category-Specific Amount Bounds (Phase 2)

Replace the flat `TYPICAL_FEE_MAX = 500.0` with per-category bounds. These live in a new `fee_crawler/fee_amount_rules.py` module — a pure data dict following the same pattern as `FEE_FAMILIES` in `fee_analysis.py`.

```python
# (min_amount, max_amount, hard_ceiling, allows_zero)
#
# min_amount/max_amount: outside this → warning (flagged for human review)
# hard_ceiling: above this → error (auto-reject candidate)
# allows_zero: True if $0 is a legitimate value

FEE_AMOUNT_RULES: dict[str, tuple[float, float, float, bool]] = {
    # Spotlight (6)
    "monthly_maintenance":    (0.00,   25.00,   50.00, True),
    "overdraft":              (5.00,   40.00,   75.00, False),
    "nsf":                    (5.00,   40.00,   75.00, False),
    "atm_non_network":        (0.50,    5.00,   10.00, True),
    "card_foreign_txn":       (0.50,    5.00,   10.00, True),
    "wire_domestic_outgoing":  (5.00,  50.00,   75.00, False),

    # Core (9)
    "stop_payment":           (10.00,  40.00,   75.00, False),
    "wire_intl_outgoing":     (10.00,  85.00,  125.00, False),
    "wire_domestic_incoming":  (0.00,  25.00,   50.00, True),
    "cashiers_check":          (3.00,  25.00,   50.00, False),
    "od_protection_transfer":  (0.00,  20.00,   50.00, True),
    "paper_statement":         (1.00,  10.00,   25.00, True),
    "minimum_balance":         (0.00,  25.00,   50.00, True),
    "card_replacement":        (0.00,  15.00,   30.00, True),
    "deposited_item_return":   (3.00,  30.00,   50.00, False),

    # Extended (15)
    "dormant_account":        (2.00,   25.00,   50.00, False),
    "early_closure":          (5.00,   50.00,  100.00, True),
    "money_order":            (1.00,   15.00,   25.00, False),
    "wire_intl_incoming":     (0.00,   30.00,   50.00, True),
    "continuous_od":          (1.00,   15.00,   30.00, False),
    "atm_international":      (1.00,    7.00,   15.00, False),
    "garnishment_levy":       (15.00, 150.00,  250.00, False),
    "safe_deposit_box":       (15.00, 500.00,  750.00, False),
    "account_research":        (5.00,  50.00,  100.00, False),
    "check_printing":          (5.00,  50.00,  100.00, False),
    "coin_counting":           (0.00,  15.00,   30.00, True),
    "ach_origination":         (0.00,  15.00,   30.00, True),
    "ach_return":              (2.00,  35.00,   50.00, False),
    "rush_card":              (10.00,  50.00,   75.00, False),
    "late_payment":            (5.00,  50.00,  100.00, False),

    # Comprehensive (19)
    "od_daily_cap":           (25.00, 300.00,  500.00, False),
    "nsf_daily_cap":          (25.00, 300.00,  500.00, False),
    "od_line_of_credit":       (0.00,  35.00,   75.00, True),
    "counter_check":           (0.50,  10.00,   20.00, False),
    "check_cashing":           (2.00,  25.00,   50.00, False),
    "check_image":             (1.00,  15.00,   30.00, False),
    "bill_pay":                (0.00,  15.00,   25.00, True),
    "mobile_deposit":          (0.00,   5.00,   10.00, True),
    "zelle_fee":               (0.00,   5.00,   10.00, True),
    "cash_advance":            (2.00,  50.00,  100.00, False),
    "night_deposit":           (0.00,  25.00,   50.00, True),
    "notary_fee":              (0.00,  15.00,   25.00, True),
    "legal_process":          (15.00, 150.00,  250.00, False),
    "account_verification":    (2.00,  25.00,   50.00, True),
    "balance_inquiry":         (0.00,   5.00,   10.00, True),
    "estatement_fee":          (0.00,   5.00,   10.00, True),
    "loan_origination":        (0.25,   5.00,   10.00, False),
    "appraisal_fee":         (200.00, 800.00, 1500.00, False),
    "card_dispute":            (0.00,  25.00,   50.00, True),
}

FALLBACK_RULES = (0.00, 500.00, 1000.00, True)

# Substrings that indicate misextracted non-fee data (balance reqs, limits, rates)
NON_FEE_SUBSTRINGS = [
    "minimum balance", "min balance", "opening deposit", "opening balance",
    "daily limit", "daily balance", "interest rate", " apy",
    "ncua operating", "fdic assessment",
]
```

### Enhanced `determine_review_status()` (Phase 3)

Upgrade the existing function in `validation.py` to return `"approved"` when a fee passes all checks. No separate auto-review engine needed — the existing pipeline already calls this function for every fee.

```
Current logic:
  warning/error flags → "flagged"
  confidence >= 0.85   → "staged"
  else                 → "pending"

New logic:
  error flags                              → "flagged"
  warning flags (excluding benign)         → "flagged"
  confidence >= 0.90 + amount in range     → "approved"  ← NEW
  confidence >= 0.85                       → "staged"
  else                                     → "pending"
```

The auto-approve path fires when:
1. No `error` or non-benign `warning` flags
2. Confidence >= 0.90
3. `fee_category` is set
4. Amount is within `[min, max]` for the category (or NULL and `allows_zero`)

Benign warnings that don't block auto-approve: `duplicate_fee_name`. The `amount_null_suspicious` flag is `info` severity (already non-blocking), but auto-approve additionally checks `allows_zero` for the category — if the category doesn't allow zero and amount is null, the fee is staged, not auto-approved.

### Backfill Existing Fees (Phase 4)

Re-run `backfill_validation.py` to reprocess the 6,448 flagged fees with the new rules. The existing backfill command already does exactly this — it re-validates all fees and updates `review_status` and `validation_flags`. No new CLI command needed.

## Technical Approach

### Phase 1: Demote `duplicate_fee_name` severity

**File: `fee_crawler/validation.py`** (line 111)

- [x] Change `severity="warning"` to `severity="info"` in `_check_duplicate()`
- [x] This single change means `duplicate_fee_name` no longer triggers `"flagged"` status

### Phase 2: Category-specific amount rules

**File: `fee_crawler/fee_amount_rules.py`** (new)

- [x] Define `FEE_AMOUNT_RULES` dict with bounds for all 49 categories
- [x] Define `FALLBACK_RULES` tuple for uncategorized fees
- [x] Define `NON_FEE_SUBSTRINGS` list for detecting misextracted non-fee data

### Phase 3: Upgrade validation pipeline

**File: `fee_crawler/validation.py`** (modify)

- [x] Import `FEE_AMOUNT_RULES`, `FALLBACK_RULES`, `NON_FEE_SUBSTRINGS` from `fee_amount_rules`
- [x] Update `_check_amount_range()` to use category-specific bounds when `fee_category` is available, falling back to flat $0-$500 when not
- [x] Add `_check_non_fee_data(fee)` — checks fee name against `NON_FEE_SUBSTRINGS`, returns `error` severity flag
- [x] Update `determine_review_status()` to add an `"approved"` return path:
  - Only `info`-severity flags (no errors, no warnings)
  - Confidence >= 0.90
  - `fee_category` is set (passed via new optional param)
  - Amount within `[min, max]` for category (or null + allows_zero)
- [x] Update `validate_fee()` to accept optional `fee_category` param
- [x] Update `validate_and_classify_fees()` to pass `fee_category` through
- [x] Write audit records for auto-approved fees: `action='auto_approve'`, `username='system/auto-review'` (in backfill)

### Phase 4: Backfill existing fees

- [x] Run `python3 -m fee_crawler validate` to reprocess all fees with new rules
- [x] Verify: flagged count drops from 6,448 to 2,033 (genuine outliers + uncategorized)
- [x] Verify: no false auto-approvals in spot-check of 20 random auto-approved fees

## Design Decisions

### Why Enhance `validation.py` Instead of a Separate Engine

The reviewers unanimously agreed: the existing `determine_review_status()` function is the right place for this logic. It already makes the staged/flagged/pending decision for every fee. Adding an `"approved"` return path is a natural extension — not a new system. This avoids a second pass, a separate module, dataclass abstractions, and the timing gap where categorization must run before a separate auto-review step.

### Why Demote `duplicate_fee_name` First

This is the 87%-of-value one-line change. `duplicate_fee_name` at `warning` severity flags every tiered safe deposit box, every per-account-type maintenance fee, every institution with multiple wire fee variants. Demoting to `info` means these pass through `determine_review_status()` without triggering `"flagged"`. Combined with the auto-approve path, most will go straight to `"approved"`.

### Why Python Dict for Rules

The amount rules are tightly coupled to the fee taxonomy (49 categories). They change infrequently (when CFPB/Bankrate publishes new data). A Python dict is version-controlled, code-reviewed, and importable — the same pattern as `FEE_FAMILIES` in `fee_analysis.py`.

### Why 0.90 Confidence for Auto-Approve

The staging threshold is 0.85. Auto-approve should be stricter: 0.90. Fees between 0.85-0.90 confidence get staged for quick human review but not auto-approved. This is a 5% safety buffer.

### Why No Admin Override, Pipeline Integration, or UI Changes (Yet)

Per reviewer feedback:
- **Admin override**: 1 rejected fee exists. Build when someone needs it. Direct DB access covers emergencies.
- **Pipeline integration**: Categorization doesn't run inside `_crawl_one()`, so inline auto-review would skip every new fee. Defer until the crawl pipeline is restructured.
- **UI badges/filters**: The audit trail already stores `action='auto_approve'` and `username='system/auto-review'`. Build UI when someone asks for it.

### Why Substring Matching, Not Regex

The non-fee detection catches ~8-20 misextracted records (minimum balance requirements, deposit limits, APY rates). Seven compiled regexes for 20 records is over-engineered. Simple `if any(s in name_lower for s in NON_FEE_SUBSTRINGS)` catches the same records and is readable.

## Acceptance Criteria

### Functional

- [ ] `duplicate_fee_name` severity changed from `warning` to `info`
- [ ] `FEE_AMOUNT_RULES` covers all 49 taxonomy categories (enforced by assertion matching `FEE_FAMILIES`)
- [ ] `_check_amount_range()` uses category bounds when `fee_category` is available
- [ ] `determine_review_status()` returns `"approved"` for high-confidence, in-range, benign-flag-only fees
- [ ] Non-fee data (minimum balances, deposit limits) flagged with `error` severity
- [ ] Backfill reduces flagged count from 6,448 to ~800
- [ ] All auto-approved fees logged in `fee_reviews` with `action='auto_approve'`, `username='system/auto-review'`
- [ ] Already-approved/rejected fees unchanged by backfill (idempotent)
- [ ] Uncategorized fees without `fee_category` are staged (not auto-approved)

### Non-Functional

- [ ] Backfill processes 63,442 fees in < 30 seconds
- [ ] No false auto-approvals in spot-check of 50 random results
- [ ] Amount rules match CFPB/Bankrate reference data

## Files Modified

| File | Change |
|------|--------|
| `fee_crawler/fee_amount_rules.py` | **New** — Amount rules dict, non-fee substrings |
| `fee_crawler/validation.py` | Demote `duplicate_fee_name` to `info`, category-aware `_check_amount_range()`, auto-approve path in `determine_review_status()`, non-fee data check |

## Verification

```bash
# 1. Dry-run backfill to preview changes
python3 -m fee_crawler backfill-validation --dry-run

# 2. Run backfill for real
python3 -m fee_crawler backfill-validation

# 3. Check new status distribution
sqlite3 data/crawler.db "SELECT review_status, COUNT(*) FROM extracted_fees GROUP BY review_status"

# 4. Spot-check auto-approved fees
sqlite3 data/crawler.db "SELECT ef.fee_category, ef.fee_name, ef.amount, ef.extraction_confidence, ct.institution_name FROM extracted_fees ef JOIN crawl_targets ct ON ef.crawl_target_id = ct.id JOIN fee_reviews fr ON fr.fee_id = ef.id WHERE fr.action = 'auto_approve' ORDER BY RANDOM() LIMIT 50"

# 5. Check remaining flagged fees (should be genuine outliers)
sqlite3 data/crawler.db "SELECT fee_category, COUNT(*), MIN(amount), MAX(amount) FROM extracted_fees WHERE review_status = 'flagged' GROUP BY fee_category ORDER BY COUNT(*) DESC"

# 6. Verify no approved fee has amount above its hard ceiling
sqlite3 data/crawler.db "SELECT fee_category, fee_name, amount FROM extracted_fees WHERE review_status = 'approved' AND amount > 500 AND fee_category NOT IN ('safe_deposit_box', 'od_daily_cap', 'nsf_daily_cap', 'appraisal_fee', 'garnishment_levy', 'legal_process') ORDER BY amount DESC LIMIT 20"
```

## References

### Internal
- Validation pipeline: `fee_crawler/validation.py:147-166` (`determine_review_status`)
- Duplicate flag: `fee_crawler/validation.py:109-114` (`_check_duplicate`, severity="warning")
- Amount range check: `fee_crawler/validation.py:47-66` (`_check_amount_range`, flat $0-$500)
- Backfill command: `fee_crawler/commands/backfill_validation.py` (existing retroactive revalidation)
- Fee taxonomy: `fee_crawler/fee_analysis.py` (49 categories, 9 families)
- Config threshold: `fee_crawler/config.py:41` (`confidence_auto_stage_threshold: 0.85`)

### External
- [Bankrate 2025 Checking Account Survey](https://www.bankrate.com/banking/checking/checking-account-survey/) — OD avg $26.77, ATM surcharge $1.64
- [CFPB Overdraft/NSF Revenue Data](https://www.consumerfinance.gov/data-research/research-reports/data-spotlight-overdraft-nsf-revenue-in-2023-down-more-than-50-versus-pre-pandemic-levels-saving-consumers-over-6-billion-annually/) — Median OD $35, NSF $32
- [Bankrate Wire Transfer Fees](https://www.bankrate.com/banking/wire-transfer-fees/) — Domestic avg $23, intl avg $43
- [MyBankTracker Cashier's Check Comparison](https://www.mybanktracker.com/news/cashiers-check-fee-comparison-top-10-us-banks) — Avg $9.10 at top 10 banks
