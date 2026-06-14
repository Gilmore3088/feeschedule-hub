# FeeInsight Consolidation Design

**Date:** 2026-06-13
**Status:** Awaiting user review
**Canonical repo:** `feeschedule-hub` -> `github.com/Gilmore3088/feeschedule-hub`

## Problem

Four directories on the Desktop are overlapping generations of the same "fee insight"
product. They drifted apart, two point at different GitHub remotes, one has no git at
all, and the most complete one is sitting on a non-default branch with uncommitted
files. The goal: review all four, consolidate into a single canonical directory, and
align it with its GitHub remote without losing any unique work.

## Investigation findings

### The four directories are a lineage, not flat copies

| Directory | Stack | Git | Remote | Last touched | Role |
|---|---|---|---|---|---|
| `claude-feesinsight-compv2` | Python (poetry) | yes | **none** | May 4 | Earliest pure-Python agentic prototype |
| `FeeInsight.com` | Next.js | **no git** | none | Apr 19 | Old web version, never version-controlled |
| `bfi-v2` | Next.js | yes | `Gilmore3088/bfi-v2` | May 25 | Clean lean rewrite, own repo, `main` in sync |
| `feeschedule-hub` | Next.js + Python | yes | `Gilmore3088/feeschedule-hub` | Jun 6 | **Superset** — both stacks, 20+ branches, active |

`feeschedule-hub` is the only directory containing both the web app and the Python
`fee_crawler`, plus the planning corpus (`PRD.md`, `RESEARCH_FINDINGS.md`, and even a
`bfi-v2-SPEC.md`). It is the canonical home.

### State of `feeschedule-hub`

- On branch `claude/peaceful-ride-EK68V` (in sync with its own remote), **not** `main`.
- `main` is **1 commit ahead** of `origin/main` (one unpushed commit).
- 284 `fee_crawler/*` files are tracked on HEAD — the real, current Python code.
- ~30 untracked `fee_crawler/*` files are **resurrected legacy modules** that were
  intentionally deleted in commit `a655e91` ("remove legacy pipeline, fake-data seeder,
  and dead modules"). Low value, but backed up before removal.
- A handful of genuinely new untracked items (`bfi-v2-SPEC.md`, some `scripts/*.mjs`)
  to be triaged individually.
- 11 git worktrees: 2 real (`darwin-v1`, `magellan-v1`) and 9 **locked agent scratch
  worktrees** under `.claude/worktrees/agent-*` (junk).
- Several feature branches are ahead of their remotes (real work to preserve).

### The two highest-risk items

1. `claude-feesinsight-compv2` has **no remote** — its history lives only on this disk.
2. `FeeInsight.com` has **no git at all** — any unique work in it is unprotected.

Both are addressed first, in Phase 0.

## Decisions

- **Canonical:** `feeschedule-hub`, aligned to `github.com/Gilmore3088/feeschedule-hub`.
- **Refactor in scope:** beyond git/file hygiene, the consolidation actively
  **de-duplicates competing implementations** inside `feeschedule-hub` into one coherent
  structure. Behavior-preserving — where two implementations differ in behavior, the
  difference is flagged for the user to choose, never silently merged.
- **bfi-v2 remote reconciled, not left standing:** bfi-v2's **full commit history is
  merged into `feeschedule-hub`** (subtree / unrelated-histories merge so nothing is
  lost), then the `bfi-v2` GitHub repo is **archived (read-only)**. End state: a single
  live remote, history preserved, reversible.
- **Other three (local dirs):** archived (moved) into a single
  `~/Desktop/_archive_feeinsight/` folder after salvage. Nothing is deleted locally.
- **Salvage + de-dup are gated:** a written `CONSOLIDATION_REPORT` (salvage list + internal
  de-duplication plan) is produced and **user-approved** before any file is copied,
  merged, or removed.
- **Final git state:** `main` clean, the unpushed commit pushed, working tree clean,
  one live remote.
- **Deliverables as HTML:** every Markdown report is rendered to a styled,
  self-contained HTML page via `render.py` and auto-opened in the browser. Markdown
  stays the git-tracked source of truth.

## Plan

Each destructive step happens only after a backup exists.

### Phase 0 — Safety net

- Create `~/Desktop/_archive_feeinsight/` with a `_backups/` subfolder.
- `claude-feesinsight-compv2` (no remote): `git bundle create` of **all refs** — full
  history captured in one portable file.
- `FeeInsight.com` (no git): `git init` + a single baseline commit, then a source-only
  tarball (excludes `node_modules`, `.next`).
- `bfi-v2`: already pushed; create a bundle as belt-and-suspenders.
- `feeschedule-hub`: push every local branch that is ahead of its remote so no commit
  exists only on disk.

### Phase 1 — Stabilize `feeschedule-hub` git state

- Copy the ~30 resurrected-legacy untracked `fee_crawler` files into the backup folder,
  then remove them from the working tree.
- Triage the few genuinely-new untracked files: commit the keepers, discard scratch.
- Remove the 9 locked agent worktrees; keep `darwin-v1` and `magellan-v1`.
- Fetch, switch to `main`, push the 1 unpushed commit. `main` becomes clean and aligned.
- Leave all real feature branches untouched.

### Phase 2 — Map, analyze, and report (approval gate)

- **Map the canonical codebase** to locate internal duplication and competing
  implementations (overlapping modules, the Python/Next.js boundary, redundant configs,
  parallel "v1/v2" code paths). This scopes the de-duplication precisely.
- **Diff the other three** for unique work:
  - `compv2`: Python `src/`, `migrations/`, docs vs `fee_crawler/` + repo docs.
  - `FeeInsight.com`: `app/`, `components/`, `lib/`, `agentic_*` packages vs `src/`.
  - `bfi-v2`: `src/`, `agents/`, `supabase/` vs canonical equivalents (also informs how
    much of bfi-v2's tree is overlap vs unique once its history is merged).
- Produce `CONSOLIDATION_REPORT.md` (+ HTML) with three sections:
  1. **Salvage** — per directory: what is unique, what is already present, port / skip.
  2. **De-duplication plan** — each competing implementation, the chosen canonical
     version, what gets removed, and any behavior differences needing a user decision.
  3. **bfi-v2 merge plan** — how its history is brought in and which files survive
     de-dup.
- **Stop and wait for user approval.**

### Phase 3 — Execute: merge, salvage, de-duplicate

- Create branch `chore/consolidation` off clean `main`.
- **Merge bfi-v2 history** into `feeschedule-hub` (subtree / `--allow-unrelated-histories`)
  so its commits are preserved in the DAG.
- **Port approved salvage** from `FeeInsight.com` and `compv2`.
- **Apply the approved de-duplication:** collapse competing implementations to the
  chosen canonical version and remove overlaps (history stays reachable). Behavior-
  preserving throughout.
- Commit in logical, conventional-commit units.
- Run build (`npm run build`) and tests after each meaningful step; fix integration
  issues. Merge to `main`, push.

### Phase 4 — Archive (local dirs and the bfi-v2 remote)

- Move `bfi-v2`, `FeeInsight.com`, `claude-feesinsight-compv2` into
  `~/Desktop/_archive_feeinsight/`. Desktop is left with only `feeschedule-hub`.
- **Archive the `bfi-v2` GitHub repo** (mark read-only via `gh`). This is an
  outward-facing, hard-to-reverse action — confirmed with the user immediately before
  it runs. End state: one live remote (`feeschedule-hub`).

### Phase 5 — Verify and finalize

- Confirm the web app builds and Python imports/tests run.
- Confirm competing implementations are gone (no duplicate code paths remain).
- Confirm `main` is pushed, aligned with `origin/main`, working tree clean.
- Confirm exactly one live remote; bfi-v2 archived and reachable in history.
- Write `CONSOLIDATION_SUMMARY.md` (+ HTML): what was salvaged, what was merged, what was
  de-duplicated, what was archived, where the backups live, and the final git state.

## Salvage methodology

"Unique work" means content present in an other directory but absent from
`feeschedule-hub`, judged by:

- Files/paths with no counterpart in the canonical tree.
- Counterpart files whose content meaningfully diverges (newer logic, extra functions,
  config the canonical repo lacks).

Generated/derived content (`node_modules`, `.next`, `__pycache__`, lockfile churn,
build caches) is ignored. The report distinguishes "unique source" from "already
present" so the user approves on facts.

## De-duplication methodology

"Competing implementations" means two or more code paths in the canonical repo that do
the same job (e.g. an old and a new version of a module, parallel config files, the same
logic expressed once in Python and once in TypeScript). For each one the report records:

- All locations of the duplicated behavior.
- The recommended canonical version and why (newer, tested, referenced by live code).
- What gets removed once the canonical version is chosen.
- **Any behavioral difference between the versions** — these are surfaced for a user
  decision and never collapsed silently.

De-duplication is behavior-preserving: it changes structure, not outputs. Removed code
remains reachable in git history, so any choice is reversible.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Losing `compv2` history (no remote) | Phase 0 git bundle of all refs |
| Losing `FeeInsight.com` work (no git) | Phase 0 `git init` + source tarball |
| Unpushed `feeschedule-hub` branch work | Phase 0 pushes all ahead branches |
| Deleting something still wanted | Nothing deleted — only moved to archive |
| Porting breaks the canonical build | Phase 3 isolates work on a branch + build/test gate |
| Removing a needed untracked file | Backed up before removal; recoverable |
| De-dup silently changes behavior | Behavior diffs surfaced for user decision; removed code stays in history |
| bfi-v2 history merge pollutes/conflicts | Done on a branch; subtree keeps it isolated; build/test gate before merge to main |
| Archiving bfi-v2 repo too early or wrongly | Archive (not delete) is reversible; confirmed with user immediately before it runs; happens only after history is merged and pushed |

## Non-goals

- **No behavior changes.** De-duplication consolidates structure only; outputs stay the
  same. Genuine behavior differences are escalated to the user, not resolved unilaterally.
- **No full re-architecture.** Rethinking module boundaries / rearchitecting the app is a
  separate milestone, spec'd and planned after this consolidation lands.
- No dependency upgrades or new feature work.

## Success criteria

- Desktop contains a single canonical `feeschedule-hub` plus one `_archive_feeinsight/`.
- `feeschedule-hub` `main` is clean, builds, and matches `origin/main`.
- Competing implementations are consolidated to one canonical version each.
- bfi-v2's history is reachable inside `feeschedule-hub`; the bfi-v2 GitHub repo is
  archived; exactly one live remote remains.
- Every unique piece of work the user approved is present in the canonical repo.
- Full backups of all four directories exist in the archive.
- Spec, consolidation report, and summary are all available as launched HTML.
