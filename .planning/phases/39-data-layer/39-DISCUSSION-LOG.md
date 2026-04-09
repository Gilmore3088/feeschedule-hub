# Phase 39: Data Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 39-data-layer
**Areas discussed:** Confidence tier rules, Soft-delete strategy

---

## Confidence Tier Rules

### Enforcement Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| DB CHECK constraint | Database rejects invalid values at SQL level | |
| App-level only | TypeScript enum validation before insert | |
| You decide | Claude picks based on existing maturity badge pattern | ✓ |

**User's choice:** You decide
**Notes:** Claude will follow existing CHECK constraint pattern from hamilton_messages.

### Thresholds

| Option | Description | Selected |
|--------|-------------|----------|
| Match maturity badges | Same thresholds (10+ approved = strong) | |
| Tighter for simulation | strong = 20+, provisional = 10+, insufficient = below 10 | ✓ |
| You decide | Claude picks defensible thresholds | |

**User's choice:** Tighter for simulation
**Notes:** Simulation results need higher data quality to be defensible for a $5,000/yr tool.

### Insufficient Tier Behavior

**User's choice:** Block simulation entirely. Don't let users run on thin data.
**Notes:** User was emphatic: "they should be blocked."

### Tier Storage

**User's choice:** Snapshot — stored on the scenario row at creation time.

---

## Soft-Delete Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| archived_at timestamp | NULL = active, non-NULL = archived | |
| status column | status enum (active/archived) | |
| Both options | archived_at + status column together | ✓ |

**User's choice:** Both — archived_at timestamp AND status column.
**Notes:** Timestamp gives audit trail, status gives easy querying.

---

## Claude's Discretion

- CHECK constraint vs app-level for confidence tier
- New file vs extending chat-memory.ts for ensureHamiltonProTables()

## Deferred Ideas

None
