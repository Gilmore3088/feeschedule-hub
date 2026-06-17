"use client";

import { useState, useTransition } from "react";
import {
  triggerAtlasForState,
  triggerExtractBatch,
  triggerHistoricalBackfillDryRun,
  triggerLocalDiscovery,
  triggerLocalDispatcher,
  triggerLocalTestConnection,
  triggerStats,
  type CommandResult,
} from "./actions";

function ResultPane({ result }: { result: CommandResult | null }) {
  if (!result) return null;
  return (
    <div
      className={`mt-3 rounded border px-3 py-2 text-[12px] font-mono ${
        result.ok
          ? "border-emerald-200 bg-emerald-50/40 text-emerald-900"
          : "border-red-200 bg-red-50/40 text-red-900"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider opacity-70 mb-1">
        {result.ok ? "✓ ok" : "✗ failed"} · {result.cmd ?? ""}
        {typeof result.duration_ms === "number" &&
          ` · ${result.duration_ms}ms`}
        {typeof result.status === "number" && ` · status ${result.status}`}
      </div>
      {result.error && <div className="text-red-700">{result.error}</div>}
      {result.stdout && (
        <pre className="whitespace-pre-wrap break-all">{result.stdout}</pre>
      )}
      {result.stderr && (
        <pre className="whitespace-pre-wrap break-all opacity-70 mt-2">
          {result.stderr}
        </pre>
      )}
    </div>
  );
}

function ActionButton({
  label,
  hint,
  onClick,
  result,
  isPending,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  result: CommandResult | null;
  isPending: boolean;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-stone-900 text-sm">{label}</div>
          {hint && <div className="text-[11px] text-stone-500 mt-0.5">{hint}</div>}
        </div>
        <button
          onClick={onClick}
          disabled={isPending}
          className="shrink-0 rounded-md bg-stone-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {isPending ? "Running…" : "Run"}
        </button>
      </div>
      <ResultPane result={result} />
    </div>
  );
}

export function CommandControls() {
  const [results, setResults] = useState<Record<string, CommandResult | null>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [stateCode, setStateCode] = useState("TX");
  const [batchSize, setBatchSize] = useState(25);

  function go(key: string, action: () => Promise<CommandResult>) {
    setPending((p) => ({ ...p, [key]: true }));
    setResults((r) => ({ ...r, [key]: null }));
    action()
      .then((res) => setResults((r) => ({ ...r, [key]: res })))
      .catch((err) =>
        setResults((r) => ({
          ...r,
          [key]: { ok: false, error: String(err) },
        })),
      )
      .finally(() => setPending((p) => ({ ...p, [key]: false })));
  }

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-700 mb-3">
        Live actions
      </h2>
      <p className="text-[12px] text-stone-600 mb-4">
        Each button triggers a real action via the admin server action layer.
        Local commands run on the Next.js server; Modal commands POST to the
        deployed Modal app (requires <code>BFI_MODAL_WORKERS_BASE_URL</code>).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ActionButton
          label="DB sanity check"
          hint="Local · python -m fee_crawler stats"
          isPending={!!pending.stats}
          result={results.stats ?? null}
          onClick={() => go("stats", triggerStats)}
        />
        <ActionButton
          label="Test DB connection (Modal cron body, local)"
          hint="Local · run_cron test_connection"
          isPending={!!pending.testconn}
          result={results.testconn ?? null}
          onClick={() => go("testconn", triggerLocalTestConnection)}
        />
        <ActionButton
          label="One per-minute dispatcher tick"
          hint="Local · runs the full run_post_processing body (atlas, darwin inbox, knox summary, hamilton digests, etc.)"
          isPending={!!pending.dispatch}
          result={results.dispatch ?? null}
          onClick={() => go("dispatch", triggerLocalDispatcher)}
        />
        <ActionButton
          label="URL discovery sweep"
          hint="Local · run_cron run_discovery (long-running; can take minutes)"
          isPending={!!pending.disc}
          result={results.disc ?? null}
          onClick={() => go("disc", triggerLocalDiscovery)}
        />
        <ActionButton
          label="Historical backfill dry-run"
          hint="Local · enumerates FDIC SDP snapshots in window without fetching"
          isPending={!!pending.hb}
          result={results.hb ?? null}
          onClick={() => go("hb", triggerHistoricalBackfillDryRun)}
        />
      </div>

      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-stone-700 mt-6 mb-3">
        Modal-triggered (require deploy)
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="font-medium text-stone-900 text-sm">Run Atlas for one state</div>
          <div className="text-[11px] text-stone-500 mt-0.5">
            Modal · POST atlas_dispatch with only_states + force=true
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="TX"
              className="w-16 rounded border border-stone-300 px-2 py-1 text-sm font-mono uppercase"
            />
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value || "25", 10))}
              min={1}
              max={500}
              className="w-20 rounded border border-stone-300 px-2 py-1 text-sm tabular-nums"
            />
            <button
              onClick={() => go("atlas", () => triggerAtlasForState(stateCode, batchSize))}
              disabled={!!pending.atlas}
              className="ml-auto rounded-md bg-stone-900 px-3 py-1 text-[12px] font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {pending.atlas ? "Running…" : "Run"}
            </button>
          </div>
          <ResultPane result={results.atlas ?? null} />
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="font-medium text-stone-900 text-sm">Bulk extraction</div>
          <div className="text-[11px] text-stone-500 mt-0.5">
            Modal · POST extract_batch_endpoint (size + doc_type)
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value || "25", 10))}
              min={1}
              max={500}
              className="w-20 rounded border border-stone-300 px-2 py-1 text-sm tabular-nums"
            />
            <button
              onClick={() => go("extract_pdf", () => triggerExtractBatch(batchSize, "pdf"))}
              disabled={!!pending.extract_pdf}
              className="ml-auto rounded-md bg-stone-900 px-3 py-1 text-[12px] font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {pending.extract_pdf ? "Running…" : "PDF"}
            </button>
            <button
              onClick={() => go("extract_html", () => triggerExtractBatch(batchSize, "html"))}
              disabled={!!pending.extract_html}
              className="rounded-md bg-stone-700 px-3 py-1 text-[12px] font-medium text-white hover:bg-stone-600 disabled:opacity-50"
            >
              {pending.extract_html ? "Running…" : "HTML"}
            </button>
          </div>
          <ResultPane result={results.extract_pdf ?? null} />
          <ResultPane result={results.extract_html ?? null} />
        </div>
      </div>
    </section>
  );
}
