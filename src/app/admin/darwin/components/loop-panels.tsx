import { sql } from "@/lib/crawler-db/connection";

interface LogEvent {
  event_id: string;
  action: string;
  entity: string;
  status: string;
  created_at: string;
}

interface ReviewStats {
  ticks_24h: number;
  success_24h: number;
  errors_24h: number;
  last_tick_at: string | null;
  last_tick_status: string | null;
}

interface DissectStats {
  unpromoted_raw: number;
  low_confidence_24h: number;
  knox_rejections_24h: number;
}

interface UnderstandRow {
  canonical_fee_key: string | null;
  rejections: number;
  reasons: string | null;
}

interface ImproveRow {
  label: string;
  count: number;
  hint: string;
}

async function getLog(): Promise<LogEvent[]> {
  try {
    const rows = await sql`
      SELECT event_id::text, action, entity, status, created_at
        FROM agent_events
       WHERE agent_name = 'darwin'
       ORDER BY created_at DESC
       LIMIT 8
    `;
    return rows as unknown as LogEvent[];
  } catch {
    return [];
  }
}

async function getReview(): Promise<ReviewStats> {
  try {
    const [row] = await sql<
      {
        ticks_24h: string;
        success_24h: string;
        errors_24h: string;
        last_tick_at: string | null;
        last_tick_status: string | null;
      }[]
    >`
      SELECT
        COUNT(*)::text AS ticks_24h,
        COUNT(*) FILTER (WHERE status = 'success')::text AS success_24h,
        COUNT(*) FILTER (WHERE status = 'error')::text AS errors_24h,
        MAX(created_at) AS last_tick_at,
        (ARRAY_AGG(status ORDER BY created_at DESC))[1] AS last_tick_status
      FROM agent_events
      WHERE agent_name = 'darwin'
        AND action = 'review_tick'
        AND created_at > NOW() - INTERVAL '24 hours'
    `;
    return {
      ticks_24h: Number(row?.ticks_24h ?? 0),
      success_24h: Number(row?.success_24h ?? 0),
      errors_24h: Number(row?.errors_24h ?? 0),
      last_tick_at: row?.last_tick_at ?? null,
      last_tick_status: row?.last_tick_status ?? null,
    };
  } catch {
    return {
      ticks_24h: 0,
      success_24h: 0,
      errors_24h: 0,
      last_tick_at: null,
      last_tick_status: null,
    };
  }
}

async function getDissect(): Promise<DissectStats> {
  try {
    const [unpromoted] = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n FROM fees_raw fr
       WHERE NOT EXISTS (
         SELECT 1 FROM fees_verified fv
          WHERE fv.fee_raw_id = fr.fee_raw_id
       )
    `;
    const [lowConf] = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n FROM fees_verified
       WHERE extraction_confidence < 0.9
         AND created_at > NOW() - INTERVAL '24 hours'
    `;
    const [rejects] = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n FROM agent_messages
       WHERE sender_agent = 'knox' AND intent = 'reject'
         AND created_at > NOW() - INTERVAL '24 hours'
    `;
    return {
      unpromoted_raw: Number(unpromoted?.n ?? 0),
      low_confidence_24h: Number(lowConf?.n ?? 0),
      knox_rejections_24h: Number(rejects?.n ?? 0),
    };
  } catch {
    // Some columns (source_fee_raw_id) may not exist on older schemas;
    // degrade to zero-filled rather than exploding the whole card.
    return { unpromoted_raw: 0, low_confidence_24h: 0, knox_rejections_24h: 0 };
  }
}

async function getUnderstand(): Promise<UnderstandRow[]> {
  try {
    const rows = await sql<
      { canonical_fee_key: string | null; rejections: string; reasons: string | null }[]
    >`
      SELECT
        fv.canonical_fee_key,
        COUNT(*)::text AS rejections,
        STRING_AGG(DISTINCT NULLIF(am.payload->>'reason',''), ' · ' ORDER BY NULLIF(am.payload->>'reason','')) AS reasons
      FROM agent_messages am
      LEFT JOIN fees_verified fv
        ON fv.fee_verified_id = NULLIF(am.payload->>'fee_verified_id','')::bigint
      WHERE am.sender_agent = 'knox'
        AND am.intent = 'reject'
        AND am.created_at > NOW() - INTERVAL '30 days'
      GROUP BY fv.canonical_fee_key
      ORDER BY COUNT(*) DESC
      LIMIT 5
    `;
    return rows.map((r) => ({
      canonical_fee_key: r.canonical_fee_key,
      rejections: Number(r.rejections),
      reasons: r.reasons,
    }));
  } catch {
    return [];
  }
}

async function getImprove(): Promise<ImproveRow[]> {
  try {
    const [lessons] = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n FROM agent_lessons
       WHERE agent_name = 'darwin' AND superseded_by IS NULL
    `;
    const [overrides7d] = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n FROM knox_overrides
       WHERE decision = 'override' AND created_at > NOW() - INTERVAL '7 days'
    `;
    const [cacheLowConf] = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n FROM classification_cache
       WHERE source = 'darwin' AND COALESCE(confidence, 0) < 0.7
    `;
    return [
      {
        label: "Active lessons",
        count: Number(lessons?.n ?? 0),
        hint: "agent_lessons rows not superseded",
      },
      {
        label: "Human overrides (7d)",
        count: Number(overrides7d?.n ?? 0),
        hint: "candidates to train Darwin on",
      },
      {
        label: "Low-conf cache entries",
        count: Number(cacheLowConf?.n ?? 0),
        hint: "cache entries with confidence < 0.7",
      },
    ];
  } catch {
    return [];
  }
}

function formatAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export async function LoopPanels() {
  const [log, review, dissect, understand, improve] = await Promise.all([
    getLog(),
    getReview(),
    getDissect(),
    getUnderstand(),
    getImprove(),
  ]);

  const reviewHealthy =
    review.last_tick_at !== null && review.last_tick_status === "success";

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      {/* LOG */}
      <div className="admin-card p-4 min-h-52">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          LOG
        </div>
        <div className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-1">
          Log
        </div>
        <div className="text-[11px] text-gray-400">every action → agent_events</div>
        <ul className="mt-3 space-y-1 text-[11px] text-gray-600 dark:text-gray-400">
          {log.length === 0 && <li className="text-gray-400">No events yet.</li>}
          {log.map((e) => (
            <li key={e.event_id} className="truncate">
              <span className="text-gray-900 dark:text-gray-200">{e.action}</span>/
              {e.entity} — {e.status}
            </li>
          ))}
        </ul>
      </div>

      {/* REVIEW */}
      <div className="admin-card p-4 min-h-52">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          REVIEW
        </div>
        <div className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-1">
          Review
        </div>
        <div className="text-[11px] text-gray-400">periodic self-examination</div>
        <div className="mt-3 space-y-1.5 text-[11px]">
          <div>
            <span className="text-gray-400">Last tick:</span>{" "}
            <span
              className={`font-semibold tabular-nums ${
                reviewHealthy
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {formatAgo(review.last_tick_at)}
              {review.last_tick_status
                ? ` (${review.last_tick_status})`
                : ""}
            </span>
          </div>
          <div>
            <span className="text-gray-400">24h ticks:</span>{" "}
            <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">
              {review.ticks_24h}
            </span>{" "}
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
              {review.success_24h} ok
            </span>
            {review.errors_24h > 0 && (
              <>
                {" "}
                <span className="text-[10px] text-red-600 dark:text-red-400">
                  {review.errors_24h} err
                </span>
              </>
            )}
          </div>
          <div className="text-[10px] text-gray-400 mt-2">
            pg_cron emits hourly. Adapter in{" "}
            <code className="text-[10px]">agent_base.agent_adapters.DarwinAgent</code>.
          </div>
        </div>
      </div>

      {/* DISSECT */}
      <div className="admin-card p-4 min-h-52">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          DISSECT
        </div>
        <div className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-1">
          Dissect
        </div>
        <div className="text-[11px] text-gray-400">what was missed</div>
        <div className="mt-3 space-y-1.5 text-[11px]">
          <div className="flex justify-between">
            <span className="text-gray-500">Unpromoted fees_raw</span>
            <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">
              {dissect.unpromoted_raw.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Low-conf (&lt;0.9) 24h</span>
            <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {dissect.low_confidence_24h.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Knox rejected 24h</span>
            <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">
              {dissect.knox_rejections_24h.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* UNDERSTAND */}
      <div className="admin-card p-4 min-h-52">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          UNDERSTAND
        </div>
        <div className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-1">
          Understand
        </div>
        <div className="text-[11px] text-gray-400">
          top error patterns (30d Knox rejects)
        </div>
        <ul className="mt-3 space-y-1.5 text-[11px]">
          {understand.length === 0 && (
            <li className="text-gray-400 italic">No rejections in last 30d.</li>
          )}
          {understand.map((r, i) => (
            <li key={i} className="truncate">
              <span className="font-mono text-[10px] text-gray-700 dark:text-gray-300">
                {r.canonical_fee_key ?? "—"}
              </span>{" "}
              <span className="tabular-nums text-red-600 dark:text-red-400">
                ×{r.rejections}
              </span>
              {r.reasons && (
                <div className="text-[10px] text-gray-400 truncate">
                  {r.reasons}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* IMPROVE */}
      <div className="admin-card p-4 min-h-52">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          IMPROVE
        </div>
        <div className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-1">
          Improve
        </div>
        <div className="text-[11px] text-gray-400">update rules + knowledge</div>
        <ul className="mt-3 space-y-1.5 text-[11px]">
          {improve.length === 0 && (
            <li className="text-gray-400 italic">No improvement signals yet.</li>
          )}
          {improve.map((row, i) => (
            <li key={i}>
              <div className="flex justify-between">
                <span className="text-gray-500">{row.label}</span>
                <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                  {row.count.toLocaleString()}
                </span>
              </div>
              <div className="text-[10px] text-gray-400">{row.hint}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
