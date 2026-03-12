# feat: Outlier Editor — Fix Extreme Values and Obvious Issues from Admin

## Overview

Add an outlier-focused editing workflow to the admin panel so you can quickly find fees with extreme amounts, decimal errors, or percentage confusion — and fix them inline without leaving the page. Currently, outlier detection runs as a CLI command (`outlier-detect --auto-flag`) that flags fees, but there's no purpose-built UI to review and correct them. The existing review page shows flag badges but has no inline editing and no way to filter specifically for outliers.

## Problem Statement

When the crawler extracts fees, common extraction errors produce obviously wrong amounts:
- **Decimal errors**: $350 overdraft fee (should be $35) — LLM misread the decimal
- **Percentage confusion**: $0.03 foreign transaction fee (should be 3%) — amount vs percentage
- **Statistical outliers**: $500 NSF fee when the median is $30 — likely misextracted
- **Duplicate amounts**: Same institution has the same fee listed 3x at different amounts

These currently require: run `outlier-detect` CLI → go to review page → filter by "flagged" → click into each fee detail → mentally figure out what's wrong → no way to edit inline → would need to build a separate flow to fix the amount.

**What should happen**: Open outlier editor → see all flagged fees with their issues explained → click a quick-fix button ("÷10", "÷100", "×100") or type a new amount → approve and move on.

## Proposed Solution

### Add to existing review page as a new "Outliers" tab/view

Rather than a separate page, extend `/admin/review` with an **Outliers** view that:
1. Filters to fees with outlier-related validation flags
2. Shows the flag detail inline (why it was flagged, what the median/P25/P75 are)
3. Provides inline amount editing with quick-fix buttons
4. Allows edit + approve in a single action

### New: Inline Fee Editor component

A reusable inline editor that can be used on the review page (and later on institution detail pages):
- Click amount → editable input appears
- Quick-fix buttons for common corrections
- Save updates the amount AND optionally approves
- Full audit trail via existing `fee_reviews` table

## Technical Approach

### Files to create

#### `src/app/admin/review/outlier-view.tsx` (client component)
Outlier-focused view of flagged fees with inline editing.

```tsx
// Key features:
// - Fetches fees with validation_flags containing outlier-related rules
// - Displays: institution, fee name, current amount, flag detail, category median
// - Inline amount editor with quick-fix buttons
// - "Fix & Approve" action (edit amount + approve in one click)
// - "Reject" for unfixable entries
// - Row-level expansion showing peer comparison context
```

**Columns:**
| Institution | Fee | Current Amount | Issue | Category Median | Fix | Actions |
|---|---|---|---|---|---|---|

**Quick-fix buttons per flag type:**
- `statistical_outlier`: Show median, offer "Set to median" or manual input
- `decimal_error` (10x): "÷10" button, "÷100" button
- `decimal_error` (0.1x): "×10" button, "×100" button
- `percentage_confusion`: "Convert %" button (multiply by 100 or set to percentage of typical amount)

#### `src/app/admin/review/inline-amount-editor.tsx` (client component)
Reusable inline editor for fee amounts.

```tsx
interface InlineAmountEditorProps {
  feeId: number;
  currentAmount: number | null;
  suggestedFixes?: { label: string; value: number }[];
  onSave: (newAmount: number) => void;
}

// Renders:
// - Display mode: formatted amount with pencil icon
// - Edit mode: number input + quick-fix chips + save/cancel
// - Keyboard: Enter to save, Escape to cancel
```

### Files to modify

#### `src/lib/fee-actions.ts`
Add a new combined action:

```typescript
export async function editAndApproveFee(
  feeId: number,
  updates: { amount?: number | null; fee_name?: string },
  notes?: string,
): Promise<{ success: boolean; error?: string }>
  // 1. requirePermission("edit") — admin only
  // 2. Edit the fee (same as editFee logic)
  // 3. Approve the fee (same as approveFee logic)
  // 4. Single audit trail entry with action "edit_approve"
  // 5. Both operations in one db.transaction()
```

#### `src/lib/crawler-db/core.ts`
Add query for outlier-flagged fees:

```typescript
export function getOutlierFlaggedFees(
  limit?: number,
  offset?: number,
  category?: string,
): { fees: ReviewableFee[]; total: number }
  // WHERE validation_flags LIKE '%outlier%'
  //    OR validation_flags LIKE '%decimal_error%'
  //    OR validation_flags LIKE '%percentage_confusion%'
  // AND review_status IN ('flagged', 'pending', 'staged')
  // ORDER BY extraction_confidence ASC, amount DESC
```

Add query for category medians (for inline context):

```typescript
export function getCategoryMedians(): Record<string, { median: number; p25: number; p75: number; count: number }>
  // SELECT fee_category, median, p25, p75, count
  // FROM non-rejected fees grouped by fee_category
  // Only categories with 5+ observations
```

#### `src/app/admin/review/page.tsx`
- Add "Outliers" tab to the status tabs strip (between "flagged" and "pending")
- When active, render `<OutlierView>` instead of the standard fee table
- Pass category medians as server-fetched prop

#### `src/app/admin/review/review-actions.tsx`
- Add `EditApproveButton` component that calls `editAndApproveFee`
- Takes the new amount as prop (set by inline editor)

### UI Design

Follow existing review page patterns:
- Same table styling (`admin-card`, `text-sm`, `tabular-nums`)
- Same status badge colors
- Flag severity colors (red/orange/blue) for issue column
- Quick-fix buttons: small pills similar to charter filter buttons (`rounded-full px-2.5 py-0.5 text-xs font-medium`)
- Inline editor: same input styling as review search (`rounded-md border border-gray-300`)
- "Fix & Approve" button: emerald like existing approve button
- Amount comparison: red for current (wrong), emerald for suggested (correct)

### Data flow

```
Server Component (page.tsx)
  ├── getOutlierFlaggedFees() → ReviewableFee[] with validation_flags
  ├── getCategoryMedians() → median/P25/P75 per category
  └── Pass both to OutlierView (client component)
        ├── Parse validation_flags JSON per fee
        ├── Compute suggested fixes from flag type + median data
        ├── Render InlineAmountEditor per row
        └── On fix: call editAndApproveFee() server action
              ├── Updates amount in extracted_fees
              ├── Sets review_status = 'approved'
              ├── Inserts fee_reviews audit entry
              └── revalidatePath("/admin/review")
```

## Acceptance Criteria

- [x] Outlier tab on review page shows all fees with outlier/decimal/percentage flags
- [x] Each row shows the flag type, explanation, and category median for context
- [x] Inline amount editor with quick-fix buttons (÷10, ÷100, ×10, set to median)
- [x] "Fix & Approve" action edits amount and approves in one click with audit trail
- [x] Standard reject button still available for unfixable entries
- [x] Category filter dropdown to focus on one fee type at a time
- [x] Count badge on Outliers tab shows how many need attention
- [ ] Keyboard nav (j/k) works in outlier view
- [x] All edits create proper `fee_reviews` audit entries

## References

- Outlier detection engine: `fee_crawler/pipeline/outlier_detection.py`
- Validation rules & flags: `fee_crawler/validation.py`
- Fee edit server action: `src/lib/fee-actions.ts:111-209`
- Review page: `src/app/admin/review/page.tsx`
- Fee detail page: `src/app/admin/review/[id]/page.tsx`
- Review actions (approve/reject): `src/app/admin/review/review-actions.tsx`
- Category select: `src/app/admin/review/category-select.tsx`
- Keyboard nav: `src/app/admin/review/keyboard-nav.tsx`
- DB queries: `src/lib/crawler-db/core.ts` (`getFeesByStatus`, `getFeeById`)
- Validation flag structure: `{rule: string, severity: string, message: string}`
- Outlier flag types: `statistical_outlier`, `decimal_error`, `percentage_confusion`
