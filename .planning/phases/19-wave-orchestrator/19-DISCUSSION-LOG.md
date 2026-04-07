# Phase 19: Wave Orchestrator - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 19-wave-orchestrator
**Areas discussed:** Concurrency model, Prioritization logic, Automation model

---

## Concurrency Model

| Option | Description | Selected |
|--------|-------------|----------|
| Modal .map() parallel | Fan out state agents as Modal functions, run 5-10 concurrently | |
| Sequential loop | Run states one at a time, slower but predictable | |
| You decide | Claude picks the best approach based on Modal constraints | ✓ |

**User's choice:** Claude's discretion
**Notes:** User wants reliability for unattended multi-hour runs. Speed is secondary.

---

## Prioritization Logic

| Option | Description | Selected |
|--------|-------------|----------|
| Institutions without fees | States with most uncovered institutions first | |
| Total institution count | Largest states first (CA, TX, NY) | |
| Coverage gap % | States with lowest current coverage % first | ✓ |

**User's choice:** Coverage gap %
**Notes:** Maximizes improvement per wave by targeting worst-covered states first.

---

## Automation Model

| Option | Description | Selected |
|--------|-------------|----------|
| CLI launch, auto-continue | Kick off manually, system auto-advances through waves | |
| Replace a cron slot | Free a Modal cron slot for wave runner | |
| Manual per-wave | Trigger each wave manually, auto within wave | |

**User's choice:** Fire-and-forget (custom response)
**Notes:** "I don't want you to ask me to start the next wave. I want this to run for as many hours uninterrupted, capturing as much as possible without stopping and asking for approval."

---

## Claude's Discretion

- Concurrency model (parallel vs sequential vs async)
- Wave persistence mechanism (DB table vs JSON)
- Wave size tuning
- Error handling granularity

## Deferred Ideas

None
