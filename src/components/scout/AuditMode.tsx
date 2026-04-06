"use client";

import { useReducer, useCallback, useState, useRef } from "react";
import type { AuditAgentId, BatchSummary } from "@/lib/scout/audit-types";
import {
  US_STATES,
  AUDIT_STEPS,
  AUDIT_AGENT_IDS,
  auditReducer,
  mkAuditState,
  Spinner,
  AgentCard,
  AuditResultCard,
  BatchProgressBar,
  BatchSummaryGrid,
  ScoutKeyframes,
} from "./shared";
import type { AuditAction, AutocompleteItem } from "./shared";

// -- SSE runners --------------------------------------------------------------

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

// -- Audit Mode component -----------------------------------------------------

export default function AuditMode() {
  const [auditScope, setAuditScope] = useState<"single" | "state" | "district">("single");
  const [scopeValue, setScopeValue] = useState("");
  const [query, setQuery] = useState("");
  const [auditState, auditDispatch] = useReducer(auditReducer, undefined, mkAuditState);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; institution: string } | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { suggestions, open, search, close } = useAutocomplete();
  const inputRef = useRef<HTMLInputElement>(null);

  const isAuditActive = auditState.status !== "idle";

  const canRunAudit =
    auditScope === "single"
      ? !!selectedInstitutionId && !!query.trim()
      : !!scopeValue;

  const handleSelect = useCallback(
    (item: AutocompleteItem) => {
      setQuery(item.institution_name);
      setSelectedInstitutionId(item.id);
      close();
      inputRef.current?.focus();
    },
    [close],
  );

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

  return (
    <>
      <ScoutKeyframes />

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
  );
}
