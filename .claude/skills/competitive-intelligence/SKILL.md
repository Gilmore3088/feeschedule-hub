---
name: competitive-intelligence
description: Market positioning and pricing strategy analysis for competitive fee intelligence
triggers: competitive, positioning, market, strategy, pricing, advantages, vulnerabilities, compete, market share, threat
---

# Competitive Intelligence Analysis

## Purpose
Assess an institution's competitive position within its market by analyzing fee pricing, product breadth, financial strength, and peer dynamics to surface strategic advantages, vulnerabilities, and actionable recommendations.

## Methodology

### Step 1: Define the Competitive Set
Identify the target institution and construct a competitive set of 5-10 peers:
- **Primary peers** (3-5): Same asset_tier, same fed_district, same charter_type. These are direct market competitors.
- **Aspirational peers** (1-2): One tier above in assets, same district. Institutions the target may be competing against for growth.
- **Disruptors** (1-2): Institutions in the same market with notably different fee strategies (e.g., a no-fee digital bank, an aggressive CU).

If the user specifies competitors by name, use those. Otherwise, select based on geographic overlap and asset similarity.

### Step 2: Build the Fee Scorecard
For each institution in the competitive set, pull all available fee data across the 15 featured categories. Construct a head-to-head comparison matrix.

Score each category for each institution:
- **1 (Competitive)**: below peer group P25
- **2 (Market Rate)**: between P25 and P75
- **3 (Premium)**: above peer group P75

Compute an aggregate Pricing Score: average of all category scores (range 1.0 - 3.0).

### Step 3: Assess Fee Coverage and Breadth
For each institution, measure:
- **Category coverage**: how many of the 49 fee categories have data (higher = more transparent or more fees)
- **Spotlight coverage**: how many of the 6 spotlight fees are present
- **Fee family breadth**: number of the 9 fee families represented

Institutions with high category counts may have more complex fee structures. Those with low counts may be simpler or less transparent.

### Step 4: Cross-Reference Financial Position
Pull financial context for each competitor:
- Total assets and growth trajectory
- Service charge income and fee dependency ratio
- Net interest margin (if available from Call Report data)
- Asset quality indicators

This context distinguishes between institutions that price low because of strategic choice versus those subsidizing with margin income.

### Step 5: Identify Strategic Patterns
Classify each competitor's fee strategy:

| Strategy | Signal | Example |
|----------|--------|---------|
| Low-cost leader | Pricing Score < 1.5, most categories below P25 | CU with no overdraft fee, $0 maintenance |
| Market conformer | Pricing Score 1.8-2.2, most categories near P50 | Community bank matching local norms |
| Premium pricer | Pricing Score > 2.5, multiple categories above P75 | Regional bank with relationship pricing |
| Selective discounter | 2-3 spotlight categories deeply competitive, rest at market | Bank waiving maintenance but premium on wires |
| Fee simplifier | Low category count, flat/simple pricing | Digital-first bank with minimal fee schedule |

### Step 6: Surface Advantages and Vulnerabilities
For the target institution, identify:

**Advantages** (where the target is positioned better than 60%+ of competitors):
- Specific categories where the target undercuts the competitive set
- Fee families where the target has simpler or fewer fees
- Financial strength that enables sustainable low pricing

**Vulnerabilities** (where the target is exposed):
- Categories where the target is the most expensive in the set
- Revenue dependency that constrains ability to lower fees
- Gaps in fee schedule transparency (missing categories peers report)

## Output Template

### Competitive Intelligence: [Target Institution]
**Market**: [District/Region] | **Tier**: [asset_tier] | **Charter**: [charter_type]
**Competitive set**: [N] institutions analyzed

#### Head-to-Head Fee Comparison
| Category | [Target] | [Comp 1] | [Comp 2] | [Comp 3] | Peer Median |
|----------|----------|----------|----------|----------|-------------|
| monthly_maintenance | $12.00 | $10.00 | $0.00 | $8.95 | $10.00 |
| overdraft | $35.00 | $35.00 | $29.00 | $34.00 | $33.00 |
| nsf | $35.00 | $33.00 | $29.00 | $30.00 | $32.00 |
| atm_non_network | $3.00 | $2.50 | $2.00 | $3.00 | $2.75 |
| wire_domestic_outgoing | $25.00 | $30.00 | $20.00 | $30.00 | $28.00 |
| card_foreign_txn | $0.00 | $3.00 | $1.00 | $2.00 | $2.00 |

#### Pricing Scorecard
| Institution | Pricing Score | Strategy | Spotlight Avg | Category Count |
|-------------|--------------|----------|---------------|----------------|
| [Target] | 2.1 | Market Conformer | $18.33 | 32/49 |
| [Comp 1] | 2.3 | Premium Pricer | $19.08 | 28/49 |
| [Comp 2] | 1.4 | Low-Cost Leader | $10.00 | 22/49 |
| [Comp 3] | 2.0 | Selective Discounter | $17.99 | 35/49 |

#### Financial Context
| Institution | Assets | Svc Charge Income | Fee Dependency | Fee Intensity (bps) |
|-------------|--------|-------------------|----------------|---------------------|
| [Target] | $850M | $2.1M | 21% | 25 |
| [Comp 1] | $1.2B | $3.8M | 28% | 32 |
| [Comp 2] | $620M | $0.8M | 9% | 13 |
| [Comp 3] | $780M | $1.9M | 19% | 24 |

#### Strategic Assessment

**Pricing Power**: [High/Moderate/Low] -- [1-2 sentence rationale based on market position and financial flexibility]

**Competitive Advantages**:
- [Advantage 1: specific category or structural advantage with data]
- [Advantage 2]

**Vulnerabilities**:
- [Vulnerability 1: specific exposure with data]
- [Vulnerability 2]

**Market Dynamics**:
- [Observation about the competitive set's collective behavior or trends]

#### Recommendations
1. [Actionable recommendation tied to a specific finding]
2. [Second recommendation]
3. [Third recommendation]

## Interpretation Guide

| Pricing Score | Position | Typical Profile |
|--------------|----------|-----------------|
| 1.0 - 1.5 | Aggressive low-cost | CUs, digital banks, institutions subsidizing with NIM |
| 1.5 - 2.0 | Competitive | Well-positioned community institutions |
| 2.0 - 2.5 | Market rate | Majority of traditional banks and CUs |
| 2.5 - 3.0 | Premium | Institutions with strong brand or captive base |

| Category Count | Signal |
|----------------|--------|
| < 20 | Simple fee structure or limited data; verify completeness |
| 20 - 35 | Typical community institution |
| 35 - 49 | Complex fee structure; full-service institution |

## Caveats
- Competitive analysis is only as good as the fee data available. Institutions with recent crawl dates (< 90 days) have more reliable data. Flag stale data (> 180 days since last crawl).
- Fee schedules alone do not capture relationship pricing, bundle discounts, or negotiated rates for commercial clients. Published fees represent the ceiling, not the average charged.
- Market share and deposit volume data are not in scope. This analysis addresses pricing position only, not market penetration.
- A low-cost strategy is not inherently superior. Institutions with strong brand loyalty and service quality can sustain premium pricing. Context from the financial data (fee dependency, asset growth) helps distinguish sustainable strategies from vulnerable ones.
- When the competitive set spans multiple asset tiers, normalize fee comparisons by noting tier context. A $50B regional bank and a $500M community bank operate under different economics even in the same district.
