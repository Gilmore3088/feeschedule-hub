---
name: district-economic-outlook
description: Regional fee landscape analysis combining Federal Reserve district data with fee trend intelligence
triggers: district, regional, beige book, economic, fed district, outlook, regional trends, district analysis
---

# District Economic Outlook

## Purpose
Synthesize Federal Reserve district economic signals, Beige Book commentary, FRED macroeconomic indicators, and fee schedule data to produce a regional fee outlook with economic context.

## Methodology

### Step 1: Identify the District
Map the request to one of the 12 Federal Reserve districts:
1-Boston, 2-New York, 3-Philadelphia, 4-Cleveland, 5-Richmond, 6-Atlanta, 7-Chicago, 8-St. Louis, 9-Minneapolis, 10-Kansas City, 11-Dallas, 12-San Francisco.

If the user names a state or city, resolve it to the correct district using `fed-districts.ts` mappings.

### Step 2: Pull District Economic Context
Retrieve from the database:
- **Beige Book**: latest `fed_beige_book` entry for the district (summary, banking_section, publication_date)
- **Fed Content**: recent `fed_content` entries tagged to the district (speeches, reports, press releases)
- **FRED Indicators**: `fed_economic_indicators` for the district including unemployment rate, GDP growth, CPI, housing starts, and consumer confidence where available

### Step 3: Build the District Fee Landscape
Query fee data filtered to `fed_district = N`:
- Compute district medians for all 15 featured fee categories using `getDistrictMedianByCategory()`
- Compare each district median to the national median; compute delta_pct: `((district - national) / national) * 100`
- Count institutions with data in the district, broken down by charter_type and asset_tier
- Identify the top 3 categories where the district diverges most from national (positive and negative)

### Step 4: Cross-Reference Economic Signals with Fee Patterns
Look for correlations and narratives:
- High unemployment + above-average overdraft/nsf fees = consumer stress amplifier
- Strong GDP growth + rising monthly_maintenance = institutions capturing value in growth markets
- Beige Book mentions of "tightening lending" + high wire/cashier_check fees = fee income compensating for margin compression
- CPI above national average + flat fees = real fee decrease (purchasing power adjusted)

### Step 5: Synthesize the Outlook
Combine economic trajectory with fee positioning to produce a forward-looking assessment.

## Output Template

### District [N]: [City] -- Fee Outlook with Economic Context

#### Key Economic Indicators
| Indicator | District Value | National Value | Delta | Trend |
|-----------|---------------|----------------|-------|-------|
| Unemployment Rate | 4.2% | 3.9% | +0.3pp | Stable |
| GDP Growth (annualized) | 2.1% | 2.4% | -0.3pp | Slowing |
| CPI (YoY) | 3.5% | 3.2% | +0.3pp | Rising |
| Consumer Confidence | 98.2 | 102.1 | -3.9 | Declining |

#### Beige Book Summary (as of [date])
> [1-2 sentence summary of banking/financial services section]

Key signals:
- [Bullet point signal 1]
- [Bullet point signal 2]

#### Fee Landscape: District vs. National
| Category | District Median | National Median | Delta | Direction |
|----------|----------------|-----------------|-------|-----------|
| overdraft | $34.00 | $33.00 | +3.0% | Above national |
| monthly_maintenance | $9.50 | $10.00 | -5.0% | Below national |
| nsf | $33.00 | $33.00 | 0.0% | At national |
| atm_non_network | $3.00 | $2.75 | +9.1% | Above national |
| wire_domestic_outgoing | $28.00 | $30.00 | -6.7% | Below national |

**Coverage**: [N] institutions reporting across [M] fee categories
**Composition**: [X] banks, [Y] credit unions | Tier breakdown: [community: A, mid: B, ...]

#### Notable Divergences
- **Highest above national**: [category] at +X% -- [brief explanation tied to economic context]
- **Lowest below national**: [category] at -Y% -- [brief explanation]
- **Fastest moving**: [category] trend direction over last 6 months

#### Outlook
[2-3 sentences combining economic trajectory with fee positioning. Reference specific Beige Book language when available. Note whether fee trends are likely to tighten, hold, or ease based on the economic signals.]

## Interpretation Guide

| Delta Range | Reading |
|-------------|---------|
| > +15% | Significantly above national; district-specific cost pressures or less competition |
| +5% to +15% | Moderately above; may reflect regional cost of living or market structure |
| -5% to +5% | Aligned with national; standard market pricing |
| -15% to -5% | Moderately below; competitive market or credit union density effect |
| < -15% | Significantly below; investigate whether driven by dominant low-cost players |

## Caveats
- Beige Book is published 8 times per year; commentary may lag current conditions by 4-6 weeks.
- FRED indicators update on different schedules (monthly, quarterly). Always note the observation date.
- District medians require at least 5 institutions reporting for a category to be meaningful. Flag categories with fewer observations.
- State boundaries do not align perfectly with Fed district boundaries. Institutions near borders may reflect adjacent district dynamics.
- Fee data reflects published schedules, not actual revenue. Waivers and promotional pricing reduce effective fee burdens below published rates.
