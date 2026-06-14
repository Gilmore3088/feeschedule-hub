# Consolidation Summary

**Date:** 2026-06-13
**Canonical repo:** `feeschedule-hub` (`github.com/Gilmore3088/feeschedule-hub`)
**Work branch:** `chore/consolidation` (5 commits on top of `main`)

## Outcome

Four overlapping directories were consolidated into a single canonical repository, with
every piece of unique work preserved and nothing destroyed.

**Before:** `claude-feesinsight-compv2`, `FeeInsight.com`, `bfi-v2`, `feeschedule-hub`
(two GitHub remotes, one un-versioned dir, the superset on a stray branch with untracked
files).

**After:** one `feeschedule-hub` on the Desktop, plus one `_archive_feeinsight/` holding
backups and the three superseded directories.

## What happened, by phase

| Phase | Result |
|---|---|
| 0 — Safety net | All 4 dirs captured as verified git bundles; `FeeInsight.com` given git history; uncommitted `feeschedule-hub` work tarred. See `_archive_feeinsight/BACKUPS.md`. |
| 1 — Stabilize git | `main` returned to a clean state matching `origin/main` (the 1 unpushed commit was pushed); 9 locked agent worktrees removed; 35 stray-identical + 1 new untracked file triaged. |
| 2 — Analyze | Four parallel audits → `CONSOLIDATION_REPORT.md`. Verdict: the other 3 dirs hold almost no unique code; `feeschedule-hub` is the superset. |
| 3 — Execute | bfi-v2 history merged (provenance); unique salvage ported; safe de-dup applied (typecheck-clean); scratch/one-offs archived. |
| 4 — Archive | The 3 superseded dirs moved into `_archive_feeinsight/`. |
| 5 — Verify | Typecheck 0 `src` errors; this summary. |

## What was salvaged / changed

- **bfi-v2 history**: all 36 commits merged via `-s ours` (preserved + tagged
  `bfi-v2-archive`) without polluting the live tree.
- **Ported from bfi-v2**: `docs/team/*`, `docs/marketing/LAUNCH_ESSAY.md`, and the
  evidence-verification migration as a **review-first draft** at
  `docs/consolidation/proposed-migrations/evidence_verification.DRAFT.sql`.
- **De-duplicated (behavior-preserving)**: `UncategorizedFee` now defined once;
  `fees.ts` `FeeChangeEvent` renamed `FeeChangeDiff` to end a real name collision.
  `ExtractedFeeRow` / `InstitutionRow` were intentionally **left alone** — they are
  distinct query projections that merely share a name; merging would change SQL behavior.
- **Archived in-repo**: scratch runners → `archive/scratch-runners/`; superseded one-off
  scripts → `archive/one-off-scripts/`; committed brainstorm scratch removed.
- **Captured**: previously-uncommitted ops scripts (`cost-audit`, `verify-backfill`, …).

## Your follow-ups (nothing is auto-applied)

1. **Push strategy** — confirm whether the `chore/consolidation` branch goes up as a PR
   or merges straight to `main` (pending, see chat).
2. **Archive the bfi-v2 GitHub repo** — outward-facing, awaiting your go-ahead (pending).
3. **Evidence-verification migration** — review the DRAFT against the live schema, then
   move it into `supabase/migrations/` with a current timestamp and apply.
4. **Magellan extraction consolidation** — optional, behavior-affecting; plan in
   `docs/consolidation/EXTRACTION_CONSOLIDATION_PLAN.md`.
5. **bfi-v2 FLAG items** — confirm whether Atlas content-validation, `agent-procs.ts`,
   or Hamilton templates are worth porting (details in `CONSOLIDATION_REPORT.md`).

## Recovery

Every original is restorable from `_archive_feeinsight/`: the moved directories
themselves, plus git bundles in `_backups/` (`git clone <bundle> restored`). Uncommitted
`feeschedule-hub` work is in `_backups/feeschedule-hub-uncommitted.tar.gz`.

## Note

This repo's CLAUDE.md prefers edits via GSD workflow commands. This consolidation was run
as an explicit, user-directed operation outside that flow, with each change committed
atomically on a dedicated branch for review.
