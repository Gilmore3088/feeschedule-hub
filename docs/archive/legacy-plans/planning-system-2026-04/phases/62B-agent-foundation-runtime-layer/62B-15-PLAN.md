---
phase: 62B
plan: 15
type: execute
wave: 2
depends_on: []
files_modified:
  - src/app/admin/coverage/actions.ts
  - src/app/api/admin/darwin/stream/route.ts
  - src/app/admin/coverage/components/magellan-console.tsx
  - src/app/admin/darwin/components/darwin-console.tsx
  - src/app/admin/darwin/components/budget-gauge.tsx
  - src/app/api/extract/route.ts
  - src/app/(public)/reports/[slug]/page.tsx
  - .planning/phases/62B-agent-foundation-runtime-layer/62B-15-TRIAGE-LOG.md
autonomous: false
gap_closure: true
requirements: []
must_haves:
  truths:
    - "Root cause of hourly Vercel failures is confirmed (not inferred) from a specific Vercel log line pasted by the user"
    - "Exactly one of the 5 debugger hypotheses is promoted from suspect to confirmed"
    - "Targeted fix applied to only the files the confirmed hypothesis points at — unrelated suspect files are NOT modified"
    - "After fix deploys, user observes zero hourly failure notifications for a full 24-hour window"
    - "Triage log documents the confirmed hypothesis, the fix, and the 24-hour clean-window evidence"
  artifacts:
    - path: .planning/phases/62B-agent-foundation-runtime-layer/62B-15-TRIAGE-LOG.md
      provides: "Running log of hypothesis confirmation, fix, and verification window"
    - path: "(conditional on confirmed hypothesis)"
      provides: "Targeted code fix — one of the 5 hypothesis-specific patches below"
  key_links:
    - from: "User-pasted Vercel log"
      to: "Confirmed hypothesis"
      via: "path + error message pattern match in triage log"
      pattern: "confirmed_hypothesis:"
    - from: "Confirmed hypothesis"
      to: "Targeted fix"
      via: "hypothesis-to-fix mapping in Task 2 action block"
      pattern: "If H1:"
---

<objective>
Close UAT Gap 1 — "Still getting failures for every Vercel thing, roughly one every hour". The existing debug session at `.planning/debug/vercel-hourly-failures.md` narrowed the suspect set to 5 ranked hypotheses but could not confirm one without Vercel dashboard access. This plan blocks on user-supplied Vercel log evidence, then applies a targeted fix based on which hypothesis is confirmed.

Purpose: DO NOT speculatively patch all 5 suspect files. That would be a shotgun fix that obscures the real root cause. Instead, pause for user to paste ONE concrete Vercel log event, confirm which hypothesis it matches, then fix ONLY that one path. Verify with a 24-hour clean-notification window before declaring the gap closed.

Output: (a) Triage log documenting the confirmed hypothesis, (b) exactly ONE of five targeted fixes applied, (c) post-fix monitoring window documented in the triage log.

Non-goals:
- NOT fixing all 5 suspect files pre-emptively
- NOT replacing child_process in /api/extract unless that path is confirmed as the hourly failure source
- NOT setting DARWIN_SIDECAR_URL / MAGELLAN_SIDECAR_URL without user's Vercel dashboard confirmation — those are env vars, not code changes
- NOT converting pollers to WebSockets — out of scope for triage
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-UAT.md
@.planning/debug/vercel-hourly-failures.md
@.planning/todos/pending/2026-04-18-finish-darwin-v1-deployment.md

<interfaces>
Five ranked hypotheses from .planning/debug/vercel-hourly-failures.md:

H1: Vercel email notifications for failed DEPLOYMENTS — bursty pushes (22 commits since 3d35503) may cause the user to perceive retry-backoff failures as "hourly".
H2: ISR revalidation of `/reports/[slug]` (revalidate=3600) errors in generateMetadata for a trafficked slug.
H3: Client-side polling loops in `/admin/coverage` or `/admin/darwin` (10-second setInterval) hitting 500 because MAGELLAN_SIDECAR_URL / DARWIN_SIDECAR_URL are unset in Vercel prod.
H4: External uptime monitor (Pingdom, UptimeRobot, BetterStack) hitting a broken route hourly.
H5: `/api/extract` uses child_process.spawn — latent landmine that 500s when called.

Suspect files (read-only at plan-time; only the file matching the confirmed hypothesis is modified):
- src/app/admin/coverage/actions.ts:15,23 (H3)
- src/app/admin/coverage/components/magellan-console.tsx:63 (H3 — 10s poller)
- src/app/api/admin/darwin/stream/route.ts:12 (H3)
- src/app/admin/darwin/components/darwin-console.tsx:101 (H3 — 10s poller)
- src/app/admin/darwin/components/budget-gauge.tsx:22 (H3 — 10s poller)
- src/app/api/extract/route.ts:2 (H5)
- src/app/(public)/reports/[slug]/page.tsx:17 (H2 — revalidate = 3600)

Env vars possibly unset in Vercel prod (per pending todo 2026-04-18-finish-darwin-v1-deployment.md):
- DARWIN_SIDECAR_URL
- MAGELLAN_SIDECAR_URL
- OPS_RUN_URL
- REPORT_INTERNAL_SECRET
- DATABASE_URL_SESSION
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: CHECKPOINT — user pastes one concrete Vercel failure event</name>
  <what-built>
    Nothing built yet. This task pauses execution and blocks on user-supplied evidence from the Vercel dashboard. Without a specific log line the remaining tasks cannot choose the correct fix.
  </what-built>
  <how-to-verify>
    User must provide ONE of the following from the Vercel dashboard. Any single item collapses the hypothesis space enough to proceed:

    **Path A — Failed deployment log (confirms H1):**
    1. Vercel → Deployments → filter "Failed"
    2. Open the most recent failed deployment
    3. Copy the last 20-40 lines of the "Build Logs" output including any error message
    4. Paste into this conversation

    **Path B — Failed function log (confirms H2, H3, or H5):**
    1. Vercel → Functions → Logs → filter by Status = 5xx or Status >= 500
    2. Time window: last 24 hours
    3. Copy ONE representative failure showing:
       - The `path` / route (e.g., `/api/admin/darwin/stream`, `/reports/some-slug`, `/admin/coverage`)
       - The `error` / message
       - Timestamp
    4. Paste into this conversation

    **Path C — External monitor report (confirms H4):**
    1. If you use Pingdom / UptimeRobot / BetterStack / StatusCake, open its dashboard
    2. Copy the URL it is monitoring + the HTTP status it records on failure
    3. Paste into this conversation

    **Path D — Environment variables snapshot (supplement, not sole evidence):**
    1. Vercel → Settings → Environment Variables → Production
    2. Paste ONLY the keys (NOT values) of: DARWIN_SIDECAR_URL, MAGELLAN_SIDECAR_URL, OPS_RUN_URL, REPORT_INTERNAL_SECRET, DATABASE_URL_SESSION
    3. Note whether each is "Present" or "Missing"
    4. This alone does NOT confirm the root cause — combine with Path A or B

    **What executor will do with the evidence:**
    1. Match the log line to one of H1-H5
    2. Write the confirmed hypothesis into `.planning/phases/62B-agent-foundation-runtime-layer/62B-15-TRIAGE-LOG.md`
    3. Apply ONLY the fix mapped to that hypothesis in Task 2
    4. Stop the executor from pre-emptively fixing other suspect files

    **If user cannot access Vercel dashboard:**
    - Run `vercel logs --prod` locally (requires `vercel login` first)
    - Or share screen with someone who has dashboard access
    - Or accept that this plan cannot close the gap and file a follow-up task to get Vercel access
  </how-to-verify>
  <read_first>
    - .planning/debug/vercel-hourly-failures.md (full file — hypothesis ranking + evidence trail)
    - .planning/todos/pending/2026-04-18-finish-darwin-v1-deployment.md (env var status)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-UAT.md Test 1 (gap detail)
  </read_first>
  <action>
    Executor MUST NOT proceed past this checkpoint. On entering Task 1:
    1. Print the "how-to-verify" block to the user verbatim (or summarize in no more than 10 bullets)
    2. Pause and await user input containing a Vercel log fragment
    3. If 10 minutes pass without user response, remind them once; do not proceed

    Once user responds:
    1. Create `.planning/phases/62B-agent-foundation-runtime-layer/62B-15-TRIAGE-LOG.md` with frontmatter:
       ```
       ---
       phase: 62B-15
       created: <ISO timestamp>
       status: hypothesis_pending
       ---
       ```
    2. In the log body, record the pasted evidence verbatim under `## Evidence from user`
    3. Map the evidence to ONE of H1-H5 using this decision table:

    | Evidence signal | Hypothesis |
    |-----------------|------------|
    | "Build failed" / "Module not found" / "Command exited 1" in deployment log | H1 |
    | Path = `/reports/<slug>` + "fetch failed" / "database" / "generateMetadata" / "Unhandled rejection" | H2 |
    | Path = `/api/admin/darwin/stream` or `/admin/coverage/*` + "sidecar not configured" / "SIDECAR_URL" / 500 | H3 |
    | External IP / User-Agent = "Pingdom" / "UptimeRobot" / "Better Uptime" | H4 |
    | Path = `/api/extract` + "ENOENT" / "spawn" / "python" | H5 |
    | Env var audit shows DARWIN_SIDECAR_URL or MAGELLAN_SIDECAR_URL missing + admin tab open when failures occur | H3 (env-var sub-cause) |
    | None match cleanly | Request a second log line — do NOT guess |

    4. Update the triage log:
       ```markdown
       ## Confirmed Hypothesis
       confirmed_hypothesis: H<N>
       rationale: <1-2 sentences mapping the evidence to the hypothesis>
       status: hypothesis_confirmed
       ```

    5. Proceed to Task 2.

    **Hard rule:** If the evidence matches 2+ hypotheses ambiguously, request a second log line. Do not apply any fix without a single confirmed hypothesis.
  </action>
  <resume-signal>
    User pastes a Vercel log fragment (or explicit "cannot access dashboard — defer this plan"). Executor writes triage log with `confirmed_hypothesis: H<N>` and proceeds to Task 2. If user defers, write `status: deferred` and stop.
  </resume-signal>
  <acceptance_criteria>
    - `.planning/phases/62B-agent-foundation-runtime-layer/62B-15-TRIAGE-LOG.md` exists
    - Triage log contains `## Evidence from user` section with non-empty body (verbatim paste)
    - Triage log contains `confirmed_hypothesis: H1` OR `H2` OR `H3` OR `H4` OR `H5` OR `status: deferred`
    - If confirmed, rationale section maps evidence → hypothesis in 1-2 sentences
    - Executor did NOT modify any source file during Task 1
  </acceptance_criteria>
  <done>Triage log exists with a single confirmed hypothesis (or deferred status). No source files touched yet.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Apply targeted fix based on confirmed hypothesis</name>
  <files>(one of the below, selected by confirmed hypothesis in Task 1)</files>
  <read_first>
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-15-TRIAGE-LOG.md (to read confirmed_hypothesis)
    - The specific suspect file(s) for the confirmed hypothesis (see below)
  </read_first>
  <action>
    **Read `confirmed_hypothesis` from the triage log. Apply ONLY the matching fix below. Do not touch files listed under other hypotheses.**

    ---

    **If H1 (bursty deployment failures):**
    Read: `.planning/debug/vercel-hourly-failures.md` + recent git log
    Files to modify: NONE (code-level)
    Action:
    1. In the triage log, add section `## H1 Mitigation`:
       - Document that H1 is an operational artifact, not a code bug
       - Recommend: user mutes Vercel email notifications for failed deployments OR fixes the specific build error from the log
    2. If the build log shows a module-not-found or TS error, fix that specific error (create a sub-task — do NOT generalize)
    3. Set triage log status: `status: resolved_operational`

    ---

    **If H2 (/reports/[slug] ISR errors):**
    Read: `src/app/(public)/reports/[slug]/page.tsx` (full file)
    Files to modify: `src/app/(public)/reports/[slug]/page.tsx`
    Action:
    1. Locate `generateMetadata` function (if present) and the default `export default async function` page component
    2. Wrap any DB call inside `generateMetadata` in a try/catch that returns a minimal fallback metadata object on error. Example minimum:
       ```typescript
       export async function generateMetadata({ params }: Props): Promise<Metadata> {
         try {
           const report = await fetchReport(/* ... */);
           return { title: report.title, description: report.summary };
         } catch (err) {
           console.error("[reports/[slug]] generateMetadata fallback:", err);
           return { title: "Report", description: "Report not available" };
         }
       }
       ```
    3. If `generateMetadata` is already defensive, instead add `export const dynamic = 'force-dynamic'` to disable ISR for this route so stale-cache regeneration errors stop firing hourly
    4. Update triage log `## H2 Fix` with the chosen approach + diff summary

    ---

    **If H3 (client poller + missing env vars):**
    Read: all of:
    - `src/app/admin/coverage/actions.ts`
    - `src/app/api/admin/darwin/stream/route.ts`
    - `src/app/admin/coverage/components/magellan-console.tsx`
    - `src/app/admin/darwin/components/darwin-console.tsx`
    - `src/app/admin/darwin/components/budget-gauge.tsx`

    Files to modify: `src/app/admin/coverage/actions.ts`, `src/app/api/admin/darwin/stream/route.ts` (server endpoints only)

    Action:
    1. In `src/app/admin/coverage/actions.ts`, locate the `throw new Error('MAGELLAN_SIDECAR_URL not set')` (or equivalent). Change it to return a typed disabled response instead of throwing, e.g.:
       ```typescript
       if (!process.env.MAGELLAN_SIDECAR_URL) {
         return { status: 'disabled', reason: 'MAGELLAN_SIDECAR_URL not configured' } as const;
       }
       ```
    2. Ensure callers handle the disabled response (check the poller component; if it only handles success/error, add a disabled branch that stops polling)
    3. In `src/app/api/admin/darwin/stream/route.ts`, locate the 500 path where `DARWIN_SIDECAR_URL` is unset. Change it from 500 to 503 with a JSON body `{ status: 'disabled', reason: 'DARWIN_SIDECAR_URL not configured' }`. 503 is not tracked as a Vercel "error" the same way 500 is.
    4. DO NOT change the polling interval — that's a separate perf concern
    5. Update triage log `## H3 Fix` with env var status + diff summary
    6. Note to user: they must ALSO set DARWIN_SIDECAR_URL and MAGELLAN_SIDECAR_URL in Vercel prod for the underlying feature to work. This fix stops the noise; the env vars enable the feature.

    ---

    **If H4 (external uptime monitor):**
    Files to modify: NONE (code-level)
    Action:
    1. In the triage log, add section `## H4 Mitigation`:
       - Document the monitored URL and service name
       - Recommend: user disables monitoring for the broken route, OR fixes the route, OR adds a graceful fallback
    2. If the monitored route is identifiable from the evidence, read that file and apply a minimal defensive patch (add try/catch or return 200 with empty body instead of 500)
    3. Set triage log status: `status: resolved_external`

    ---

    **If H5 (/api/extract child_process):**
    Read: `src/app/api/extract/route.ts` (full file)
    Files to modify: `src/app/api/extract/route.ts`
    Action:
    1. Locate `import { spawn } from "child_process"` and the handler body
    2. Replace the spawn call with an early 503 response:
       ```typescript
       export async function POST(req: Request) {
         return Response.json(
           {
             status: 'disabled',
             reason: '/api/extract is not supported on Vercel — use the Modal ops webhook instead.',
             see: '/admin/ops',
           },
           { status: 503 },
         );
       }
       ```
    3. Remove the `import { spawn } from "child_process"` line and any unused imports
    4. Update triage log `## H5 Fix` with diff summary

    ---

    **After applying the selected fix:**
    1. Run `npx tsc --noEmit` and confirm clean
    2. Run `npx vitest run` and confirm no regressions in existing tests
    3. Append to triage log:
       ```markdown
       ## Fix Applied
       timestamp: <ISO>
       files_changed: [<list>]
       typecheck: clean
       vitest: green
       status: fix_applied
       ```
  </action>
  <verify>
    <automated>grep -E "confirmed_hypothesis: H[1-5]|status: deferred" .planning/phases/62B-agent-foundation-runtime-layer/62B-15-TRIAGE-LOG.md && grep -E "status: fix_applied|status: resolved_operational|status: resolved_external|status: deferred" .planning/phases/62B-agent-foundation-runtime-layer/62B-15-TRIAGE-LOG.md && npx tsc --noEmit --project tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - Triage log has exactly ONE `confirmed_hypothesis: H<N>` line (unless deferred)
    - Triage log has exactly ONE `## H<N> Fix` or `## H<N> Mitigation` section matching the confirmed hypothesis
    - Triage log does NOT contain fix sections for any other hypothesis (e.g., if H3 confirmed, no `## H5 Fix` section)
    - `npx tsc --noEmit` exits 0 after fix applied
    - `npx vitest run` exits 0 (no new test regressions)
    - If H2 or H3 or H5 confirmed: exactly the file(s) listed for that hypothesis were modified. Verify via `git diff --name-only` — the changed file set must match the hypothesis's `Files to modify` list
    - If H1 or H4 confirmed: zero source files modified (operational or external cause). Verify `git diff --name-only -- 'src/**' 'fee_crawler/**'` is empty
    - Triage log contains `status: fix_applied` OR `status: resolved_operational` OR `status: resolved_external` OR `status: deferred`
  </acceptance_criteria>
  <done>Exactly one targeted fix applied (or deferred), TypeScript clean, no test regressions, triage log captures confirmed hypothesis + fix details.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: CHECKPOINT — 24-hour clean-window verification</name>
  <what-built>
    Task 2 applied the targeted fix and deployed it (or flagged operational cause). This checkpoint verifies the hourly failure cadence has stopped.
  </what-built>
  <how-to-verify>
    **Deploy the fix (if code change was applied in Task 2):**
    1. Commit the change with message `fix(62B-15): <confirmed_hypothesis> — <1-line summary>`
    2. Push to main; wait for Vercel deploy to succeed
    3. Confirm deploy URL responds 200 on a smoke route (`curl -I https://<prod-url>/admin`)

    **Monitor for 24 hours:**
    1. Note the deploy timestamp in the triage log
    2. Wait 24 hours (can be split across sessions — user updates the log when they check)
    3. During the window, observe Vercel failure notifications:
       - Zero new failure emails for 24h → fix confirmed
       - Any new failure at the same cadence → hypothesis was wrong or there are multiple causes; reopen by re-entering Task 1 with the new log line

    **Record in triage log:**
    ```markdown
    ## 24-Hour Verification Window
    fix_deployed_at: <ISO>
    monitoring_started_at: <ISO>
    monitoring_ended_at: <ISO>
    failures_during_window: <count>
    verdict: pass | fail | partial
    ```

    **If verdict is fail or partial:**
    - Document in triage log which hypothesis was wrong
    - Re-enter Task 1 with the new log evidence
    - This is allowed — Gap 1 was explicitly marked "inconclusive" and may need multiple iterations
  </how-to-verify>
  <resume-signal>
    User reports: 24 hours elapsed, 0 new failures → verdict: pass. OR user reports a new failure with log line → verdict: fail → executor re-enters Task 1.
  </resume-signal>
  <acceptance_criteria>
    - Triage log contains `## 24-Hour Verification Window` section with all 4 fields filled
    - `verdict: pass` OR `verdict: fail` OR `verdict: partial` present
    - If `verdict: pass`: Gap 1 is closed — add `gap_1_status: closed` to triage log frontmatter
    - If `verdict: fail` or `partial`: Task 1 is re-entered with fresh evidence (do not close the gap)
  </acceptance_criteria>
  <done>24-hour window observed and verdict recorded in triage log. Gap 1 closed on pass; escalated to second iteration on fail/partial.</done>
</task>

</tasks>

<verification>
## Overall Phase Checks

```bash
# Triage log exists and records confirmation
test -f .planning/phases/62B-agent-foundation-runtime-layer/62B-15-TRIAGE-LOG.md
grep -E "confirmed_hypothesis: H[1-5]" .planning/phases/62B-agent-foundation-runtime-layer/62B-15-TRIAGE-LOG.md

# If code fix applied, typecheck clean
npx tsc --noEmit

# No test regressions
npx vitest run

# 24h window recorded
grep "verdict: pass" .planning/phases/62B-agent-foundation-runtime-layer/62B-15-TRIAGE-LOG.md
```

## Scope discipline checks

- If H3 confirmed, files changed MUST be only `src/app/admin/coverage/actions.ts` and `src/app/api/admin/darwin/stream/route.ts`. The other 3 H3 suspect files (pollers) are NOT modified unless an H3-sub-cause variant explicitly targets them.
- If H5 confirmed, files changed MUST be only `src/app/api/extract/route.ts`. H3 files are NOT touched.
- `/api/extract` is only touched if H5 confirmed, regardless of how tempting the "latent landmine" framing is. This plan is triage, not cleanup.

## Retest UAT Test 1

After `verdict: pass`:
```
UAT Test 1 result: pass
verified_by: 24-hour clean-notification window documented in 62B-15-TRIAGE-LOG.md
```
</verification>

<success_criteria>
- Gap 1 closed with evidence-backed root cause (not speculation)
- Only the files matching the confirmed hypothesis are modified
- 24-hour clean-notification window observed and documented
- Triage log has full provenance: evidence → hypothesis → fix → verification
- No shotgun fixes, no pre-emptive patches to unrelated suspect files
- If hypothesis is wrong on first iteration, plan supports re-entry without pollution
</success_criteria>

<output>
After completion (verdict: pass), create `.planning/phases/62B-agent-foundation-runtime-layer/62B-15-SUMMARY.md` documenting:
- Confirmed hypothesis (H<N>) + evidence that confirmed it
- Targeted fix applied (files + diff summary)
- 24-hour verification window result
- UAT Test 1 flip from `issue: blocker` to `pass`
- Files touched: 1-2 at most (depending on hypothesis)
- Lessons for future triage: "confirm before patching" as the core discipline

If deferred (user could not access Vercel dashboard): create SUMMARY noting defer reason and a TODO to revisit when access is available.
</output>
