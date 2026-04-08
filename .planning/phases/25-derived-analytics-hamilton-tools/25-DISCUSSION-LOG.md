# Phase 25: Derived Analytics & Hamilton Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-08
**Phase:** 25-derived-analytics-hamilton-tools
**Areas discussed:** Hamilton tool strategy, Revenue concentration, Audit existing queries, Derived metric design

---

## Hamilton Tool Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| One tool per data source | Separate tools per source | |
| One unified national data tool | Single tool with source parameter | ✓ |
| Extend existing tools | Enrich current tools | |

**User's choice:** Unified tool. Sources: call_reports, economic, health, complaints, fee_index.

---

## Revenue Concentration

| Option | Description | Selected |
|--------|-------------|----------|
| Top N by total SC income (Recommended) | Dollar volume Pareto | |
| Top N by institution coverage | Prevalence ranking | |
| Both dimensions | Dollar + prevalence two-axis | ✓ |

---

## Audit Existing Queries

| Option | Description | Selected |
|--------|-------------|----------|
| Audit first (Recommended) | Verify fee-revenue.ts queries | ✓ |
| You decide | Claude determines | |

---

## Derived Metric Design

| Option | Description | Selected |
|--------|-------------|----------|
| Stick to requirements | Just DERIVE-01/02/03 | |
| Add peer percentiles | P25/P50/P75 positioning | |
| Add trend signals | QoQ/YoY changes for momentum | ✓ |

---

## Claude's Discretion

- Internal routing logic for queryNationalData
- Pareto calculation approach
- Whether trends need new queries or computed from time-series
- Test structure for unified tool

## Deferred Ideas

- Peer percentiles — future phase
- Admin portal pages — Phase 26
- Consumer metric summaries — Phase 26
