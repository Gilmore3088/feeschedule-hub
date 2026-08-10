# Backend UI — Page-by-Page Inventory

**Status:** Proposed · companion to the ops-console direction
**Date:** 2026-07-16
**Purpose:** Every existing `/admin` route mapped to a home, so the move to an
engine-connected console loses **nothing** by accident. "Are we losing
functionality?" becomes a checklist.

## How to read this

The single-page console replaces the **operations** cluster only. Everything
else either stays as its own section (product/research/growth — different users)
or is removed because it's duplication/legacy the audit already flagged.

**Disposition legend**

| Tag | Meaning |
|---|---|
| **CONSOLE** | Folds into the one ops-console overview (a card/panel, not its own page). |
| **WORKFLOW** | Stays a focused ops page, linked from the console (deep work an overview can't hold). |
| **REWIRE** | Kept, but repointed from a **legacy** table to the **engine** table (see mapping). |
| **KEEP** | Non-ops product/research/growth surface — out of scope for this UI, unchanged. |
| **DELETE** | Duplicate or legacy (reads frozen `extracted_fees`, or a byte-duplicated tree). |

**Legacy → engine table mapping** (drives every REWIRE):

| Reads today (legacy) | Should read (engine) |
|---|---|
| `extracted_fees` (frozen) | `fees_raw` → `fees_verified` → `fees_published_current` |
| `crawl_runs` / `crawl_results` | `pipeline_runs` + `documents` |
| `agent_messages` / `agent_events` | `jobs` (queue) + `pipeline_runs` |
| — (no equivalent today) | `institution_hints`, `state_run_notes`, `publish_batches` |

---

## 1. Operations cluster → the console (+ its workflows)

These are the pages the new console consolidates. Nothing here is lost — it's
re-homed and, in every case, upgraded to read live engine data.

| Route | Does today | Disposition | Notes |
|---|---|---|---|
| `pipeline` | Crawl freshness from `crawl_runs` (the orphaned-`running` bug lives here) | **CONSOLE · REWIRE** | Becomes the run-timeline panel over `pipeline_runs` (always-terminal). |
| `ops` | Manual job triggers / ops actions | **CONSOLE** | Becomes the Atlas publish panel + "run cycle" / "publish now" controls. |
| `agents` (index) | Darwin/Knox/Magellan status via `agent_messages` | **CONSOLE · REWIRE** | Becomes the **Fleet** strip (Magellan/Rosetta/Knox/Darwin) over `jobs`. |
| `darwin` + `darwin/stream` | Darwin drain status/costs (SSE) | **CONSOLE · REWIRE** | Fleet card for Darwin; SSE feed merges into the console's one stream. |
| `scout` | Discovery/scout status | **CONSOLE** | Folds into Magellan (fetch/resolve) metrics. |
| `coverage` + `coverage/stream` | Coverage % (SSE) | **CONSOLE · REWIRE** | Becomes the stat band + Steward state grid, from `state_run_notes`. |
| `data-quality`, `quality` | Two data-hygiene pages (audit noted the overlap) | **CONSOLE** | Merge into one "exceptions" panel (dedup the two). |
| `verify` (index) | Verify queue overview | **CONSOLE** | Folds into the review/exceptions summary. |
| `states/[code]` | Per-state detail | **WORKFLOW · REWIRE** | The Steward drill-down; institutions from `crawl_targets ⋈ fees_verified`, notes from `state_run_notes`. |
| `states/[code]/runs/[id]` | A specific run's detail | **WORKFLOW · REWIRE** | Reads `pipeline_runs` + the `jobs` it spawned. |
| `review`, `review/[id]` | Fee review queue + item | **WORKFLOW · REWIRE** | Bulk review of Darwin-flagged `fees_raw` (outlier_flags), with document provenance. Approve/reclassify writes `institution_hints.fee_name_aliases`. |
| `review/categories`, `.../[category]` | Review grouped by category | **WORKFLOW · REWIRE** | Same queue, grouped by canonical key. |
| `agents/knox/reviews`, `.../[id]` | Knox adversarial reviews | **WORKFLOW · REWIRE** | Folds into the verify workflow (Knox is the 2nd-pass gate). |
| `agents/health` | Agent health rollup | **WORKFLOW · REWIRE** | Fleet detail / dead-letter over `jobs` + `pipeline_runs`. |
| `agents/lineage` | Fee lineage graph | **WORKFLOW · REWIRE** | Provenance browser: `fees_verified → fees_raw → documents`. |
| `agents/replay` | Replay agent events | **WORKFLOW** | Becomes "requeue" over the `jobs` dead-letter. |
| `agents/messages` | `agent_messages` stream (LISTEN/NOTIFY) | **DELETE** | Engine doesn't use agent_messages; superseded by the `jobs` queue view. |
| `institution/[id]` (+ actions) | Per-institution detail/edit + recrawl | **WORKFLOW · REWIRE** | Ops actions (force recrawl = enqueue a fetch job; override a hint). Product view of it lives in §2. |
| `verify/[id]` (+ actions) | Verify a single fee | **WORKFLOW · REWIRE** | Merges into the review workflow. |

**New workflow pages the console links to (no legacy equivalent — pure gain):**
document browser (`documents` + R2 bytes), dead-letter triage (`jobs status='dead'`),
golden-set editor (`golden_institutions`), publish-batch history (`publish_batches`).

**Admin API routes:**

| Route | Disposition | Notes |
|---|---|---|
| `api/admin/coverage/stream` | **REWIRE** | Merge into one console SSE over the engine's `NOTIFY jobs_*`. |
| `api/admin/darwin/stream` | **REWIRE** | Same — one stream, not per-agent. |
| `api/admin/job-health` | **REWIRE + SECURE** | Repoint to `pipeline_runs`; **put behind auth** (audit: currently public). |

---

## 2. Product analytics → KEEP (separate section, different user)

Not operations. These serve analysts/execs, not pipeline operators, and are out
of scope for the ops-console work. They **do** need one change: read the engine's
published surface, not the frozen legacy table.

| Route | Disposition | Notes |
|---|---|---|
| `market` (+ actions) | **KEEP · REWIRE** | National/peer index — read `fees_published_current`, not `extracted_fees`. |
| `peers`, `peers/[id]`, `peers/explore` (+ actions) | **KEEP · REWIRE** | Peer benchmarking. |
| `index` (+ actions), `national` | **KEEP · REWIRE** | Index snapshots. |
| `fees`, `fees/catalog`, `fees/catalog/[category]` (+ actions) | **KEEP · REWIRE** | Fee catalog — the 143 `extracted_fees` refs live here; repoint to published fees. |
| `districts`, `districts/[id]` | **KEEP · REWIRE** | Fed-district analytics. |
| `institutions`, `institution/[id]` (product view) | **KEEP · REWIRE** | Directory + institution profile. |
| `methodology` | **KEEP** | Static methodology page. |

---

## 3. Research / Hamilton → KEEP (its own product)

The AI research analyst. Out of scope for ops. **But this cluster is duplicated**
(the audit found byte-identical `articles/actions.ts` in both trees) — collapse
to one.

| Route | Disposition | Notes |
|---|---|---|
| `hamilton`, `hamilton/chat`, `hamilton/reports` | **KEEP** | The Hamilton product. |
| `research`, `research/[agentId]`, `research/articles`, `research/usage` | **KEEP (canonical)** | Pick this tree **or** the `hamilton/research/*` tree — not both. |
| `hamilton/research`, `.../[agentId]`, `.../articles`, `.../usage` | **DELETE (duplicate)** | Byte-duplicated of `research/*` per the audit — keep one. |
| `hamilton/methodology` | **DELETE (duplicate)** | Duplicate of top-level `methodology`. |
| `hamilton/scout` | **DELETE (duplicate)** | Duplicate of top-level `scout` (which itself folds into CONSOLE). |

---

## 4. Growth / plumbing

| Route | Disposition | Notes |
|---|---|---|
| `leads` | **KEEP** | Lead CRM. |
| `hamilton/leads` | **DELETE (duplicate)** | Duplicate of `leads`. |
| `(index)` dashboard | **KEEP · REWIRE** | The admin landing; its pipeline widgets repoint to engine tables (or link to the console). |
| `query` (+ actions) | **KEEP** | Ad-hoc SQL/query tool — useful, unchanged. |
| `login` (+ actions) | **KEEP** | Auth. Add the central `middleware.ts` guard (audit: layout auth hole). |

---

## 5. Tally — what actually happens to functionality

| Disposition | Count (approx.) | Meaning |
|---|---|---|
| **CONSOLE** | ~9 routes | Fold into the one overview — fewer pages, *more* visibility (queues/provenance/publish the old UI can't see). |
| **WORKFLOW** | ~12 routes | Stay as focused ops pages, linked from the console. **No functionality lost.** |
| **KEEP** | ~16 routes | Non-ops sections, unchanged (most also REWIRE off the frozen table). |
| **DELETE** | ~7 routes | Duplicate/legacy the audit already flagged — removing these *fixes* the UI. |

**Verdict:** No operational capability is lost. The ~9 CONSOLE pages compress
into one live overview; every deep workflow (review, run history, triage,
lineage, per-state, per-institution) keeps its own page. The only things that
disappear are (a) duplicated trees and (b) pages that read a frozen table and
therefore showed stale data. The net is **fewer pages, no lost function, and a
large gain**: queues, per-state Steward learning, document provenance, and
publish batches become visible for the first time.

## Resolved decisions

### 1. Canonical research tree → keep `research/*`, delete `hamilton/research/*`
Evidence: `/admin/research` has **13 inbound links**, `/admin/hamilton/research` has **1**;
both trees are 10 files; `articles/actions.ts` is byte-identical; only `page.tsx` +
`[agentId]/page.tsx` differ. `hamilton/research/*` is a near-orphan copy.
**How:** diff the two differing `page.tsx` files, fold any real behavior into
`research/*`, fix the 1 stray link, `git rm -r admin/hamilton/research`, add a
redirect `/admin/hamilton/research/* → /admin/research/*`. Apply the same to the
other orphan duplicates: `hamilton/leads → leads`, `hamilton/methodology →
methodology`, `hamilton/scout → scout`.

### 2. `query` (raw SQL) → keep, fenced off the console
It's a power tool with arbitrary-SQL blast radius; it doesn't belong on the
operator overview. **How:** move to `/admin/advanced/query`, require the **admin**
role (not analyst), enforce **read-only** (read-only transaction / reject
non-`SELECT`), log every query.

### 3. REWIRE order — driven by a finding that reframes it

**Finding:** ~18 files in `src/lib/crawler-db/*` (market, peers, institution,
fee-index, states, dashboard, search…) **plus the public `api/v1` and reports
routes read the FROZEN `extracted_fees`.** The published tier
(`fees_verified`/`fees_published`) is read in only ~4 internal spots. So the
**product — national index, peer benchmarks, institution reports, the public API
— is served from a frozen table the engine no longer writes to.** The engine's
`fees_raw → verified → published` pipeline currently reaches nothing a user sees.
The product rewire is therefore the **wire that connects the engine to the
product**, not a cosmetic second pass.

**How (low-risk):** build a **compatibility view** shaped like `extracted_fees`
but backed by `fees_published_current ⋈ crawl_targets`; point the query layer's
`FROM` at the view in one place; run a **parity check** vs the frozen snapshot on
a sample; then flip. One view swap → all ~18 readers get fresh data with no query
rewrites. Delete `extracted_fees` afterward.

**Build sequence:**
1. **Ops console** — pure observability, zero product risk.
2. **Product rewire via the compat view** — fast follow (this is the value
   connection); the parity check makes it safe.
3. **Workflow pages** — review, triage, lineage, per-state, document browser.
4. **Delete legacy** — `extracted_fees`, the duplicate trees, `agents/messages`.
