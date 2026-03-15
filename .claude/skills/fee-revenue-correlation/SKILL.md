---
name: fee-revenue-correlation
description: Analysis framework correlating published fee schedules with actual service charge revenue from Call Reports
triggers: revenue, income, call report, service charge, fee dependency, FDIC, NCUA, fee income, noninterest income
---

# Fee Revenue Correlation Analysis

## Purpose
Bridge the gap between published fee schedules and actual fee revenue by correlating extracted fee amounts with Call Report service charge income data from FDIC (banks) and NCUA (credit unions).

## Methodology

### Step 1: Identify the Institution and Pull Financial Data
Retrieve the institution profile:
- **FDIC-insured banks**: CERT number, total assets, service charges on deposit accounts (RIAD4080), total noninterest income (RIAD4079), net income (RIAD4340)
- **NCUA credit unions**: charter number, total assets, fee income (account code 131), total operating income

Map the institution to its peer group (charter_type, asset_tier, fed_district) for comparative analysis.

### Step 2: Calculate Fee Dependency Ratios
Compute three ratios that measure how reliant the institution is on fee income:

| Metric | Formula | Benchmark |
|--------|---------|-----------|
| Fee Dependency Ratio | Service charge income / Total noninterest income | Banks: 15-25%, CUs: 10-20% |
| Fee Intensity | Service charge income / Total assets (bps) | Banks: 20-40 bps, CUs: 15-30 bps |
| Fee-to-Net-Income | Service charge income / Net income | Healthy: <50%, Elevated: 50-100%, Critical: >100% |

### Step 3: Cross-Reference Fee Schedule with Revenue
For each institution, compare:
- **Published fees** (from extracted fee schedules): overdraft, nsf, monthly_maintenance, atm_non_network, wire_domestic_outgoing, and other spotlight categories
- **Reported revenue** (from Call Reports): aggregate service charge income

Estimate a "fee schedule aggressiveness score" by summing the institution's published fees (weighted by typical transaction volume) and comparing to peers with similar revenue profiles.

### Step 4: Identify Discrepancies
Flag institutions where published fees and reported revenue diverge:
- **High fees, low revenue**: institution publishes above-median fees but reports below-median service charge income. Possible explanations: high waiver rates, low transaction volume, recent fee increases not yet reflected in revenue.
- **Low fees, high revenue**: institution publishes below-median fees but reports above-median service charge income. Possible explanations: high volume, hidden fees not in standard schedule, account structure fees.
- **Revenue concentration**: >40% of noninterest income from service charges suggests overdependence on fee revenue.

### Step 5: Peer Comparison
Rank the institution against peers on each ratio. Compute percentile position within the peer group for fee dependency, fee intensity, and fee-to-net-income.

### Step 6: Trend Analysis (when historical data available)
If multiple Call Report periods are available:
- Chart service charge income over 4-8 quarters
- Identify whether fee revenue is growing, stable, or declining relative to assets
- Correlate fee schedule changes (detected via crawl history) with revenue inflection points

## Output Template

### Fee Revenue Analysis: [Institution Name]
**CERT/Charter**: [ID] | **Assets**: [total] | **Charter**: [bank/credit_union] | **Peer group**: [tier, district]

#### Revenue Metrics
| Metric | Institution | Peer Median | Peer P25 | Peer P75 | Percentile | Assessment |
|--------|-------------|-------------|----------|----------|------------|------------|
| Service charge income | $2.4M | $1.8M | $1.2M | $2.8M | P64 | Above median |
| Fee dependency ratio | 22.1% | 18.5% | 14.0% | 24.0% | P68 | Moderate |
| Fee intensity (bps) | 32 bps | 28 bps | 20 bps | 38 bps | P58 | Average |
| Fee-to-net-income | 38% | 32% | 22% | 48% | P62 | Healthy |

#### Fee Schedule vs. Revenue Cross-Reference
| Category | Published Fee | Peer Median Fee | Fee Percentile | Revenue Signal |
|----------|-------------|-----------------|----------------|----------------|
| overdraft | $35.00 | $33.00 | P72 | Consistent |
| nsf | $35.00 | $32.00 | P78 | Consistent |
| monthly_maintenance | $0.00 | $10.00 | P0 | Waived (likely offset) |
| atm_non_network | $3.00 | $2.75 | P60 | Consistent |
| wire_domestic_outgoing | $30.00 | $30.00 | P50 | Consistent |
| card_foreign_txn | $5.00 | $2.00 | P95 | High -- verify volume |

#### Discrepancy Flags
- [Flag 1: describe the discrepancy and possible explanation]
- [Flag 2: ...]

#### Fee Dependency Ranking (within peer group)
Position [X] of [N] peers by fee dependency ratio.
- Peers more dependent: [count] ([percentage]%)
- Peers less dependent: [count] ([percentage]%)

## Interpretation Guide

| Fee Dependency Ratio | Reading | Implications |
|---------------------|---------|--------------|
| < 10% | Low dependency | Diversified noninterest income; fee reductions have limited P&L impact |
| 10% - 20% | Moderate | Balanced income mix; standard for well-run community institutions |
| 20% - 35% | Elevated | Material reliance on fee income; vulnerable to regulatory fee caps |
| > 35% | High dependency | Fee income is a primary earnings driver; significant regulatory and competitive risk |

| Fee Intensity (bps) | Reading |
|---------------------|---------|
| < 15 bps | Low extraction; may indicate fee waivers, digital-first model, or CU philosophy |
| 15 - 30 bps | Normal range for community institutions |
| 30 - 50 bps | Above average; strong fee income generation |
| > 50 bps | Aggressive extraction; scrutinize for consumer impact |

## Caveats
- Call Report data lags by 1-2 quarters. Fee schedules reflect current pricing. Temporal mismatch is inherent.
- Service charge income (RIAD4080) is an aggregate line item. It cannot be decomposed into individual fee categories without internal data.
- Credit union fee income reporting (NCUA 5300) uses different account codes and aggregation levels than FDIC Call Reports. Cross-charter comparisons require normalization.
- Fee waivers, relationship pricing, and account packaging mean published fees overstate actual per-account revenue. A 30-50% waiver rate is common for monthly_maintenance.
- Institutions with large commercial deposit bases may report high service charges driven by treasury management fees, not consumer fees.
