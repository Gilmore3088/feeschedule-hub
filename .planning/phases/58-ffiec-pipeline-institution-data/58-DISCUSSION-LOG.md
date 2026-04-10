# Phase 58: FFIEC Pipeline & Institution Data - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 58-ffiec-pipeline-institution-data
**Areas discussed:** Ingestion pipeline architecture, Institution detail page data, Data freshness & automation, Coverage matching strategy

---

## Ingestion Pipeline Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Port to Postgres | Keep logic, swap Database/? for psycopg2/conn/%s | Y |
| Rewrite from scratch | Fresh implementation using asyncpg | |

**User's choice:** Port to Postgres

| Option | Description | Selected |
|--------|-------------|----------|
| 8 quarters (2 years) | Enough for YoY/QoQ | |
| 20 quarters (5 years) | Deeper historical context | |
| 4 quarters (1 year) | Minimum for QoQ | |

**User's choice:** Other -- backfill from 2010 to present (~60 quarters). "Our DB should go back to 2010. FFIEC."

| Option | Description | Selected |
|--------|-------------|----------|
| One-time bulk load | Download all from 2010 in single run | Y |
| Incremental yearly batches | Year by year with checkpointing | |

**User's choice:** One-time bulk load

---

## Institution Detail Page Data

| Option | Description | Selected |
|--------|-------------|----------|
| Full financial profile | Assets, deposits, revenue, ratios, QoQ/YoY | Y |
| Revenue focus only | Service charge revenue + fee-to-deposit ratio | |
| You decide | Claude picks data density | |

**User's choice:** Full financial profile

| Option | Description | Selected |
|--------|-------------|----------|
| Hero stat cards + sparklines | Large stat cards with mini trend charts | Y |
| Tabbed sections | Economy/Fees/History tabs | |
| Side-by-side dashboard | Left metrics, right fee data | |

**User's choice:** Hero stat cards + sparklines
**Notes:** User emphasized "need to ensure this data is displayed beautifully"

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, inline peer context | Each card shows peer median/percentile badge | Y |
| Separate peer section | Peer comparison below hero cards | |
| No peer context yet | Just own data | |

**User's choice:** Inline peer context

---

## Data Freshness & Automation

| Option | Description | Selected |
|--------|-------------|----------|
| Modal quarterly cron | 3am on Feb/May/Aug/Nov 15 | Y |
| Manual CLI trigger | Developer runs manually | |
| You decide | Claude picks automation level | |

**User's choice:** Modal quarterly cron

| Option | Description | Selected |
|--------|-------------|----------|
| Retry + alert | 3 retries, log error, continue | Y |
| Fail fast | Abort on any error | |
| You decide | Claude picks error handling | |

**User's choice:** Retry + alert

---

## Coverage Matching Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Cert/charter number join | Direct deterministic join | |
| Name + state fuzzy match | Fallback fuzzy matching | |
| Both with priority | Cert first, fuzzy fallback | Y |

**User's choice:** Both with priority

| Option | Description | Selected |
|--------|-------------|----------|
| Ingest anyway, match later | Store all with nullable FK | Y |
| Skip unmatched | Only ingest for existing crawl_targets | |
| Auto-create crawl_targets | Create rows for unknown institutions | |

**User's choice:** Ingest anyway, match later

---

## Claude's Discretion

- Database schema for institution_financials table
- FFIEC field codes beyond core ones
- Sparkline implementation choice
- Financial ratio selection
- Staleness badge design

## Deferred Ideas

None
