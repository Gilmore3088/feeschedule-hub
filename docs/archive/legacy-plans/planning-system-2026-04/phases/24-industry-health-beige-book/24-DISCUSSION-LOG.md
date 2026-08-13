# Phase 24: Industry Health & Beige Book - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 24-industry-health-beige-book
**Areas discussed:** Audit existing code, Institution count trends, Theme extraction, Health metric formulas, Consumer + Pro data access

---

## Audit Existing Code

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, audit first (Recommended) | Verify queries return correct data post-scaling fix | ✓ |
| Re-implement everything | Treat all 7 requirements as open | |
| You decide | Claude determines audit scope | |

**User's choice:** Audit first

---

## Institution Count Trends

| Option | Description | Selected |
|--------|-------------|----------|
| Quarter-over-quarter from financials | Count distinct institutions per quarter | ✓ |
| FDIC/NCUA charter lists | Cross-reference official lists | |
| Both sources combined | Filing counts + charter events | |

**User's choice:** Quarter-over-quarter from financials

---

## Theme Extraction

### Q1: Extraction method

| Option | Description | Selected |
|--------|-------------|----------|
| LLM summarization (Recommended) | Claude Haiku for theme extraction | ✓ |
| Keyword/regex extraction | Pattern matching | |
| Pre-built summaries | Store as-is, Hamilton extracts on-demand | |

### Q2: Timing

| Option | Description | Selected |
|--------|-------------|----------|
| At ingestion time | Pre-compute themes | |
| On-demand via Hamilton | Extract during report generation | |
| Both — pre-compute + refresh | Instant access + fresh analysis | ✓ |

---

## Health Metric Formulas

| Option | Description | Selected |
|--------|-------------|----------|
| Standard FFIEC definitions | ROA = net_income/total_assets, etc. | |
| Simplified proxies | Use available fields | |
| You decide | Claude picks best available | ✓ |

---

## Consumer + Pro Data Access

### Q1: What data

| Option | Description | Selected |
|--------|-------------|----------|
| Consumer fee summaries | Plain-language averages | |
| Pro dashboard widgets | At-a-glance KPI cards | |
| Both consumer + pro | Same data, different presentations | ✓ |

### Q2: Phase scope

| Option | Description | Selected |
|--------|-------------|----------|
| Data layer only (Recommended) | Queries + summaries only, UI in Phase 26 | ✓ |
| Include basic views | Add widgets alongside data layer | |

---

## Claude's Discretion

- ROA/ROE/efficiency ratio field selection
- LLM prompt design for theme extraction
- JSON schema for stored themes
- DB storage approach for themes
- Test structure and mock patterns

## Deferred Ideas

- Consumer fee average pages — Phase 26
- Pro dashboard KPI cards — Phase 26
- FDIC/NCUA charter event tracking — future phase
