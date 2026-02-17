# Fee Categorization Audit & Repair

You are auditing the fee categorization pipeline for the Bank Fee Index. Your job is to find miscategorized fees, missing aliases, and data quality issues — then fix them.

## Context

- Database: `data/crawler.db` (SQLite)
- ~60,000 extracted fees from ~1,500 institutions
- ~30,000 have a `fee_category` assigned via `normalize_fee_name()` in `fee_crawler/fee_analysis.py`
- Categories defined in `FEE_FAMILIES` (Python) and `src/lib/fee-taxonomy.ts` (TypeScript) — must stay in sync
- The `categorize` CLI command: `python3 -m fee_crawler categorize [--force] [--dry-run]`

## Audit Steps (run ALL of these)

### 1. Distribution Outlier Check

For each major category, find amounts that are statistical outliers. These are likely miscategorized entries (e.g., a daily cap stored as a per-item fee).

```sql
-- Run for each category in: overdraft, nsf, continuous_od, monthly_maintenance,
-- stop_payment, cashiers_check, wire_domestic_outgoing, wire_domestic_incoming,
-- card_replacement, money_order, check_cashing, atm_non_network
SELECT fee_category, fee_name, amount, crawl_target_id
FROM extracted_fees
WHERE fee_category = '{category}' AND amount > 0
ORDER BY amount DESC
LIMIT 10;
```

**Red flags:**
- Overdraft/NSF amounts above $45 (likely daily caps)
- Monthly maintenance above $50 (likely business/commercial products)
- Wire transfers above $100 (likely international miscategorized as domestic)
- Any amount that's 3x+ the category median

For each outlier, check the institution's other fees to determine if it's a cap or legitimate fee.

### 2. Cap/Limit Leakage Check

Verify no cap/limit entries leaked into per-item fee categories:

```sql
SELECT fee_category, fee_name, amount
FROM extracted_fees
WHERE fee_category IN ('overdraft', 'nsf', 'continuous_od')
  AND (LOWER(fee_name) LIKE '%cap%'
    OR LOWER(fee_name) LIKE '%maximum%'
    OR LOWER(fee_name) LIKE '%daily limit%'
    OR LOWER(fee_name) LIKE '%per day%')
  AND LOWER(fee_name) NOT LIKE '%capture%'
ORDER BY amount DESC;
```

Any results here need to be reclassified to `od_daily_cap` or `nsf_daily_cap`.

### 3. Continuous OD Misclassification Check

Fees with "continuous", "sustained", "extended", "daily" + overdraft context should be `continuous_od`, not `overdraft`:

```sql
SELECT fee_name, amount, fee_category
FROM extracted_fees
WHERE fee_category = 'overdraft'
  AND (LOWER(fee_name) LIKE '%continuous%'
    OR LOWER(fee_name) LIKE '%sustained%'
    OR LOWER(fee_name) LIKE '%extended%'
    OR (LOWER(fee_name) LIKE '%daily%' AND LOWER(fee_name) LIKE '%overdraft%'))
ORDER BY fee_name;
```

### 4. Top Unmatched Fee Names

Find the most common uncategorized fees — these are candidates for new aliases:

```sql
SELECT fee_name, COUNT(*) as cnt
FROM extracted_fees
WHERE fee_category IS NULL AND fee_name IS NOT NULL
GROUP BY LOWER(fee_name)
ORDER BY cnt DESC
LIMIT 30;
```

For each, determine:
- Is this a known fee type that needs an alias? (add to `FEE_NAME_ALIASES`)
- Is this a new category we should track? (add to `FEE_FAMILIES`)
- Is this not a fee at all? (leave uncategorized)

### 5. Cross-Institution Sanity Check

Verify that the same fee type has consistent amounts across institutions:

```sql
SELECT fee_category,
       COUNT(*) as n,
       MIN(amount) as min_amt,
       ROUND(AVG(amount), 2) as avg_amt,
       MAX(amount) as max_amt,
       COUNT(DISTINCT crawl_target_id) as inst_count
FROM extracted_fees
WHERE fee_category IS NOT NULL AND amount > 0
GROUP BY fee_category
ORDER BY fee_category;
```

**Check for:**
- Categories where max is 5x+ the average (outlier contamination)
- Categories with very few institutions (<5) — may need more aliases
- Categories where min is suspiciously low ($0.01-$1 for a fee that should be $10+)

## Repair Actions

### Adding Aliases

When you find fee names that should map to existing categories, add them to `FEE_NAME_ALIASES` in `fee_crawler/fee_analysis.py`:

```python
"new alias text": "canonical_category",
```

Remember:
- Alias keys must be **lowercase, punctuation stripped, single spaces**
- Punctuation stripping joins words: "overdraft/nsf" becomes "overdraftnsf"
- The `_get_sorted_aliases()` cache uses longest-first matching — add new aliases and the cache auto-invalidates on next import
- Test with: `python3 -c "from fee_crawler.fee_analysis import normalize_fee_name; print(normalize_fee_name('Your Fee Name'))"`

### Fixing Misclassified Rows

For individual rows, fix directly:

```sql
UPDATE extracted_fees
SET fee_category = 'correct_category', fee_family = 'Correct Family'
WHERE id = {row_id};
```

For systematic fixes, update the aliases/detection logic and re-run:

```bash
python3 -m fee_crawler categorize --force --dry-run  # preview
python3 -m fee_crawler categorize --force             # apply
```

### Adding New Categories

If a genuinely new fee type is found (10+ instances across multiple institutions):

1. Add to `FEE_FAMILIES` in `fee_crawler/fee_analysis.py`
2. Add to `CANONICAL_DISPLAY_NAMES` in the same file
3. Add to `FEE_FAMILIES` in `src/lib/fee-taxonomy.ts`
4. Add to `DISPLAY_NAMES` in the same file
5. Add aliases to `FEE_NAME_ALIASES`
6. Re-run categorization

**Both Python and TypeScript taxonomies must stay in sync.**

### Updating Cap Detection

If new cap patterns are found, update `_detect_cap_category()` in `fee_analysis.py`. Key rules:
- Caps must contain OD/NSF context words (overdraft, nsf, courtesy, bounce, paid item)
- Item-count limits ("max 4 per day") are NOT dollar caps — skip them
- "No daily limit" means there IS no cap — skip
- Punctuation stripping joins "overdraft/nsf" into "overdraftnsf" — use relaxed regex without leading `\b` for compound terms

## Verification

After all repairs:

```bash
# Re-run categorization
python3 -m fee_crawler categorize --force

# Check distributions are clean
sqlite3 data/crawler.db "
SELECT fee_category, COUNT(*), MIN(amount), ROUND(AVG(amount),0), MAX(amount)
FROM extracted_fees WHERE fee_category IS NOT NULL AND amount > 0
GROUP BY fee_category ORDER BY fee_category;
"

# Build still passes
npx next build
```

## Report Format

After completing the audit, output a summary:

```
## Fee Audit Report

### Issues Found
- [count] outlier amounts reclassified
- [count] new aliases added
- [count] cap/limit entries corrected

### Distribution Summary (key categories)
| Category | N | Min | Median | Max |
|----------|---|-----|--------|-----|

### Top Remaining Unmatched (candidates for future aliases)
1. [name] (Nx) — suggested category: [x]

### Coverage
- Before: X categorized / Y total (Z%)
- After:  X categorized / Y total (Z%)
```
