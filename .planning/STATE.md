# Project State

Updated: 2026-08-12

## Current Focus

Finish the agentic cleanup and production cutover.

Current runtime direction:

```text
Atlas -> Magellan -> Rosetta -> Knox -> Darwin -> Hamilton
```

All agent work must be visible through `agent_runs`, `agent_run_steps`, and
`agent_run_events`. Retired crawler/worker plans are archived and are not source
of truth.

Current launch behavior: admin actions create queued visible run records first.
The browser/live-status surface then calls the serverless agent runner at
`/api/admin/agents/runs/[id]/execute`; `/api/admin/agents/tick` can pick up
queued runs from an authenticated admin or cron-style bearer caller.
Production schedules the tick route every five minutes through `vercel.json`;
the remaining durability upgrade is Workflow/Queue-backed replay and fan-out.

## Active References

- `docs/audits/legacy-retirement-status-2026-08-12.md`
- `docs/plans/modal-legacy-decommission-agentic-experience-2026-08-12.md`

## Immediate Remaining Work

1. Upgrade the current serverless runner to durable Workflow/Queue execution.
2. Finish PDF/OCR, provider extraction, adversarial review, and report rendering.
3. Reconcile Supabase migration history drift without replaying old migrations
   blindly.
4. Keep human review limited to anomaly/decision exceptions.
