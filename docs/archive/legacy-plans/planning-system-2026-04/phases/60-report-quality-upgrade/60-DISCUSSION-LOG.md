# Phase 60: Report Quality Upgrade - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-11
**Phase:** 60-report-quality-upgrade
**Areas discussed:** Call Report data fix, FRED + Beige Book integration, PDF layout upgrade, Report template structure

---

## Call Report Data Fix

| Option | Description | Selected |
|--------|-------------|----------|
| Multiply at query layer | Fix in financial.ts, single fix point | Y |
| Multiply at assembler layer | Fix in each assembler | |
| You decide | Claude picks | |

**User's choice:** Multiply at query layer

## FRED + Beige Book Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Core 4 indicators | Fed funds, CPI, unemployment, GDP | |
| Full economic dashboard | Core 4 + confidence, savings, lending | Y |
| You decide | Claude picks | |

**User's choice:** Full economic dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-select by district relevance | Pull from relevant district(s) | Y |
| Most recent edition, all districts | Full latest summary | |
| You decide | Claude picks | |

**User's choice:** Auto-select by district relevance

## PDF Layout Upgrade

| Option | Description | Selected |
|--------|-------------|----------|
| HTML template + Puppeteer PDF | Design in HTML/CSS, render via Puppeteer | Y |
| React-PDF components | Build with React-PDF primitives | |
| You decide | Claude picks | |

**User's choice:** HTML template + Puppeteer PDF

| Option | Description | Selected |
|--------|-------------|----------|
| Stat callouts + chapters + pull quotes | Core 3 elements | |
| Full editorial design | All above + charts, tables, header/footer, TOC | Y |
| You decide | Claude picks | |

**User's choice:** Full editorial design

## Report Template Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Insight-first structure | Bold claim -> data -> context per section | Y |
| Traditional structure | Summary -> methodology -> findings | |
| You decide | Claude picks | |

**User's choice:** Insight-first structure

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, every major section | "So what" callout box per section | Y |
| Executive summary only | One box at top | |
| You decide | Claude picks | |

**User's choice:** Every major section

## Claude's Discretion
- HTML/CSS design for stat callouts, Puppeteer config, chart types, FRED section mapping, missing data handling

## Deferred Ideas
None
