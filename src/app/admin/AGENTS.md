# Admin Agent Surface Guide

Admin routes expose the operator experience for Atlas, Magellan, Rosetta, Knox, Darwin, and Hamilton. These screens are control and review surfaces; they must not become alternate runtimes that bypass the agent ledger, automation stop, or semantic data pipeline.

Before editing an agent-specific admin surface, also read the matching runtime guide:

- Atlas: `src/lib/agents/atlas/AGENTS.md`
- Magellan: `src/lib/agents/magellan/AGENTS.md`
- Rosetta: `src/lib/agents/rosetta/AGENTS.md`
- Knox: `src/lib/agents/knox/AGENTS.md`
- Darwin: `src/lib/agents/darwin/AGENTS.md`
- Hamilton: `src/lib/agents/hamilton/AGENTS.md`

## Shared Admin Rules

- Show operator state, durable receipts, blocked reasons, next safe actions, and automation posture before offering actions that can spend provider money.
- Queue or advance work only through the active TypeScript runtime paths: `agent_runs`, `agent_run_steps`, `agent_run_events`, `run-store.ts`, `/api/admin/agents/tick`, or explicit admin actions backed by those contracts.
- If `automation_control` indicates a stop or pause, admin actions may queue deterministic/manual review state but must not call providers or imply automation resumed.
- Preserve canonical numeric institution IDs, source-document lineage, run/event IDs, evidence tier, reviewer identity, and review notes anywhere an operator decision is shown or written.
- Do not reintroduce retired crawler workers, Modal jobs, `ops_jobs`, Supabase Edge Function product endpoints, request-time DDL, or UI-only shortcuts around the trust pipeline.

## Surface Ownership

### Atlas

`/admin`, `/admin/atlas/*`, and `/api/admin/agents/*` are orchestration surfaces. They may create or advance runs, display lane status, and explain the next safe action. They must not extract, verify, publish, or synthesize fee conclusions directly.

### Magellan

`/admin/magellan` is source discovery/fetch visibility. It should expose accepted submissions, source-needed reasons, fetch status, backoff, and handoff to Rosetta. It must not extract fee rows or publish data.

### Rosetta

`/admin/rosetta` is source-text normalization visibility. It should show deterministic read status, OCR/manual-needed states, and source-text lineage. It must not invent text or create fee observations.

### Knox

`/admin/knox` and `/admin/agents/knox/*` are extraction-review surfaces. They may review conservative raw observations and Knox decisions, preserve source-grounded reasoning, and route anomalies to Darwin/operator review. They must not mark rows verified or use provisional rows in verified benchmarks.

### Darwin

`/admin/darwin` is verification/classification visibility. It may queue deterministic repair/classification passes, show reason counts, and surface challenged rows. It must not publish rows directly or weaken verification checks to increase volume.

### Hamilton

`/admin/hamilton/*` is internal Hamilton publication, research, report, and chat visibility. It can expose admin/analyst-only operational context, but public and Pro Hamilton behavior still must use the shared request contract, selected institution briefing, evidence policy, and audience gates. Internal Hamilton must not generate generic reports for thin evidence or queue provider work while automation is stopped.
