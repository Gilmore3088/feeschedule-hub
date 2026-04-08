# INSTITUTION PAGE — V2.1 IMPLEMENTATION SPEC (FOCUSED FIX)

## Objective
Fix:
1. Visual disorganization (top section hierarchy)
2. Fee schedule table (currently unchanged, low value)

---

# 1. TOP SECTION ORDER (FIX LAYOUT)

## REQUIRED ORDER (STRICT)

1. Institution Header
2. Summary Card
3. What This Means
4. Key Metrics Row (charter, assets, fees)
5. Fee Count Card
6. Fee Comparison (NEW)
7. Fee Table (ENHANCED)
8. Compare Section
9. CTA (bottom)

## REMOVE
- Mid-page CTA above metadata
- Duplicate metadata blocks

---

# 2. FEE SCHEDULE — COMPLETE REBUILD

## 2.1 TABLE STRUCTURE UPDATE

Replace columns:
- Fee Name | Amount | Frequency | Comparison | Category

## 2.2 COMPARISON COLUMN

IF national median exists:
- Above = amount > median → ↑ (red)
- Below = amount < median → ↓ (green)
- Equal = within tolerance (+-$1 or +-5%) → = (gray)
- No benchmark → — (muted)

REMOVE all "-" placeholders.

## 2.3 CATEGORY TAGGING

Map each fee to: Overdraft/NSF, Maintenance, Wire, ATM, Service, Other
Display as small muted pill/badge.

## 2.4 SORTING

Default: Overdraft/NSF → Maintenance → Wire → ATM → Service → Other
Within category: highest consumer impact first.

## 2.5 GROUPING

Group rows by category with section headers.

## 2.6 ROW PRIORITIZATION

Highlight key rows (overdraft, NSF, maintenance) with left border accent.

## 2.7 IMPACT INDICATOR

High (overdraft, NSF, maintenance), Medium (wires, stop payment), Low (safe deposit, admin).

## 2.8 SUMMARY ABOVE TABLE

FeeTableSummary: max 3 bullets showing key fees with comparison status.

---

# 3. FEE COMPARISON SECTION

Between Fee Count and Table. Show institution vs national bars for overdraft, maintenance, wire.

---

# 4-7. CLEANUP

- Remove duplicate metadata blocks
- Move ALL CTAs to after Compare section + bottom
- Left-align table/bars/text, center summary card + title
- Visual hierarchy: Summary → Comparison → Table → Everything else

---

# 8. ACCEPTANCE CRITERIA

- User can scan overdraft position in <2 seconds
- User sees above/below average instantly
- Rows grouped logically
- No "-" placeholders remain
- Key fees visually prioritized
- Fee schedule functions as a comparison tool, not a list
