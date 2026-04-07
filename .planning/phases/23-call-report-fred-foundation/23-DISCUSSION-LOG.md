# Phase 23: Call Report & FRED Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 23-call-report-fred-foundation
**Areas discussed:** Scaling fix strategy, Revenue query API shape, FRED summary design, Test coverage approach

---

## Scaling Fix Strategy

### Q1: Where should the *1000 scaling correction live?

| Option | Description | Selected |
|--------|-------------|----------|
| Query-level fix (Recommended) | Multiply in each SQL query (SUM(service_charge_income * 1000)). Explicit, no hidden magic, easy to grep for. | Yes |
| Shared utility wrapper | Create a scaleRevenue() helper that all code calls. Centralizes the logic but adds indirection. | |
| DB view or computed column | Create a Postgres view that pre-multiplies. Clean reads but adds a DB object to maintain. | |

**User's choice:** Query-level fix
**Notes:** None

### Q2: Should the fix also apply to total_assets and other financial fields?

| Option | Description | Selected |
|--------|-------------|----------|
| Only service_charge_income | SC income stored in thousands. Other fields may have different conventions. | |
| All financial fields from Call Reports | Apply *1000 to total_assets, total_deposits, total_loans uniformly. | |
| You decide | Claude checks the actual data and applies the fix wherever appropriate. | Yes |

**User's choice:** You decide
**Notes:** None

---

## Revenue Query API Shape

### Q3: How should the revenue queries be organized?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate focused functions (Recommended) | One function per requirement. Matches existing pattern. Clear, testable. | Yes |
| Flexible query builder | Single getRevenueData() with dynamic SQL. More powerful but complex. | |
| Mix: core + builder | Focused functions sharing a common SQL builder internally. | |

**User's choice:** Separate focused functions
**Notes:** None

### Q4: Should all revenue queries live in call-reports.ts or a new file?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep in call-reports.ts (Recommended) | File is small (~145 lines). Adding 4-5 more keeps it cohesive. | |
| New file: revenue-queries.ts | Separate namespace for analytical queries. | |
| You decide | Claude picks based on final line count and cohesion. | |

**User's choice:** Other (free text)
**Notes:** "Whatever is the most accurate and comprehensive. Always think in context of what's gonna create the most accurate report, the most consistent, and the most value."

---

## FRED Summary Design

### Q5: Where should the FRED summary queries live?

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing fed.ts (Recommended) | All Fed/economic data in one place. File is only ~100 lines. | Yes |
| New file: fred-indicators.ts | Separate FRED from Beige Book queries. | |
| You decide | Claude picks based on cohesion and file size. | |

**User's choice:** Extend existing fed.ts
**Notes:** None

### Q6: CPI YoY computation -- SQL or TypeScript?

| Option | Description | Selected |
|--------|-------------|----------|
| SQL window function (Recommended) | Compute YoY change directly in SQL using LAG(). Single query. | |
| TypeScript post-processing | Query raw CPI values, compute in TS. More testable in isolation. | |
| You decide | Claude picks the most accurate, verifiable approach. | Yes |

**User's choice:** You decide
**Notes:** None

### Q7: National economic summary return shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Flat object with latest values (Recommended) | Simple { fedFundsRate: 5.33, ... } directly usable. | |
| Rich object with history | Each indicator includes current + last 4 values + trend direction. | Yes |
| You decide | Claude designs based on what Hamilton needs. | |

**User's choice:** Rich object with history
**Notes:** None

---

## Test Coverage Approach

### Q8: What level of test coverage?

| Option | Description | Selected |
|--------|-------------|----------|
| Reconciliation tests (Recommended) | Tests that verify totals reconcile: splits = total, scaled values match expected magnitudes. | Yes |
| Unit tests with mocked data | Mock SQL responses, test TS transformation logic. Fast but doesn't catch SQL bugs. | |
| Both: unit + reconciliation | Most thorough but more test code. | |
| You decide | Claude picks for maximum confidence. | |

**User's choice:** Reconciliation tests
**Notes:** None

---

## Claude's Discretion

- Which financial fields beyond service_charge_income need thousands scaling (check actual data)
- File organization for revenue queries (based on line count and cohesion)
- CPI YoY computation approach (SQL vs TypeScript)

## Deferred Ideas

None -- discussion stayed within phase scope
