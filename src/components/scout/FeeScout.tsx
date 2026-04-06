"use client";

import { useReducer, useCallback, useEffect, useState, useRef } from "react";
import type { FeeReport, AgentId, MappedFee } from "@/lib/scout/types";
import type { AuditAgentId, AuditResult, BatchSummary } from "@/lib/scout/audit-types";
import type { AgentRun } from "@/lib/scout/agent-types";

// -- Constants ----------------------------------------------------------------

const AGENT_IDS: AgentId[] = ["scout", "classifier", "extractor", "analyst"];

const STEPS: { id: AgentId; n: string; label: string; desc: string }[] = [
  { id: "scout",      n: "01", label: "Database Lookup",    desc: "Searches Bank Fee Index for this institution" },
  { id: "classifier", n: "02", label: "Data Quality Check", desc: "Assesses completeness and freshness" },
  { id: "extractor",  n: "03", label: "Fee Structuring",    desc: "Maps database records to report schema" },
  { id: "analyst",    n: "04", label: "Report Synthesis",   desc: "Claude generates intelligence report" },
];

// -- Audit constants ----------------------------------------------------------

const AUDIT_AGENT_IDS: AuditAgentId[] = ["validator", "discoverer", "ai_scout", "reporter"];

const AUDIT_STEPS: { id: AuditAgentId; n: string; label: string; desc: string }[] = [
  { id: "validator",  n: "01", label: "URL Validation",       desc: "Checks if existing URL is a real fee schedule" },
  { id: "discoverer", n: "02", label: "Heuristic Discovery",  desc: "Runs 6-method cascade to find fee schedule URL" },
  { id: "ai_scout",   n: "03", label: "AI Scout",             desc: "Claude evaluates homepage links for fee schedules" },
  { id: "reporter",   n: "04", label: "Reporter",             desc: "Summarizes audit results and changes" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR",
] as const;

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

// -- Audit state machine ------------------------------------------------------

interface AuditAgentState {
  status: AgentStatus;
  data: Record<string, unknown> | null;
  ms: number | null;
  msgs: LogMsg[];
}

interface AuditPipelineState {
  status: "idle" | "running" | "done" | "error";
  agents: Record<AuditAgentId, AuditAgentState>;
  result: AuditResult | null;
  error: string | null;
}

type AuditAction =
  | { type: "RESET" }
  | { type: "STATUS"; val: AuditPipelineState["status"] }
  | { type: "AGENT_START"; id: AuditAgentId }
  | { type: "AGENT_DONE"; id: AuditAgentId; ok: boolean; data: Record<string, unknown> | null; ms: number }
  | { type: "LOG"; agentId: AuditAgentId; msg: string }
  | { type: "PIPELINE_ERROR"; msg: string }
  | { type: "RESULT"; result: AuditResult };

function mkAuditAgent(): AuditAgentState {
  return { status: "idle", data: null, ms: null, msgs: [] };
}

function mkAuditState(): AuditPipelineState {
  return {
    status: "idle",
    agents: Object.fromEntries(AUDIT_AGENT_IDS.map((id) => [id, mkAuditAgent()])) as Record<AuditAgentId, AuditAgentState>,
    result: null,
    error: null,
  };
}

function auditReducer(state: AuditPipelineState, action: AuditAction): AuditPipelineState {
  switch (action.type) {
    case "RESET":
      return mkAuditState();
    case "STATUS":
      return { ...state, status: action.val };
    case "AGENT_START":
      return {
        ...state,
        agents: { ...state.agents, [action.id]: { ...mkAuditAgent(), status: "running" } },
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
      AUDIT_AGENT_IDS.forEach((id) => {
        if (agents[id].status === "running") {
          agents[id] = { ...agents[id], status: "error" };
        }
      });
      return { ...state, agents, error: action.msg };
    }
    case "RESULT":
      return { ...state, result: action.result };
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

// -- Audit SSE runners --------------------------------------------------------

async function runAudit(
  institutionId: number,
  dispatch: React.Dispatch<AuditAction>,
) {
  dispatch({ type: "RESET" });
  dispatch({ type: "STATUS", val: "running" });

  try {
    const res = await fetch("/api/scout/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionId }),
    });

    if (!res.ok || !res.body) {
      dispatch({ type: "PIPELINE_ERROR", msg: `Audit error: ${res.status}` });
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
          case "result":
            dispatch({ type: "RESULT", result: event.result });
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

async function runBatchAudit(
  scope: string,
  value: string,
  dispatch: React.Dispatch<AuditAction>,
  onProgress: (p: { current: number; total: number; institution: string }) => void,
  onSummary: (s: BatchSummary) => void,
) {
  dispatch({ type: "RESET" });
  dispatch({ type: "STATUS", val: "running" });

  try {
    const res = await fetch("/api/scout/audit-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, value }),
    });

    if (!res.ok || !res.body) {
      dispatch({ type: "PIPELINE_ERROR", msg: `Batch audit error: ${res.status}` });
      dispatch({ type: "STATUS", val: "error" });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;

      buffer += decoder.decode(chunk, { stream: true });
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
          case "result":
            dispatch({ type: "RESULT", result: event.result });
            break;
          case "batch_progress":
            onProgress(event.batchProgress);
            break;
          case "batch_summary":
            onSummary(event.batchSummary);
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

interface StepDef {
  id: string;
  n: string;
  label: string;
  desc: string;
}

interface AgentCardProps {
  step: StepDef;
  agent: AgentState;
  expanded: boolean;
  onToggle: () => void;
  hideDetail?: boolean;
}

function AgentCard({ step, agent, expanded, onToggle, hideDetail }: AgentCardProps) {
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
      {expanded && isDone && (
        <div
          className="border-t border-gray-200 bg-gray-50 p-4"
          style={{ animation: "fadein .2s ease" }}
        >
          {/* Activity log */}
          {msgs.length > 0 && (
            <div className={data && !hideDetail ? "mb-4 pb-3.5 border-b border-gray-100" : ""}>
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

          {/* Agent-specific detail (research mode only) */}
          {data && !hideDetail && <AgentDetail step={step} data={data} />}
        </div>
      )}
    </div>
  );
}

// -- Agent detail panels (extracted for readability) --------------------------

function AgentDetail({ step, data }: { step: StepDef; data: Record<string, unknown> }) {
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

// -- Audit result display components ------------------------------------------

function AuditResultCard({ result }: { result: AuditResult }) {
  const actionColors: Record<string, { bg: string; text: string; label: string }> = {
    validated:  { bg: "bg-emerald-50", text: "text-emerald-700", label: "Validated" },
    cleared:    { bg: "bg-amber-50",   text: "text-amber-700",   label: "Cleared" },
    discovered: { bg: "bg-blue-50",    text: "text-blue-700",    label: "Discovered" },
    ai_found:   { bg: "bg-indigo-50",  text: "text-indigo-700",  label: "AI Found" },
    not_found:  { bg: "bg-red-50",     text: "text-red-700",     label: "Not Found" },
  };

  const ac = actionColors[result.action] || actionColors.not_found;

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-5 py-4 mb-3" style={{ animation: "fadein .3s ease" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-sans font-semibold text-[15px] text-gray-900">
          {result.institutionName}
        </div>
        <span className={`${ac.bg} ${ac.text} text-xs font-semibold px-2.5 py-1 rounded-md`}>
          {ac.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="font-sans text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            URL Before
          </div>
          <div className="font-mono text-[11px] text-gray-600 break-all">
            {result.urlBefore || "None"}
          </div>
        </div>
        <div>
          <div className="font-sans text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            URL After
          </div>
          <div className="font-mono text-[11px] text-gray-600 break-all">
            {result.urlAfter || "None"}
          </div>
        </div>
      </div>
      {(result.discoveryMethod || result.confidence !== null) && (
        <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
          {result.discoveryMethod && (
            <div>
              <span className="font-sans text-[10px] text-gray-400 uppercase tracking-wider">Method: </span>
              <span className="font-sans text-xs text-gray-700">{result.discoveryMethod}</span>
            </div>
          )}
          {result.confidence !== null && (
            <div>
              <span className="font-sans text-[10px] text-gray-400 uppercase tracking-wider">Confidence: </span>
              <span className="font-sans text-xs text-gray-700">{Math.round(result.confidence * 100)}%</span>
            </div>
          )}
          {result.reason && (
            <div className="flex-1">
              <span className="font-sans text-[10px] text-gray-400 uppercase tracking-wider">Reason: </span>
              <span className="font-sans text-xs text-gray-500">{result.reason}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BatchProgressBar({ progress }: { progress: { current: number; total: number; institution: string } }) {
  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-5 py-4 mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="font-sans text-sm font-medium text-gray-900">
          {progress.current} / {progress.total} institutions
        </span>
        <span className="font-sans text-xs text-gray-500 truncate ml-3">
          {progress.institution}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#c44a2a] rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BatchSummaryGrid({ summary }: { summary: BatchSummary }) {
  const items: [string, number, string][] = [
    ["Total",      summary.total,        "text-gray-900"],
    ["Validated",  summary.validated,     "text-emerald-700"],
    ["Cleared",    summary.cleared,       "text-amber-700"],
    ["Discovered", summary.discovered,    "text-blue-700"],
    ["AI Found",   summary.aiFound,       "text-indigo-700"],
    ["Missing",    summary.stillMissing,  "text-red-700"],
  ];

  return (
    <div className="grid grid-cols-6 gap-3 mb-6" style={{ animation: "fadein .3s ease" }}>
      {items.map(([label, value, color]) => (
        <div key={label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</div>
        </div>
      ))}
    </div>
  );
}

// -- Main FeeScout component --------------------------------------------------

export default function FeeScout() {
  // Research mode state
  const [state, dispatch] = useReducer(reducer, undefined, mkState);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { suggestions, open, search, close } = useAutocomplete();
  const inputRef = useRef<HTMLInputElement>(null);

  // Mode toggle
  const [mode, setMode] = useState<"research" | "audit" | "agent">("research");

  // Audit mode state
  const [auditScope, setAuditScope] = useState<"single" | "state" | "district">("single");
  const [scopeValue, setScopeValue] = useState("");
  const [auditState, auditDispatch] = useReducer(auditReducer, undefined, mkAuditState);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; institution: string } | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<number | null>(null);

  // Agent mode state
  const [agentState, setAgentState] = useState<string>("WY");
  const [agentRunId, setAgentRunId] = useState<number | null>(null);
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [agentPolling, setAgentPolling] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  // Research mode handlers
  const handleRun = useCallback(async () => {
    if (!query.trim() || state.status === "running") return;
    close();
    setExpanded({});
    await runPipeline(query.trim(), dispatch);
  }, [query, state.status, close]);

  const handleSelect = useCallback(
    (item: AutocompleteItem) => {
      setQuery(item.institution_name);
      setSelectedInstitutionId(item.id);
      close();
      inputRef.current?.focus();
    },
    [close],
  );

  // Audit mode handlers
  const handleAuditRun = useCallback(async () => {
    if (auditState.status === "running") return;
    setExpanded({});
    setBatchProgress(null);
    setBatchSummary(null);

    if (auditScope === "single") {
      if (!selectedInstitutionId) return;
      await runAudit(selectedInstitutionId, auditDispatch);
    } else {
      if (!scopeValue) return;
      await runBatchAudit(
        auditScope,
        scopeValue,
        auditDispatch,
        setBatchProgress,
        setBatchSummary,
      );
    }
  }, [auditScope, scopeValue, selectedInstitutionId, auditState.status]);

  // Agent mode handlers
  const triggerAgent = useCallback(async (stateCode: string) => {
    setAgentError(null);
    setAgentRun(null);
    try {
      const res = await fetch("/api/scout/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: stateCode }),
      });
      const data = await res.json();
      if (data.run_id) {
        setAgentRunId(data.run_id);
        setAgentPolling(true);
      } else {
        setAgentError(data.error || "Failed to start agent");
      }
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Auto-detect existing agent runs when switching to agent tab or changing state
  useEffect(() => {
    if (mode !== "agent") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/scout/agent?state=${agentState}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.run) {
          setAgentRun(data.run);
          setAgentRunId(data.run.id);
          if (data.run.status === "running") {
            setAgentPolling(true);
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [mode, agentState]);

  // Poll for agent progress
  useEffect(() => {
    if (!agentPolling || !agentRunId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scout/agent/${agentRunId}`);
        const data = await res.json();
        setAgentRun(data);
        if (data.status !== "running") {
          setAgentPolling(false);
        }
      } catch {
        // polling error -- will retry
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [agentPolling, agentRunId]);

  const { status, agents, report, error } = state;
  const isRunning =
    mode === "research"
      ? status === "running"
      : mode === "audit"
        ? auditState.status === "running"
        : agentPolling;
  const isResearchActive = status !== "idle";
  const isAuditActive = auditState.status !== "idle";

  const canRunAudit =
    auditScope === "single"
      ? !!selectedInstitutionId && !!query.trim()
      : !!scopeValue;

  return (
    <div>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes blink  { 0%,100%{opacity:.15} 50%{opacity:1} }
        @keyframes fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
      `}</style>

      {/* Mode toggle */}
      <div className="flex justify-center mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setMode("research")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors border-none cursor-pointer ${
              mode === "research" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 bg-transparent"
            }`}
          >
            Research
          </button>
          <button
            onClick={() => setMode("audit")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors border-none cursor-pointer ${
              mode === "audit" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 bg-transparent"
            }`}
          >
            URL Audit
          </button>
          <button
            onClick={() => setMode("agent")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors border-none cursor-pointer ${
              mode === "agent" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 bg-transparent"
            }`}
          >
            Agent
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* RESEARCH MODE                                                     */}
      {/* ================================================================ */}
      {mode === "research" && (
        <>
          {/* Search bar */}
          <div className="max-w-xl mx-auto mb-8 relative">
            <div
              className={`flex bg-white border rounded-lg overflow-hidden transition-all duration-200 ${
                status === "running" ? "border-[#c44a2a] ring-2 ring-red-100" : "border-gray-200 shadow-sm"
              }`}
            >
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedInstitutionId(null);
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
                  setTimeout(close, 200);
                }}
                placeholder="Enter institution name -- e.g. Chase, Ally Bank..."
                disabled={status === "running"}
                className="flex-1 border-none outline-none bg-transparent px-4 py-3.5 text-[15px] text-gray-900 placeholder:text-gray-400 disabled:opacity-60"
              />
              <button
                onClick={handleRun}
                disabled={status === "running" || !query.trim()}
                className={`px-6 text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-all duration-200 border-none cursor-pointer disabled:cursor-not-allowed ${
                  status === "running" || !query.trim()
                    ? "bg-gray-200 text-gray-500"
                    : "bg-[#c44a2a] text-white hover:bg-[#a83d22]"
                }`}
              >
                {status === "running" && <Spinner size={13} />}
                {status === "running" ? "Running..." : "Run Analysis"}
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
                      handleSelect(s);
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
          {isResearchActive && (
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
              {status !== "running" && isResearchActive && (
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
          {!isResearchActive && (
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
        </>
      )}

      {/* ================================================================ */}
      {/* AUDIT MODE                                                        */}
      {/* ================================================================ */}
      {mode === "audit" && (
        <>
          {/* Scope selector + search */}
          <div className="max-w-xl mx-auto mb-8">
            {/* Scope controls */}
            <div className="flex gap-3 mb-3">
              <select
                value={auditScope}
                onChange={(e) => {
                  setAuditScope(e.target.value as "single" | "state" | "district");
                  setScopeValue("");
                }}
                disabled={auditState.status === "running"}
                className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-white text-gray-900 disabled:opacity-60"
              >
                <option value="single">Single Institution</option>
                <option value="state">By State</option>
                <option value="district">By Fed District</option>
              </select>
              {auditScope === "state" && (
                <select
                  value={scopeValue}
                  onChange={(e) => setScopeValue(e.target.value)}
                  disabled={auditState.status === "running"}
                  className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-white text-gray-900 disabled:opacity-60"
                >
                  <option value="">Select state...</option>
                  {US_STATES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              )}
              {auditScope === "district" && (
                <select
                  value={scopeValue}
                  onChange={(e) => setScopeValue(e.target.value)}
                  disabled={auditState.status === "running"}
                  className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-white text-gray-900 disabled:opacity-60"
                >
                  <option value="">Select district...</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={String(d)}>District {d}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Institution search (single mode only) */}
            {auditScope === "single" && (
              <div className="relative">
                <div
                  className={`flex bg-white border rounded-lg overflow-hidden transition-all duration-200 ${
                    auditState.status === "running" ? "border-[#c44a2a] ring-2 ring-red-100" : "border-gray-200 shadow-sm"
                  }`}
                >
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSelectedInstitutionId(null);
                      search(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        close();
                        handleAuditRun();
                      }
                      if (e.key === "Escape") close();
                    }}
                    onFocus={() => {
                      if (query.trim().length >= 2) search(query);
                    }}
                    onBlur={() => {
                      setTimeout(close, 200);
                    }}
                    placeholder="Search institution to audit..."
                    disabled={auditState.status === "running"}
                    className="flex-1 border-none outline-none bg-transparent px-4 py-3.5 text-[15px] text-gray-900 placeholder:text-gray-400 disabled:opacity-60"
                  />
                  <button
                    onClick={handleAuditRun}
                    disabled={auditState.status === "running" || !canRunAudit}
                    className={`px-6 text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-all duration-200 border-none cursor-pointer disabled:cursor-not-allowed ${
                      auditState.status === "running" || !canRunAudit
                        ? "bg-gray-200 text-gray-500"
                        : "bg-[#c44a2a] text-white hover:bg-[#a83d22]"
                    }`}
                  >
                    {auditState.status === "running" && <Spinner size={13} />}
                    {auditState.status === "running" ? "Auditing..." : "Run Audit"}
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
                          handleSelect(s);
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
            )}

            {/* Batch run button (state/district modes) */}
            {auditScope !== "single" && (
              <button
                onClick={handleAuditRun}
                disabled={auditState.status === "running" || !canRunAudit}
                className={`w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 border-none cursor-pointer disabled:cursor-not-allowed ${
                  auditState.status === "running" || !canRunAudit
                    ? "bg-gray-200 text-gray-500"
                    : "bg-[#c44a2a] text-white hover:bg-[#a83d22]"
                }`}
              >
                {auditState.status === "running" && <Spinner size={13} />}
                {auditState.status === "running" ? "Auditing..." : "Run Batch Audit"}
              </button>
            )}
          </div>

          {/* Batch progress */}
          {batchProgress && auditState.status === "running" && (
            <BatchProgressBar progress={batchProgress} />
          )}

          {/* Batch summary */}
          {batchSummary && <BatchSummaryGrid summary={batchSummary} />}

          {/* Audit pipeline cards */}
          {isAuditActive && (
            <div className="mb-7">
              <div className="font-sans text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2.5">
                Audit Pipeline
              </div>
              {AUDIT_STEPS.map((step) => (
                <AgentCard
                  key={step.id}
                  step={step}
                  agent={auditState.agents[step.id]}
                  expanded={!!expanded[step.id]}
                  onToggle={() => setExpanded((e) => ({ ...e, [step.id]: !e[step.id] }))}
                  hideDetail
                />
              ))}
              {auditState.status !== "running" && isAuditActive && (
                <div className="font-sans text-[11px] text-gray-400 text-right mt-1.5">
                  Click any completed step to view its log
                </div>
              )}
            </div>
          )}

          {/* Audit result */}
          {auditState.result && <AuditResultCard result={auditState.result} />}

          {/* Audit error */}
          {auditState.status === "error" && !auditState.result && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-4">
              <div className="font-sans font-semibold text-[13px] text-[#c44a2a] mb-2">Audit Error</div>
              <div className="font-mono text-xs text-gray-900 leading-relaxed">{auditState.error}</div>
            </div>
          )}

          {/* Idle state description */}
          {!isAuditActive && (
            <div className="text-center py-11">
              <div className="max-w-md mx-auto">
                <div className="font-sans text-lg font-semibold text-gray-900 mb-2">URL Audit Pipeline</div>
                <div className="font-sans text-sm text-gray-500 leading-relaxed">
                  Validate existing fee schedule URLs, discover missing ones via heuristic search,
                  and escalate failures to AI-powered discovery. Run on a single institution or
                  batch-process an entire state or Fed district.
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* AGENT MODE                                                        */}
      {/* ================================================================ */}
      {mode === "agent" && (
        <>
          {/* Controls */}
          <div className="max-w-xl mx-auto mb-8">
            <div className="flex gap-3">
              <select
                value={agentState}
                onChange={(e) => setAgentState(e.target.value)}
                disabled={agentPolling}
                className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-white text-gray-900 disabled:opacity-60 flex-1"
              >
                {US_STATES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
              <button
                onClick={() => triggerAgent(agentState)}
                disabled={agentPolling}
                className={`px-6 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-all duration-200 border-none cursor-pointer disabled:cursor-not-allowed ${
                  agentPolling
                    ? "bg-gray-200 text-gray-500"
                    : "bg-[#c44a2a] text-white hover:bg-[#a83d22]"
                }`}
              >
                {agentPolling && <Spinner size={13} />}
                {agentPolling ? "Running..." : "Run Agent"}
              </button>
            </div>
          </div>

          {/* Progress display */}
          {agentRun && agentRun.status === "running" && (
            <div className="max-w-xl mx-auto mb-6">
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="font-sans text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  Agent Progress
                </div>
                {agentRun.current_stage && (
                  <div className="flex items-center gap-2 mb-2">
                    <Spinner size={13} />
                    <span className="font-sans text-sm text-gray-900 font-medium capitalize">
                      {agentRun.current_stage}
                    </span>
                  </div>
                )}
                {agentRun.current_institution && (
                  <div className="font-sans text-xs text-gray-500 mb-3">
                    Processing: {agentRun.current_institution}
                  </div>
                )}
                {/* Counters */}
                <div className="flex gap-4 flex-wrap mb-3">
                  {(
                    [
                      ["Discovered", agentRun.discovered],
                      ["Classified", agentRun.classified],
                      ["Extracted", agentRun.extracted],
                      ["Validated", agentRun.validated],
                      ["Failed", agentRun.failed],
                    ] as [string, number][]
                  ).map(([label, val]) => (
                    <div key={label} className="text-center">
                      <div className="font-sans text-lg font-bold tabular-nums text-gray-900">{val}</div>
                      <div className="font-sans text-[10px] text-gray-400 uppercase tracking-wider">{label}</div>
                    </div>
                  ))}
                </div>
                {/* Progress bar */}
                {agentRun.total_institutions > 0 && (
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#c44a2a] transition-all duration-500"
                      style={{
                        width: `${Math.round((agentRun.validated / agentRun.total_institutions) * 100)}%`,
                      }}
                    />
                  </div>
                )}
                {agentRun.total_institutions > 0 && (
                  <div className="font-sans text-[11px] text-gray-400 mt-1.5 text-right">
                    {agentRun.validated} / {agentRun.total_institutions} complete
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Completion summary */}
          {agentRun && agentRun.status === "complete" && (
            <div className="max-w-2xl mx-auto mb-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 mb-4">
                <div className="font-sans font-semibold text-[13px] text-emerald-800 mb-1">
                  Agent Complete
                </div>
                <div className="font-sans text-sm text-emerald-700">
                  Processed {agentRun.total_institutions} institutions in {agentRun.state_code}.
                </div>
              </div>
              {/* Results table */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        Stage
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(
                      [
                        ["Discovered", agentRun.discovered],
                        ["Classified", agentRun.classified],
                        ["Extracted", agentRun.extracted],
                        ["Validated", agentRun.validated],
                        ["Failed", agentRun.failed],
                      ] as [string, number][]
                    ).map(([label, val]) => (
                      <tr key={label} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-2.5 font-sans text-sm text-gray-900">{label}</td>
                        <td className="px-4 py-2.5 font-sans text-sm text-gray-900 tabular-nums text-right">
                          {val}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Agent failure */}
          {agentRun && agentRun.status === "failed" && (
            <div className="max-w-xl mx-auto mb-6">
              <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-4">
                <div className="font-sans font-semibold text-[13px] text-[#c44a2a] mb-2">Agent Failed</div>
                <div className="font-sans text-xs text-gray-900 leading-relaxed">
                  The agent encountered an error during the {agentRun.current_stage || "unknown"} stage.
                  {agentRun.current_institution && ` Last institution: ${agentRun.current_institution}.`}
                </div>
              </div>
            </div>
          )}

          {/* Agent trigger error */}
          {agentError && (
            <div className="max-w-xl mx-auto mb-6">
              <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-4">
                <div className="font-sans font-semibold text-[13px] text-[#c44a2a] mb-2">Error</div>
                <div className="font-mono text-xs text-gray-900 leading-relaxed">{agentError}</div>
              </div>
            </div>
          )}

          {/* Idle state description */}
          {!agentPolling && !agentRun && !agentError && (
            <div className="text-center py-11">
              <div className="max-w-md mx-auto">
                <div className="font-sans text-lg font-semibold text-gray-900 mb-2">State Agent</div>
                <div className="font-sans text-sm text-gray-500 leading-relaxed">
                  Run a 5-stage AI agent that discovers, classifies, extracts, and validates
                  fee schedules for every institution in a state. Select a state and click
                  Run Agent to begin.
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
