/**
 * /admin/command — Operator Command Center.
 *
 * Single-pane view for verifying the system is alive + driving each
 * agent. Designed to answer the founder's question: "is anything
 * actually happening?"
 *
 * Read paths: existing crawler-db query layer (no Modal needed; works
 * straight against Supabase). Action paths: copy-paste commands +
 * Modal endpoint URLs — we don't run subprocesses from a web request
 * (too risky in prod), but we surface the exact command the operator
 * needs to run.
 */

import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";
import { getCoverageSummary } from "@/lib/crawler-db/coverage";
import { getJobFreshness } from "@/lib/admin-queries";
import { CommandControls } from "./controls";

export const dynamic = "force-dynamic";

// ─── data fetchers (server-side) ─────────────────────────────────────

async function getTierCounts(): Promise<{
  fees_raw: number;
  fees_verified: number;
  fees_published_live: number;
  fees_published_total: number;
}> {
  // Each tier counted separately so a transient query failure on one
  // doesn't blank the whole page.
  const [raw] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM fees_raw`.catch(() => [{ n: 0 }] as { n: number }[]);
  const [verified] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM fees_verified`.catch(() => [{ n: 0 }] as { n: number }[]);
  const [pubLive] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM fees_published WHERE rolled_back_at IS NULL
  `.catch(() => [{ n: 0 }] as { n: number }[]);
  const [pubTotal] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM fees_published`.catch(() => [{ n: 0 }] as { n: number }[]);
  return {
    fees_raw: raw?.n ?? 0,
    fees_verified: verified?.n ?? 0,
    fees_published_live: pubLive?.n ?? 0,
    fees_published_total: pubTotal?.n ?? 0,
  };
}

interface AgentRow {
  agent_name: string;
  role: string;
  is_active: boolean;
  per_day_limit_cents: number | null;
  per_day_spent_cents: number | null;
  per_day_halted_at: string | null;
  events_last_24h: number;
  latest_event_at: string | null;
}

async function getAgentBoard(): Promise<AgentRow[]> {
  try {
    // All timestamps cast to text in SQL so the TS layer doesn't need to
    // know whether postgres-js returns Date or string — the page just
    // .slice()s a string in both cases.
    const rows = await sql<AgentRow[]>`
      SELECT
        r.agent_name,
        r.role,
        r.is_active,
        bd.limit_cents::int          AS per_day_limit_cents,
        bd.spent_cents::int          AS per_day_spent_cents,
        bd.halted_at::text           AS per_day_halted_at,
        COALESCE(e.recent_count, 0)  AS events_last_24h,
        e.latest_at::text            AS latest_event_at
      FROM agent_registry r
      LEFT JOIN agent_budgets bd
        ON bd.agent_name = r.agent_name AND bd.budget_window = 'per_day'
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS recent_count, MAX(created_at) AS latest_at
          FROM agent_events
         WHERE agent_name = r.agent_name
           AND created_at > NOW() - INTERVAL '24 hours'
      ) e ON TRUE
      WHERE r.role <> 'state_agent'
      ORDER BY r.role, r.agent_name
    `;
    return rows;
  } catch {
    return [];
  }
}

async function getRecentEvents(): Promise<
  { event_id: string; agent_name: string; action: string; status: string; created_at: string }[]
> {
  try {
    return await sql<
      { event_id: string; agent_name: string; action: string; status: string; created_at: string }[]
    >`
      SELECT event_id::text, agent_name, action, status, created_at::text
        FROM agent_events
        ORDER BY created_at DESC
        LIMIT 20
    `;
  } catch {
    return [];
  }
}

async function getLessons(): Promise<
  { agent_name: string; lesson_name: string; description: string; created_at: string }[]
> {
  try {
    return await sql<
      { agent_name: string; lesson_name: string; description: string; created_at: string }[]
    >`
      SELECT agent_name, lesson_name, description, created_at::text
        FROM agent_lessons
        WHERE superseded_by IS NULL
        ORDER BY created_at DESC
        LIMIT 10
    `;
  } catch {
    return [];
  }
}

// ─── UI components ───────────────────────────────────────────────────

function StatTile({
  label, value, sub, tone = "neutral",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  const toneClass = {
    neutral: "border-stone-200 bg-white",
    ok: "border-emerald-200 bg-emerald-50/60",
    warn: "border-amber-200 bg-amber-50/60",
    bad: "border-red-200 bg-red-50/60",
  }[tone];
  return (
    <div className={`rounded-lg border ${toneClass} p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-stone-900 tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="block whitespace-pre-wrap rounded bg-stone-50 border border-stone-200 px-3 py-2 text-[12px] font-mono text-stone-800 leading-relaxed">
      {children}
    </code>
  );
}

// ─── page ────────────────────────────────────────────────────────────

export default async function CommandCenterPage() {
  await requireAuth("view");

  const [tiers, agents, events, lessons, coverage, freshness] = await Promise.all([
    getTierCounts(),
    getAgentBoard(),
    getRecentEvents(),
    getLessons(),
    getCoverageSummary().catch(() => ({
      total_states: 0, states_with_full_coverage: 0, states_with_url_gap: 0,
      states_with_publish_gap: 0, median_url_pct: 0, median_publish_pct: 0,
    })),
    getJobFreshness().catch(() => ({ ok_count: 0, jobs: [] as Array<{
      job_name: string; display_name: string; status: string;
      last_completed_at: string | null; hours_since: number | null;
      expected_within_hours: number;
    }> })),
  ]);

  const promotionPct =
    tiers.fees_raw > 0
      ? Math.round((tiers.fees_verified / tiers.fees_raw) * 10000) / 100
      : 0;
  const publishPct =
    tiers.fees_verified > 0
      ? Math.round((tiers.fees_published_live / tiers.fees_verified) * 10000) / 100
      : 0;

  const staleCount = freshness.jobs.filter(
    (j) => j.status === "stale" || j.status === "never_ran",
  ).length;
  const everRanCount = freshness.jobs.filter((j) => j.last_completed_at).length;
  const liveStatus: "live" | "setup" | "outage" =
    everRanCount === 0 ? "setup"
    : staleCount === 0 ? "live"
    : "outage";

  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">Command Center</h1>
        <p className="text-sm text-stone-600 mt-1">
          Operator pane for verifying the system is running + driving each agent.
        </p>
      </header>

      {/* ── Live status banner ─────────────────────────────────────── */}
      {liveStatus === "live" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800">
          🟢 <strong>Pipeline live.</strong> All {freshness.jobs.length} scheduled jobs ran within their expected window.
        </div>
      )}
      {liveStatus === "setup" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
          🟡 <strong>Setup in progress.</strong> Scheduled jobs are registered but none have run yet.
          See the operator checklist below to bring the pipeline live.
        </div>
      )}
      {liveStatus === "outage" && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-800">
          🔴 <strong>{staleCount} of {freshness.jobs.length} jobs stale.</strong> See pipeline section below.
        </div>
      )}

      {/* ── Tier counts ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-700 mb-3">
          Data pipeline
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatTile label="Tier 1 fees_raw" value={tiers.fees_raw.toLocaleString()}
                    sub="extracted by Magellan + extractor" />
          <StatTile label="Tier 2 fees_verified" value={tiers.fees_verified.toLocaleString()}
                    sub={`${promotionPct}% promoted from raw`}
                    tone={promotionPct < 5 ? "bad" : promotionPct < 50 ? "warn" : "ok"} />
          <StatTile label="Tier 3 fees_published (live)" value={tiers.fees_published_live.toLocaleString()}
                    sub={`${publishPct}% promoted from verified`}
                    tone={publishPct < 10 ? "bad" : publishPct < 50 ? "warn" : "ok"} />
          <StatTile label="States with publish coverage" value={`${coverage.states_with_full_coverage}/${coverage.total_states}`}
                    sub={`median publish ${coverage.median_publish_pct}%`}
                    tone={coverage.states_with_full_coverage === 0 ? "bad"
                          : coverage.states_with_full_coverage < 25 ? "warn" : "ok"} />
        </div>
      </section>

      {/* ── Agent board ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-700 mb-3">
          Agents ({agents.length})
        </h2>
        <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-stone-600 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">Agent</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Active</th>
                <th className="px-3 py-2 text-right">Per-day spent</th>
                <th className="px-3 py-2 text-right">Cap</th>
                <th className="px-3 py-2 text-right">Events 24h</th>
                <th className="px-3 py-2 text-left">Latest event</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-stone-500 italic">
                  No agents registered. Apply migrations + reseed agent_registry.
                </td></tr>
              )}
              {agents.map((a) => {
                const spent = a.per_day_spent_cents ?? 0;
                const limit = a.per_day_limit_cents ?? 0;
                const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
                return (
                  <tr key={a.agent_name} className="border-t border-stone-100">
                    <td className="px-3 py-2 font-mono text-stone-800">{a.agent_name}</td>
                    <td className="px-3 py-2 text-stone-600">{a.role}</td>
                    <td className="px-3 py-2">{a.is_active ? "✓" : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      ${(spent / 100).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {limit > 0 ? `$${(limit / 100).toFixed(2)} (${pct}%)` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {a.events_last_24h.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-stone-500 text-[11px]">
                      {a.latest_event_at ? String(a.latest_event_at).slice(0, 19) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Operator checklist (the "why isn't it live" panel) ─────── */}
      <section className="rounded-lg border border-stone-200 bg-stone-50 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-700 mb-3">
          Operator checklist — bring it live
        </h2>
        <ol className="space-y-3 text-sm text-stone-800">
          <li>
            <strong>1. Apply pending migrations.</strong>
            <Code>{`node scripts/apply-migration.mjs --dry-run    # preview
node scripts/apply-migration.mjs --pending    # apply`}</Code>
          </li>
          <li>
            <strong>2. Deploy to Modal.</strong> Requires{" "}
            <code className="font-mono">bfi-secrets</code> populated (DATABASE_URL,
            R2_*, ANTHROPIC_API_KEY, FRED_API_KEY).
            <Code>{`bash scripts/modal-deploy.sh                  # validates env, deploys app`}</Code>
          </li>
          <li>
            <strong>3. Raise Darwin daily cap.</strong> Default $5 → recommended $30 to drain 103K backlog in ~6 days.
            <Code>{`# Set in Modal secret bfi-secrets:
DARWIN_DAILY_COST_LIMIT_USD=30`}</Code>
          </li>
          <li>
            <strong>4. Verify cron is firing.</strong> Watch the Pipeline tab; the
            every-minute dispatcher writes <code className="font-mono">workers_last_run</code> after each tick.
          </li>
          <li>
            <strong>5. (Optional) Smoke-test from your laptop.</strong>
            <Code>{`# Pick the stalest state and run extraction for it:
curl -X POST "$(modal url bank-fee-index-workers atlas_dispatch)" \\
  -H "Content-Type: application/json" \\
  -d '{"states_per_tick":1,"size_per_state":10,"force":true}'`}</Code>
          </li>
        </ol>
      </section>

      {/* ── Recent agent events ────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-700 mb-3">
          Recent agent_events (last 20)
        </h2>
        <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-stone-600 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Agent</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-stone-500 italic">
                  No agent events yet — the pipeline hasn&apos;t fired any tools.
                </td></tr>
              )}
              {events.map((e) => (
                <tr key={e.event_id} className="border-t border-stone-100">
                  <td className="px-3 py-2 text-stone-500 text-[11px]">{String(e.created_at).slice(0, 19)}</td>
                  <td className="px-3 py-2 font-mono text-stone-800">{e.agent_name}</td>
                  <td className="px-3 py-2 text-stone-600">{e.action}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${
                      e.status === "success" ? "bg-emerald-50 text-emerald-700"
                      : e.status === "health_alert" ? "bg-red-50 text-red-700"
                      : e.status === "budget_halt" ? "bg-red-50 text-red-700"
                      : e.status === "improve_rejected" ? "bg-amber-50 text-amber-700"
                      : "bg-stone-100 text-stone-600"
                    }`}>
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Latest lessons ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-700 mb-3">
          Latest agent_lessons (LOOP-05 output)
        </h2>
        <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-stone-600 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">Agent</th>
                <th className="px-3 py-2 text-left">Lesson</th>
                <th className="px-3 py-2 text-left">Narrative</th>
                <th className="px-3 py-2 text-left">When</th>
              </tr>
            </thead>
            <tbody>
              {lessons.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-stone-500 italic">
                  No lessons yet — the LOOP-04→07 review_tick hasn&apos;t produced any.
                </td></tr>
              )}
              {lessons.map((l) => (
                <tr key={`${l.agent_name}-${l.lesson_name}`} className="border-t border-stone-100">
                  <td className="px-3 py-2 font-mono text-stone-800">{l.agent_name}</td>
                  <td className="px-3 py-2 text-stone-700 text-[12px]">{l.lesson_name}</td>
                  <td className="px-3 py-2 text-stone-600 text-[12px]">{l.description}</td>
                  <td className="px-3 py-2 text-stone-500 text-[11px]">{String(l.created_at).slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Interactive controls ───────────────────────────────────── */}
      <CommandControls />

      {/* ── Manual triggers (copy-pasteable curl) ──────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-700 mb-3">
          Manual triggers (from your terminal)
        </h2>
        <p className="text-[12px] text-stone-600 mb-3">
          For safety, this UI doesn&apos;t fire actions directly — too risky on
          shared infra. Copy the commands you need; each one is bounded by
          its own per-day budget cap so they can&apos;t blow the bank.
        </p>
        <div className="space-y-4">
          <div>
            <div className="text-[12px] font-semibold text-stone-700 mb-1">Run extraction for one state (Atlas)</div>
            <Code>{`curl -X POST "$(modal url bank-fee-index-workers atlas_dispatch)" \\
  -H "Content-Type: application/json" \\
  -d '{"states_per_tick":1,"size_per_state":100,"only_states":["TX"],"force":true}'`}</Code>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-stone-700 mb-1">Bulk-extract PDFs (extractor)</div>
            <Code>{`curl -X POST "$(modal url bank-fee-index-workers extract_batch_endpoint)" \\
  -H "Content-Type: application/json" \\
  -d '{"size":50,"document_type":"pdf","include_failing":true}'`}</Code>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-stone-700 mb-1">Drain Darwin (one batch)</div>
            <Code>{`modal run fee_crawler/modal_app.py::darwin_nightly_drain`}</Code>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-stone-700 mb-1">Local dev (Modal not required)</div>
            <Code>{`python -m fee_crawler run-cron run_post_processing   # full per-minute tick
python -m fee_crawler run-cron run_discovery          # URL discovery
python -m fee_crawler run-cron test_connection         # DB sanity`}</Code>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-stone-700 mb-1">Pipeline health snapshot (SQL)</div>
            <Code>{`SELECT job_name, completed_at, status,
       ROUND(EXTRACT(EPOCH FROM (NOW() - completed_at))/3600.0, 1) AS hours_ago
  FROM workers_last_run
 ORDER BY completed_at DESC NULLS LAST;`}</Code>
          </div>
        </div>
      </section>
    </section>
  );
}
