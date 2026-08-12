# Research & Data API Expansion Plan

## Overview

Audit of the Bank Fee Index data pipeline against all available free public APIs. The project currently integrates 7 data sources across 18 CLI commands. This plan identifies **high-value gaps** where new APIs or better use of existing APIs would materially improve the product.

## Current State: What We Have

| Source | Command | Status | Key Gap |
|--------|---------|--------|---------|
| FDIC BankFind | `seed`, `ingest-fdic` | Active (34,553 rows) | `service_charge_income` is NULL -- not pulling RIAD4080 |
| NCUA 5300 | `seed`, `ingest-ncua` | Active (4,419 rows) | Fee income (ACCT_131) not extracted |
| FRED API | `ingest-fred` | Active (1,248 rows) | Just fixed: replaced discontinued series, added districts |
| CFPB Complaints | `ingest-cfpb` | Active (2,069 rows) | Only 2024 data; no fee-specific filtering |
| Fed Beige Book | `ingest-beige-book` | Active (114 sections) | Working well |
| Fed Content | `ingest-fed-content` | Active (315 items) | Working well |
| Fee Schedules | `crawl` pipeline | Active (65,287 fees) | 99.7% unreviewed |

---

## Tier 1: Fix What We Already Have (High Impact, Low Effort)

These are bugs/gaps in existing integrations -- not new APIs, just better use of what's already wired up.

### 1.1 FDIC: Pull Service Charge Income (RIAD4080)

**Problem**: `ingest-fdic` already calls the FDIC Financials API but `service_charge_income` is NULL for all rows.
**Fix**: The FDIC API exposes `SC` (RIAD4080) and `NIMY` (net interest margin %). Add these fields to the API query.
**File**: `fee_crawler/commands/ingest_fdic.py`
**Impact**: Enables the entire fee-revenue correlation feature (fee_crawler skill: `fee-revenue-correlation`)

### 1.2 NCUA: Extract Fee Income (Account 131)

**Problem**: `ingest-ncua` downloads 5300 ZIP files but doesn't extract Account 131 (fee income).
**Fix**: Parse `ACCT_131` from FS220A.txt alongside existing fields.
**File**: `fee_crawler/commands/ingest_ncua.py`
**Impact**: Credit union fee revenue analysis parity with banks

### 1.3 CFPB: Expand Date Range & Fee-Specific Filtering

**Problem**: Only ingesting 2024 complaints. Not filtering to fee-related issues.
**Fix**: Expand to 2020-present. Filter products to "Checking or savings account" with fee-related issues (overdraft, account management fees, problem with fees).
**File**: `fee_crawler/commands/ingest_cfpb.py`
**Impact**: 5x more complaint data, all fee-relevant

### 1.4 FRED: Add BLS Bank Services CPI

**Problem**: We have general CPI (CPIAUCSL) but not the bank-specific CPI.
**Fix**: Add series `CUSR0000SEMC01` (CPI for Checking Account and Other Bank Services) to FRED ingestion.
**File**: `fee_crawler/commands/ingest_fred.py`
**Impact**: "Bank fees rose 3.2% while overall inflation was 2.1%" -- compelling narrative data

```python
# Add to NATIONAL_SERIES in ingest_fred.py
"CUSR0000SEMC01",  # CPI: Checking Account and Other Bank Services (monthly, BLS via FRED)
```

---

## Tier 2: New API Integrations (High Impact, Moderate Effort)

### 2.1 BLS Public Data API (Direct)

- **URL**: `https://api.bls.gov/publicAPI/v2/timeseries/data/`
- **Auth**: Free registration key (500 queries/day)
- **Data**: CPI for bank services, regional CPI, banking sector wages
- **Why**: FRED has some BLS data but not all regional breakdowns. Direct BLS API gives per-metro CPI.
- **Command**: `ingest-bls` (new)
- **Table**: Reuse `fed_economic_indicators` with `series_id` prefix `BLS_`
- **Effort**: Small -- same pattern as `ingest-fred`

### 2.2 FDIC Summary of Deposits (SOD)

- **URL**: `https://banks.data.fdic.gov/bankfind-suite/SOD`
- **Auth**: None
- **Data**: Branch-level deposit data for all 76,000+ domestic offices. Annual (June 30).
- **Why**: Compute local market concentration (HHI). Banks in concentrated markets charge higher fees.
- **Command**: `ingest-sod` (new)
- **Table**: New `branch_deposits` table (institution_id, branch_id, state, county, msa, deposits, year)
- **Derived**: `market_concentration` table (msa, hhi, top3_share, year)
- **Effort**: Medium -- new table, new aggregation logic

### 2.3 FFIEC Census Tract Income Data

- **URL**: `https://www.ffiec.gov/data/census`
- **Auth**: None (flat file download)
- **Data**: Tract income classification (low/moderate/middle/upper), median family income by MSA
- **Why**: "Do institutions in lower-income communities charge higher fees?" CRA-type equity analysis.
- **Command**: `ingest-census-tracts` (new)
- **Table**: New `census_tracts` table (tract_id, state, county, msa, income_level, median_income, year)
- **Enrichment**: Join with branch locations from SOD data
- **Effort**: Medium -- flat file parsing, geographic joins

### 2.4 Census ACS Demographics API

- **URL**: `https://api.census.gov/data/`
- **Auth**: Free API key
- **Data**: Median household income, poverty rate, population by ZIP/county/state
- **Why**: "Fee burden" metric = avg monthly fees / median household income. Powerful consumer story.
- **Command**: `ingest-census-acs` (new)
- **Table**: New `demographics` table (geo_id, geo_type, median_income, poverty_rate, population, year)
- **Effort**: Medium -- API key registration, geographic level decisions

### 2.5 NY Fed Markets Data API

- **URL**: `https://markets.newyorkfed.org/`
- **Auth**: None
- **Data**: SOFR, EFFR daily rates, Treasury repo rates
- **Why**: Rate environment drives fee behavior. When rates drop, fee income rises to compensate.
- **Command**: Could add to `ingest-fred` as supplemental, or separate `ingest-nyfed`
- **Effort**: Small -- simple JSON API, few series

---

## Tier 3: Strategic Enrichment (Moderate Impact, Higher Effort)

### 3.1 SEC EDGAR API (Public Bank 10-K Filings)

- **URL**: `https://data.sec.gov/`
- **Auth**: None (User-Agent header with email required)
- **Rate limit**: 10 req/sec
- **Data**: 10-K/10-Q filings with XBRL-tagged financials for public bank holding companies
- **Why**: Fee strategy narratives in annual reports. "Management expects service charge income to..."
- **Command**: `ingest-sec-filings` (new)
- **Effort**: High -- XBRL parsing, entity matching (CIK to cert_number)

### 3.2 CFPB Overdraft/NSF Policy Tracking Tables

- **URL**: `https://www.consumerfinance.gov/data-research/research-reports/`
- **Auth**: None (static download)
- **Data**: Tracked overdraft policies for ~20 largest banks (amounts, caps, grace periods)
- **Why**: Ground-truth validation for your LLM-extracted overdraft fees
- **Command**: Manual ingest or `ingest-cfpb-od-tracking`
- **Effort**: Medium -- semi-structured data, periodic manual updates

### 3.3 CFPB Credit Card Terms (TCCP Survey)

- **URL**: `https://www.consumerfinance.gov/data-research/credit-card-data/`
- **Auth**: None (CSV download)
- **Data**: 30+ years of credit card fees (annual fees, late fees, over-limit fees) from 150+ issuers
- **Why**: Expand beyond deposit fees to credit card fees for a complete fee picture
- **Command**: `ingest-cfpb-tccp` (new)
- **Effort**: Medium -- CSV parsing, new fee families needed in taxonomy

### 3.4 OFR Financial Stress Index

- **URL**: `https://www.financialresearch.gov/financial-stress-index/`
- **Auth**: None
- **Data**: Daily financial stress index (33 market variables)
- **Why**: Contextual indicator -- fee behavior changes under financial stress
- **Command**: Could add to `ingest-fred` or separate `ingest-ofr`
- **Effort**: Small

### 3.5 FR Y-9C Bank Holding Company Reports

- **URL**: `https://www.chicagofed.org/banking/financial-institution-reports/bhc-data`
- **Auth**: None (bulk CSV)
- **Data**: Consolidated financials for BHCs with $3B+ assets
- **Why**: Enterprise-level fee strategy (JPMorgan consolidated vs. individual charters)
- **Effort**: High -- entity matching, consolidation logic

---

## What We Do NOT Need

| Source | Reason to Skip |
|--------|---------------|
| FDIC Bank Failures API | Too niche; only ~5 failures/year recently |
| HMDA Data Browser | Mortgage data -- tangential to fee analysis |
| Fed Survey of Consumer Finances | Triennial microdata -- too infrequent, hard to operationalize |
| FRASER Archive | Historical research only -- no API, manual effort |
| Treasury Fiscal Data API | Government finance -- not directly fee-relevant |

---

## Recommended Execution Order

### Sprint 1: Fix Existing Integrations (Tier 1)
1. **1.1** FDIC RIAD4080 -- unlocks fee-revenue correlation (existing plan: `feat-call-report-fee-revenue-pipeline.md`)
2. **1.2** NCUA Account 131 -- CU parity
3. **1.4** FRED bank services CPI -- one line of code
4. **1.3** CFPB date expansion -- minor change

### Sprint 2: Market Context Layer (Tier 2, subset)
5. **2.5** NY Fed rates -- small effort, high context value
6. **2.1** BLS direct API -- regional CPI breakdowns

### Sprint 3: Geographic Intelligence (Tier 2, remainder)
7. **2.2** FDIC SOD -- market concentration
8. **2.3** FFIEC Census tracts -- income classification
9. **2.4** Census ACS demographics -- fee burden metric

### Sprint 4: Strategic Depth (Tier 3, selective)
10. **3.2** CFPB OD tracking -- validation data
11. **3.4** OFR stress index -- dashboard context
12. **3.1** SEC EDGAR -- only if pursuing institutional research product

---

## API Key Requirements

| API | Auth Type | Key Needed | Status |
|-----|-----------|------------|--------|
| FDIC BankFind | None | No | Ready |
| NCUA | None | No | Ready |
| FRED | API key (query param) | `FRED_API_KEY` | Configured in `.env.local` |
| CFPB | None | No | Ready |
| BLS v2 | Registration key | `BLS_API_KEY` (new) | Need to register |
| Census ACS | Registration key | `CENSUS_API_KEY` (new) | Need to register |
| NY Fed Markets | None | No | Ready |
| SEC EDGAR | None (User-Agent) | No | Ready |
| OFR | None | No | Ready |

**User action needed**: Register for free keys at:
- BLS: https://data.bls.gov/registrationEngine/
- Census: https://api.census.gov/data/key_signup.html

---

## References

- FDIC BankFind API docs: https://api.fdic.gov/banks/docs/
- CFPB Complaint API: https://cfpb.github.io/api/ccdb/
- BLS API: https://www.bls.gov/developers/home.htm
- Census ACS API: https://www.census.gov/data/developers/data-sets/acs-5year.html
- NY Fed Markets API: https://markets.newyorkfed.org/static/docs/markets-api.html
- FFIEC Census Data: https://www.ffiec.gov/data/census
- FDIC SOD: https://banks.data.fdic.gov/bankfind-suite/SOD
- SEC EDGAR API: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- OFR Financial Stress: https://www.financialresearch.gov/financial-stress-index/
- Existing plan (fee-revenue): `plans/feat-call-report-fee-revenue-pipeline.md`
- Existing plan (data hygiene): `plans/feat-data-hygiene-pipeline.md`
