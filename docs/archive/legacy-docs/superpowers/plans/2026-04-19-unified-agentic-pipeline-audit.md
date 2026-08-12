# Unified Agentic Pipeline Audit — Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the three deferred sections of the audit spec (§2.2 what-writes-what, §2.4 admin entry-point inventory, §3 full gap ledger) with real evidence, regenerate the architecture diagram from verified flows, and ship the audit ready to spawn the B1–B7 sub-specs.

**Architecture:** Evidence-first. Every claim in the finalized audit must trace to a file path + line number, a grep result, a DB query output, a commit hash, or a pending todo. Section-by-section commits so progress is atomic and the audit doc is readable at every intermediate state. No code is modified outside the `docs/` tree — this is an analysis deliverable, not a refactor.

**Tech Stack:** bash + rg (Grep tool) for codebase scanning · psycopg2 one-liners for DB inventory queries (DATABASE_URL loaded from `.env`) · Markdown tables for findings · inline SVG or mermaid for the refreshed architecture diagram · git for atomic commits.

**Spec reference:** `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md` (commit `d8fc6a5`).

---

## Task 1: Bootstrap evidence scratchpad + open section placeholders

**Files:**
- Create: `docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md`
- Modify: `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md`

- [ ] **Step 1: Create the evidence scratchpad**

Create `docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md` with this content:

```markdown
# Audit Evidence Scratchpad — 2026-04-19

Rolling notes captured during audit execution. Every claim in the
finalized audit spec traces to a line in this file.

## Section 2.2 — writers per table
<!-- populated in Task 2 -->

## Section 2.3 — cron health snapshot
<!-- populated in Task 4 -->

## Section 2.4 — admin entry-point inventory
<!-- populated in Task 3 -->

## Section 3 — gap ledger evidence
<!-- populated in Task 5 -->

## Cross-references: primitives → gaps
<!-- populated in Task 7 -->
```

- [ ] **Step 2: Insert placeholder markers in the audit spec**

In `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md`, find the two `(to be enumerated during audit execution)` phrases (§2.2 and §2.4) and the `Populated during audit execution` phrase (§3). Leave them for now — they will be replaced in Tasks 2, 3, 5. The purpose of this step is only to confirm the three locations exist.

Run: `grep -n "populated during audit execution\|to be enumerated during audit execution" docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md`

Expected: 3 matches at approximately lines 44, 65, 90 (exact line numbers may vary by one or two).

- [ ] **Step 3: Commit the scratchpad**

```bash
git add docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md
git commit -m "docs(audit): add evidence scratchpad scaffold for pipeline audit"
```

---

## Task 2: Inventory every Postgres writer

Build §2.2 "what-writes-what" table. Goal: for each of the ten load-bearing tables, list every code path that writes to it, at what frequency, through which contract (direct SQL vs. agent-gated).

**Files:**
- Modify: `docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md`
- Modify: `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md` (§2.2)

- [ ] **Step 1: Enumerate writes in the Python layer**

Run via Grep tool:
- Pattern: `INSERT INTO|UPDATE\s+\w+\s+SET|ON CONFLICT|UPSERT`
- Path: `fee_crawler`
- glob: `**/*.py`
- output_mode: `content`
- head_limit: 250

Capture file + line for every match in the scratchpad under a subheading per target table (institutions, extracted_fees, fees_verified, crawl_targets, crawl_runs, agent_events, workers_last_run, canonical_fee_key_map, fee_change_events, institution_dossiers). If a match doesn't belong to one of the ten tables, note it under "other writes" — the long tail matters for orphan-table detection.

- [ ] **Step 2: Enumerate writes in the TypeScript layer**

Run via Grep tool:
- Pattern: `INSERT INTO|UPDATE\s+\w+\s+SET|sql\`INSERT|sql\`UPDATE`
- Path: `src`
- glob: `**/*.ts`
- output_mode: `content`
- head_limit: 250

Append to the same subheadings. TS writers typically live in `src/app/admin/*/actions.ts` or `src/lib/crawler-db/*.ts`.

- [ ] **Step 3: Query the live DB for writer frequency signals**

Run the following as one shell block:

```bash
set -a; source .env; set +a
python3 -c "
import os, psycopg2
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
for table in ['institutions','extracted_fees','fees_verified','crawl_targets',
              'crawl_runs','agent_events','workers_last_run','canonical_fee_key_map',
              'fee_change_events','institution_dossiers']:
    try:
        cur.execute(f'SELECT COUNT(*) FROM {table}')
        n = cur.fetchone()[0]
        print(f'{table:<28} {n:>10,} rows')
    except Exception as e:
        print(f'{table:<28} ERROR: {e}'); conn.rollback()
cur.close(); conn.close()
"
```

Expected: ten lines, each showing current row count. Paste output into the scratchpad under a "current row counts" subheading.

- [ ] **Step 4: Classify each writer as direct vs. agent-gated**

For each writer logged in Steps 1–2, mark one of:
- **direct** — writes raw SQL to the table without going through an agent's tool contract
- **agent-gated** — writes only via `agent_tools/*` or similar contract-enforced entry points

Agent-gated paths live under `fee_crawler/agent_tools/`, `fee_crawler/agents/*/orchestrator.py`, or are invoked from Darwin/Knox/Magellan/Atlas code.

- [ ] **Step 5: Compile the §2.2 table**

Open `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md` and replace the §2.2 body (the "(to be enumerated during audit execution)" paragraph) with a table:

```markdown
### 2.2 What-writes-what

Ten load-bearing tables. For each: every writer (code path + line range),
trigger frequency, contract (direct vs. agent-gated).

| Table | Row count (2026-04-19) | Writer | Trigger / frequency | Contract |
|---|---:|---|---|---|
| `institutions` | … | `fee_crawler/commands/ingest_fdic.py:…` | quarterly ingest cron | direct |
| `institutions` | … | `fee_crawler/commands/ingest_ncua.py:…` | quarterly ingest cron | direct |
| `extracted_fees` | … | `fee_crawler/pipeline/extract_llm.py:…` | per-URL during crawl | direct |
| `extracted_fees` | … | `fee_crawler/agents/darwin/orchestrator.py:…` | Darwin drain | agent-gated |
| … | | | | |

**Orphan tables** (nobody writes, nobody reads): …
**Collision rows** (multiple writers with conflicting contracts): …
```

Fill in every writer found in Steps 1–2, row counts from Step 3, contracts from Step 4. Leave no "…" placeholders in the committed version.

- [ ] **Step 6: Sanity check — every writer class is represented**

Run: `grep -c "^| " docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md` to get a rough row count of all tables in the spec.

Expected: increases by the number of writer rows added. If any of the ten tables has zero writers listed, re-check — the audit's premise is that every table has at least one (otherwise it's orphaned and should be called out explicitly).

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md \
        docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md
git commit -m "docs(audit): populate §2.2 what-writes-what table with evidence"
```

---

## Task 3: Inventory every `/admin/*` route

Build §2.4 "admin entry-point inventory". Goal: for each route, document data source, write capability, and target-state disposition (keep / consolidate into cockpit / kill).

**Files:**
- Modify: `docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md`
- Modify: `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md` (§2.4)

- [ ] **Step 1: List all admin routes**

Run: `ls -1 src/app/admin/ | grep -v '^_' | grep -v '\.'`

Expected output resembles: `agents coverage darwin data-quality districts fees hamilton index institutions leads market methodology national ops peers pipeline quality research` (about 18–22 entries).

Paste the output into the scratchpad under `## §2.4 admin routes`.

- [ ] **Step 2: Identify data source per route**

For each route from Step 1, run:

```bash
route=agents  # replace per iteration
echo "--- /admin/$route ---"
grep -rE "^import|^const.*=.*require|from ['\"]@/lib" src/app/admin/$route/ 2>/dev/null | grep -v node_modules | head -20
```

Capture each route's imports from `@/lib/crawler-db/*` and `@/lib/hamilton/*` — those are the data sources. Note in the scratchpad.

- [ ] **Step 3: Identify write capability per route**

For each route:

```bash
route=agents  # replace per iteration
test -f src/app/admin/$route/actions.ts && echo "HAS actions.ts: /admin/$route" || echo "read-only: /admin/$route"
```

A route with `actions.ts` has server-action write capability; without it, the route is read-only.

- [ ] **Step 4: Classify each route's target-state disposition**

Three buckets (target-state spec §4.5 is the reference):
- **keep (product surface):** `/index`, `/market`, `/peers`, `/districts`, `/national`, `/methodology`, `/institutions` — these render the product, not ops.
- **consolidate into cockpit:** `/agents`, `/darwin`, `/coverage`, `/pipeline`, `/ops`, `/quality`, `/data-quality`, `/hamilton` (ops slice only; research surface may stay).
- **kill:** anything that duplicates another route without a distinct job.

Record the disposition for each route in the scratchpad.

- [ ] **Step 5: Compile the §2.4 table**

Replace the §2.4 placeholder in the audit doc with:

```markdown
### 2.4 Admin entry-point inventory

| Route | Data source | Write capable | Primary job | Target disposition |
|---|---|:---:|---|---|
| `/admin/agents` | `@/lib/crawler-db/agent-console` | yes | agent fleet monitor | consolidate → cockpit panel (a) |
| `/admin/coverage` | `@/lib/crawler-db/coverage` | yes | Magellan queue drain | consolidate → cockpit panel (a) + (d) |
| `/admin/darwin` | `@/lib/crawler-db/darwin` | yes | Darwin decision stream | consolidate → cockpit panel (a) |
| `/admin/market` | `@/lib/crawler-db/fee-index` | no | public market view | keep (product surface) |
| … | | | | |

**Duplicate routes** (overlap without distinct purpose): …
**Orphan routes** (no clear data source or purpose): …
```

Fill every route row. Every route must land in exactly one disposition bucket.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md \
        docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md
git commit -m "docs(audit): populate §2.4 admin entry-point inventory"
```

---

## Task 4: Refresh the cron inventory with live health

§2.3 of the spec has a 2026-04-19 snapshot already, but it was captured early in the day. Goal: re-query and ensure the snapshot is consistent with the end-of-day state.

**Files:**
- Modify: `docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md`
- Modify: `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md` (§2.3)

- [ ] **Step 1: Enumerate Modal crons in source**

```bash
grep -nE "@app.schedule|@app.function.*schedule|@stub.schedule" fee_crawler/modal_app.py
```

Expected: ~5 matches corresponding to the Modal schedules currently documented in §2.3. If the count differs from the spec's table, update the spec.

- [ ] **Step 2: Enumerate GH Actions workflows**

```bash
ls .github/workflows/
cat .github/workflows/*.yml | grep -nE "cron:|on:" | head -30
```

Confirm three workflows: `test.yml`, `unit-tests.yml`, `e2e-tests.yml` (and any new ones).

- [ ] **Step 3: Query `workers_last_run` for today's health**

```bash
set -a; source .env; set +a
python3 -c "
import os, psycopg2
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
cur.execute('''
  SELECT job_name, completed_at, status
  FROM workers_last_run
  ORDER BY completed_at DESC
''')
for r in cur.fetchall(): print(f'  {r[0]:<32} {r[1]}  {r[2]}')
cur.close(); conn.close()
"
```

Expected: at least 5 rows; `daily_pipeline` should either now be present (if manually re-run) or still absent (confirming today's silent miss).

- [ ] **Step 4: Query `crawl_runs` for current stuck rows**

```bash
set -a; source .env; set +a
python3 -c "
import os, psycopg2
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
cur.execute(\"\"\"
  SELECT COUNT(*) FROM crawl_runs
   WHERE status='running'
     AND started_at < NOW() - interval '2 hours'
\"\"\")
print('stuck crawl_runs:', cur.fetchone()[0])
cur.close(); conn.close()
"
```

Expected: 0 after today's cleanup. If nonzero, the reaper hasn't been built yet — record the count in the scratchpad.

- [ ] **Step 5: Update §2.3 table in the audit doc**

If any status column value has changed since the spec was written, update the corresponding row. Add an "as-of" timestamp at the bottom of §2.3:

```markdown
*Snapshot as of 2026-04-19 <HH:MM> UTC. Re-run the queries in Task 4 steps 3–4 to refresh.*
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md \
        docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md
git commit -m "docs(audit): refresh §2.3 cron inventory with end-of-day health snapshot"
```

---

## Task 5: Build the ranked gap ledger

This is the heart of the audit. §3 ships with a column contract and 8 representative rows; the goal is a full 20–30 row ledger with evidence and rankings.

**Files:**
- Modify: `docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md`
- Modify: `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md` (§3)

- [ ] **Step 1: Validate every representative gap with concrete evidence**

For each of the 8 representative gaps in §3, locate the exact evidence (file paths, line numbers, commit hashes, DB row counts). Record in the scratchpad under `## §3 evidence — representative gaps`. If evidence can't be found for a listed gap, demote or remove it; the audit must not carry unverifiable claims.

- [ ] **Step 2: Scan for additional gaps — TODOs / FIXMEs**

Run:

```
Grep pattern="TODO|FIXME|XXX|HACK" glob="**/*.{py,ts,tsx}" path=fee_crawler,src output_mode=content head_limit=80
```

For each hit that names a specific gap (not just "TODO: refactor"), decide whether it belongs in the audit ledger. Filter aggressively — comments that are trivial or obsolete should be skipped.

- [ ] **Step 3: Scan for additional gaps — pending todos**

Run: `ls .planning/todos/pending/*.md`

Read each file's frontmatter title. Any todo whose title describes a systemic issue (not a one-off task) is candidate ledger material. Today's four new todos are all candidates:
- `2026-04-19-rewrite-monthly-orchestration-agent-as-institution-first.md`
- `2026-04-19-modal-scrape-crons-leak-running-rows-on-crash.md`
- `2026-04-19-daily-pipeline-no-catch-up-when-window-missed.md`
- `2026-04-19-phase-62-test-suite-has-38-failures.md`

- [ ] **Step 4: Scan for additional gaps — recent git log**

Run: `git log --oneline --since='60 days ago' | grep -iE 'fix|hack|workaround|patch' | head -40`

For each commit, read the message. If the fix points to a recurring failure mode (not a one-off bug), the underlying class is a gap. Capture commit hash + one-line gap description in the scratchpad.

- [ ] **Step 5: Score every gap**

Build one table row per gap in the scratchpad with columns:

```
| # | Gap | Category | impact_B (1-5) | impact_D (1-5) | Evidence | Size (XS/S/M/L) | Blocks | Phase B |
```

Scoring rubric — copy this into the scratchpad as a reference block:
- **impact_B** = how much human intervention does this gap require today? 1 = none / monitoring only, 5 = every data cycle requires hand-holding.
- **impact_D** = how much bad data can reach the index because of this? 1 = impossible, 5 = routinely.
- **fix_size_weight** = XS → 0, S → 1, M → 2, L → 3.
- **leverage score** = impact_B + impact_D − fix_size_weight. Range: −3 to +10.

- [ ] **Step 6: Compute leverage scores and rank**

For each row in Step 5, compute leverage. Sort descending. Ties break on "blocks" count (more blocked gaps = higher).

- [ ] **Step 7: Map each gap to a Phase B sub-spec**

For each gap, assign to exactly one of: B1 (identity), B2 (budget), B3 (governance), B4 (agent contract), B5 (data path), B6 (Atlas), B7 (cockpit), or "tactical — no sub-spec" (for gaps too small or self-contained to justify one).

If a gap doesn't map cleanly, that's a signal the target-state blueprint is missing a primitive — record in the scratchpad as a primitive-review flag.

- [ ] **Step 8: Write §3 full ledger**

Replace the §3 body in the audit spec with:
- The column contract (already there — keep it)
- The ranking rule (already there — keep it)
- A complete ledger table with one row per gap, ranked

Remove the "Representative gaps already identified" list — those rows are absorbed into the ranked table.

- [ ] **Step 9: Sanity check: every Phase B sub-spec has ≥1 gap**

Run: `grep -c "^| .*| B1 " docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md`

Repeat for B2, B3, B4, B5, B6, B7. Each should be ≥ 1. If any is 0, either the gap scan missed something or the sub-spec isn't justified — flag for review.

- [ ] **Step 10: Commit**

```bash
git add docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md \
        docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md
git commit -m "docs(audit): populate §3 ranked gap ledger (20-30 rows with evidence)"
```

---

## Task 6: Regenerate the current-state architecture diagram from verified flows

The diagram in the brainstorming browser was a rough draft. Replace it with a committed asset driven by the verified flows from Tasks 2–5.

**Files:**
- Create: `docs/superpowers/specs/diagrams/current-state-2026-04-19.svg`
- Modify: `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md` (§2.1 reference)

- [ ] **Step 1: Lift the draft SVG from the brainstorm session**

Copy the SVG block from `.superpowers/brainstorm/41571-1776621838/content/current-state-map.html` (the inline `<svg>...</svg>` element inside the `.mockup-body` div) into a new file at `docs/superpowers/specs/diagrams/current-state-2026-04-19.svg`.

Wrap it as a standalone SVG document:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 640" width="1100" height="640" font-family="ui-sans-serif,system-ui,sans-serif">
  <!-- paste the <defs>...<defs> and all <rect>/<text>/<line> elements from the draft -->
</svg>
```

- [ ] **Step 2: Corrections from verified evidence**

Walk the diagram against Tasks 2–4 findings. Specifically:
- If §2.2 surfaced writer paths not on the diagram, add arrows.
- If §2.4 surfaced admin routes not in the "Admin portal" bar, extend the bar or footnote it.
- If §2.3 surfaced cron state changes since the draft, update the status badges on the three cron boxes.
- Remove any draft-era shorthand that contradicts evidence.

- [ ] **Step 3: Replace §2.1's brainstorm reference**

In the audit spec, §2.1 currently points to the brainstorm HTML. Replace that reference with:

```markdown
### 2.1 Architecture diagram

See `docs/superpowers/specs/diagrams/current-state-2026-04-19.svg`.
```

- [ ] **Step 4: Verify the SVG renders**

```bash
open docs/superpowers/specs/diagrams/current-state-2026-04-19.svg
```

Expected: opens in the default browser or Preview, renders the diagram cleanly. No broken text, no overlapping elements, no empty boxes.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/diagrams/current-state-2026-04-19.svg \
        docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md
git commit -m "docs(audit): regenerate current-state architecture diagram from verified flows"
```

---

## Task 7: Cross-verify primitives → gaps coverage

Every target-state primitive (§4.1–§4.7) must be justified by ≥1 gap in the ranked ledger (§3). Conversely, every B-series sub-spec (§5 / B1–B7) must have a nontrivial collection of gaps it kills. This task tightens that mapping.

**Files:**
- Modify: `docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md`
- Modify: `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md` (§4, §5)

- [ ] **Step 1: Build the cross-reference table in the scratchpad**

For each of the 7 primitives, list every ledger row (by gap #) that maps to it. Shape:

```markdown
## Primitive → gaps cross-reference

- §4.1 Atlas orchestrator → gaps #3, #7, #12, …
- §4.2 Agent tool contract → gaps #1, #5, …
- §4.3 Data path + Knox gate → gaps #1 (root), #8, …
- §4.4 Unified budget ledger → gaps #11, …
- §4.5 Admin cockpit → gaps #14, …
- §4.6 Governance-as-config → gaps #4, …
- §4.7 Canonical identity → gaps #2, #15, …
```

- [ ] **Step 2: Flag under-justified primitives**

Any primitive with 0 or 1 gap mapped to it is a candidate for removal (YAGNI). Any Phase B sub-spec where the gaps total ≤ 2 tiny-impact items is a candidate for absorption into another sub-spec.

Decide per candidate: justified / absorb / remove. Record decisions in the scratchpad.

- [ ] **Step 3: Update §5 "Kills on completion" column**

For each of B1–B7 in the §5 transition table, replace the "Kills on completion" cell's hand-written list with a concrete reference:

```markdown
| B1 | Canonical identity + schema translator | ⟨7⟩ | Gap #2, #15, #19 (identity fragmentation class) | L |
```

Every kill claim is now a gap number you can click through to.

- [ ] **Step 4: Update §4 primitives with "justified by" trailers**

At the end of each §4.N primitive section, append a one-line trailer:

```markdown
*Justified by gaps: #3, #7, #12.*
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/evidence/2026-04-19-audit-scratchpad.md \
        docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md
git commit -m "docs(audit): cross-reference §4 primitives to §3 ledger gaps"
```

---

## Task 8: Final review + handoff readiness

Fresh-eyes pass on the full audit, fix any drift between sections, and produce the explicit handoff to the first B-series sub-spec brainstorm.

**Files:**
- Modify: `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md`

- [ ] **Step 1: Read the full audit end-to-end**

Read every section sequentially. Note any contradictions, broken cross-references (`§X` that doesn't exist, gap numbers that don't match the table), or stale statistics (row counts that disagree with the live queries in Task 2/4).

- [ ] **Step 2: Fix inline**

Any contradiction surfaced in Step 1 — resolve it. If two sections disagree, trust §3's evidence-based ledger; update §1 / §4 / §5 to match.

- [ ] **Step 3: Update §7 "Next action" with the explicit B1 handoff**

Replace the current §7 with:

```markdown
## 7. Next action

The audit is complete. Three sub-specs ready to brainstorm next, in this order:

1. **B1 — Canonical identity + schema translator.** Foundation for every
   other sub-spec. Brainstorm by invoking `superpowers:brainstorming`
   with this audit as context. Spec output: `docs/superpowers/specs/
   YYYY-MM-DD-b1-canonical-identity-design.md`.

2. **B2 — Unified budget ledger.** Can be brainstormed in parallel with
   B1; they don't share code. Ship whichever design doc lands first.

3. **B3 — Governance-as-config + codegen.** Brainstorm after B1 + B2
   have specs (it enforces invariants across them).

B4–B7 are sequenced in §5 of this document.

**Tactical cleanups to land inline during B1–B2:**
- `daily_pipeline` catch-up (todo `2026-04-19-daily-pipeline-no-catch-up-when-window-missed.md`)
- `crawl_runs` reaper (todo `2026-04-19-modal-scrape-crons-leak-running-rows-on-crash.md`)
- Phase 62 test-suite cleanup (todo `2026-04-19-phase-62-test-suite-has-38-failures.md`)

These three should be fully closed before B3 starts so CI is green through the sub-spec build-out.
```

- [ ] **Step 4: Update STATE.md to reflect audit completion**

Open `.planning/STATE.md`, find the "## Pending Todos" section, and add a reference to the finalized audit at the top:

```markdown
**Audit complete (2026-04-19):** `docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md`
→ B1 canonical identity sub-spec is the next brainstorm.
```

- [ ] **Step 5: Final commit + push**

```bash
git add docs/superpowers/specs/2026-04-19-unified-agentic-pipeline-audit.md \
        .planning/STATE.md
git commit -m "docs(audit): finalize audit — evidence populated, primitives cross-referenced, B1 handoff declared"
git push origin main
```

---

## Self-review (done by me before offering execution)

**Spec coverage check:**
- Spec §2.1 diagram → Task 6 (regenerate SVG)
- Spec §2.2 table → Task 2 (writers)
- Spec §2.3 cron inventory → Task 4 (refresh)
- Spec §2.4 admin entry-points → Task 3 (routes)
- Spec §3 gap ledger → Task 5 (populate + rank)
- Spec §4 primitives justification → Task 7 (cross-ref)
- Spec §5 transition kills → Task 7 (gap references)
- Spec §7 next action → Task 8 (B1 handoff)
All 8 spec sections covered.

**Placeholder scan:**
- Every step has a concrete deliverable (grep command, SQL query, table cell, commit message).
- No "TBD", "add appropriate error handling", "similar to task N", or "write tests for the above."
- Where a template table is shown (Task 2 step 5, Task 3 step 5, Task 5 step 5), the contract is that the step's deliverable is the fully-populated table; the template illustrates shape.

**Type / reference consistency:**
- §2.2 table columns match across Task 2 step 5 and the spec's column contract.
- §3 ledger columns match across Task 5 step 8, spec §3 column contract, and the rubric in Task 5 step 5.
- Primitive numbering (1–7) matches between §4.1–§4.7 and B1–B7 sub-spec mapping.
- Gap-number references in Task 7 are placeholders that resolve after Task 5 assigns numbers; no forward reference breaks.

No issues found; plan is ready for execution.
