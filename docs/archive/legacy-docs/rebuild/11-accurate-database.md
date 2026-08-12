# Building an Accurate Database

> Everything else — MSA analysis, fee change alerts, B2B products, $100K ARR — is built
> on top of this. If this is wrong, everything is wrong.
>
> This document maps every place accuracy breaks down in the current pipeline
> and gives the exact fix for each one.

---

## What "Accurate" Means Here

A fee row is accurate when:

1. **It exists** — the fee is real, published by the institution on their public fee schedule
2. **The amount is correct** — $35, not $350; not a minimum balance requirement mistaken for a fee
3. **The category is correct** — an overdraft fee is classified as `overdraft`, not `monthly_maintenance`
4. **It's complete enough to be useful** — if a bank charges 8 fees and you extracted 2, the record is misleading
5. **It's current** — the fee was in effect when it was scraped, not from a stale document

The current pipeline has problems at every one of these levels. Here is each problem and the fix.

---

## Problem 1: Wrong Document (Highest Impact)

**What happens:** `discover_urls` finds a URL and classifies it as a fee schedule. But it's actually:
- An account agreement (mentions fees in passing but isn't the fee schedule)
- A Truth in Savings disclosure (rates, not fee schedule)
- A mortgage or loan disclosure
- A generic "disclosures" page that links to the actual fee schedule PDF

The LLM then extracts whatever dollar amounts it finds — loan APRs, minimum balance requirements, interest rates — and those get written as fees.

**How to detect it:**

A legitimate fee schedule has a specific signature:
- High fee-to-page ratio (many distinct fee line items, not one fee mentioned 3 times)
- Multiple fee categories present (an OD fee AND a wire fee AND a monthly fee = probably a fee schedule; just an OD fee = probably account agreement)
- Fee names that look like a schedule (short, structured, tabular) not prose

**The fix — add a document classifier before LLM extraction:**

```python
# fee_crawler/pipeline/classify_document.py

def classify_document(text: str) -> dict:
    """
    Classify whether extracted text is a fee schedule, account agreement,
    rate sheet, or something else.

    Returns:
        {
            "is_fee_schedule": bool,
            "confidence": float,        # 0.0 - 1.0
            "doc_type_guess": str,      # "fee_schedule" | "account_agreement" |
                                        #  "rate_sheet" | "tis_disclosure" | "other"
            "signals": list[str]        # what triggered the classification
        }
    """
    lower = text.lower()
    signals = []
    score = 0.0

    # Strong positive signals — these appear in real fee schedules
    STRONG_FEE_SIGNALS = [
        "schedule of fees",
        "fee schedule",
        "schedule of charges",
        "service charges and fees",
        "consumer deposit account fees",
        "deposit account fee schedule",
        "personal fee schedule",
        "account fees and charges",
    ]
    for sig in STRONG_FEE_SIGNALS:
        if sig in lower:
            score += 0.4
            signals.append(f"title_match: {sig}")
            break

    # Positive signals — fee-schedule-like structure
    FEE_STRUCTURE_SIGNALS = [
        ("per item", 0.1),
        ("per occurrence", 0.1),
        ("per month", 0.1),
        ("each", 0.05),
        ("waived if", 0.1),
        ("fee waiver", 0.1),
        ("no charge", 0.05),
    ]
    for sig, weight in FEE_STRUCTURE_SIGNALS:
        if sig in lower:
            score += weight
            signals.append(f"structure: {sig}")

    # Count distinct dollar amounts — a fee schedule has many
    import re
    dollar_amounts = re.findall(r"\$\d+(?:\.\d{2})?", text)
    distinct_amounts = len(set(dollar_amounts))
    if distinct_amounts >= 8:
        score += 0.3
        signals.append(f"many_distinct_amounts: {distinct_amounts}")
    elif distinct_amounts >= 4:
        score += 0.1
        signals.append(f"some_distinct_amounts: {distinct_amounts}")

    # Negative signals — these suggest it's NOT a fee schedule
    NEGATIVE_SIGNALS = [
        ("annual percentage rate", -0.3),
        ("annual percentage yield", -0.2),
        ("truth in lending", -0.3),
        ("truth-in-lending", -0.3),
        ("credit agreement", -0.3),
        ("loan agreement", -0.3),
        ("mortgage", -0.15),
        ("arbitration", -0.15),
        ("governing law", -0.15),
    ]
    for sig, weight in NEGATIVE_SIGNALS:
        if sig in lower:
            score += weight  # weight is negative
            signals.append(f"negative: {sig}")

    score = max(0.0, min(1.0, score))

    if score >= 0.4:
        doc_type = "fee_schedule"
    elif "truth in savings" in lower or "apy" in lower:
        doc_type = "tis_disclosure"
    elif "annual percentage rate" in lower or "loan agreement" in lower:
        doc_type = "account_agreement"
    else:
        doc_type = "other"

    return {
        "is_fee_schedule": score >= 0.4,
        "confidence": score,
        "doc_type_guess": doc_type,
        "signals": signals,
    }
```

**Wire this in before the LLM call in `crawl.py`:**

```python
# In _crawl_one(), after text extraction, before _is_likely_fee_schedule():

from fee_crawler.pipeline.classify_document import classify_document

doc_class = classify_document(text)

# Store the classification on crawl_targets for later analysis
db.execute(
    "UPDATE crawl_targets SET document_type_detected = ? WHERE id = ?",
    (doc_class["doc_type_guess"], target_id)
)

if not doc_class["is_fee_schedule"]:
    # This URL is probably not a fee schedule — mark for re-discovery
    result["status"] = "failed"
    result["message"] = f"WRONG_DOCUMENT ({doc_class['doc_type_guess']}, confidence={doc_class['confidence']:.2f})"
    db.execute(
        "UPDATE crawl_targets SET failure_reason = 'wrong_document', fee_schedule_url = NULL WHERE id = ?",
        (target_id,)
    )
    # Re-queue for discovery — this URL is wrong, find a better one
    # (Discovery will probe different paths next time)
    return result
```

**Also add `document_type_detected` column to `crawl_targets`:**

```sql
ALTER TABLE crawl_targets ADD COLUMN document_type_detected TEXT;
ALTER TABLE crawl_targets ADD COLUMN doc_classification_confidence FLOAT;
```

**Impact:** Eliminates a large category of fake fees. Every row currently in `extracted_fees` from a wrong document gets cleaned out.

---

## Problem 2: LLM Extracts Non-Fee Data as Fees

**What happens:** The LLM sees a document with a mix of real fees and account terms. It extracts:
- "Minimum balance to open: $25" → writes as a fee with amount $25
- "Interest Rate: 0.01% APY" → sometimes misclassified as a fee
- "NSF item limit: 6 per day" → extracts "6" as a dollar amount
- "Wire transfer limit: $10,000" → extracts $10,000 as a wire fee

The `NON_FEE_SUBSTRINGS` filter in `fee_amount_rules.py` catches many of these. But it's a substring blocklist — it misses novel phrasings.

**The fix — tighten the LLM prompt with explicit negative examples:**

```python
# In fee_crawler/pipeline/extract_llm.py, update _USER_PROMPT:

_USER_PROMPT = """\
Extract ALL fees from this {charter_type} fee schedule document ({document_type}).
Institution: {institution_name}

EXTRACT — actual fees with a dollar amount charged to the customer:
- Monthly maintenance fees, service charges
- Overdraft fees, NSF (non-sufficient funds) fees
- ATM fees, wire transfer fees, stop payment fees
- Paper statement fees, account closing fees
- Any line item where the bank charges the customer money

DO NOT EXTRACT — these look like fees but are not:
- Minimum balance requirements (e.g., "Minimum balance to open: $500")
- Interest rates or APY values (e.g., "0.05% APY")
- Daily transaction limits (e.g., "ATM limit: $500/day")
- Transfer limits (e.g., "Wire limit: $10,000")
- Account maximums or caps that are not fees
- Share/membership par values at credit unions
- Loan amounts, credit limits, or borrowing caps

IMPORTANT: If you see "waived if [condition]", extract the fee with the
waiver condition in the conditions field — do not skip it.

<document_content>
{text}
</document_content>

Use the extract_fees tool to return every fee found in this document.
"""
```

**Also add these to `NON_FEE_SUBSTRINGS` in `fee_amount_rules.py`:**

```python
NON_FEE_SUBSTRINGS = [
    # existing entries...
    
    # Limits and caps (not fees)
    "daily atm limit",
    "daily withdrawal limit",
    "daily purchase limit",
    "daily transaction limit",
    "transfer limit",
    "wire limit",
    "atm limit",
    "cash limit",
    
    # Loan/credit terms
    "credit limit",
    "loan amount",
    "borrowing limit",
    "maximum loan",
    
    # Rate/yield data
    " apy",
    " apr",
    "annual percentage",
    "interest rate",
    "variable rate",
    "fixed rate",
    
    # Balance requirements
    "minimum balance to open",
    "minimum balance to avoid",
    "minimum opening deposit",
    "minimum opening balance",
    "required opening deposit",
    "average daily balance",
    "daily balance required",
    
    # Insurance / regulatory
    "fdic insured",
    "ncua insured",
    "fdic insurance",
    "ncua insurance",
    "member fdic",
    "federally insured",
]
```

---

## Problem 3: Categorization Falls Through

**What happens:** `normalize_fee_name()` maps fee names to canonical categories via aliases and regex. When a fee name doesn't match any pattern, it falls through and gets stored as a cleaned raw name like `telephone_banking_inquiry_fee`. These fees have no bounds checking, no auto-approve logic, and can't be aggregated in peer analysis.

**The current fallthrough rate is unknown. It needs to be measured.**

**Step 1 — measure it:**

```sql
-- What % of approved/staged fees have no canonical category?
SELECT
    COUNT(*) FILTER (WHERE fee_category IN (
        'monthly_maintenance', 'overdraft', 'nsf', 'wire_domestic_outgoing',
        'atm_non_network', 'stop_payment', 'cashiers_check', 'paper_statement',
        -- ... all 49 canonical categories
    )) AS categorized,
    COUNT(*) FILTER (WHERE fee_category NOT IN (
        'monthly_maintenance', 'overdraft', 'nsf'  -- etc
    ) OR fee_category IS NULL) AS uncategorized,
    COUNT(*) AS total
FROM extracted_fees
WHERE review_status IN ('approved', 'staged');
```

Or simpler — add a `is_canonical` boolean to your reporting:

```sql
-- Top uncategorized fee names (these need alias entries)
SELECT fee_category, COUNT(*) as n
FROM extracted_fees
WHERE review_status IN ('approved', 'staged')
  AND fee_category NOT IN (
    SELECT unnest(ARRAY[
      'monthly_maintenance','minimum_balance','early_closure','dormant_account',
      'account_research','paper_statement','estatement_fee','overdraft','nsf',
      'continuous_od','od_protection_transfer','od_line_of_credit','od_daily_cap',
      'nsf_daily_cap','atm_non_network','atm_international','card_replacement',
      'rush_card','card_foreign_txn','card_dispute','wire_domestic_outgoing',
      'wire_domestic_incoming','wire_intl_outgoing','wire_intl_incoming',
      'cashiers_check','money_order','check_printing','stop_payment',
      'counter_check','check_cashing','check_image','ach_origination',
      'ach_return','bill_pay','mobile_deposit','zelle_fee','coin_counting',
      'cash_advance','deposited_item_return','night_deposit','notary_fee',
      'safe_deposit_box','garnishment_levy','legal_process','account_verification',
      'balance_inquiry','late_payment','loan_origination','appraisal_fee'
    ])
  )
GROUP BY fee_category
ORDER BY n DESC
LIMIT 30;
```

**Step 2 — add missing aliases:**

Run the above query on your existing data. The top 30 uncategorized categories will show you exactly which aliases are missing. Add them to `FEE_NAME_ALIASES` in `fee_analysis.py`.

Common ones likely missing:
```python
FEE_NAME_ALIASES.update({
    # Telephone/teller fees
    "telephone banking fee":        "balance_inquiry",
    "teller fee":                   "balance_inquiry",
    "assisted transaction fee":     "balance_inquiry",
    "live teller fee":              "balance_inquiry",
    "teller transaction fee":       "balance_inquiry",

    # Excessive withdrawal (Reg D — credit unions especially)
    "excessive withdrawal fee":     "overdraft",
    "excess withdrawal fee":        "overdraft",
    "over limit fee":               "overdraft",

    # Return mail
    "return mail fee":              "account_research",
    "undeliverable mail fee":       "account_research",
    "address change fee":           "account_research",

    # Verification / reference
    "account verification fee":     "account_verification",
    "bank reference letter":        "account_verification",
    "signature guarantee":          "account_verification",
    "medallion signature":          "account_verification",

    # Remote / online deposit
    "remote deposit fee":           "mobile_deposit",
    "remote deposit capture fee":   "mobile_deposit",
    "rdc fee":                      "mobile_deposit",

    # Outgoing domestic wire variants
    "domestic wire fee":            "wire_domestic_outgoing",
    "outgoing wire fee":            "wire_domestic_outgoing",
    "wire fee":                     "wire_domestic_outgoing",
    "outgoing wire transfer":       "wire_domestic_outgoing",
})
```

**Step 3 — add a fallthrough alert to the pipeline:**

```python
# In crawl.py, after categorization:
uncategorized = sum(1 for c in categories if c not in CANONICAL_CATEGORIES)
if len(categories) > 0 and uncategorized / len(categories) > 0.3:
    logger.warning(
        "High fallthrough rate for %s: %d/%d fees uncategorized",
        name, uncategorized, len(categories)
    )
    # These institutions need manual review or alias additions
```

---

## Problem 4: Completeness Is Unmeasured

**What happens:** You extract 3 fees from Bank of America and 3 fees from First National Community Bank. Both show "3 fees" in your database. But BofA has a 50-page fee schedule with 40+ distinct fees. The community bank might actually only have 3. The same count means completely different things.

Without a completeness signal, you can't tell the difference between a complete extraction and a partial one — and neither can your users.

**The fix — add an `extraction_completeness_score` to `crawl_targets`:**

```python
def estimate_completeness(
    extracted_fees: list,
    asset_size: int | None,
    charter_type: str,
    document_type: str,
) -> tuple[float, str]:
    """
    Estimate how complete the fee extraction is for this institution.

    Returns (score 0.0-1.0, explanation).

    Heuristics:
    - Larger banks publish more fees. A $10B bank with 3 fees = incomplete.
    - A complete fee schedule should have at least: 1 OD fee, 1 maintenance fee,
      1 ATM fee, 1 wire fee. If any of these are missing, likely incomplete.
    - Below-median fee count for the asset tier = likely incomplete.
    """
    if not extracted_fees:
        return 0.0, "no_fees_extracted"

    categories_found = {f.get("fee_category") for f in extracted_fees if f.get("fee_category")}
    n_fees = len(extracted_fees)

    # Core fees that virtually every institution has
    CORE_CATEGORIES = {"overdraft", "nsf", "monthly_maintenance", "wire_domestic_outgoing"}
    core_found = CORE_CATEGORIES & categories_found
    core_coverage = len(core_found) / len(CORE_CATEGORIES)

    # Expected fee count by asset tier (rough heuristics from industry data)
    EXPECTED_FEES_BY_TIER = {
        "super_regional": (30, 60),
        "large_regional":  (20, 50),
        "regional":        (15, 40),
        "community_large": (10, 30),
        "community_mid":   (8,  25),
        "community_small": (5,  20),
    }

    asset_tier = _asset_tier(asset_size)
    expected_min, expected_max = EXPECTED_FEES_BY_TIER.get(asset_tier, (5, 20))

    if n_fees >= expected_min:
        count_score = 1.0
    elif n_fees >= expected_min * 0.5:
        count_score = 0.6
    else:
        count_score = 0.3

    # Weighted combination
    score = (core_coverage * 0.6) + (count_score * 0.4)

    if score >= 0.8:
        explanation = "complete"
    elif score >= 0.5:
        explanation = "partial"
    else:
        explanation = "likely_incomplete"

    return round(score, 2), explanation
```

Add to `crawl_targets`:

```sql
ALTER TABLE crawl_targets ADD COLUMN extraction_completeness_score FLOAT;
ALTER TABLE crawl_targets ADD COLUMN extraction_completeness_label TEXT;
-- 'complete' | 'partial' | 'likely_incomplete' | 'not_extracted'
```

**Why this matters beyond accuracy:** Your B2B customers will ask "how confident are you in this data?" An institution with `extraction_completeness_label = 'likely_incomplete'` should be flagged in the UI. Your API response should include this field. It's also a re-crawl prioritization signal — incomplete extractions should be re-attempted with a different URL or a deeper discovery pass.

---

## Problem 5: Pre-Screen Threshold Is Arbitrary

**What happens:** `_is_likely_fee_schedule()` requires `>= 3 fee keywords AND >= 2 dollar amounts`. This threshold was set without measuring what it rejects.

**The risk:** It's rejecting valid fee schedules that use different vocabulary. A credit union might say "service charge schedule" instead of "fee schedule" and "thirty dollars" instead of "$30". Both would fail the pre-screen.

**The fix — measure what's being rejected:**

```sql
-- What % of crawl attempts get pre-screened out?
SELECT
    failure_reason,
    COUNT(*) as n,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct
FROM crawl_targets
WHERE failure_reason IS NOT NULL
GROUP BY failure_reason
ORDER BY n DESC;
```

If `too_few_fee_keywords` or `no_dollar_amounts` is high (>20% of failures), the pre-screen is too aggressive and you're discarding real documents.

**Loosen the threshold and rely more on the document classifier (Problem 1 fix):**

```python
def _is_likely_fee_schedule(text: str) -> bool:
    """
    Pre-LLM screening. Now requires EITHER:
    - 3+ fee keywords AND 2+ dollar amounts (original)
    - OR the document classifier says it's a fee schedule
    
    The document classifier (classify_document.py) is more sophisticated.
    This function is the cheap first pass.
    """
    lower = text.lower()
    
    # Short circuit: explicit fee schedule title = always try LLM
    DEFINITIVE_TITLES = [
        "schedule of fees", "fee schedule", "schedule of charges",
        "consumer fee schedule", "deposit account fees",
        "schedule of service charges",
    ]
    if any(t in lower for t in DEFINITIVE_TITLES):
        return True

    fee_keywords = [
        "fee", "charge", "service charge", "overdraft", "nsf",
        "non-sufficient funds", "insufficient funds", "maintenance",
        "monthly service", "wire transfer", "atm", "stop payment",
        "dormant", "inactive account", "cashier", "statement fee",
        "schedule of fees", "fee schedule", "per item",
    ]
    keyword_matches = sum(1 for kw in fee_keywords if kw in lower)

    dollar_pattern = r"\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?"
    dollar_matches = len(re.findall(dollar_pattern, text))

    # Loosened: 2 keywords OR 1 dollar amount (was: 3 keywords AND 2 amounts)
    return keyword_matches >= 2 or dollar_matches >= 1
```

Note: loosening this will increase LLM calls. With the document classifier catching wrong documents *before* extraction, you can afford to be more permissive here. The LLM is the real filter.

---

## Problem 6: No Ground Truth — You Don't Know Your Error Rate

**What happens:** You have no way to measure extraction accuracy. You don't know if you're at 70% accuracy or 95% accuracy. You're flying blind.

**The fix — build a gold standard dataset.**

This is manual work, but it's the most valuable thing you can do for data credibility, especially with B2B customers.

**Process:**
1. Pick 50 institutions that already have extracted fees in your DB — spread across asset tiers and states
2. Manually look up each institution's actual published fee schedule
3. Manually record the ground truth fees in a spreadsheet: fee name, amount, category
4. Compare to what your pipeline extracted
5. Calculate: precision (of what you extracted, what % is correct), recall (of what exists, what % did you find)

**Target metrics for launch:**
- Precision ≥ 90% (less than 1 in 10 extracted fees is wrong)
- Recall ≥ 70% (you find at least 7 out of 10 real fees)
- Category accuracy ≥ 85% (of correctly extracted fees, 85% get the right category)

**Where to store the gold standard:**

```sql
CREATE TABLE gold_standard_fees (
    id                  BIGSERIAL PRIMARY KEY,
    crawl_target_id     BIGINT NOT NULL REFERENCES crawl_targets(id),
    fee_name            TEXT NOT NULL,
    amount              FLOAT,
    fee_category        TEXT,
    source_url          TEXT,        -- direct link to the fee schedule page
    verified_by         TEXT,        -- who verified this (your name)
    verified_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes               TEXT
);
```

**Run evaluation against gold standard:**

```python
# fee_crawler/commands/evaluate_accuracy.py

def evaluate(db, target_ids: list[int] = None) -> dict:
    """
    Compare extracted fees against gold standard.
    Returns precision, recall, category accuracy.
    """
    gold = db.fetchall("""
        SELECT crawl_target_id, fee_category, amount
        FROM gold_standard_fees
        WHERE crawl_target_id = ANY($1::bigint[])
    """, target_ids)
    
    extracted = db.fetchall("""
        SELECT crawl_target_id, fee_category, amount
        FROM extracted_fees
        WHERE crawl_target_id = ANY($1::bigint[])
          AND review_status = 'approved'
    """, target_ids)
    
    # Group by institution
    # For each institution: what % of gold standard fees did we extract?
    # For each institution: what % of extracted fees are in gold standard?
    # ...
    
    return {
        "precision": ...,
        "recall": ...,
        "category_accuracy": ...,
        "institutions_evaluated": len(set(r["crawl_target_id"] for r in gold)),
    }
```

**When to run this:** After every major change to the extraction pipeline (new model, new prompt, new validation rules). This is your regression test suite for data quality.

---

## Problem 7: Re-crawls Don't Detect Staleness

**What happens:** Once a fee is extracted and approved, it stays in the database forever. If the bank changes their fee schedule, you don't know until you happen to re-crawl that institution.

The `last_success_at` field exists on `crawl_targets` but there's no systematic "this data is X days old, re-crawl it" logic.

**The fix — add a staleness policy:**

```python
# In crawl.py, when selecting targets to crawl:

def _get_targets_to_crawl(db, config, limit=None, state=None):
    """
    Priority order for re-crawl:
    1. Has fee_schedule_url but has never been crawled (NULL last_crawl_at)
    2. Was crawled successfully but last_success_at > 90 days ago
    3. Was crawled successfully but last_success_at > 30 days ago (lower priority)
    """
    return db.fetchall("""
        SELECT *
        FROM crawl_targets
        WHERE fee_schedule_url IS NOT NULL
          AND consecutive_failures < 5
          AND (
              last_success_at IS NULL                          -- never crawled
              OR last_success_at < NOW() - INTERVAL '90 days'  -- stale
          )
        ORDER BY
            CASE WHEN last_success_at IS NULL THEN 0 ELSE 1 END ASC,  -- never first
            asset_size DESC NULLS LAST                                  -- bigger banks next
        LIMIT $1
    """, limit or 10000)
```

Also add a `data_freshness_days` computed field to your public API responses:

```typescript
// In API response for institution fees:
{
  institution_name: "First National Bank",
  fees: [...],
  data_freshness_days: 23,  // days since last successful crawl
  data_completeness: "partial"  // from extraction_completeness_label
}
```

Consumers and B2B customers need to know how fresh the data is. Hiding this destroys trust when they discover a fee you show as $35 is actually $30 now.

---

## Problem 8: The Confidence Score Is Meaningless Without Calibration

**What happens:** Claude returns a `confidence` value between 0.0 and 1.0 for each extracted fee. Your auto-approve threshold is 0.90 and auto-stage is 0.85. But these thresholds were set arbitrarily.

**The problem:** Claude's confidence scores are not calibrated. A confidence of 0.90 doesn't mean 90% of those fees are correct. It could mean 70% are correct or 99% are correct — you don't know.

**The fix — calibrate after you build the gold standard:**

Once you have 50 institutions in the gold standard:

```python
def calibrate_confidence_thresholds(gold_standard_results: list[dict]) -> dict:
    """
    For each confidence bucket (0.7-0.75, 0.75-0.8, etc.),
    measure the actual precision in the gold standard.
    
    Returns the confidence threshold at which precision hits 90%.
    """
    buckets = {}
    for result in gold_standard_results:
        conf = result["confidence"]
        bucket = round(conf * 20) / 20  # round to nearest 0.05
        if bucket not in buckets:
            buckets[bucket] = {"correct": 0, "total": 0}
        buckets[bucket]["total"] += 1
        if result["is_correct"]:
            buckets[bucket]["correct"] += 1
    
    for bucket, counts in sorted(buckets.items()):
        precision = counts["correct"] / counts["total"] if counts["total"] > 0 else 0
        print(f"  Confidence {bucket:.2f}: {precision:.0%} precision ({counts['total']} fees)")
    
    # Find threshold where precision >= 90%
    for threshold in sorted(buckets.keys(), reverse=True):
        cumulative_correct = sum(v["correct"] for k, v in buckets.items() if k >= threshold)
        cumulative_total = sum(v["total"] for k, v in buckets.items() if k >= threshold)
        if cumulative_total > 0 and cumulative_correct / cumulative_total >= 0.90:
            return {"auto_approve_threshold": threshold}
    
    return {"auto_approve_threshold": 0.95}  # conservative fallback
```

Until you run calibration, keep auto-approve threshold at 0.90 and do **not** lower it to increase approval rates. False approvals are worse than false rejects because users see the data.

---

## The Accuracy Build Order

Do these in sequence. Don't move to the next until the previous is done and measured.

| Step | What | Why First |
|---|---|---|
| **1** | Add `document_type_detected` column, build `classify_document.py`, wire into crawl | Eliminates the biggest source of fake fees before they enter the DB |
| **2** | Expand `NON_FEE_SUBSTRINGS` + tighten LLM prompt with negative examples | Catches misextracted limits, rates, and balance requirements |
| **3** | Run uncategorized fee query. Add top 30 missing aliases to `FEE_NAME_ALIASES` | Makes existing data more useful, improves peer analysis coverage |
| **4** | Add `extraction_completeness_score` to `crawl_targets`. Backfill for existing records | You need to know which records to trust and which to re-crawl |
| **5** | Build gold standard dataset (50 institutions, manually verified) | Gives you a real accuracy number instead of a guess |
| **6** | Run accuracy evaluation. Adjust confidence thresholds if calibration warrants it | Makes auto-approve trustworthy |
| **7** | Add staleness re-crawl logic. Anything > 90 days old gets re-queued | Keeps approved data current |

---

## What "Accurate Enough to Launch" Looks Like

You don't need 100% accuracy. You need accuracy you can honestly describe to customers.

**Minimum bar to show data publicly:**
- Precision ≥ 90% (measured against gold standard)
- 5,000+ institutions with at least 3 approved fees across 2+ categories
- Every public fee row shows `data_freshness_days` and `extraction_completeness_label`
- Clear methodology page: what you scrape, how you extract, what review process looks like

**Minimum bar for B2B customers:**
- Precision ≥ 90% (documented)
- Recall ≥ 70% (documented)
- Gold standard results published in methodology doc
- API response includes `confidence`, `freshness_days`, `completeness`
- Re-crawl cadence documented (monthly for approved institutions)

**You don't need 50,000 institutions to get first revenue.** You need 5,000 institutions with trustworthy, documented, fresh data. Quality beats coverage at the start of a B2B sale every time.
