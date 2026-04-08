---
title: Roomba needs wider rejection bands — crazy maxes still in data
area: data-quality
priority: high
created: 2026-04-07
---

## Problem

The admin catalog at /admin/fees/catalog shows insane max values:
- card_replacement: $5,000 (should be <$50)
- atm_non_network: $715 (should be <$10)
- minimum_balance: $10,000 (extraction error)
- ach_origination: $500 (should be <$50)
- check_cashing: $500 (should be <$20)
- nsf: $500 (should be <$50)

The Roomba only has rejection bands for 11 categories. Need to expand to cover ALL 49 canonical categories.

Also: catalog page shows 15 "Featured" by default — user may think that's all 49. The `?show=all` toggle exists but isn't obvious.

## Fix

1. Expand REJECTION_BANDS in roomba.py to cover all 49 categories
2. Add a "statistical max" sweep: flag any fee above P99 for its category
3. Re-run Roomba with expanded bands
4. Consider making the catalog default to all 49 instead of 15 featured
