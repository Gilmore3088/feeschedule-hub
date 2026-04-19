---
created: 2026-04-19T17:46:46.579Z
title: Rewrite monthly orchestration agent as institution-first (Tier 1 / Tier 2)
area: planning
files:
  - fee_crawler/magellan_api.py
  - fee_crawler/agents/magellan/orchestrator.py
---

## Problem

The current monthly orchestrator (Anthropic Managed Agent, lives in the
Console — not in the repo) iterates U.S. counties and launches a Bank Fee
Schedule Scanner per county. At 3,143 counties × ~15–20 min/scan × concurrency
25, a full sweep takes 3–5 days and costs $3k–$6k per run.

Worse, it re-scans institutions we already have coverage for, because the
`global_registry.json` dedup logic runs at STEP 3 *after* the scans have
already burned the budget. The registry is a ledger, not a gate.

The product's value hierarchy says **completeness beats freshness**: an
empty institution row is a hole in every peer benchmark it should
participate in. Refreshing a bank we already have is lower-leverage than
finally covering one we don't. Within each tier, bigger institutions go
first (more peer-benchmark weight, more reader traffic).

## Solution

Replace the Managed Agent's system prompt with the v2.0 draft produced in
chat on 2026-04-19 (institution-first, wave-based dispatch). Key changes:

1. **Drop counties.json / united-states.xlsx as the input axis.** Query
   Postgres directly via a new `DATABASE_URL` env var. Two ordered tiers:
   - Tier 1: institutions with zero approved/staged fees, by `total_assets DESC`
   - Tier 2: institutions with stale `fees_last_crawled_at` (>90d default), by `total_assets DESC`
   Drain Tier 1 fully before touching Tier 2. Never interleave.

2. **Scanner input contract change.** Scanner now receives a JSON payload
   `{institution_id, institution_name, fee_schedule_url, website_url,
   charter_type, priority_tier}` instead of a county string. The scanner's
   own system prompt must be rewritten to match — it becomes a
   per-institution verifier/extractor, not a geographic discoverer.

3. **Wave-based dispatch.** Default `max_per_run=500, concurrency=25,
   refresh_days=90`, all overridable via the trigger message JSON.

4. **Coverage report reframed.** Replace county rollups with tier rollups
   (`tier1_dispatched`, `tier1_completed`, `tier1_remaining_after_run`)
   and asset-band breakdowns (over_100b, 10b_to_100b, 1b_to_10b, under_1b).

5. **Registry → run ledger.** `global_registry.json` becomes a lightweight
   per-run ledger. Source of truth for long-term coverage state is the
   Postgres `institutions` table, not a JSON file.

6. **Counties xlsx becomes a separate quarterly agent.** New orchestrator
   handles FDIC/NCUA delta discovery — pulls newly-issued charters,
   inserts into `institutions`, lets them flow into Tier 1 automatically
   on the next monthly run. Drafted separately.

### Operational numbers after the flip

- Tier 1 (empty coverage) is ~1,500–2,000 institutions today. At
  concurrency 25 × ~15 min/scan, full drain takes ~1.5–2 days of wall
  clock, spread across a few weekly runs at the 500/run cap.
- Tier 2 refresh is a rolling background job capped by the 90d cycle —
  tops out around ~700 institutions/month, <1 day at concurrency 25.
- Monthly run is ~1 day of compute, mostly on Tier 1 holes. Gets
  monotonically cheaper as coverage fills in.

### Companion changes (required before v2.0 goes live)

- [ ] Rewrite Bank Fee Schedule Scanner agent system prompt to accept
      institution JSON payload (drop county-string parsing entirely).
- [ ] Add `DATABASE_URL` secret to the Managed Agents environment
      (read-only DSN preferred — orchestrator does no writes).
- [ ] Confirm `scanner_updates_*.json` handoff shape with downstream
      categorization agent; its trigger payload changes from
      `master_fee_index_path` → `scanner_updates_path`.
- [ ] Draft quarterly FDIC/NCUA delta discovery agent prompt as a
      separate system prompt (replaces the counties-xlsx path).

### References

- Draft v2.0 prompt: in conversation 2026-04-19 (not yet persisted to repo).
- Feedback rule: `~/.claude/projects/.../memory/feedback_scan_priority_order.md`
- Existing Magellan API: `fee_crawler/magellan_api.py` (may become the
  dispatch target instead of a separate scanner agent — decision deferred
  until scanner prompt rewrite begins).
