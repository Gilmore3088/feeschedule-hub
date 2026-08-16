# Catalog Data-Quality Audit — 2026-08-15 (read-only)

Direct read-only queries against `published_fee_catalog` and `institution_sources`.
No data was modified. Every finding below is reproducible with the SQL noted.

## Headline numbers

| Metric | Value |
|---|---|
| Total published_fee_catalog rows | 13,317 |
| Exact duplicates (same institution_id, fee_name, amount) | **9,589 (72%)** |
| Rows with NULL source_url | **11,129 (84%)** |

Implication: the site's "13,317 verified fee observations" stat counts duplicate
rows; distinct observations are ~3,700. The published stat AND the marketing
claims should count `distinct (institution_id, fee_name, amount)`.

## Confirmed bugs (from studio matrix follow-ups)

### 1. Duplicate publishing — systemic, not isolated
Hamilton (publish stage) writes the same fee line repeatedly. Examples:
inst 4861 notary ×16 identical rows; 4399 ×11; 8434 (Bay Cities, a first-send
target) ×15.00 ×10; 860's $384 cap ×3; 1675's $50 ATM ×5.
**Fix direction:** unique constraint (or upsert key) on
`(institution_id, canonical_fee_key, amount, variant_type)` + one-time dedupe.

### 2. 860 notary contradiction — unsourced row wins over sourced rows
Rows: `Notary service $10.00` (id 11654, **source_url NULL**) vs
`Notary $0.00 FREE` ×2 (ids 11878/11897, sourced). The $10 row is the suspect.
**Fix direction:** provenance gate (no source → no publish) would have blocked it.

### 3. $384 "daily" cap mislabeled
`Maximum overdraft/NSF fee $384.00 daily` ×3 with `is_fee_cap = false`.
It IS a cap (12 × $32). **Fix:** set `is_fee_cap=true` for cap-type lines;
display layer then renders "daily maximum" instead of a scary bare "daily".

### 4. 7192 Redwood: zero provenance + wrong name
35 published rows, **0 with source_url**. Name is "Redwood Federal Credit
Union" but website is redwoodcu.org → real name **Redwood Credit Union**
(cert 60793). HOLD stays until name fixed and fees re-verified from the
fee_schedule_url PDF that IS on file.

### 5. 8485 First CU: wrong name (already hand-corrected in studio)
DB says "First Federal Credit Union"; website FirstCU.net → **First Credit
Union** (Chandler AZ, cert 68444). Studio pack/narrative/draft already use the
correct name; DB still wrong.

## New systemic finding: spurious "Federal" in CU names

**2,019 credit unions** have "Federal" in institution_name while their website
contains neither "federal" nor "fcu" — the same fingerprint as the two known
wrong names. This is a heuristic (many real FCUs use short domains), so each
needs NCUA charter verification (cert_number is on file) before renaming.
Three are in the 25-report matrix and should be verified BEFORE any send:

| id | DB name | website |
|---|---|---|
| 8101 | Emblem Federal Credit Union | emblemcu.com |
| 8434 | Bay Cities Federal Credit Union | baycities.org |
| 8595 | Union Square Federal Credit Union | unionsquare.org |

NCUA's public charter lookup by cert_number settles each in seconds.

## 1675 $50 ATM (verify-before-send flag)
`Foreign ATM Usage Charge $50.00` ×5 rows, all `source_url NULL`, all
review_status=approved. Confirms: approved+published with no provenance.
Either find it in 1675's source doc or pull the datapoint.

## Recommended fix order (next working session)
1. One-time dedupe of published_fee_catalog + unique constraint.
2. Provenance gate in Hamilton: publish requires source_url (or explicit override).
3. NCUA-verify + correct the 5 known/suspect names (7192, 8485, 8101, 8434, 8595).
4. Cap-detection rule (`is_fee_cap`) for "Maximum …" lines.
5. Recompute site stats from distinct observations.
6. Re-run studio pull for affected institutions; re-render; then user review pass.
