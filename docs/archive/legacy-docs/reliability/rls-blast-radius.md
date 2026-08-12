# RLS Blast-Radius Assessment

**Scope:** Supabase Postgres — tables, query call-sites, risk, phased rollout, effort estimate.
**Mode:** Read-only research. No code changes.
**Author context:** Bank Fee Index (Next.js 16 + Python crawler) — B2B fee intelligence platform preparing for public API launch.

---

## Executive Summary

**Critical finding:** RLS is **already enabled on 55 tables** (migration `20260408_enable_rls_all_tables.sql`) with **zero policies** — meaning every non-superuser role is currently DENY-ALL by default. The Next.js app is unaffected because it connects via direct postgres (DATABASE_URL) using the `postgres` role, which bypasses RLS. The one Supabase-client caller (`supabase/functions/fee-lookup`) uses the service-role key, which also bypasses RLS.

**The real question is not "will enabling RLS break things?"** — it already is enabled. **The question is: "what policies do we need before we expose the anon/authenticated roles?"** Namely: (a) opening the PostgREST endpoints for the public API, (b) migrating any server code from direct postgres to `supabase-js` with a user JWT, or (c) running Supabase Realtime subscriptions client-side.

**Headline recommendation:** This is a 3–5 day job, not 2 weeks, because the deny-by-default posture is already in place. The work is additive (writing ~15 SELECT policies), not invasive. The "2-week" estimate was sized against a big-bang retrofit that is not needed.

---

## Section 1 — Table Inventory by Tier

Tables are drawn from `supabase/migrations/` (41 migration files, ~75 distinct tables). Grouped by sensitivity tier for anon/authenticated exposure.

### Tier 1 — Public-Readable (anon SELECT should work)

These back the public API (`/api/v1/fees`, `/api/v1/index`, `/api/v1/institutions`) and any future PostgREST-exposed read endpoints. All data is already considered public-facing (published fee schedules, institution rosters, Fed economic indicators).

| Table | Purpose | Current RLS |
|---|---|---|
| `crawl_targets` | Institution roster (name, charter, state, assets) | Enabled, no policy |
| `extracted_fees` | Fee rows (filtered by `review_status != 'rejected'`) | Enabled, no policy |
| `fees_published` | Tier-3 curated published fees | Not in 20260408 list — **RLS status unknown** |
| `fee_index_cache` | Precomputed national/peer index | Enabled, no policy |
| `fee_index_snapshots` | Historical index snapshots | Not in 20260408 list |
| `institution_fee_snapshots` | Per-institution history | Not in 20260408 list |
| `fed_beige_book`, `fed_content`, `fed_economic_indicators` | Federal Reserve public data | Enabled, no policy |
| `beige_book_themes` | Derived theme tags from Beige Book | Enabled, no policy |
| `institution_financials` | FFIEC/NCUA Call Reports (public filings) | Enabled, no policy |
| `institution_complaints` | CFPB complaints (public dataset) | Enabled, no policy |
| `market_concentration`, `demographics`, `branch_deposits`, `census_tracts` | Public demographic/FDIC data | Enabled, no policy |
| `reg_articles`, `research_articles` | Public articles + published research | Enabled, no policy |
| `platform_registry` | Known crawl platforms | Enabled, no policy |

### Tier 2 — Authenticated-Only (signed-in admin/analyst/premium)

These serve the admin console (`/admin/*`) and Pro workbench. Today access is gated by Next.js `getCurrentUser()` on the application layer; the DB is not aware of the session.

| Table | Purpose |
|---|---|
| `fee_reviews` | Review queue audit (analyst actions) |
| `fee_change_events` | Fee price-movement events |
| `fee_snapshots` | Pre-approval fee state |
| `crawl_runs`, `crawl_results`, `crawl_target_changes` | Crawler operational data |
| `discovery_cache` | Scout/Magellan URL discovery state |
| `pipeline_runs`, `coverage_snapshots` | Pipeline telemetry |
| `ops_jobs`, `jobs`, `upload_jobs`, `workers_last_run` | Job queue + worker heartbeats |
| `roomba_log` | Cleanup agent log |
| `agent_health_rollup`, `v_agent_reasoning_trace` | Agent observability |
| `hamilton_conversations`, `hamilton_messages`, `research_conversations`, `research_messages`, `research_usage` | Hamilton analyst sessions (user-scoped in practice) |
| `published_reports`, `report_jobs` | Report generation queue and output |
| `analysis_results` | Derived analytical artifacts |
| `community_submissions` | User-submitted feedback on fees |
| `gold_standard_fees` | QA reference set |

### Tier 3 — Service-Role-Only (no anon/authenticated access ever)

These are backend-only — pipeline internals, audit trails, partitioned event streams. Any anon access would leak raw extraction internals, agent reasoning, or security-sensitive auth logs.

| Table | Purpose |
|---|---|
| `fees_raw`, `fees_verified` | Pre-publish fee tiers (raw extraction + verified-but-not-published) |
| `agent_events` (partitioned) | Agent reasoning trace (includes `reasoning_text`) |
| `agent_auth_log` (partitioned) | Agent authentication audit |
| `agent_messages` | Inter-agent handshake protocol (challenge/prove/accept) |
| `agent_runs`, `agent_run_results` | Agent execution telemetry |
| `agent_registry`, `agent_budgets`, `agent_lessons` | Agent config + learned lessons |
| `shadow_outputs`, `canary_runs` | Pre-production agent output comparison |
| `classification_cache`, `classification_history` | Darwin classifier state |
| `wave_runs`, `wave_state_runs` | Crawl wave orchestration |
| `institution_dossiers` | Enriched institution context (PII-adjacent) |
| `stripe_events` | Stripe webhook raw payloads |
| `usage_events`, `api_keys` | API key material + usage telemetry |
| `sessions` | Auth session IDs (**never** anon-readable) |
| `leads` | Inbound sales leads (PII: email, company) |
| `external_intelligence` | Third-party intel feed |
| `overdraft_revenue` (from migration 20260414) | Revenue-sensitive rollup |

### Tier 4 — User-Scoped (RLS with `user_id = auth.uid()` filter)

These need per-row ownership policies. Today all enforcement lives in the application layer (`WHERE created_by = ${userId}` in template literals).

| Table | Ownership column | Current status |
|---|---|---|
| `users` | `id` (self-read only) | Enabled, no policy |
| `subscriptions` | `user_id` | Enabled, no policy |
| `saved_peer_sets` | `created_by` (TEXT, not FK — see drift migration) | Enabled, no policy |
| `saved_subscriber_peer_groups` | `user_id` | Enabled, no policy |
| `alert_preferences`, `fee_alert_subscriptions` | `user_id` | Enabled, no policy |
| `organizations`, `org_members` | `org_id` / membership | Enabled, no policy |
| `hamilton_conversations`, `hamilton_messages` | `user_id` (added in drift migration) | Enabled, no policy |
| `report_jobs` | `user_id` (TEXT after drift reconcile) | Enabled, no policy |

---

## Section 2 — Query Call-Site Inventory by Auth Context

**Finding:** 33 files under `src/lib/crawler-db/` issue raw SQL via the `postgres` npm client — a single shared pool initialized in `connection.ts` from `DATABASE_URL`. The pool connects as the `postgres` role (Supabase transaction pooler, port 6543). **All 377 `sql\`\`` sites bypass RLS.**

### Contexts in the codebase

1. **Direct postgres pool (bypasses RLS) — dominant pattern.**
   Used by: all of `src/lib/crawler-db/*`, every route in `src/app/api/*` that imports from `@/lib/crawler-db`, every server component and server action.
   *Implication:* RLS policies have **zero effect** on the running app. Enabling RLS does not break these queries.

2. **Supabase service-role client (bypasses RLS).**
   Used by: `supabase/functions/fee-lookup/index.ts` (Edge Function). Reads `crawl_targets`, `extracted_fees`, `crawl_results`.
   *Implication:* Enabling RLS does not affect this path either. Service-role always bypasses.

3. **Supabase anon/authenticated client — NOT YET USED anywhere in the repo.**
   No `createClient(SUPABASE_URL, ANON_KEY)` call exists in application code. This is the entire blast-radius surface that does not yet exist — the moment we add one, the deny-by-default posture matters.

### Per-table query touchpoints (representative, not exhaustive)

| Table | Modules that touch it | Dominant queries |
|---|---|---|
| `crawl_targets` | core, institution, market, states, search, geographic, quality, pipeline, dashboard | Institution lookup, roster list, geographic filters |
| `extracted_fees` | core, fees, fee-index, geographic, market, peers, dashboard, quality, hygiene, fee-revenue, derived-analytics | Median/P25/P75 aggregations, category summaries, fee listings |
| `institution_financials` | call-reports, health, financial, fee-revenue, derived-analytics, quality | Call Report joins, health indicators |
| `fed_*` | fed, financial | Beige Book, FRED series |
| `agent_events`, `agent_runs`, `agent_messages`, `agent_health_rollup`, `v_agent_reasoning_trace` | agent-console, institution, states | Agent observability |
| `ops_jobs`, `pipeline_runs`, `crawl_runs` | ops, pipeline, pipeline-runs, dashboard, quality | Job queue display |
| `saved_peer_sets` | saved-peers | User-scoped reads + writes (via `created_by`) |
| `research_articles` | articles | Public-published list + admin CRUD |
| `fee_reviews`, `fee_change_events`, `fee_snapshots` | fees, dashboard | Review audit trail |
| `institution_complaints`, `market_concentration`, `demographics`, `branch_deposits` | complaints, financial | Public economic data |
| `leads` | (server action in `/leads`) | Sales-inbound PII |
| `sessions`, `users` | `src/lib/auth.ts` | Cookie session lookup |

### External writers (also bypass RLS)

- **Python fee crawler** (`fee_crawler/`): uses `psycopg2` with `DATABASE_URL`. Writes to `extracted_fees`, `fees_raw`, `crawl_results`, `crawl_runs`, `fed_*`, `institution_financials`, `agent_*`.
- **Modal serverless workers**: run the crawler on cron; same DSN, same role.
- **`scripts/apply-migration.mjs` / `apply-drift.mjs`**: DDL against DATABASE_URL.

None of these are at risk from RLS policy changes.

---

## Section 3 — Breakage Risk Matrix

Risk is conditional on the launch of an anon/authenticated PostgREST surface (not yet shipped).

| Tier | Table group | Risk if anon-SELECT exposed without policy | Risk today |
|---|---|---|---|
| 1 | `crawl_targets`, `extracted_fees`, `fee_index_cache`, `fed_*`, `institution_financials`, `research_articles` | **High (silent)** — anon queries return empty today (RLS on, no policy). Future `supabase-js` readers will see "no rows" without an obvious error. | Low — app bypasses RLS. |
| 2 | `fee_reviews`, `crawl_runs`, `ops_jobs`, `report_jobs` | Medium — admin console would need server-side JWT passthrough to enforce; today it uses session cookie + service-role pool. | Low. |
| 3 | `agent_events`, `agent_messages`, `fees_raw`, `leads`, `sessions`, `api_keys`, `stripe_events` | **Critical if exposed** — PII, auth material, agent reasoning leakage. Default-deny is correct; must NEVER have anon SELECT. | Low (deny-all active). |
| 4 | `users`, `subscriptions`, `saved_peer_sets`, `hamilton_*`, `report_jobs` | **High** — wrong or missing policy lets user A read user B's rows. | N/A today (no JWT path). |

### Specific breakage scenarios flagged

1. **Public API → supabase-js migration.** If we refactor `/api/v1/*` to use `@supabase/supabase-js` with the anon key (for rate-limit-at-PostgREST benefits), every query returns 0 rows silently until Tier-1 SELECT policies land. This is the biggest footgun.

2. **Cross-tier joins.** `getInstitutionsByFilter` joins `crawl_targets` (Tier 1) with a subquery on `extracted_fees` (Tier 1). Fine. But `/api/institutions/[id]` style routes that surface `agent_run_results` alongside institution data (`src/lib/crawler-db/institution.ts`) cross into Tier 3 — those must NOT be exposed to anon clients even after Tier-1 policies are written.

3. **Server actions assuming no RLS.** All server actions under `src/app/admin/*/actions.ts` use the direct pg pool. If any are refactored to use supabase-js with a user JWT (for Realtime or for per-user audit logs), they will require authenticated-role policies on `fee_reviews`, `saved_peer_sets`, `hamilton_conversations`.

4. **`saved_peer_sets.created_by` is TEXT, not a uuid FK to `auth.users`.** Drift migration widened it, and migration 20261231 made it nullable. A user-scoped policy `created_by = auth.uid()::text` will work but requires a cast, and orphaned NULL rows are invisible to anyone under RLS.

5. **`hamilton_conversations.user_id` was added late** (20261231_reconcile_schema_drift). Legacy rows have NULL. User-scoped policies must decide: hide NULLs (safe) or grant admin passthrough.

6. **`published_reports` slug endpoints.** `/reports/[slug]` is public-facing; the table is currently under deny-all RLS. If this page ever moves to a supabase-js fetch (e.g. for Vercel ISR revalidation from the edge), it breaks.

7. **Pipeline cron → Python.** Python workers connect as `postgres` role and bypass RLS. No risk, but worth documenting so an engineer doesn't later "fix" it by switching to `supabase-py` with the anon key.

---

## Section 4 — Phased Rollout Plan

### Phase A — Policy Foundation (Day 1, ~4h)

**Goal:** Document the current state and establish policy conventions before writing any.

- Inventory every table's current `relrowsecurity` and policy count via `pg_policies` — confirm the 55 tables from 20260408 are still the complete set.
- Add a `schema_migrations_tracking` query to flag any new tables added since (already exists per 20260418_schema_migrations_tracking.sql).
- Decide: do we use `auth.uid()` (Supabase-native) or rely on a custom JWT claim? The app's session cookie is HMAC-signed, not a JWT — if we want a unified model we'll need supabase-auth adoption.
- Write the policy-naming convention: `{table}_anon_select`, `{table}_owner_all`, `{table}_admin_all`.

**Gate:** Decision doc approved by owner. No DB changes yet.

### Phase B — Tier 1 Open-Read Policies (Day 2, ~6h)

**Goal:** Enable anon SELECT on the ~15 tables that back the public API. This unblocks any future supabase-js migration.

Tables: `crawl_targets`, `extracted_fees` (filtered to `review_status != 'rejected'`), `fee_index_cache`, `fee_index_snapshots`, `institution_fee_snapshots`, `fed_beige_book`, `fed_content`, `fed_economic_indicators`, `beige_book_themes`, `institution_financials`, `institution_complaints`, `market_concentration`, `demographics`, `branch_deposits`, `census_tracts`, `reg_articles`, `research_articles` (only `status = 'published'`), `platform_registry`, `fees_published`.

Policy shape (English):
- "Anyone (anon or authenticated) may SELECT. Column filtering handled at view layer where needed (e.g. `extracted_fees_public` view hides internal columns if required later)."
- For `research_articles`: "Anyone may SELECT where `status = 'published'`." Authenticated admin gets full access via Phase D.
- For `extracted_fees`: either a row-level WHERE in the policy or a dedicated `extracted_fees_public` view. **Recommend view** — keeps policy simple and prevents accidental leak of `review_status = 'rejected'` rows through `SELECT *`.

**Gate:** All existing Vitest + Pytest suites pass (they use direct postgres and will be unaffected). Then smoke-test a `supabase-js` anon read against each Tier-1 table in a throwaway script.

### Phase C — Tier 4 Owner Policies (Day 3, ~4h)

**Goal:** Row-level ownership on user data. Must land before we ever expose per-user supabase-js reads.

Tables: `users` (self only), `subscriptions`, `saved_peer_sets`, `saved_subscriber_peer_groups`, `alert_preferences`, `fee_alert_subscriptions`, `hamilton_conversations`, `hamilton_messages`, `research_conversations`, `research_messages`, `report_jobs`.

Policy shape:
- "Authenticated user may SELECT/INSERT/UPDATE/DELETE where `user_id = auth.uid()` (or `created_by = auth.uid()::text` for legacy TEXT columns)."
- Orphan NULL rows: **hide from non-admin** (add `AND user_id IS NOT NULL`). Cleanup is a separate data-migration concern.
- `organizations` + `org_members`: policy joins `org_members.user_id = auth.uid()` to grant org-scoped read.

**Gate:** Write a `.sql` script that, impersonating `authenticated` with a test JWT, confirms user A cannot see user B's saved peer sets. Run in staging.

### Phase D — Tier 2 Admin Policies (Day 4, ~4h)

**Goal:** Grant authenticated users with admin role (custom JWT claim) access to operational tables. Only matters if/when admin console moves off the direct-pg session-cookie model.

Tables: `fee_reviews`, `fee_change_events`, `fee_snapshots`, `crawl_runs`, `crawl_results`, `crawl_target_changes`, `discovery_cache`, `pipeline_runs`, `coverage_snapshots`, `ops_jobs`, `jobs`, `upload_jobs`, `workers_last_run`, `agent_health_rollup`, `analysis_results`, `community_submissions`, `gold_standard_fees`, `published_reports`.

Policy shape:
- "Authenticated user with JWT claim `role = 'admin' | 'analyst'` may SELECT; `admin` may INSERT/UPDATE/DELETE."
- Requires a helper SQL function `public.current_app_role()` that reads a JWT claim.

**Gate:** Defer actual rollout until admin console migration is planned. Policies can be written + tested in staging without cutover.

### Phase E — Tier 3 Explicit Deny-All Reconfirmation (Day 5, ~2h)

**Goal:** Lock down service-role-only tables with an explicit "no policies, RLS enabled, service-role bypasses" marker and DB comments so future engineers don't drift.

Tables: all Tier 3 listed above.

- Add `COMMENT ON TABLE ... IS 'TIER 3 — service-role-only. Do not add anon/authenticated policies.'` on each.
- Add a CI lint (new `.mjs` script) that fails if any Tier-3 table gains a non-service-role policy.

**Gate:** CI script passes. Documentation updated.

### Rollback strategy

Each policy is additive (`CREATE POLICY`). Rollback is `DROP POLICY ... ON {table}`. Because the direct-pg pool bypasses RLS entirely, the app is unaffected by rollback — the only surface that cares is the (not-yet-built) supabase-js anon path. Reversible in seconds via a rollback migration.

---

## Section 5 — Effort Estimate and Critical Path

| Phase | Duration | Who | Blocking? |
|---|---|---|---|
| A — Foundation | 0.5 day | Backend lead | Yes for B |
| B — Tier 1 anon SELECT | 0.75 day | Backend | Yes for future public API |
| C — Tier 4 owner policies | 0.5 day | Backend | Yes for future per-user supabase-js |
| D — Tier 2 admin policies | 0.5 day | Backend | No — deferrable |
| E — Tier 3 lockdown + lint | 0.25 day | Backend | No — hygiene |
| Testing & staging verification | 1 day | QA / backend | — |
| Buffer (edge cases, `auth.uid()` integration) | 0.5 day | — | — |

**Total: 3.5–4.5 working days.** The original "2 weeks" estimate assumed big-bang migration off direct-pg onto supabase-js with full policy rewrite of every query — that is a different (much larger) project. The RLS-policy-only scope is a fraction of that.

**Critical path:** Phase A → Phase B. Once Tier 1 is policied, the public API can safely migrate to supabase-js at leisure, which unlocks PostgREST-native rate limiting and caching.

---

## Section 6 — Open Questions / Decisions Needed

1. **Auth model unification.** The app uses HMAC-signed session cookies (not Supabase Auth). RLS policies are most natural with `auth.uid()` (a JWT claim). Do we adopt `supabase-auth` for the Pro workbench, or do we emit our own JWT with matching claims? This is the biggest architectural decision gating Phases C and D.

2. **Anon API key at the edge.** Once Tier 1 has SELECT policies, do we move `/api/v1/*` to supabase-js? Benefits: PostgREST caching, native rate limiting, less bespoke code. Costs: loss of fine-grained aggregations we compute in TypeScript today (`getNationalIndex`, etc.). Recommendation: keep the aggregations in Next.js for now, only migrate simple reads.

3. **`fees_published` vs `extracted_fees`.** The tier-3-promoted table `fees_published` is not in the 20260408 migration — its RLS status needs explicit confirmation. If we're going to expose a public fee API, this is the correct table to policy (not `extracted_fees` which is Tier 2 with pre-approval rows).

4. **`published_reports` public slug.** Is `/reports/[slug]` going to stay as a server-component page (direct pg, fine) or move to a client-fetched supabase-js page? The answer changes whether `published_reports` needs a Tier-1 or Tier-2 policy.

5. **Orphan NULL ownership rows.** Several Tier-4 tables have legacy rows with NULL `user_id`/`created_by`. Hide-or-migrate decision needed before writing owner policies.

6. **Realtime subscriptions.** Does the admin console plan to use Supabase Realtime (e.g. for live review-queue updates)? If yes, Realtime respects RLS — Phase D becomes blocking, not deferrable.

7. **Service-role key exposure in Edge Functions.** `supabase/functions/fee-lookup` uses SERVICE_ROLE_KEY. When the public API migration happens, we should reconsider — service-role bypasses all our Tier-3 protections and is overkill for a Tier-1 read.

8. **Python pipeline auth.** Long-term, should the Python crawler also move to a scoped role (e.g. `pipeline_writer`) rather than continuing as `postgres` superuser? Out of scope for the RLS phase, but a natural follow-on.

---

**Summary for the owner:** RLS-enabled-without-policies is already the posture. The work to support a safe public API launch is ~4 days of additive policy writing, not 2 weeks. The decision that actually blocks us is auth-model unification (question 1) — answer that, and the rest is mechanical.
