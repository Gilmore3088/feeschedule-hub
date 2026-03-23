# Fix Fee Review Throughput

## Overview

58 approved fees out of 18,000+ observations (0.3% approval rate). The review system exists and is well-built (status tabs, outlier triage, keyboard nav, inline edits, bulk actions), but review throughput is too low because fees are reviewed one-at-a-time in a flat list. The user suspects many individual fee instances are "just coded wrong" — meaning miscategorized or with bad amounts.

This plan adds three focused improvements to 10x review speed.

## Problem Statement

1. **Category-blind review**: Fees from all 49 categories appear in one flat list. A reviewer seeing "Wire Transfer Fee: $25" has no context about whether $25 is normal for that category.
2. **No quick "approve the obvious" path**: A fee with 95% confidence, within P25-P75 range, and no flags should take zero time — but it still requires manual click-through.
3. **No category-level quality view**: There's no way to see "37 of 40 overdraft fees look correct, approve them all, then fix the 3 outliers."

## Proposed Solution: Category-Grouped Review Mode

### Phase 1: Category Review Page (`/admin/review/categories`)

A new page that shows each fee category as a card with:
- Category name + family
- Total fees count (staged/flagged/pending/approved)
- Median amount, P25-P75 range
- Mini histogram of amounts
- "% ready to approve" — fees within bounds, high confidence, no flags
- Action: "Review this category" → opens category-focused review

**Files:**
- New: `src/app/admin/review/categories/page.tsx`
- Use: `src/lib/crawler-db/core.ts` → existing `getFeeCategorySummaries()`
- Use: `src/lib/crawler-db/fees.ts` → fee query functions
- Use: `src/lib/fee-taxonomy.ts` → `getDisplayName()`, `getFeeFamily()`

### Phase 2: Category-Focused Review View

When you click into a category (e.g., overdraft), show:
- **Top bar**: category name, median, P25/P75, institution count
- **Two sections**:
  - **Ready to approve** (confidence >= 90%, within P25-P75, no flags): show as a compact table with a "Approve All X" button
  - **Needs review** (everything else): show with inline editing, flag badges, suggested fixes

This transforms review from "look at one random fee at a time" to "approve 35 good overdraft fees in one click, then fix the 5 problematic ones."

**Files:**
- New: `src/app/admin/review/categories/[category]/page.tsx`
- Use: `src/lib/fee-actions.ts` → `bulkApproveFees()`, `editAndApproveFee()`
- Use: existing review components: `CategorySelect`, `InlineAmountEditor`, `FlagsBadges`

### Phase 3: Bulk Recategorize Action

Add a server action that lets you select multiple fees and reassign them to a different category at once. Currently `updateFeeCategory()` works one fee at a time.

**Files:**
- Update: `src/lib/fee-actions.ts` → add `bulkUpdateFeeCategory(feeIds[], newCategory, notes?)`
- Use in the category review page with a "Move to..." dropdown on selected items

## Acceptance Criteria

- [x] `/admin/review/categories` shows all 49 categories with review status counts
- [x] Each category card shows median, range, and "% ready to approve"
- [x] Clicking a category opens focused review with ready/needs-review split
- [x] "Approve All Ready" button works and logs to audit trail
- [x] Bulk recategorize action moves selected fees to new category with audit log
- [x] Keyboard shortcuts (j/k/a/x) work in the focused review view
- [x] Nav item added to admin sidebar

## Context / Why This Matters

- Current approval rate: 0.3% (58/18K)
- Target: 50%+ of staged fees reviewed in first category-grouped session
- The index includes staged+pending fees with maturity badges, so approvals directly improve data quality signals
- Per project memory: "peer price movements are core product value" — can't track movements if fees aren't approved

## Technical Notes

- `bulkApproveFees()` already has a 200-item limit — sufficient for per-category batches
- Audit trail via `fee_reviews` table captures all bulk operations
- State machine in `review_status.py` protects manual approvals from automated demotion
- `validation_flags` JSON contains structured flag data for rendering

## References

- Review queue: `src/app/admin/review/page.tsx`
- Review table: `src/app/admin/review/review-table.tsx`
- Outlier view: `src/app/admin/review/outlier-view.tsx`
- Fee actions: `src/lib/fee-actions.ts` (lines 1-200+)
- Fee taxonomy: `src/lib/fee-taxonomy.ts`
- Validation rules: `fee_crawler/validation.py`
- Amount bounds: `fee_crawler/fee_amount_rules.py`
