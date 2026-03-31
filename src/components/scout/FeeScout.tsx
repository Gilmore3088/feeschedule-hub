"use client";

import { useReducer, useCallback, useEffect, useState, useRef } from "react";
import type { FeeReport, AgentId, MappedFee } from "@/lib/scout/types";

// -- Constants ----------------------------------------------------------------

const AGENT_IDS: AgentId[] = ["scout", "classifier", "extractor", "analyst"];

const STEPS: { id: AgentId; n: string; label: string; desc: string }[] = [
  { id: "scout",      n: "01", label: "Database Lookup",    desc: "Searches Bank Fee Index for this institution" },
  { id: "classifier", n: "02", label: "Data Quality Check", desc: "Assesses completeness and freshness" },
  { id: "extractor",  n: "03", label: "Fee Structuring",    desc: "Maps database records to report schema" },
  { id: "analyst",    n: "04", label: "Report Synthesis",   desc: "Claude generates intelligence report" },
];

const CATS: Record<string, { label: string; color: string }> = {
  account_maintenance: { label: "Account Maintenance", color: "#1d4ed8" },
  overdraft_nsf:       { label: "Overdraft / NSF",     color: "#c44a2a" },
  atm:                 { label: "ATM",                 color: "#2d7a5f" },
  wire:                { label: "Wire Transfer",       color: "#9a6c1a" },
  card:                { label: "Card Services",       color: "#6d28d9" },
  foreign:             { label: "Foreign / FX",        color: "#0e7490" },
  other:               { label: "Other",               color: "#7a7570" },
};

// -- State machine ------------------------------------------------------------

type AgentStatus = "idle" | "running" | "ok" | "warn" | "error";

interface LogMsg {
  id: number;
  text: string;
}

interface AgentState {
  status: AgentStatus;
  data: Record<string, unknown> | null;
  ms: number | null;
  msgs: LogMsg[];
}

interface PipelineState {
  status: "idle" | "running" | "done" | "error";
  agents: Record<AgentId, AgentState>;
  report: FeeReport | null;
  error: string | null;
}

type Action =
  | { type: "RESET" }
  | { type: "STATUS"; val: PipelineState["status"] }
  | { type: "AGENT_START"; id: AgentId }
  | { type: "AGENT_DONE"; id: AgentId; ok: boolean; data: Record<string, unknown> | null; ms: number }
  | { type: "LOG"; agentId: AgentId; msg: string }
  | { type: "PIPELINE_ERROR"; msg: string }
  | { type: "REPORT"; report: FeeReport };

function mkAgent(): AgentState {
  return { status: "idle", data: null, ms: null, msgs: [] };
}

function mkState(): PipelineState {
  return {
    status: "idle",
    agents: Object.fromEntries(AGENT_IDS.map((id) => [id, mkAgent()])) as Record<AgentId, AgentState>,
    report: null,
    error: null,
  };
}

function reducer(state: PipelineState, action: Action): PipelineState {
  switch (action.type) {
    case "RESET":
      return mkState();
    case "STATUS":
      return { ...state, status: action.val };
    case "AGENT_START":
      return {
        ...state,
        agents: { ...state.agents, [action.id]: { ...mkAgent(), status: "running" } },
      };
    case "AGENT_DONE":
      return {
        ...state,
        agents: {
          ...state.agents,
          [action.id]: {
            ...state.agents[action.id],
            status: action.ok ? "ok" : "warn",
            data: action.data,
            ms: action.ms,
          },
        },
      };
    case "LOG": {
      const a = state.agents[action.agentId];
      return {
        ...state,
        agents: {
          ...state.agents,
          [action.agentId]: {
            ...a,
            msgs: [...a.msgs, { id: Date.now() + Math.random(), text: action.msg }],
          },
        },
      };
    }
    case "PIPELINE_ERROR": {
      const agents = { ...state.agents };
      AGENT_IDS.forEach((id) => {
        if (agents[id].status === "running") {
          agents[id] = { ...agents[id], status: "error" };
        }
      });
      return { ...state, agents, error: action.msg };
    }
    case "REPORT":
      return { ...state, report: action.report };
    default:
      return state;
  }
}

// -- SSE pipeline runner ------------------------------------------------------

async function runPipeline(query: string, dispatch: React.Dispatch<Action>) {
  dispatch({ type: "RESET" });
  dispatch({ type: "STATUS", val: "running" });

  try {
    const res = await fetch("/api/scout/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!res.ok || !res.body) {
      dispatch({ type: "PIPELINE_ERROR", msg: `Pipeline error: ${res.status}` });
      dispatch({ type: "STATUS", val: "error" });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const event = JSON.parse(line.slice(6));

        switch (event.type) {
          case "agent":
            if (event.status === "running") {
              dispatch({ type: "AGENT_START", id: event.agentId });
            } else {
              dispatch({
                type: "AGENT_DONE",
                id: event.agentId,
                ok: event.status === "ok",
                data: null,
                ms: event.durationMs,
              });
            }
            break;
          case "log":
            dispatch({ type: "LOG", agentId: event.agentId, msg: event.msg });
            break;
          case "report":
            dispatch({ type: "REPORT", report: event.report });
            break;
          case "error":
            dispatch({ type: "PIPELINE_ERROR", msg: event.msg });
            break;
          case "done":
            dispatch({ type: "STATUS", val: event.success ? "done" : "error" });
            break;
        }
      }
    }
  } catch (err) {
    dispatch({
      type: "PIPELINE_ERROR",
      msg: err instanceof Error ? err.message : String(err),
    });
    dispatch({ type: "STATUS", val: "error" });
  }
}

// -- Autocomplete hook --------------------------------------------------------

interface AutocompleteItem {
  id: number;
  institution_name: string;
  state: string | null;
  charter_type: string | null;
}

function useAutocomplete() {
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/scout/institutions?q=${encodeURIComponent(q.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.institutions || []);
        setOpen((data.institutions || []).length > 0);
      } catch {
        // silent
      }
    }, 300);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { suggestions, open, search, close };
}

// -- Small UI components ------------------------------------------------------

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <div
      className="shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        border: "2px solid #e8b8a6",
        borderTop: "2px solid #c44a2a",
        animation: "spin .8s linear infinite",
      }}
    />
  );
}

function Dot({ d }: { d: number }) {
  return (
    <span
      className="inline-block w-1 h-1 rounded-full bg-[#c44a2a]"
      style={{ animation: `blink 1.2s ${d * 0.25}s ease-in-out infinite` }}
    />
  );
}

function Tag({
  label,
  color = "text-gray-500",
  bg,
  border,
}: {
  label: string;
  color?: string;
  bg?: string;
  border?: string;
}) {
  return (
    <span
      className="font-mono text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-sm"
      style={{
        background: bg || `${color}14`,
        color,
        border: `1px solid ${border || color + "30"}`,
      }}
    >
      {label}
    </span>
  );
}

// -- Agent Card ---------------------------------------------------------------

interface AgentCardProps {
  step: (typeof STEPS)[number];
  agent: AgentState;
  expanded: boolean;
  onToggle: () => void;
}

function AgentCard({ step, agent, expanded, onToggle }: AgentCardProps) {
  const { status, data, ms, msgs } = agent;
  const isIdle = status === "idle";
  const isRunning = status === "running";
  const isOk = status === "ok";
  const isWarn = status === "warn";
  const isErr = status === "error";
  const isDone = isOk || isWarn;

  const accentColor = isRunning ? "#c44a2a" : isOk ? "#2d7a5f" : isWarn ? "#9a6c1a" : isErr ? "#c44a2a" : "#ddd9d0";
  const cardBgClass = isRunning
    ? "bg-red-50/60"
    : isOk
      ? "bg-emerald-50/60"
      : isWarn
        ? "bg-amber-50/60"
        : "bg-white";

  const summary =
    isDone && data
      ? (() => {
          const d = data as Record<string, unknown>;
          if (step.id === "scout") {
            const targets = d.targets as unknown[] | undefined;
            const fees = d.fees as unknown[] | undefined;
            return `${targets?.length || 0} match${(targets?.length ?? 0) !== 1 ? "es" : ""} · ${fees?.length || 0} fees`;
          }
          if (step.id === "classifier")
            return `${d.availability} availability · ${d.feeCount} records`;
          if (step.id === "extractor") {
            const fees = d.fees as unknown[] | undefined;
            return `${fees?.length || 0} fees structured · ${Math.round(((d.confidence as number) || 0) * 100)}% conf.`;
          }
          if (step.id === "analyst") {
            const cs = d.consumer_score as { score?: number } | undefined;
            return `Score ${cs?.score}/10 · ${d.data_quality}`;
          }
          return null;
        })()
      : null;

  return (
    <div
      className={`${cardBgClass} border border-gray-200 rounded-md overflow-hidden mb-2 transition-all duration-200`}
      style={{
        borderLeft: `3px solid ${accentColor}`,
        opacity: isIdle ? 0.4 : 1,
      }}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-3 px-4 py-3 ${isDone ? "cursor-pointer" : ""}`}
        onClick={() => isDone && onToggle()}
      >
        <span className="font-mono text-[10px] text-gray-400 min-w-5 shrink-0">{step.n}</span>
        {isRunning && <Spinner />}
        {isOk && <span className="text-emerald-700 text-[15px] shrink-0">&#10003;</span>}
        {isWarn && <span className="text-amber-700 text-[15px] shrink-0">&#9888;</span>}
        {isErr && <span className="text-[#c44a2a] text-[15px] shrink-0">&#10007;</span>}
        {isIdle && <span className="text-gray-400 text-[13px] shrink-0">&#9675;</span>}
        <div className="flex-1">
          <div className="font-sans font-semibold text-[13px] text-gray-900">{step.label}</div>
          {isIdle && <div className="font-sans text-[11px] text-gray-400 mt-px">{step.desc}</div>}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {ms != null && (
            <span className="font-mono text-[10px] text-gray-400">{(ms / 1000).toFixed(1)}s</span>
          )}
          {summary && <span className="font-sans text-[11px] text-emerald-700">{summary}</span>}
          {isErr && <span className="font-sans text-[11px] text-[#c44a2a]">Failed</span>}
          {isDone && <span className="text-gray-500 text-[11px]">{expanded ? "\u25B2" : "\u25BC"}</span>}
        </div>
      </div>

      {/* Live message feed */}
      {msgs.length > 0 && (isRunning || (!expanded && isDone)) && (
        <div className="border-t border-gray-200 py-2 px-4 pl-[52px]">
          {msgs.map((m, i) => {
            const isLast = i === msgs.length - 1;
            const isActive = isLast && isRunning;
            return (
              <div
                key={m.id}
                className="flex items-center gap-2 py-0.5"
                style={{ animation: "fadein .15s ease" }}
              >
                <span
                  className={`font-mono text-[10px] shrink-0 ${isActive ? "text-[#c44a2a]" : "text-gray-400"}`}
                >
                  {isActive ? "\u25B6" : "\u00B7"}
                </span>
                <span
                  className={`font-sans text-xs flex-1 leading-relaxed ${isActive ? "text-gray-900" : "text-gray-500"}`}
                >
                  {m.text}
                </span>
                {isActive && (
                  <span className="flex gap-0.5 shrink-0">
                    <Dot d={0} />
                    <Dot d={1} />
                    <Dot d={2} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && isDone && data && (
        <div
          className="border-t border-gray-200 bg-gray-50 p-4"
          style={{ animation: "fadein .2s ease" }}
        >
          {/* Activity log */}
          {msgs.length > 0 && (
            <div className="mb-4 pb-3.5 border-b border-gray-100">
              <div className="font-sans text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Activity Log
              </div>
              {msgs.map((m) => (
                <div key={m.id} className="flex gap-2 py-0.5 font-sans text-[11px] text-gray-500">
                  <span className="text-emerald-700 shrink-0">&#10003;</span>
                  <span>{m.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Agent-specific detail */}
          <AgentDetail step={step} data={data} />
        </div>
      )}
    </div>
  );
}

// -- Agent detail panels (extracted for readability) --------------------------

function AgentDetail({ step, data }: { step: (typeof STEPS)[number]; data: Record<string, unknown> }) {
  if (step.id === "scout") return <ScoutDetail data={data} />;
  if (step.id === "classifier") return <ClassifierDetail data={data} />;
  if (step.id === "extractor") return <ExtractorDetail data={data} />;
  if (step.id === "analyst") return <AnalystDetail data={data} />;
  return null;
}

function MetaGrid({ items }: { items: [string, string | undefined][] }) {
  return (
    <div className="flex gap-5 flex-wrap mb-3.5">
      {items
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <div className="font-sans text-[10px] text-gray-500 uppercase tracking-wider mb-1">{k}</div>
            <div className="font-sans text-[13px] font-medium text-gray-900 capitalize">{v}</div>
          </div>
        ))}
    </div>
  );
}

function ScoutDetail({ data }: { data: Record<string, unknown> }) {
  const inst = data.institution as Record<string, unknown> | undefined;
  const targets = data.targets as Record<string, unknown>[] | undefined;
  const primaryDocUrl = data.primaryDocUrl as string | undefined;

  return (
    <div>
      <div className="font-sans text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
        Matched Institution
      </div>
      <MetaGrid
        items={[
          ["Name", inst?.institution_name as string],
          ["DB ID", String(inst?.id)],
          ["State", inst?.state as string],
          ["Charter", inst?.charter_type as string],
          ["Fees", String((data.fees as unknown[])?.length || 0)],
          ["Crawls", String((data.crawlResults as unknown[])?.length || 0)],
        ]}
      />
      {(targets?.length ?? 0) > 1 && (
        <div className="p-2.5 px-3 bg-amber-50 border border-amber-200 rounded-md">
          <div className="font-sans text-[11px] text-amber-700 font-semibold mb-1.5">Other matches</div>
          {targets!.slice(1).map((t) => (
            <div key={t.id as number} className="font-sans text-xs text-gray-900 mb-0.5">
              &bull; {t.institution_name as string} (ID: {t.id as number})
            </div>
          ))}
        </div>
      )}
      {primaryDocUrl && (
        <div className="mt-3">
          <div className="font-sans text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
            Source Document
          </div>
          <a
            href={primaryDocUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-[#c44a2a] break-all hover:underline"
          >
            {primaryDocUrl}
          </a>
        </div>
      )}
    </div>
  );
}

function ClassifierDetail({ data }: { data: Record<string, unknown> }) {
  const categories = data.categories as string[] | undefined;
  return (
    <div>
      <MetaGrid
        items={[
          ["Availability", data.availability as string],
          ["Fee Records", String(data.feeCount)],
          ["With Amounts", String(data.hasAmounts)],
          ["Categories", String(categories?.length)],
          ["Crawl Status", data.latestCrawlStatus as string],
        ]}
      />
      {(categories?.length ?? 0) > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {categories!.map((c) => (
            <Tag key={c} label={c.replace(/_/g, " ")} color="#c44a2a" />
          ))}
        </div>
      )}
    </div>
  );
}

function ExtractorDetail({ data }: { data: Record<string, unknown> }) {
  const fees = data.fees as { name: string; amount: string }[] | undefined;
  return (
    <div>
      <MetaGrid
        items={[
          ["Records", String(fees?.length || 0)],
          ["Confidence", `${Math.round(((data.confidence as number) || 0) * 100)}%`],
          ["Source", data.source_type as string],
          ["As Of", data.knowledge_date as string],
        ]}
      />
      {(fees?.length ?? 0) > 0 && (
        <>
          <div className="font-sans text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Fee Preview (first 8)
          </div>
          {fees!.slice(0, 8).map((f, i) => (
            <div
              key={i}
              className={`flex justify-between items-center px-2.5 py-1.5 rounded-sm text-xs ${i % 2 ? "bg-white" : "bg-gray-50"}`}
            >
              <span className="font-sans text-gray-900">{f.name}</span>
              <span className="font-mono text-[#c44a2a] font-medium ml-3">{f.amount}</span>
            </div>
          ))}
          {fees!.length > 8 && (
            <div className="font-sans text-[11px] text-gray-500 mt-1.5">
              +{fees!.length - 8} more in the full report below
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AnalystDetail({ data }: { data: Record<string, unknown> }) {
  const cs = data.consumer_score as { score?: number; label?: string } | undefined;
  return (
    <div className="flex gap-6 flex-wrap">
      {(
        [
          ["Quality", data.data_quality as string],
          ["Score", `${cs?.score}/10`],
          ["Rating", cs?.label],
        ] as [string, string | undefined][]
      )
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <div className="font-sans text-[10px] text-gray-500 uppercase tracking-wider mb-1">{k}</div>
            <div className="font-sans text-[13px] font-medium text-gray-900 capitalize">{v}</div>
          </div>
        ))}
    </div>
  );
}

// -- Score Ring ----------------------------------------------------------------

function ScoreRing({ score = 5 }: { score?: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const color = score >= 7 ? "#2d7a5f" : score >= 4 ? "#9a6c1a" : "#c44a2a";
  const label = score >= 7 ? "Fee-Competitive" : score >= 4 ? "Market Average" : "Above Market";

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-16 h-16 shrink-0">
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#ddd9d0" strokeWidth="5" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - score / 10)}
            strokeLinecap="round"
            transform="rotate(-90 32 32)"
            style={{ transition: "stroke-dashoffset 1s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono font-medium text-lg text-gray-900">{score}</span>
        </div>
      </div>
      <div>
        <div className="font-sans font-semibold text-[15px]" style={{ color }}>
          {label}
        </div>
        <div className="font-sans text-[11px] text-gray-500 mt-0.5">out of 10 -- consumer friendliness</div>
      </div>
    </div>
  );
}

// -- Fee Table ----------------------------------------------------------------

function FeeTable({ categories }: { categories: Record<string, MappedFee[]> | undefined }) {
  const rows = Object.entries(categories || {}).flatMap(([cat, fees]) =>
    (fees || []).map((f) => ({ ...f, _cat: cat })),
  );

  if (!rows.length) {
    return <div className="p-5 font-sans text-[13px] text-gray-500">No fee records in this category.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-gray-50/80">
            {["Category", "Fee Name", "Amount", "Waivable", "Conditions"].map((h) => (
              <th
                key={h}
                className="text-left px-4 py-2.5 font-sans text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((f, i) => {
            const cm = CATS[f._cat] || CATS.other;
            return (
              <tr key={i} className={`border-b border-gray-100 ${i % 2 ? "bg-gray-50" : "bg-white"}`}>
                <td className="px-4 py-2.5">
                  <span
                    className="font-mono text-[10px] px-2 py-0.5 rounded-sm whitespace-nowrap"
                    style={{
                      background: `${cm.color}12`,
                      color: cm.color,
                      border: `1px solid ${cm.color}28`,
                    }}
                  >
                    {cm.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-sans font-medium text-gray-900">{f.name || "\u2014"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-[#c44a2a] font-medium whitespace-nowrap">
                  {f.amount || "\u2014"}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={`font-sans text-xs ${f.waivable ? "font-semibold text-emerald-700" : "text-gray-400"}`}
                  >
                    {f.waivable ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-sans text-xs text-gray-500">{f.conditions || "\u2014"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// -- Full Report --------------------------------------------------------------

function Report({ report }: { report: FeeReport }) {
  const qColor: Record<string, string> = {
    excellent: "#2d7a5f",
    good: "#1d4ed8",
    partial: "#9a6c1a",
    limited: "#c44a2a",
  };
  const qBg: Record<string, string> = {
    excellent: "#eaf4f0",
    good: "#eff6ff",
    partial: "#fdf6e3",
    limited: "#fdf0ec",
  };

  const qualColor = qColor[report.data_quality] || "#7a7570";
  const qualBg = qBg[report.data_quality] || "#faf8f4";

  return (
    <div style={{ animation: "fadein .5s ease" }}>
      {/* Report header */}
      <div className="bg-white border border-gray-200 rounded-lg px-6 py-5 mb-3">
        <div className="font-sans text-[10px] text-gray-500 uppercase tracking-widest mb-2.5">
          Fee Intelligence Report -- Bank Fee Index
        </div>
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h2 className="font-serif text-2xl text-gray-900 tracking-tight mb-2.5">{report.institution}</h2>
            <div className="flex gap-2 flex-wrap items-center">
              <Tag label={report.source_summary?.type || "database"} color="#c44a2a" />
              <Tag label="verified" color="#2d7a5f" bg="#eaf4f0" border="#a8d4c4" />
              {report.source_summary?.as_of && (
                <span className="font-sans text-[11px] text-gray-500">
                  data as of {report.source_summary.as_of}
                </span>
              )}
              {report.source_summary?.url && (
                <a
                  href={report.source_summary.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-sans text-[11px] text-[#c44a2a] hover:underline"
                >
                  View source document &#8599;
                </a>
              )}
            </div>
          </div>
          <div
            className="rounded-md px-4 py-3 text-center shrink-0"
            style={{ background: qualBg, border: `1px solid ${qualColor}33` }}
          >
            <div className="font-sans text-[10px] text-gray-500 uppercase tracking-widest mb-1">Data Quality</div>
            <div className="font-sans font-semibold text-sm capitalize" style={{ color: qualColor }}>
              {report.data_quality}
            </div>
          </div>
        </div>
      </div>

      {/* Score + Verdict */}
      <div className="flex gap-3 mb-3 flex-wrap">
        <div className="flex-1 min-w-[220px] bg-white border border-gray-200 rounded-lg px-5 py-5">
          <div className="font-sans text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3.5">
            Consumer Score
          </div>
          <ScoreRing score={report.consumer_score?.score || 5} />
          {report.consumer_score?.rationale && (
            <p className="font-sans text-xs text-gray-500 mt-3.5 leading-relaxed">
              {report.consumer_score.rationale}
            </p>
          )}
        </div>
        <div className="flex-[2] min-w-[300px] bg-white border border-gray-200 rounded-lg px-5 py-5">
          <div className="font-sans text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3.5">
            Analyst Verdict
          </div>
          <p className="font-sans text-sm text-gray-900 leading-relaxed">{report.verdict}</p>
          {report.peer_context && (
            <p className="font-sans text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100 leading-relaxed italic">
              {report.peer_context}
            </p>
          )}
        </div>
      </div>

      {/* Highlights / Warnings / Tips */}
      <div className="flex gap-3 mb-3 flex-wrap">
        {[
          {
            key: "h",
            label: "Strengths",
            items: report.highlights || [],
            color: "#2d7a5f",
            bgClass: "bg-emerald-50",
            borderColor: "#a8d4c4",
            icon: "\u2191",
          },
          {
            key: "w",
            label: "Watch Out For",
            items: report.warnings || [],
            color: "#c44a2a",
            bgClass: "bg-red-50",
            borderColor: "#e8b8a6",
            icon: "\u2193",
          },
        ].map(({ key, label, items, color, bgClass, borderColor, icon }) => (
          <div
            key={key}
            className={`flex-1 min-w-[200px] ${bgClass} rounded-lg px-4 py-4`}
            style={{ border: `1px solid ${borderColor}` }}
          >
            <div
              className="font-sans text-[10px] font-semibold uppercase tracking-wider mb-3"
              style={{ color }}
            >
              {label}
            </div>
            {!items.length && <p className="font-sans text-xs text-gray-500">None identified.</p>}
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <span className="font-mono text-xs shrink-0 mt-0.5" style={{ color }}>
                  {icon}
                </span>
                <span className="font-sans text-[13px] text-gray-900 leading-normal">{item}</span>
              </div>
            ))}
          </div>
        ))}
        {(report.tips || []).length > 0 && (
          <div className="flex-1 min-w-[200px] bg-white border border-gray-200 rounded-lg px-4 py-4">
            <div className="font-sans text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Savings Strategies
            </div>
            {report.tips.map((tip, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <span className="font-mono text-[11px] text-[#c44a2a] shrink-0 mt-0.5">{i + 1}.</span>
                <span className="font-sans text-[13px] text-gray-900 leading-normal">{tip}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fee Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-200 flex justify-between items-center">
          <span className="font-sans font-semibold text-[13px] text-gray-900">Extracted Fee Schedule</span>
          {report.source_summary?.url && (
            <a
              href={report.source_summary.url}
              target="_blank"
              rel="noreferrer"
              className="font-sans text-xs text-[#c44a2a] hover:underline"
            >
              View source document &#8599;
            </a>
          )}
        </div>
        <FeeTable categories={report.fee_categories} />
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 font-sans text-[11px] text-gray-400">
          Data sourced from Bank Fee Index database.
        </div>
      </div>
    </div>
  );
}

// -- Main FeeScout component --------------------------------------------------

export default function FeeScout() {
  const [state, dispatch] = useReducer(reducer, undefined, mkState);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { suggestions, open, search, close } = useAutocomplete();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleRun = useCallback(async () => {
    if (!query.trim() || state.status === "running") return;
    close();
    setExpanded({});
    await runPipeline(query.trim(), dispatch);
  }, [query, state.status, close]);

  const handleSelect = useCallback(
    (name: string) => {
      setQuery(name);
      close();
      inputRef.current?.focus();
    },
    [close],
  );

  const { status, agents, report, error } = state;
  const isRunning = status === "running";
  const isActive = status !== "idle";

  return (
    <div>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes blink  { 0%,100%{opacity:.15} 50%{opacity:1} }
        @keyframes fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
      `}</style>

      {/* Search bar */}
      <div className="max-w-xl mx-auto mb-8 relative">
        <div
          className={`flex bg-white border rounded-lg overflow-hidden transition-all duration-200 ${
            isRunning ? "border-[#c44a2a] ring-2 ring-red-100" : "border-gray-200 shadow-sm"
          }`}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              search(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                close();
                handleRun();
              }
              if (e.key === "Escape") close();
            }}
            onFocus={() => {
              if (query.trim().length >= 2) search(query);
            }}
            onBlur={() => {
              // Delay to allow click on suggestion
              setTimeout(close, 200);
            }}
            placeholder="Enter institution name -- e.g. Chase, Ally Bank..."
            disabled={isRunning}
            className="flex-1 border-none outline-none bg-transparent px-4 py-3.5 text-[15px] text-gray-900 placeholder:text-gray-400 disabled:opacity-60"
          />
          <button
            onClick={handleRun}
            disabled={isRunning || !query.trim()}
            className={`px-6 text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-all duration-200 border-none cursor-pointer disabled:cursor-not-allowed ${
              isRunning || !query.trim()
                ? "bg-gray-200 text-gray-500"
                : "bg-[#c44a2a] text-white hover:bg-[#a83d22]"
            }`}
          >
            {isRunning && <Spinner size={13} />}
            {isRunning ? "Running..." : "Run Analysis"}
          </button>
        </div>

        {/* Autocomplete dropdown */}
        {open && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="w-full text-left px-4 py-2.5 font-sans text-sm text-gray-900 hover:bg-gray-50 transition-colors flex items-center justify-between border-none bg-transparent cursor-pointer"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(s.institution_name);
                }}
              >
                <span className="font-medium">{s.institution_name}</span>
                <span className="text-[11px] text-gray-400">
                  {[s.state, s.charter_type].filter(Boolean).join(" -- ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pipeline cards */}
      {isActive && (
        <div className="mb-7">
          <div className="font-sans text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2.5">
            Analysis Pipeline
          </div>
          {STEPS.map((step) => (
            <AgentCard
              key={step.id}
              step={step}
              agent={agents[step.id]}
              expanded={!!expanded[step.id]}
              onToggle={() => setExpanded((e) => ({ ...e, [step.id]: !e[step.id] }))}
            />
          ))}
          {!isRunning && isActive && (
            <div className="font-sans text-[11px] text-gray-400 text-right mt-1.5">
              Click any completed step to inspect its output
            </div>
          )}
        </div>
      )}

      {/* Report */}
      {report && <Report report={report} />}

      {/* Error */}
      {status === "error" && !report && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-4">
          <div className="font-sans font-semibold text-[13px] text-[#c44a2a] mb-2">Analysis Error</div>
          <div className="font-mono text-xs text-gray-900 leading-relaxed">{error}</div>
        </div>
      )}

      {/* Idle state stats */}
      {!isActive && (
        <div className="text-center py-11">
          <div className="inline-flex gap-9 flex-wrap justify-center">
            {(
              [
                ["8,000+", "institutions"],
                ["49", "fee categories"],
                ["live", "database"],
                ["verified", "sources"],
              ] as [string, string][]
            ).map(([val, label]) => (
              <div key={label} className="text-center">
                <div className="font-serif text-3xl text-[#c44a2a] tracking-tight">{val}</div>
                <div className="font-sans text-xs text-gray-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
