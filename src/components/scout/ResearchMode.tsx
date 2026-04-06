"use client";

import { useReducer, useCallback, useState, useRef } from "react";
import type { AgentId } from "@/lib/scout/types";
import {
  STEPS,
  reducer,
  mkState,
  Spinner,
  AgentCard,
  Report,
  ScoutKeyframes,
} from "./shared";
import type { Action, AutocompleteItem } from "./shared";

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

// -- Research Mode component --------------------------------------------------

export default function ResearchMode() {
  const [state, dispatch] = useReducer(reducer, undefined, mkState);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { suggestions, open, search, close } = useAutocomplete();
  const inputRef = useRef<HTMLInputElement>(null);

  const { status, agents, report, error } = state;
  const isResearchActive = status !== "idle";

  const handleRun = useCallback(async () => {
    if (!query.trim() || state.status === "running") return;
    close();
    setExpanded({});
    await runPipeline(query.trim(), dispatch);
  }, [query, state.status, close]);

  const handleSelect = useCallback(
    (item: AutocompleteItem) => {
      setQuery(item.institution_name);
      close();
      inputRef.current?.focus();
    },
    [close],
  );

  return (
    <>
      <ScoutKeyframes />

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
    </>
  );
}
