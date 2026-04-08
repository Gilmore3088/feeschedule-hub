# INSTITUTION PAGE — V2 UPGRADE SPEC

## Objective
Upgrade the institution slug page from:
→ static fee table

To:
→ consumer decision page with clear insights, visual signals, and engagement hooks

---

# 1. SUMMARY CARD (MANDATORY)

## Placement
Directly under institution name

## Component: `FeeSummaryCard`

### Fields

- rating_label (string)
  - "Consumer-Friendly"
  - "Average Fee Structure"
  - "Above-Average Fees"

- rating_color (enum)
  - green / yellow / red

- bullets (array, max 3)
  - short, scannable insights

---

## Example Output

Consumer-Friendly Fee Structure

- Overdraft fee: $30 (aligned with national median)
- Total fees: 18 (below typical range)
- Wire fees slightly above average

---

## Logic (initial version)

- overdraft vs national median
- total fee count vs dataset average
- presence/absence of key fees (OD, NSF, maintenance)

---

# 2. "WHAT THIS MEANS" (MANDATORY)

## Placement
Directly under Summary Card

## Component: `InterpretationBlock`

### Requirements
- 2-3 sentences max
- plain English
- no jargon

---

## Example

This institution uses a relatively simple fee structure with moderate overdraft pricing. The lower number of total fees suggests a cleaner, more consumer-friendly model than many peers.

---

# 3. VISUAL COMPARISONS (MANDATORY)

## Component: `FeeComparisonBars`

### Show 3-5 key fees:
- Overdraft
- Monthly maintenance
- Domestic wire
- NSF (if available)

---

## Format

Label
[ bar ] institution value
[ bar ] national median

---

## Behavior
- normalize bars to median scale
- show difference visually, not just numerically

---

# 4. FEE COUNT COMPARISON (MANDATORY)

## Component: `FeeCountCard`

### Fields

- institution_fee_count
- avg_fee_count_bank
- avg_fee_count_cu

---

## Example

18 fees
Typical credit union: 25-35
Typical bank: 30-50

---

# 5. GOOD / WATCH SECTION (MANDATORY)

## Component: `ProsConsBlock`

### Structure

Strengths:
- bullet
- bullet

Watch:
- bullet
- bullet

---

## Rules
- max 2 bullets each
- derived from pricing vs median

---

# 6. TABLE ENHANCEMENTS (MANDATORY)

## Current Issue
"VS MEDIAN" column shows "-"

---

## Required Change

### Add: `comparison_indicator`

Values:
- above
- below
- equal
- unknown

---

## UI

Replace "-" with:

- ↑ Above average (red)
- ↓ Below average (green)
- = In line (gray)

---

## Optional (future)
Color row background lightly based on indicator

---

# 7. MID-PAGE CTA (MANDATORY)

## Placement
After visual comparison section

## Component: `MidPageCTA`

---

## Copy

"Want a deeper breakdown of how this institution generates fee revenue?"

Button:
-> "Unlock full analysis"

---

# 8. COMPARE HOOK (MANDATORY)

## Component: `CompareSection`

---

## Options

- "Compare to nearby institutions"
- "Compare to top credit unions"
- "Compare to Florida averages"

---

## Behavior
Links to:
- filtered search
- comparison tool (future)

---

# 9. FOOTER CTA (KEEP, UPDATE COPY)

## New Copy

"Financial professionals use Bank Fee Index to benchmark pricing, analyze revenue, and identify opportunities."

---

# 10. DESIGN SYSTEM UPDATES

## Alignment Rules

### CENTER:
- Institution name
- Summary card
- Hero elements

### LEFT:
- Table
- Charts
- Text blocks

---

## Spacing

- 24-32px between sections
- clear separation between cards

---

## Visual Hierarchy

1. Summary (most prominent)
2. Visual comparisons
3. Table
4. CTA

---

# 11. DATA HANDLING RULES

## Missing Data

DO NOT:
- show "-" without context

---

## Instead:

- hide comparison if unavailable
OR
- show "Not enough data" (small, muted)

---

# 12. FUTURE (NOT REQUIRED NOW)

## Add later:

- Estimated annual fee impact
- "Users like you pay $X/year"
- Behavioral scoring

---

# SUCCESS CRITERIA

Page is successful if:

- User can answer in 5 seconds:
  -> "Is this institution expensive or not?"

- User scrolls past table
- User clicks compare or CTA
- Page feels like insight, not raw data

---

# FINAL DIRECTIVE

This page must shift from:
-> "Here are the fees"

To:
-> "Here's what this means for you"
