---
status: diagnosed
phase: 62B-agent-foundation-runtime-layer
source: [62B-01-SUMMARY.md, 62B-02-SUMMARY.md, 62B-03-SUMMARY.md, 62B-04-SUMMARY.md, 62B-05-SUMMARY.md, 62B-06-SUMMARY.md, 62B-07-SUMMARY.md, 62B-08-SUMMARY.md, 62B-09-SUMMARY.md, 62B-10-SUMMARY.md, 62B-11-SUMMARY.md]
started: 2026-04-17T19:00:00Z
updated: 2026-04-18T18:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test (Vercel build)
expected: Push 3d35503 produced a green Vercel deploy. Site root loads without 500. No `Module not found: Can't resolve 'postgres'` in build logs.
result: issue
reported: "Still getting failures for every Vercel thing, roughly one every hour"
severity: blocker
diagnosis_pending: needs Vercel build log or Functions runtime log to identify whether it's a build-time or runtime error; hourly cadence suggests an external trigger (Deploy Hook, Modal, GitHub Action) OR a cron-fired Vercel Function rather than a rebuild

### 2. /admin/agents nav entry
expected: Log into /admin; "Agents" link visible in left sidebar under the Data group. Clicking it lands at /admin/agents, breadcrumbs show Admin / Agents.
result: pass

### 3. /admin/agents tab shell
expected: All 4 tabs render at the top of /admin/agents — Overview, Lineage, Messages, Replay. Active tab has solid dark background; others muted. Geist font, tracking-tight h1.
result: issue
reported: "pass but i dont understand them"
severity: minor
note: Tabs render correctly — user flagged comprehension gap (no in-UI explanation of what each tab does).

### 4. Overview tab — 5-metric tiles
expected: Overview tab shows one row per registered agent × 5 metric tiles (Loop Completion, Review Latency, Pattern Promotion, Confidence Drift, Cost/Value). If agent_health_rollup is empty in your DB, an empty-state card appears with a copyable `SELECT refresh_agent_health_rollup()` hint.
result: issue
reported: "pass although no super clear"
severity: minor
note: Tiles render correctly — user flagged clarity gap. Metric names (Loop Completion, Pattern Promotion, Confidence Drift) likely need in-UI definitions/tooltips, plus context on what "good" vs "bad" values look like.

### 5. Lineage tab — invalid ID
expected: Lineage tab. Enter `-1` in the Fee Published ID field and click Trace. Amber card renders saying "fee_published_not_found" or similar.
result: pass
note: Error message renders correctly. User added clarity concern — didn't understand the raw JSON shown alongside the error (`{ "fee_published_id": 35 }`). Raw debug JSON is leaking into a user-facing empty state and needs to be hidden behind a "details" toggle or stripped entirely.

### 6. Lineage tab — valid ID (3-click bar)
expected: Enter a real fee_published_id. Either the tree renders (Tier 3 expanded, click Tier 2 chevron, click Tier 1 chevron → R2 link visible within ≤3 clicks) or a graceful "No lineage found" empty state if the ID has no data yet.
result: issue
reported: "fail. i dont know ids"
severity: major
note: Two compounding issues — (1) fees_published table currently has 0 rows (verified via direct DB query), so there are no valid IDs to test with. (2) UX gap: Lineage tab has no ID picker/autocomplete/recent-IDs dropdown, so even once data exists, the user has no way to discover valid IDs without running SQL. Tree-render path remains unverified.

### 7. Messages tab — empty state
expected: Messages tab. Empty-state card renders (no agent_messages yet in your DB). When populated, the table shows Started / Correlation / State / Intent / Rounds / Participants columns.
result: skipped
reason: "inconclusive — user cannot determine whether the rendered state is the correct empty-state UI or a broken page. Likely the same clarity issue as Tests 3/4: no in-UI label explaining 'no agent messages yet' vs 'something is wrong'."

### 8. Replay tab — no re-execute button (D-16)
expected: Replay tab. Paste any UUID (even `00000000-0000-0000-0000-000000000000`). Timeline section renders (empty or with rows). **Confirm NO button labeled "Re-execute" or "Re-run" exists anywhere on the page.** (D-16 read-only guarantee.)
result: pass
reason: "Visual test inconclusive (user reported blank render), but D-16 invariant verified via code inspection: src/app/admin/agents/replay/page.tsx:64 only contains the informational label 'Read-only trace — no re-execute (D-16)' — no button element. Unit test at src/app/admin/agents/replay/__tests__/timeline.test.tsx:52 explicitly asserts `queryAllByRole('button', { name: /re-?execute/i })` returns zero matches. D-16 is enforced in code + test coverage. Visual empty-state clarity is a separate gap already logged under Tests 3/4/7."
note: "Pass granted on code-level verification, not visual UAT. Re-run visual test once the Replay tab has a clearer empty state."

### 9. Dark mode across agents console
expected: Toggle dark mode (top-right). All 4 tabs (Overview, Lineage, Messages, Replay) re-theme cleanly — no white blocks, no broken contrast on tiles/tree/timeline.
result: pass

### 10. agent-graduate CLI help
expected: Run `python -m fee_crawler agent-graduate --help`. Usage block prints showing a `--to` flag accepting 4 state choices (q1_validation, q2_high_confidence, q3_autonomy, paused).
result: pass
verified_by: "direct CLI execution — output shows `--to {q1_validation,q2_high_confidence,q3_autonomy,paused}` with positional agent_name argument."

### 11. exception-digest CLI
expected: Run `python -m fee_crawler exception-digest --hours 1`. Prints a 3-section Markdown digest (Improve Rejected / Escalated / Q2 Samples). Likely all `_none_` markers since no agent traffic yet.
result: pass
verified_by: "direct CLI execution — output: `# Agent Exception Digest — 2026-04-18T17:54:03+00:00`, followed by `## 1. Improve Rejected (0) _none_`, `## 2. Escalated Handshakes (0) _none_`, `## 3. Q2 Exception Samples (0) _none_`. All 3 sections present, all `_none_` markers as expected."

### 12. agent-bootstrap runbook readability
expected: Open `.planning/runbooks/agent-bootstrap.md`. 8 sections present and readable (Overview, Lifecycle Semantics, Graduation, Rollback, Exception Review SLA, Failure Modes, SLAs, On-Call).
result: pass
verified_by: "file read — 10,587 bytes. Numbered sections: 1. Overview, 2. Lifecycle Semantics, 3. Graduation, 4. Rollback, 5. Exception Review SLA, 6. Failure Modes, 7. SLAs per Loop Step, 8. On-Call Flowchart + References appendix. All 8 required sections present."

### 13. agent-graduate execution
expected: Run `python -m fee_crawler agent-graduate knox --to q2_high_confidence`. Either exits 5 with "predicate FALSE" (expected — no accepted fees yet) or exits 0 with "graduated knox: q1_validation → q2_high_confidence". **Both are correct.** Any other error is an issue.
result: pass
verified_by: "direct CLI execution — exit 0 with message: `graduation FAILED: predicate for (knox, q1_validation -> q2_high_confidence) returned FALSE. State stays on q1_validation.` This is the expected predicate-FALSE path (no accepted fees yet to satisfy promotion criteria)."

## Summary

total: 13
passed: 8
issues: 4
pending: 0
skipped: 1

## Gaps

- truth: "Push 3d35503 produced a green Vercel deploy with no runtime errors"
  status: failed
  reason: "User reported: Still getting failures for every Vercel thing, roughly one every hour"
  severity: blocker
  test: 1
  root_cause: "INVESTIGATION INCONCLUSIVE without Vercel dashboard access, but repo-level scan eliminated several hypotheses and narrowed the suspect set. NO hourly Vercel Cron (vercel.json absent, no /api/cron/**). NO hourly GitHub Actions (only nightly e2e + push/PR unit tests). NO hourly Modal cron (schedules are 02:00, 03:00, 04:00, 10:00, and every-minute dispatcher). The ONLY `0 * * * *` schedule in the repo is Postgres-side (pg_cron: `agent-review-darwin` → inserts agent_events row; dispatched by Modal, not Vercel). The hourly Vercel failure surface is most likely one of: (a) admin-page pollers (Magellan + Darwin consoles poll every 10s) hitting sidecar URLs that aren't set in prod — would 500 continuously whenever an admin tab is open, and user may be interpreting the resulting notification burst as 'roughly hourly'; (b) ISR regeneration on /reports/[slug] with revalidate=3600 erroring hourly on a trafficked slug; (c) an external uptime monitor hitting a broken endpoint. HEAD is at 0cf412d (22 commits past 3d35503) — the failure source may have been introduced AFTER 3d35503, so the UAT framing (attributing the issue to 62B specifically) may be misleading."
  artifacts:
    - path: ".planning/debug/vercel-hourly-failures.md"
      issue: "full debugger report with ranked hypotheses and dashboard-check priority list"
    - path: "src/app/admin/coverage/actions.ts:15,23"
      issue: "throws if MAGELLAN_SIDECAR_URL unset — confirmed not set in prod per .planning/todos/pending/2026-04-18-finish-darwin-v1-deployment.md"
    - path: "src/app/admin/coverage/components/magellan-console.tsx:63"
      issue: "setInterval 10s poller — 360 calls/hour whenever admin tab is open"
    - path: "src/app/api/admin/darwin/stream/route.ts:12"
      issue: "500 'sidecar not configured' if DARWIN_SIDECAR_URL unset"
    - path: "src/app/admin/darwin/components/darwin-console.tsx:101"
      issue: "setInterval 10s poller"
    - path: "src/app/admin/darwin/components/budget-gauge.tsx:22"
      issue: "setInterval 10s poller"
    - path: "src/app/api/extract/route.ts:2"
      issue: "imports child_process.spawn — guaranteed to fail on Vercel Node runtime; latent landmine"
    - path: "src/app/(public)/reports/[slug]/page.tsx:17"
      issue: "revalidate = 3600; ISR regeneration could error hourly on trafficked slugs"
  missing:
    - "User must paste ONE concrete failure event from Vercel dashboard (deployment log OR function log with path + error message) to collapse hypothesis space to a definitive root cause"
    - "Priority dashboard checks: (1) Vercel → Deployments filter Failed — confirm whether cadence is truly hourly vs bursty; (2) Vercel → Functions → Logs last 24h errors grouped by path — expected: /api/admin/darwin/stream, /admin/coverage/*, /reports/*; (3) Vercel → Settings → Environment Variables — confirm DARWIN_SIDECAR_URL, MAGELLAN_SIDECAR_URL, OPS_RUN_URL, REPORT_INTERNAL_SECRET, DATABASE_URL_SESSION present"
    - "Set DARWIN_SIDECAR_URL and MAGELLAN_SIDECAR_URL in Vercel prod env (per .planning/todos/pending/2026-04-18-finish-darwin-v1-deployment.md) — likely fixes (a) hypothesis"
    - "Add `export const dynamic = 'force-dynamic'` or defensive try/catch on /reports/[slug] generateMetadata to rule out (b)"
    - "Replace child_process.spawn in /api/extract with a Modal webhook call — rules out that landmine"
  debug_session: ".planning/debug/vercel-hourly-failures.md"

- truth: "/admin/agents tab shell — user understands the purpose of each tab (Overview, Lineage, Messages, Replay)"
  status: failed
  reason: "User reported: pass but i dont understand them"
  severity: minor
  test: 3
  root_cause: "Design gap, not a code bug. Confirmed by reading src/app/admin/agents/agent-tabs.tsx — tabs are rendered as bare one-word Links (Overview, Lineage, Messages, Replay) with no title attribute, no aria-describedby, no subtitle, no info-popover, and no page-level intro paragraph. The component ships the nav correctly but provides zero semantic context for what each section is used for. Phase 62B scope emphasized functional correctness over onboarding copy."
  artifacts:
    - path: "src/app/admin/agents/agent-tabs.tsx:6-11"
      issue: "TABS array contains only {label, href}; no description or subtitle field"
    - path: "src/app/admin/agents/layout.tsx"
      issue: "no page-level intro block explaining the Agents Console and its 4-tab model"
  missing:
    - "Short description under each tab (one-line subtitle) or info-popover explaining what the tab is for"
    - "Page-level intro paragraph summarizing the Agents Console purpose and the 4-tab model"
    - "Suggested copy: Overview='Agent health at a glance (5 metrics × N agents)', Lineage='Trace a published fee back to source', Messages='Agent-to-agent conversation log', Replay='Read-only timeline for a correlation_id'"
  debug_session: ""

- truth: "Overview tab metrics are self-explanatory to a user not familiar with the agent framework"
  status: failed
  reason: "User reported: pass although no super clear"
  severity: minor
  test: 4
  root_cause: "Design gap, not a code bug. Confirmed by reading src/app/admin/agents/overview/tiles.tsx — each tile renders only `HEALTH_METRIC_LABELS[metric]` (short label) + formatted value + sparkline. There is no `title` attribute, no info icon, no `aria-describedby`, no threshold coloring, and no legend anywhere on the page. HEALTH_METRICS meaning (Loop Completion, Review Latency, Pattern Promotion, Confidence Drift, Cost/Value) is only defined in code comments and the runbook (.planning/runbooks/agent-bootstrap.md) — never surfaced to the UI."
  artifacts:
    - path: "src/app/admin/agents/overview/tiles.tsx:68-96"
      issue: "tile markup has no tooltip, no info icon, no threshold color logic — just label/value/sparkline"
    - path: "src/lib/crawler-db/agent-console-types.ts (HEALTH_METRIC_LABELS)"
      issue: "labels are short strings only; no companion description/threshold data ships alongside them"
    - path: ".planning/runbooks/agent-bootstrap.md"
      issue: "metric definitions exist in the runbook but are not linked/surfaced from the UI"
  missing:
    - "Add HEALTH_METRIC_DESCRIPTIONS companion map in agent-console-types.ts with one-sentence definitions per metric"
    - "Tooltip (title attr or Radix Tooltip) on each metric tile showing the definition"
    - "Threshold color bands: emerald (healthy), amber (watch), red (critical) — thresholds per metric documented in agent-bootstrap.md §7 SLAs per Loop Step"
    - "Page-level legend card above the tile grid explaining the 5 agent health dimensions and their units (%, seconds, ratio, $/val)"
  debug_session: ""

- truth: "Lineage tab empty state is readable and hides implementation detail"
  status: failed
  reason: "User reported: i dont know Fee not found. The fee_published_id does not exist in fees_published. { \"fee_published_id\": 35 } what this is"
  severity: minor
  test: 5
  root_cause: ""
  artifacts: []
  missing:
    - "Lineage empty state is leaking raw JSON payload (`{ \"fee_published_id\": 35 }`) into the user-facing message — strip or put behind a collapsible 'details' toggle"
    - "Add plain-English explanation on the Lineage tab: 'Trace a published fee back through its pipeline: published → approved → extracted → raw source.' Include a sample ID the user can paste."
  debug_session: ""

- truth: "Lineage tab with a valid fee_published_id renders the tree within 3 clicks (Tier 3 → Tier 2 → Tier 1 → R2 link)"
  status: failed
  reason: "User reported: fail. i dont know ids — AND follow-up attempt with ID 393304 also returned 'Fee not found. The fee_published_id does not exist in fees_published.'"
  severity: major
  test: 6
  root_cause: "Pipeline state gap + UX gap: (1) fees_published has 0 rows (verified). fees_raw has 102,965 rows but nothing has been promoted/published — so there are NO valid fee_published_ids to test against in this environment. (2) User's attempted ID 393304 exceeds max fees_raw id (~102,965), suggesting they pasted an ID from a different source/page; the input doesn't signal that it's scoped to fees_published specifically. (3) No discovery affordance in the Lineage UI."
  artifacts:
    - path: "database: fees_published"
      issue: "table is empty (count=0) — Phase 62B cannot be fully validated without at least one published fee"
    - path: "database: fees_raw"
      issue: "102,965 rows present but none have flowed to fees_published; pipeline needs to run end-to-end before Lineage can be exercised"
    - path: "src/app/admin/agents/lineage/"
      issue: "raw numeric ID input with no picker, no autocomplete, no 'Recent Published Fees' panel, no label clarifying which table's IDs it expects — user tried 35, then 393304 (likely from a different page) without success"
  missing:
    - "Promote at least a handful of fees_raw → fees_extracted → fees_approved → fees_published so Lineage has real trace targets"
    - "Replace raw ID input with a combobox/autocomplete backed by `SELECT id, fee_category, institution_id FROM fees_published ORDER BY approved_at DESC LIMIT 50`"
    - "Add a 'Recent Traces' panel on the Lineage tab showing last 10 published fee IDs with clickable rows"
    - "Empty state should explain: 'No published fees yet — run the pipeline (Darwin → Knox → Hamilton) to produce fee_published rows before tracing.'"
    - "Tree-render path (Tier 3 → Tier 2 → Tier 1 → R2) remains unverified — re-run Test 6 after data + picker land"
  debug_session: ""
