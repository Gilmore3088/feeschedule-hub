---
title: Fee categorization not working -- institution pages show no national medians
date: 2026-04-08
priority: critical
area: data-pipeline
---

# Fee Categorization Not Working

## Problem
Space Coast Federal Credit Union has 18 extracted fees visible on the institution page, but ALL show "-" for National Median and Vs. Median columns. This means the fees have no `fee_category` assignment, so they can't be matched against the national index.

This has been worked on for weeks. Something is broken in the categorization pipeline.

## Impact
- Institution pages show raw fees with no benchmarking context -- defeats the entire value prop
- Fee callouts (Phase 30) can't fire without category matches
- Percentile badges can't compute without category matches
- Distribution charts can't render without category matches
- The national index itself may be incomplete if categorization is failing broadly

## Investigation Needed
1. Check `extracted_fees` for Space Coast -- do any rows have a non-null `fee_category`?
2. Check if `categorize_fees.run()` has been run against these fees
3. Check if the 49-category taxonomy aliases are matching the raw fee names
4. Check if this is a Space Coast-specific issue or a systemic problem across all institutions
5. Run `python -m fee_crawler categorize` against Space Coast and check output

## Expected Behavior
Fees like "Overdraft Privilege Fee" ($30.00) should map to `overdraft` category, "Returned Check" ($30.00) should map to `nsf` or `returned_item`, "Stop Payment" ($15.00) should map to `stop_payment`, etc.
