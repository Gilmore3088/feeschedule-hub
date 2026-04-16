---
title: Pipeline and Hamilton Audit — 2026-04-16
purpose: End-to-end map of the collection pipeline and the Hamilton intelligence layer; identify holes; propose path to fully automated, orchestrated, compounding operation
initiator: Operator directive after Phase 55 SC5 revealed 80% source-traceback gap and ~5-10% categorization error rate
---

# Pipeline and Hamilton Audit — 2026-04-16

## Why this exists

Phase 55 closed out the canonical taxonomy foundation — but the data it sits on is polluted. Two hard numbers surfaced during SC5 verification:

- **82,805 of 103,052 active fees (80.4%)** have NULL `crawl_results.document_url` — we cannot trace back to source
- **~600 fees miscategorized** by 6 simple heuristics — true rate likely 5-10% of all categorized fees (thousands)

These are not isolated bugs. They are symptoms of pipeline gaps. Rather than patch each symptom, the operator has directed a full end-to-end audit of how data enters, flows, persists, and feeds into Hamilton.

## Scope

The collection pipeline and the Hamilton intelligence layer are two separate functions that coalesce together. The audit must cover both.

**Collection side (fee pipeline):**
- Seed → Discover → Fetch → Extract → Categorize → Validate
- Wave orchestration, iterative deepening, knowledge compounding
- Modal workers, cron schedules, R2 persistence
- Audit tables, data lineage, retry logic

**Intelligence side (Hamilton):**
- Report assemblers, research agents, thesis engine, skills
- Data consumption patterns from the crawler tables
- Where quality gaps in the pipeline bite downstream in reports
- Feedback loops (or lack thereof) from reports back into crawling decisions

**Coalescence:**
- How pipeline data flows into Hamilton
- Hamilton's own data persistence (hamilton_reports, external_intelligence, etc.)
- Closed-loop compounding: what should the system learn from each cycle

## Target end-state (per operator)

The whole system should be:

1. **Automated** — no manual steps required for a clean cycle (seed → crawl → extract → classify → validate → surface)
2. **Orchestrated** — stages hand off cleanly; failures route to the right remediation path; no orphaned data
3. **Compounding** — every cycle improves the next (better URLs, better extraction, better categorization, better knowledge)

## Document structure

| File | Owner | Scope |
|---|---|---|
| `01-fee-pipeline.md` | Mapping agent A | Seed → Discover → Extract → Categorize → Validate stages, code layout, DB writes, failure modes |
| `02-hamilton-layer.md` | Mapping agent B | Hamilton assemblers, agents, reports, skills, data consumption patterns |
| `03-data-integrity.md` | Mapping agent C | DB schema, R2 storage, audit trails, lineage — where data falls on the floor |
| `04-orchestration.md` | Mapping agent D | Modal workers, wave orchestrator, cron schedules, knowledge automation, compounding mechanics |
| `SYNTHESIS.md` | Orchestrator | Cross-cutting findings, visual system map, prioritized recommendations, proposed Phase 62+ work |

## Output commitment

After synthesis, this audit will produce:

- A canonical diagram of current state (collection + Hamilton)
- A ranked gap list with downstream-impact scoring
- A proposed Phase 62 scope (the first concrete fix set)
- A Phase 63+ roadmap sketch for the rest

No code changes in this audit. Research only.
