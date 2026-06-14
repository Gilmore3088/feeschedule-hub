# Consolidation Report — Salvage, De-duplication & Merge Plan

**Date:** 2026-06-13
**Canonical repo:** `feeschedule-hub`
**Status:** Phases 0-2 complete. This report is the approval gate for Phase 3.

## Executive summary

Four parallel analyses (one per directory) reached a consistent verdict:

- **`feeschedule-hub` is a true superset.** It is dramatically more mature than the other
  three — 1,653 commits, a full Python `fee_crawler/` agent platform, a 90-table live
  schema, and a complete Next.js app.
- **The other three contain almost no unique *code* worth porting.** `compv2` and
  `FeeInsight.com` are earlier/abandoned architectures (an `institutions`-table model the
  canonical repo deliberately rejected in favor of `crawl_targets`). `bfi-v2` is an
  ~80-85% overlap rebuild whose `SPEC.md` is **byte-identical** to the canonical
  `bfi-v2-SPEC.md`.
- **The genuine work is therefore small and targeted:** a few salvage items from
  `bfi-v2`, merging `bfi-v2`'s 36-commit history for provenance, and the internal
  de-duplication you requested — most of which is safe, but a few items carry real
  behavior risk and need your decision.

---

## Section A — Salvage analysis

### A1. compv2 (Python prototype, no remote) — **nothing to port as code**

Superseded clean-room prototype (~1.6k LOC, self-described as "specification documents
only"). Its Inngest/Ptolemy/Nisty/Chronos stack has **zero footprint** in canonical, and
everything it does (FDIC/NCUA ingestion, R2, review gates, agents) exists in canonical in
a more advanced form. Three **documentation-only** ideas are worth a skim, not a port:

| Item | Recommendation | Note |
|---|---|---|
| Chronos 3-tier change-detection heuristic (cosmetic-diff suppression) | FLAG (doc) | Confirm canonical `recrawl.py`/`snapshot_fees.py` already does this; if not, adopt the heuristic |
| Nisty lineage invariant (mandatory verbatim `quote` + `page_ref` per fee) | FLAG (doc) | Verify canonical extraction enforces equivalent provenance |
| Inngest durable-workflow HITL pattern | SKIP (idea only) | Canonical's Knox/agent_messages gating already covers this |

### A2. FeeInsight.com (Next.js, no git) — **nothing to port as code**

Abandoned "clean-room v2" built on the rejected `institutions` schema. All TS pipeline,
app, component, test, and config code is superseded. Two **reference-only** specs exist
(governed-truth lineage schema; Ptolemy/Nisty/Publisher role decomposition) — historical
value only, no port.

### A3. bfi-v2 (Next.js, own remote) — **3 real salvage items**

~80-85% overlap with canonical. The genuinely unique slice (post-absorption work, since
bfi-v2's last commit is ~5 weeks newer than canonical's):

| Item (path) | Unique? | Recommendation | Note |
|---|---|---|---|
| `supabase/migrations/20260525000004_data_cleaning.sql` — `evidence_quote`, `evidence_in_source`, `amount_in_bounds`, `amount_bound_reason` cols + `_unmapped` category | **Yes** (0 grep hits in canonical) | **PORT** | Highest-value. Re-author as a properly-dated canonical migration — do **not** import bfi-v2's file as-is. Needs review before applying to the DB. |
| `docs/team/*` + `docs/marketing/LAUNCH_ESSAY.md` | Yes | **PORT** | Pure docs, zero collision risk |
| Atlas content-validation (soft-404 / non-fee-page rejection), `src/lib/agent-procs.ts`, Hamilton Jinja2 report templates, operator-UX form components, seed/ingest scripts | Partial | **FLAG** | Likely covered by canonical's richer equivalents; confirm before porting/discarding |

---

## Section B — Internal de-duplication plan

### B1. Safe / behavior-preserving (proposed to auto-apply on a branch, with typecheck)

These change structure, not outputs. High confidence, exact locations confirmed.

| Duplication | Locations | Action | Risk |
|---|---|---|---|
| `UncategorizedFee` (byte-identical) | `src/lib/admin-queries.ts:129` & `src/lib/crawler-db/quality.ts:11` | Keep `crawler-db/quality.ts`; re-export | none |
| `InstitutionRow` (5 ad-hoc copies) | `admin-queries.ts:1267`, `scout/types.ts:55`, `admin/states/[code]/runs/[id]/page.tsx:14`, `api/reports/institution/[id]/route.ts:16`, `admin/institutions/page.tsx:13` | Import the rich `scout/types.ts` def everywhere | none (locals are narrower) |
| `ExtractedFeeRow` (2 copies) | `admin-queries.ts:1917` & `scout/types.ts:76` | Use scout superset; widen callers | none |
| `_run_states.py`, `_run_states_original.py`, `_run_il_3x.py`, `_run_il_3x.log` | repo root | Move to `archive/scratch-runners/` | none (manual scratch) |
| Committed brainstorm scratch HTML | `.superpowers/brainstorm/.../report-layout{,-v2,-v3}.html` + server.pid/log | Remove (keep nothing) | none |
| `migrate-data.js` vs `-v2.js`; `dedup-preview.mjs` vs `-v2.mjs`; 7× `apply-62b-*.mjs` | `scripts/` | Move superseded one-offs to `archive/one-off-scripts/` | none (already-run) |

### B2. Behavior risk — **needs your decision (will NOT touch without it)**

| Duplication | Locations | Why it's risky |
|---|---|---|
| **Three parallel fee-extraction stacks** | `pipeline/extract_*` (used by `commands/crawl.py`) vs `agents/extract_{pdf,html,js}.py` (LLM wrappers, used by `modal_app.py`) vs `agents/magellan/rungs/*` | `commands/crawl.py` uses the **pipeline** layer; `modal_app.py` uses the **agents** layer; magellan rungs are newest. Which is the live production path is ambiguous from code. Removing the wrong one breaks crawling. |
| **Two orchestrators** | `pipeline/executor.py` vs `modal_app.py` | Both appear wired (local pipeline vs Modal serverless). Need to know which the daily run uses. |
| `extract_kreuzberg.py` vs `extract_pdf.py` | `pipeline/` | Kreuzberg is experiment-gated; safe to drop only if the experiment concluded. |
| `FeeChangeEvent` name collision (two different shapes) | `crawler-db/fee-changes.ts:10` (8-field audit) vs `crawler-db/fees.ts:44` (4-field diff) | Same import name, divergent meaning. Fix is a **rename** (`FeeChangeDiff`), not a merge — low risk but I want your nod on the new name. |
| **Three SQL-migration homes** | `supabase/migrations/` (47, canonical) vs `scripts/migrations/` (6) vs `scripts/migrate-schema.sql` | Consolidating migration source files is safe; but I won't reorganize migration history without confirming none are unapplied. |
| Taxonomy mirrored Python↔TS | `fee_crawler/fee_analysis.py` ↔ `src/lib/fee-taxonomy.ts` | Intentional cross-language mirror. Long-term fix is codegen, not de-dup. Out of scope unless you want it. |

---

## Section C — bfi-v2 history merge plan

**Approach:** `git subtree add --prefix=archive/bfi-v2 <bfi-v2> main`. This brings all
**36 commits** into `feeschedule-hub`'s history under `archive/bfi-v2/`, preserving
provenance with **zero path collisions** (everything is namespaced under the prefix, so
the destructive baseline migration and duplicate `package.json`/configs never touch the
live tree).

**After the subtree merge:**
1. Port the 3 salvage items (Section A3) to their proper canonical homes.
2. Remove the rest of `archive/bfi-v2/` working tree (history stays reachable in the DAG).
3. The bfi-v2 GitHub repo is archived read-only (Phase 4).

This preserves history (your requirement) and ends de-duplicated.

---

## Section D — Decisions needed from you (the gate)

1. **Extraction stack / orchestrator** (B2 rows 1-2): which is the live production path —
   `pipeline` (used by `commands/crawl.py`), `modal_app.py` (Modal serverless), or
   magellan rungs? Or: **leave all three in place** for now and only do safe de-dup.
2. **Scope of internal de-dup**: apply all of **B1 (safe)** now, plus whichever **B2**
   items you clear?
3. Everything additive (bfi-v2 history merge, doc salvage, scratch cleanup) proceeds
   regardless unless you object.

## What proceeds autonomously after your answer

- bfi-v2 subtree history merge + the 2 zero-risk doc PORTs.
- All **B1** safe de-dup, verified with a TypeScript typecheck before merging to `main`.
- The evidence-verification migration is **authored but not applied** (flagged for your
  DB review).
- Behavior-risk **B2** items only as you direct.
