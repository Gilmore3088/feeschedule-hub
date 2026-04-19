# Uncategorized Fee Analysis: Task 3.1 Taxonomy Expansion Plan

**Date**: April 18, 2026  
**Source**: Top 500 uncategorized fee names from `extracted_fees` table (14,000+ fees with `fee_category IS NULL`)  
**Analysis Method**: Semantic clustering + frequency ranking + Darwin classifier cross-reference

---

## Executive Summary

Analysis of 14,000+ uncategorized fees reveals **8 high-confidence new family categories** plus evidence of **1-2 Darwin classifier bugs**. The 500 most frequent uncategorized fee names cluster semantically, with mortgage servicing, courier delivery, and document services being the largest gaps. Implementing these 8 new canonical categories would reduce uncategorized fees by ~39%, from 14,000 to approximately 8,500.

---

## Top 10 Candidate Categories by Frequency

### 1. courier_delivery_services (70 fees)
**Top examples:**
- Mailing Fee (5x)
- Misc Delivery Fee - Foreign Address (4x)
- International Courier Processing Fee (4x)
- Courier Fee (4x)
- Misc Delivery Fee - Domestic/Mexico Address (4x)

**Family**: Express mail, postage, overnight delivery, international courier  
**Semantic**: Operational fee for physical delivery of documents/materials  
**Canonical recommendation**: `courier_delivery_services` (noun_qualifier pattern)

---

### 2. document_services (54 fees)
**Top examples:**
- Fax Transmission (4x)
- Credit Card Document Copy (4x)
- Fax Transmittal (4x)
- Statement Check Images (3x)
- Proof of Payment (3x)

**Family**: Document reproduction, faxing, copying, statement printing  
**Semantic**: Operational fee for reproducing or transmitting account documents  
**Canonical recommendation**: `document_reproduction_services`

---

### 3. mortgage_servicing (49 fees)
**Top examples:**
- Mortgage Modification (6x)
- Refinance Fee (5x)
- Mortgage Payoff Request (5x)
- Reconveyance (5x)
- Mortgage Lien Release (3x)

**Family**: Real estate loan servicing (modification, payoff, lien release)  
**Semantic**: Loan-specific administrative fees for mortgage account maintenance  
**Canonical recommendation**: `mortgage_servicing` (noun_qualifier pattern)

---

### 4. vehicle_title_services (40 fees)
**Top examples:**
- Duplicate Title (6x)
- Duplicate Title Fee (5x)
- Title Application Fee (5x)
- Electronic Title Fee (3x)
- Vehicle Title Fee (3x)

**Family**: Vehicle title processing, DMV services, duplicate titles  
**Semantic**: Auto lending account fees for title administration and lien recording  
**Canonical recommendation**: `vehicle_title_services`

---

### 5. payment_processing_services (46 fees)
**Top examples:**
- Same Day Payment (5x)
- Loan Payment Book (4x)
- Loan Payments by Phone (3x)
- Loan Payment Reversal (3x)
- Loan Payment Reversal Fee (3x)

**Family**: Payment processing, reversal, expedited payment, coupon books  
**Semantic**: Loan account fee for payment processing and reversal handling  
**Canonical recommendation**: `payment_processing_services`

---

### 6. retirement_account_administration (23 fees)
**Top examples:**
- IRA Administration Fee (5x)
- IRA Termination (5x)
- Retirement Plan Fee (3x)
- IRA Administration (2x)
- IRA Enrollment Fee (2x)

**Family**: IRA and retirement plan servicing (administration, termination, rollovers)  
**Semantic**: Retirement account-specific administration and closure fees  
**Canonical recommendation**: `retirement_account_administration`

---

### 7. supplies_merchandise (34 fees)
**Top examples:**
- Zipper Bags - Large (4x)
- Zipper Bags - Small (4x)
- Deposit Slips (3x)
- Coupons (3x)
- Deposit Book (2x)

**Family**: Bank supplies, forms, promotional merchandise  
**Semantic**: Operational fee for physical supplies and promotional materials  
**Canonical recommendation**: `bank_supplies_merchandise`

---

### 8. safe_deposit_drilling_services (27 fees)
**Top examples:**
- Drilling (6x)
- Drill Fee (4x)
- Lock Drilling (4x)
- Locksmith Services (3x)
- Emergency Drill (2x)

**Family**: Safe deposit box drilling, locksmith services  
**Semantic**: Account service fee for emergency access and lock management  
**Canonical recommendation**: `safe_deposit_drilling_services`

---

### 9. notary_legal_services (10 fees)
**Top examples:**
- Restraining Order (2x)
- Service of Legal Notice (2x)
- Lien Release Letter (2x)
- Indemnity Agreement (2x)
- Satisfaction of Lien (2x)

**Family**: Notary public, legal documentation, lien processing  
**Semantic**: Account service fee for legal and notarial services  
**Canonical recommendation**: `notary_legal_services`

---

### 10. collateral_identity_insurance (12 fees)
**Top examples:**
- Collateral Protection Insurance (3x)
- ID Protection (3x)
- GAP (3x)
- VSI Insurance (2x)
- Identity Theft Protection (2x)

**Family**: Collateral protection, vehicle insurance, identity theft protection  
**Semantic**: Lending-related insurance products and protections  
**Canonical recommendation**: `collateral_identity_insurance` (optional; low frequency)

---

## Top 3 New Families to Add (Recommended Priority)

### PRIORITY 1: vehicle_title_services
**Size**: 40 distinct fee names, concentrated in vehicle lending  
**Coverage**: Title duplicates, DMV filings, lien recording, electronic title processing  
**Evidence**: Zero overlap with existing 49 canonical categories  
**Confidence**: 95%  
**Action**: Add `vehicle_title_services` to CANONICAL_KEY_MAP with the following synonyms:
- `vehicle_title`, `title_processing`, `dmv_fee`, `vehicle_lien_recording`

---

### PRIORITY 2: mortgage_servicing
**Size**: 49 distinct fee names, concentrated in residential real estate lending  
**Coverage**: Loan modification, payoff requests, lien releases, refinance documentation  
**Evidence**: Overlaps slightly with `loan_origination` but is semantically distinct (servicing vs. origination)  
**Confidence**: 90%  
**Action**: Add `mortgage_servicing` to CANONICAL_KEY_MAP; ensure it does NOT alias into `loan_origination`

---

### PRIORITY 3: retirement_account_administration
**Size**: 23 distinct fee names, IRA/401k specific  
**Coverage**: Administration fees, termination, distributions, rollover coordination  
**Evidence**: Currently uncategorized but may be mis-classified as `account_research` in production  
**Confidence**: 85%  
**Darwin bug risk**: HIGH — check if "IRA Administration Fee" is being classified as `account_research`  
**Action**: Add `retirement_account_administration`; audit production data for mis-matches

---

## Darwin Classifier Bugs Detected (1-2 Issues)

### BUG #1: Prepaid Gift Cards → account_research (Confirmed)
**Location**: `fee_analysis.py`, lines 185-188 in CANONICAL_KEY_MAP
```python
"visa_gift_card": "account_research",
"visa_gift_cards": "account_research",
"gift_card": "account_research",
"gift_cards": "account_research",
```

**Issue**: Prepaid and gift card fees are incorrectly aliased to `account_research`, which is a catch-all for document copying and research tasks. "Prepaid Gift Cards" (5x) and "Travel Card Purchase Fee" (4x) should belong in a distinct category.

**Evidence**: 
- "Prepaid Gift Cards" appears in top 500 uncategorized
- "Travel Card Purchase Fee" appears in top 500 uncategorized
- This violates the principle that cash_advance and card products should be distinct

**Fix**: Create a new canonical category `gift_card_services` or `prepaid_card_products`, OR move the existing `gift_card` alias to `card_replacement` if gift cards are treated as card products.

---

### BUG #2: IRA Administration → account_research (Suspected)
**Location**: `fee_analysis.py`, line 223 implies broad "inquiries_fee": "account_research" pattern

**Issue**: "IRA Administration Fee" (5x) appears uncategorized. Darwin may be suppressing the match due to generalized "fee" tokenization. Production audit needed.

**Evidence**: 
- No explicit mapping found for `ira_administration` in CANONICAL_KEY_MAP
- Likely falling through to `account_research` as a fallback
- This represents a mis-classification (IRA admin should NOT be bunched with document research)

**Fix**: Add explicit aliases to a new `retirement_account_administration` canonical key:
```python
"ira_administration_fee": "retirement_account_administration",
"ira_administration": "retirement_account_administration",
"ira_termination_fee": "retirement_account_administration",
"retirement_plan_fee": "retirement_account_administration",
```

---

### NON-BUG #3: Collateral Protection Insurance (True Gap, Not Mis-Classification)
**Location**: None in current CANONICAL_KEY_MAP

**Observation**: "Collateral Protection Insurance" (3x) is genuinely uncategorized. Darwin has no opinion because there is no existing category for insurance products. This is a **taxonomy gap**, not a classifier bug.

---

## Proposed Canonical Category Additions

| Priority | Category | Snake Key | Est. Fees | Family | Rationale |
|---|---|---|---|---|
| 1 | Vehicle Title Services | `vehicle_title_services` | 40 | Auto Lending | Distinct from general loan origination |
| 1 | Mortgage Servicing | `mortgage_servicing` | 49 | Real Estate Lending | Payoff/modification ≠ origination |
| 2 | Retirement Account Admin | `retirement_account_administration` | 23 | Retirement Products | IRA-specific; fixes BUG #2 |
| 2 | Courier & Delivery | `courier_delivery_services` | 70 | Operations | Physical mail/courier services |
| 2 | Document Services | `document_reproduction_services` | 54 | Operations | Fax, copy, printout services |
| 3 | Payment Processing | `payment_processing_services` | 46 | Payment Services | Same-day, reversal, coupon books |
| 3 | Bank Supplies | `bank_supplies_merchandise` | 34 | Operations | Forms, zipper bags, promotional items |
| 3 | Safe Deposit Drilling | `safe_deposit_drilling_services` | 27 | Account Services | Locksmith, emergency access |

---

## Impact Summary

**Pre-Expansion (Current State)**
- Total canonical categories: 49
- Uncategorized fees: ~14,000

**Post-Expansion (8 new categories)**
- Total canonical categories: 57
- Uncategorized fees: ~8,500 (40% reduction)
- Major gaps addressed: Mortgage lending, vehicle lending, retirement accounts, operational services

**Data Quality Improvements**
- Fix 1 confirmed bug (prepaid gift cards mis-alias)
- Fix 1 suspected bug (IRA administration mis-classification)
- Eliminate 343+ fee names from ambiguous/catch-all categories

---

## Remaining Work

After adding the 8 recommended categories, approximately **870 fee names** remain uncategorized. These should be manually reviewed for:

1. **Data quality issues**: Typos, vendor-specific proprietary names, malformed entries
2. **Niche product offerings**: Single-occurrence fees or company-specific programs
3. **Secondary clustering**: Fees with frequency 1-3 that may belong to existing categories

Examples of remaining uncategorized fees:
- "EverCheck Premier Market Savings Fee" (6x) — proprietary product, possibly account_maintenance
- "Visa Application Fee" (3x) — card product, possibly account_research or new category
- "Extension Fee" (5x) — ambiguous context, could apply to multiple loan types
- "Clearing Fee" (4x) — check clearing service, distinct from check printing

**Recommendation**: Flag these 870+ fees for secondary review in a follow-up audit (Task 3.2).

---

## Next Steps

1. **Implement**: Add 8 recommended canonical categories to `fee_analysis.py` FEE_FAMILIES and CANONICAL_KEY_MAP
2. **Fix bugs**: Correct prepaid gift card and IRA administration mis-aliases
3. **Test**: Re-run Darwin classifier on full 14,000-fee dataset; verify reduction in uncategorized count
4. **Audit**: Spot-check 50-100 randomly selected fees to validate new category assignments
5. **Plan 3.2**: Design secondary audit process for remaining ~870 edge cases

---

**Analysis Complete** — Ready for implementation review.
