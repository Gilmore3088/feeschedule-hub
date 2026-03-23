# Phase 5 — Platform Rules + 50% Coverage

> **Duration:** Weeks 8–12 development + ongoing compute  
> **Goal:** 35,000+ institutions (50%+) with approved extracted fees. Steady-state monthly cost < $10.

---

## 5A — Platform Rule Extraction

Rule-based extraction costs $0 per institution. Every platform you validate and enable permanently removes those institutions from the LLM queue.

### Create `fee_crawler/pipeline/extract_platform.py`

```python
"""
Rule-based fee extraction for known CMS platforms.

For each platform, once you've validated extraction rules against 20+ real 
institutions, flip rule_enabled = TRUE in platform_registry.

Validation process:
  1. Pick 20 institutions on the platform that already have LLM-extracted fees
  2. Run rule extractor on the same HTML
  3. Compare: does rule output match LLM output within 10%?
  4. If yes: flip rule_enabled = TRUE, all future institutions on this platform skip LLM
"""

from bs4 import BeautifulSoup
import re
from dataclasses import dataclass


@dataclass
class PlatformFee:
    fee_name: str
    amount: float | None
    frequency: str
    conditions: str | None
    confidence: float
    extracted_by: str


def try_platform_extraction(platform: str, html: str, rule_enabled: bool) -> list[PlatformFee] | None:
    """
    Returns list of fees if platform rules are enabled and match,
    or None to fall through to LLM extraction.
    """
    if not rule_enabled:
        return None

    extractors = {
        "banno":     _extract_banno,
        "q2":        _extract_q2,
        "wordpress": _extract_generic_tables,
        "drupal":    _extract_generic_tables,
        "fiserv":    _extract_generic_tables,
        "fis":       _extract_generic_tables,
    }

    extractor = extractors.get(platform)
    if not extractor:
        return None

    fees = extractor(html)
    return fees if fees else None


def _extract_banno(html: str) -> list[PlatformFee]:
    """
    Jack Henry Banno sites have consistent fee table structure.
    Typical: <table class="fee-schedule-table"> with Fee Type | Amount | Frequency columns.
    VALIDATE AGAINST 20+ REAL BANNO SITES BEFORE ENABLING.
    """
    soup = BeautifulSoup(html, "lxml")
    fees = []

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue

        header = " ".join(th.get_text() for th in rows[0].find_all(["th", "td"])).lower()
        if not any(kw in header for kw in ["fee", "charge", "amount", "cost"]):
            continue

        for row in rows[1:]:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if len(cells) < 2:
                continue

            fee_name = cells[0].strip()
            if not fee_name or len(fee_name) < 3:
                continue

            amount = _parse_dollar(cells[1] if len(cells) > 1 else "")
            if amount is None and not any(w in (cells[1] if len(cells) > 1 else "").lower()
                                          for w in ["free", "waived", "no charge", "$0"]):
                continue

            fees.append(PlatformFee(
                fee_name=fee_name,
                amount=amount,
                frequency=_parse_frequency(cells[2] if len(cells) > 2 else ""),
                conditions=cells[3] if len(cells) > 3 else None,
                confidence=0.88,
                extracted_by="banno_rule",
            ))

    return fees


def _extract_q2(html: str) -> list[PlatformFee]:
    """Q2 Banking: standardized disclosure tables."""
    soup = BeautifulSoup(html, "lxml")
    fees = []

    for table in soup.select("table.disclosure-table, table.fee-table, .fee-schedule table, table"):
        for row in table.find_all("tr")[1:]:  # skip header
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if len(cells) < 2:
                continue
            fee_name = cells[0].strip()
            if not fee_name or len(fee_name) < 3:
                continue
            amount = _parse_dollar(cells[1])
            if amount is None:
                continue
            fees.append(PlatformFee(
                fee_name=fee_name,
                amount=amount,
                frequency=_parse_frequency(cells[2] if len(cells) > 2 else ""),
                conditions=cells[3] if len(cells) > 3 else None,
                confidence=0.85,
                extracted_by="q2_rule",
            ))

    return fees


def _extract_generic_tables(html: str, platform: str = "generic") -> list[PlatformFee]:
    """Generic HTML table extraction. Used for WordPress, Drupal, Fiserv, FIS."""
    soup = BeautifulSoup(html, "lxml")
    fees = []

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue

        # Detect fee tables by header content
        header_text = " ".join(c.get_text() for c in rows[0].find_all(["th", "td"])).lower()
        if not any(kw in header_text for kw in ["fee", "service", "charge", "amount"]):
            continue

        for row in rows[1:]:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if len(cells) < 2:
                continue
            fee_name = cells[0].strip()
            if not fee_name or len(fee_name) < 3:
                continue
            if fee_name.lower() in {"fee", "service", "type", "description", "item", "charge"}:
                continue

            amount_text = cells[1]
            amount = _parse_dollar(amount_text)
            if amount is None and "$" not in amount_text and "free" not in amount_text.lower():
                continue

            fees.append(PlatformFee(
                fee_name=fee_name,
                amount=amount,
                frequency=_parse_frequency(cells[2] if len(cells) > 2 else ""),
                conditions=cells[3] if len(cells) > 3 else None,
                confidence=0.75,
                extracted_by=f"{platform}_rule",
            ))

    return fees


def _parse_dollar(text: str) -> float | None:
    if not text:
        return None
    text = text.strip()
    if text.lower() in {"free", "no charge", "waived", "n/a", "none", "$0", "$0.00"}:
        return 0.0
    m = re.search(r"\$?\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)", text)
    if m:
        try:
            return float(m.group(1).replace(",", ""))
        except ValueError:
            pass
    return None


def _parse_frequency(text: str) -> str:
    t = text.lower().strip()
    if any(w in t for w in ["month", "monthly", "/mo"]):
        return "monthly"
    if any(w in t for w in ["annual", "year", "/yr", "yearly"]):
        return "annual"
    if any(w in t for w in ["daily", "per day"]):
        return "daily"
    if any(w in t for w in ["one time", "one-time", "once", "initial"]):
        return "one_time"
    return "per_occurrence"
```

### Platform Validation Process

For each platform, before flipping `rule_enabled = TRUE`:

1. Find 20+ institutions on that platform that already have LLM-extracted fees:
   ```sql
   SELECT ct.id, ct.institution_name, ct.fee_schedule_url
   FROM crawl_targets ct
   JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
   WHERE ct.cms_platform = 'banno'
     AND ef.review_status = 'approved'
   LIMIT 25;
   ```

2. Re-extract those institutions using rules only (not LLM)

3. Compare: `rule_fees` vs `llm_fees` for each institution. Calculate:
   - Coverage: what % of LLM fees did rules also find?
   - Accuracy: what % of rule fees match LLM fees within $1?
   - False positive rate: what % of rule fees were NOT in LLM output?

4. If coverage > 85% and accuracy > 90%: flip `rule_enabled = TRUE`
   ```sql
   UPDATE platform_registry
   SET rule_enabled = TRUE, validated_count = 20
   WHERE platform = 'banno';
   ```

### Platform Priority Order

| Platform | Est. US Institutions | Structure | Validate First? |
|---|---|---|---|
| Jack Henry / Banno | ~1,100 | Very consistent HTML tables | ✅ YES — start here |
| Q2 Banking | ~450 | Standardized disclosure tables | ✅ YES |
| WordPress (PDF) | ~2,000+ | Not HTML — PDF at known path | Use pdfplumber, no HTML rules needed |
| Drupal | ~800 | Consistent CMS table output | After Banno + Q2 |
| Fiserv (varies by product) | ~3,700 | Heterogeneous — validate carefully | Last — most complex |

### Tasks
- [ ] Create `fee_crawler/pipeline/extract_platform.py`
- [ ] Validate Banno rules against 20 real Banno institutions
- [ ] If validation passes: `UPDATE platform_registry SET rule_enabled = TRUE WHERE platform = 'banno'`
- [ ] Validate Q2 rules against 20 real Q2 institutions
- [ ] If validation passes: flip Q2 rule_enabled
- [ ] Add platform extraction step to `extraction_worker.py`: try rules before pushing to LLM queue
- [ ] Monitor: `SELECT extracted_by, COUNT(*) FROM extracted_fees GROUP BY extracted_by` — should show growing rule-extracted share

---

## 5B — Second Discovery Pass

After the first full sweep, some institutions will still have no fee URL because:
- Their site uses heavy JavaScript rendering
- Their fee schedule was 3+ clicks deep
- They were temporarily down during first sweep

Run a targeted second pass:

```bash
# Re-queue institutions that failed discovery more than 30 days ago
INSERT INTO jobs (queue, entity_id, priority)
SELECT 'discovery', ct.id::TEXT, COALESCE(ct.asset_size, 0) / 1000000
FROM crawl_targets ct
LEFT JOIN jobs j ON j.entity_id = ct.id::TEXT AND j.queue = 'discovery'
WHERE ct.website_url IS NOT NULL
  AND ct.fee_schedule_url IS NULL
  AND (j.completed_at IS NULL OR j.completed_at < NOW() - INTERVAL '30 days')
ON CONFLICT DO NOTHING;
```

Enable Playwright for JS-heavy sites during this pass. Update `discovery_worker.py` to fall back to Playwright when plain HTTP returns < 200 chars of content.

---

## 5C — Ongoing Cadence

At steady state, these Modal jobs run automatically:

| Job | Schedule | What It Does | Est. Monthly Cost |
|---|---|---|---|
| `run_discovery` | Nightly 2am UTC | Sweeps new/changed institutions | ~$0 |
| `run_extraction` | Nightly 3am UTC | Downloads + text-extracts new URLs | ~$0 |
| `run_llm_batch` | Nightly 1am UTC | Processes LLM queue via Haiku Batch | ~$5–10 |
| `run_post_processing` | Nightly 6am UTC | Validate, categorize, auto-review, analyze | ~$0 |
| `ingest_daily` | Daily 10am UTC | FRED, NYFED, BLS, OFR | ~$0 |
| `ingest_weekly` | Monday 10am UTC | FDIC, NCUA, CFPB, SOD, Beige Book | ~$0 |
| Monthly re-crawl | 1st of month | Re-crawl all approved institutions for fee changes | ~$2–5 |

**Total monthly cost at steady state: ~$8–20/month** (infra + LLM)

---

## Gate: Phase 5 Complete — 50% Coverage

| Check | How to verify |
|---|---|
| ✅ Fee coverage ≥ 50% | `SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees` ≥ 35,000 |
| ✅ Categorization rate ≥ 90% | `SELECT COUNT(*) FROM extracted_fees WHERE fee_category IS NOT NULL` / total ≥ 90% |
| ✅ Platform rules active for 2+ platforms | `SELECT platform FROM platform_registry WHERE rule_enabled = TRUE` returns ≥ 2 rows |
| ✅ All 50 states have coverage | `SELECT state_code, COUNT(DISTINCT ct.id) FROM crawl_targets ct JOIN extracted_fees ef ON ef.crawl_target_id = ct.id GROUP BY state_code` — no nulls, no states with < 50 |
| ✅ Asset tier coverage met | Community > 45%, Regional > 60%, Large Regional > 80% |
| ✅ Monthly LLM cost < $10 | Anthropic API billing page — steady-state re-crawl cost |
| ✅ Manual review queue manageable | `SELECT COUNT(*) FROM extracted_fees WHERE review_status IN ('pending', 'staged')` < 5,000 |
