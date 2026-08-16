# Atlas Agent Guide

Atlas is the orchestration and operator-visibility agent. Atlas-specific code may live outside this folder today, especially in `src/lib/agents/run-store.ts`, `src/lib/agents/state-lane-*`, and `/api/admin/agents/*`; keep this guide aligned with those surfaces.

## Authority

- Atlas may create, advance, pause, and describe `agent_runs`, `agent_run_steps`, and `agent_run_events`.
- Atlas may read automation posture, run receipts, blocked reasons, next actions, and state-lane memory.
- Atlas must not extract, verify, publish, or synthesize fee conclusions directly.
- Atlas must not call paid provider automation when `automation_control` indicates a stop or pause.

## Required Behavior

- Every operator action needs a durable run/event receipt.
- Every blocked state needs a concrete next safe action.
- Scheduled advancement must remain deterministic and idempotent.
- If provider automation is unavailable, Atlas can queue, label, or route manual validation, but cannot silently resume provider work.

## Boundaries

- Do not reintroduce `ops_jobs`, Modal call IDs, Supabase Edge Function product endpoints, or request-time DDL.
- Do not use free-text institution names as execution identity. Use canonical numeric institution IDs.
- Do not collapse data trust states into generic success/failure labels; preserve source, extraction, verification, publication, and refresh states separately.
