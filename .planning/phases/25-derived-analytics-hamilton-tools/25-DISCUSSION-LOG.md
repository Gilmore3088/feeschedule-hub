# Phase 25: Derived Analytics & Hamilton Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 25-derived-analytics-hamilton-tools
**Areas discussed:** Derived analytics placement, Hamilton tool wiring, Concentration analysis, Hamilton consolidation, Tool response format, Fee dependency granularity

---

## Derived Analytics Placement

| Option | Description | Selected |
|--------|-------------|----------|
| New file: derived.ts (Recommended) | Cross-source nature makes it a distinct domain | Yes |
| Extend fee-revenue.ts | Related queries but mixes concerns | |
| You decide | | |

**User's choice:** New file: derived.ts

---

## Hamilton Tool Wiring

### Tool Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single national-data tool (Recommended) | One tool with section param | Yes |
| Separate tool per data source | 5 new tools | |
| You decide | | |

**User's choice:** Single national-data tool

### Agent Access

**User's choice:** Other (free text)
**Notes:** "Hamilton is THE agent. Everything rolls up to Hamilton. Legacy agents need to be stripped down and merged. No dead ends, no legacy stuff."

---

## Concentration Analysis

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable N, default 5 (Recommended) | Function takes optional topN param | Yes |
| Fixed top 5 | | |
| You decide | | |

**User's choice:** Configurable N, default 5

---

## Hamilton Consolidation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Wire tools only, defer cleanup (Recommended) | | |
| Full consolidation now | Remove all legacy agent definitions, merge everything into Hamilton | Yes |
| You decide | | |

**User's choice:** Full consolidation now

---

## Tool Response Format

| Option | Description | Selected |
|--------|-------------|----------|
| Full RichIndicator objects (Recommended) | Complete history + trend for each indicator | Yes |
| Condensed current-only | Only current values + trend direction | |
| You decide | | |

**User's choice:** Full RichIndicator objects

---

## Fee Dependency Ratio Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Use what we have + flag gap (Recommended) | | |
| Add overdraft field to ingestion first | Extend FDIC/NCUA ingestion for RIAD4070 | Yes |
| You decide | | |

**User's choice:** Add overdraft field to ingestion first
**Notes:** "Service charges are just the overarching bucket. In call reports we get overdraft revenue and other fee revenue. We need granularity. Overdraft revenue from call reports and any other data needs to be clearly broken up."

---

## Claude's Discretion

- Test file organization
- Exact FDIC field for overdraft revenue
- Legacy agent cleanup approach
- Tool Zod schema details

## Deferred Ideas

- BLS data, additional FRED series, national surveys -- Phase 27
- Agent consolidation may need sub-phase if complex
