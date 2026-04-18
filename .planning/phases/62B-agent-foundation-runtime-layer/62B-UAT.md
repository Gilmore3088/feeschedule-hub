---
status: testing
phase: 62B-agent-foundation-runtime-layer
source: [62B-01-SUMMARY.md, 62B-02-SUMMARY.md, 62B-03-SUMMARY.md, 62B-04-SUMMARY.md, 62B-05-SUMMARY.md, 62B-06-SUMMARY.md, 62B-07-SUMMARY.md, 62B-08-SUMMARY.md, 62B-09-SUMMARY.md, 62B-10-SUMMARY.md, 62B-11-SUMMARY.md]
started: 2026-04-17T19:00:00Z
updated: 2026-04-17T19:00:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test (Vercel build)
expected: |
  Push 3d35503 to origin/main triggered a Vercel deploy. Deploy succeeds (green build, no module-not-found errors). Visit the deployed site root — homepage loads, no 500.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test (Vercel build)
expected: Push 3d35503 produced a green Vercel deploy. Site root loads without 500. No `Module not found: Can't resolve 'postgres'` in build logs.
result: issue
reported: "Still getting failures for every Vercel thing, roughly one every hour"
severity: blocker
diagnosis_pending: needs Vercel build log or Functions runtime log to identify whether it's a build-time or runtime error; hourly cadence suggests an external trigger (Deploy Hook, Modal, GitHub Action) OR a cron-fired Vercel Function rather than a rebuild

### 2. /admin/agents nav entry
expected: Log into /admin; "Agents" link visible in left sidebar under the Data group. Clicking it lands at /admin/agents, breadcrumbs show Admin / Agents.
result: [pending]

### 3. /admin/agents tab shell
expected: All 4 tabs render at the top of /admin/agents — Overview, Lineage, Messages, Replay. Active tab has solid dark background; others muted. Geist font, tracking-tight h1.
result: [pending]

### 4. Overview tab — 5-metric tiles
expected: Overview tab shows one row per registered agent × 5 metric tiles (Loop Completion, Review Latency, Pattern Promotion, Confidence Drift, Cost/Value). If agent_health_rollup is empty in your DB, an empty-state card appears with a copyable `SELECT refresh_agent_health_rollup()` hint.
result: [pending]

### 5. Lineage tab — invalid ID
expected: Lineage tab. Enter `-1` in the Fee Published ID field and click Trace. Amber card renders saying "fee_published_not_found" or similar.
result: [pending]

### 6. Lineage tab — valid ID (3-click bar)
expected: Enter a real fee_published_id. Either the tree renders (Tier 3 expanded, click Tier 2 chevron, click Tier 1 chevron → R2 link visible within ≤3 clicks) or a graceful "No lineage found" empty state if the ID has no data yet.
result: [pending]

### 7. Messages tab — empty state
expected: Messages tab. Empty-state card renders (no agent_messages yet in your DB). When populated, the table shows Started / Correlation / State / Intent / Rounds / Participants columns.
result: [pending]

### 8. Replay tab — no re-execute button (D-16)
expected: Replay tab. Paste any UUID (even `00000000-0000-0000-0000-000000000000`). Timeline section renders (empty or with rows). **Confirm NO button labeled "Re-execute" or "Re-run" exists anywhere on the page.** (D-16 read-only guarantee.)
result: [pending]

### 9. Dark mode across agents console
expected: Toggle dark mode (top-right). All 4 tabs (Overview, Lineage, Messages, Replay) re-theme cleanly — no white blocks, no broken contrast on tiles/tree/timeline.
result: [pending]

### 10. agent-graduate CLI help
expected: Run `python -m fee_crawler agent-graduate --help`. Usage block prints showing a `--to` flag accepting 4 state choices (q1_validation, q2_high_confidence, q3_autonomy, paused).
result: [pending]

### 11. exception-digest CLI
expected: Run `python -m fee_crawler exception-digest --hours 1`. Prints a 3-section Markdown digest (Improve Rejected / Escalated / Q2 Samples). Likely all `_none_` markers since no agent traffic yet.
result: [pending]

### 12. agent-bootstrap runbook readability
expected: Open `.planning/runbooks/agent-bootstrap.md`. 8 sections present and readable (Overview, Lifecycle Semantics, Graduation, Rollback, Exception Review SLA, Failure Modes, SLAs, On-Call).
result: [pending]

### 13. agent-graduate execution
expected: Run `python -m fee_crawler agent-graduate knox --to q2_high_confidence`. Either exits 5 with "predicate FALSE" (expected — no accepted fees yet) or exits 0 with "graduated knox: q1_validation → q2_high_confidence". **Both are correct.** Any other error is an issue.
result: [pending]

## Summary

total: 13
passed: 0
issues: 0
pending: 13
skipped: 0

## Gaps

[none yet]
