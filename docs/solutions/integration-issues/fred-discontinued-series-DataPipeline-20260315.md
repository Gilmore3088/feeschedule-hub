---
module: Data Pipeline
date: 2026-03-15
problem_type: integration_issue
component: tooling
symptoms:
  - "FRED series USNIM and EQTA returning only 3 observations since 2020"
  - "FRED API returning 400 for BLS series CUSR0000SEMC01"
  - "Bank services CPI not available via FRED API"
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags: [fred-api, bls-api, discontinued-series, economic-indicators]
---

# FRED Discontinued Series + BLS Series Not on FRED

## Symptom

The `ingest-fred` command was configured with series `USNIM` (Net Interest Margin) and `EQTA` (Equity Capital to Assets). Both returned only 3 observations -- they were **discontinued by FRED in Q3 2020** when the FDIC stopped publishing via FRED.

Additionally, `CUSR0000SEMC01` (CPI for Checking Account and Other Bank Services) was assumed to be on FRED but returns a 400 error -- it's a **BLS-only series** not mirrored to FRED.

## Investigation

1. Searched FRED for replacement NIM/ROA series -- all FDIC-sourced banking profitability series (USNIM, USROA, USROE, US1NIM, etc.) are discontinued
2. Found the **Quarterly Banking Profile (QBP)** series are the active replacements, published directly by FDIC through FRED
3. Tested `CUSR0000SEMC01` on FRED -- 400 error, series doesn't exist
4. Tested broader `CUSR0000SEMC` (professional services) -- exists but wrong granularity
5. Confirmed `CUUR0000SEMC01` is available only via the direct BLS Public Data API v2

## Root Cause

FDIC stopped publishing bank performance metrics to FRED after Q2 2020. The data moved to FDIC's own Quarterly Banking Profile series with different series IDs (prefix `QBPQ`). The BLS bank services CPI was never on FRED -- it's only available via the BLS API directly.

## Solution

### Replaced discontinued series with active QBP equivalents:

```python
# Before (discontinued)
"USNIM",         # Net Interest Margin -- DISCONTINUED
"EQTA",          # Equity Capital to Assets -- DISCONTINUED

# After (active through Q4 2025)
"QBPQYNTIY",        # Net Interest Income (quarterly, QBP)
"QBPQYTNIY",        # Total Noninterest Income (quarterly, QBP)
"QBPQYTNIYSRVDP",   # Service Charges on Deposit Accounts (quarterly, QBP)
"QBPQYNTYBKNI",     # Net Income (quarterly, QBP)
```

### Built separate `ingest-bls` command for BLS-only series:

The bank services CPI (`CUUR0000SEMC01`) requires the direct BLS API v2, which uses POST requests with JSON payloads and supports batching up to 50 series per request.

```python
# BLS API v2 (different from FRED)
payload = {
    "seriesid": ["CUUR0000SEMC01", "CUUR0000SEMC02"],
    "startyear": "2015",
    "endyear": "2026",
    "registrationkey": api_key,  # optional, improves rate limits
}
resp = requests.post("https://api.bls.gov/publicAPI/v2/timeseries/data/", json=payload)
```

## Prevention

- When adding FRED series, check `observation_end` date in the series metadata -- if it's years old, the series may be discontinued
- Search for replacement series using `fred/series/search` endpoint with `order_by=popularity`
- BLS series (prefix `CU`, `LA`, `CE`, etc.) are NOT guaranteed to be on FRED -- always verify with `fred/series?series_id=X` before assuming availability
- The FRED `popular` endpoint lists trending series including BLS ones that ARE mirrored

## Files Changed

- `fee_crawler/commands/ingest_fred.py` -- replaced series, added district unemployment
- `fee_crawler/commands/ingest_bls.py` -- new command for direct BLS API
- `fee_crawler/config.py` -- updated default series list

## Related

- BLS API docs: https://www.bls.gov/developers/home.htm
- FRED API docs: https://fred.stlouisfed.org/docs/api/fred/
- FRED QBP series search: search for "Quarterly Banking Profile" on FRED
