# Data Quality & Enrichment Audit

## Audit Results (2026-03-16)

### Overall Health: Good

| Table | Rows | Status |
|-------|------|--------|
| Institutions | 8,750 | Clean (4,331 banks, 4,419 CUs) |
| Extracted fees | 65,287 | 10% need attention |
| Financials | 38,964 | Very clean |
| Economic indicators | 20,284 | Clean (37 series) |
| Branch deposits | 76,727 | Clean |
| Census tracts | 85,396 | Clean |
| Demographics | 3,274 | Clean |
| Complaints | 3,924 | Clean |

**Total: ~300k rows across 22 tables.**

---

## Issues Found (Priority Order)

### 1. 6,842 fees with no category (10.5%)

**Impact: High** -- uncategorized fees don't appear in the fee index, peer benchmarks, or any analysis.

```
No category: 6,842 out of 65,287 (10.5%)
```

**Fix:** Run `python -m fee_crawler categorize --force` to re-run the categorization engine against all uncategorized fees. The `FEE_NAME_ALIASES` dictionary in `fee_analysis.py` maps fee names to categories. Any remaining uncategorized fees need new aliases added.

**Command:** `python -m fee_crawler categorize`

### 2. 9,160 fees with no amount (14%)

**Impact: Medium** -- fees without amounts can't be used for median calculations but may still have useful condition/frequency data.

```
No amount (NULL or 0): 9,160
Negative amounts: 8
```

**Fix:** The 8 negative amounts are likely extraction errors -- flag or reject them. The 9,160 NULL/0 amounts may be legitimate (e.g., "no fee" or "waived") or extraction failures. Review a sample:

```sql
SELECT fee_name, amount, conditions, extraction_confidence
FROM extracted_fees WHERE amount IS NULL OR amount = 0
ORDER BY RANDOM() LIMIT 20;
```

### 3. 117 fees over $500

**Impact: Low** -- likely valid (e.g., wire transfers, early termination fees) but some may be extraction errors.

**Fix:** Run `python -m fee_crawler outlier-detect` to flag statistical outliers. Review the flagged ones in `/admin/review`.

### 4. 634 institutions with no website URL (7.2%)

**Impact: Medium** -- can't crawl fee schedules without a URL. Mostly NCUA credit unions.

**Fix:** Run `python -m fee_crawler backfill-ncua-urls` to fill missing URLs from the NCUA mapping API. For remaining gaps, the discover command can search for websites.

### 5. 75.9% of institutions have NO fee data

**Impact: High** -- only 2,112 out of 8,750 institutions have fee data (24.1%).

**Fix:** This is the core crawl coverage problem. Run `python -m fee_crawler run-pipeline` weekly via GitHub Actions (already configured). Each run discovers URLs and crawls fees for ~100 institutions.

**Current coverage:**
- 2,112 institutions with fee data
- 6,638 institutions without

### 6. Duplicate institution names

**Impact: Low** -- "First State Bank" appears 35 times because there are 35 different banks named "First State Bank" in different states. This is NOT a data quality issue -- they're different institutions with different cert numbers.

**No fix needed.** The deduplication is correct (UNIQUE on source + cert_number).

### 7. Fee review backlog

```
approved: 43,701 (66.9%)
staged: 9,628 (14.7%)
flagged: 9,526 (14.6%)
rejected: 2,432 (3.7%)
```

**Impact: Medium** -- 19,154 fees (29.3%) are staged or flagged, meaning they haven't been fully validated. The auto-staging threshold (confidence >= 0.85) handles most, but flagged fees need manual review or auto-review rules.

**Fix:** Build auto-review rules (plan exists at `plans/feat-auto-review-rules.md`) to auto-approve fees that match known patterns.

---

## Enrichment Opportunities

### Already Done (Yesterday)

| Source | Rows | Status |
|--------|------|--------|
| FRED macro (UNRATE, FEDFUNDS, CPI, deposits) | 294 | Done |
| FRED QBP (NII, noninterest income, service charges, net income) | 96 | Done |
| FRED district unemployment (12 states) | 852 | Done |
| BLS CPI (bank services + regional) | 879 | Done |
| NY Fed (SOFR, EFFR, OBFR) | 3,897 | Done |
| OFR Financial Stress Index | 14,260 | Done |
| CFPB complaints (2020-2025) | 3,924 | Done |
| FDIC SOD (branch deposits + HHI) | 76,727 + 393 | Done |
| Census ACS demographics | 3,274 | Done |
| Census tract income classifications | 85,396 | Done |

### Not Yet Done

| Opportunity | Source | Impact | Effort |
|-------------|--------|--------|--------|
| Categorize remaining 6,842 fees | Local (fee_analysis.py) | High | Run command |
| Backfill NCUA website URLs | NCUA API | Medium | Run command |
| Run outlier detection | Local | Low | Run command |
| Expand CFPB to per-issue breakdown | CFPB API | Low | Code change |
| Add fee snapshots (temporal tracking) | Local | Medium | New command needed |
| Add fee change events | Local | Medium | New command needed |

---

## Recommended Actions

### Immediate (run commands)

```bash
# 1. Categorize uncategorized fees
python -m fee_crawler categorize

# 2. Backfill missing NCUA URLs
python -m fee_crawler backfill-ncua-urls

# 3. Detect and flag outliers
python -m fee_crawler outlier-detect --auto-flag

# 4. Validate existing fees
python -m fee_crawler validate

# 5. Enrich any missing tiers/districts
python -m fee_crawler enrich
```

### Short-term (code changes)

1. **Auto-review rules** -- auto-approve fees matching known patterns (plan exists)
2. **Fee snapshots** -- track fee changes over time (`fee_snapshots` table exists, empty)
3. **Fee change events** -- detect when fees change between crawls (`fee_change_events` table exists, empty)

### Ongoing (scheduled)

Already configured in GitHub Actions:
- Weekly crawl pipeline (Wednesdays) -- discover + crawl + categorize
- Daily data refresh -- FRED, BLS, NY Fed, OFR
- Weekly data refresh -- CFPB

## Acceptance Criteria

- [ ] Run categorize command -- reduce uncategorized from 6,842 to <500
- [ ] Run backfill-ncua-urls -- reduce no-URL from 634 to <200
- [ ] Run outlier-detect -- flag suspicious fees >$500 and negative amounts
- [ ] Run validate -- check all fees against validation rules
- [ ] Run enrich -- ensure all institutions have tier + district
- [ ] Review flagged outliers in /admin/review

## References

- Categorization: `fee_crawler/commands/categorize_fees.py`
- Fee aliases: `fee_crawler/fee_analysis.py` (FEE_NAME_ALIASES)
- Outlier detection: `fee_crawler/pipeline/outlier_detection.py`
- Validation: `fee_crawler/commands/backfill_validation.py`
- Enrichment: `fee_crawler/commands/enrich.py`
- NCUA backfill: `fee_crawler/commands/backfill_ncua_urls.py`
- Auto-review plan: `plans/feat-auto-review-rules.md`
