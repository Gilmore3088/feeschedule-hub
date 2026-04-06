"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentRun } from "@/lib/scout/agent-types";
import { US_STATES, Spinner, ScoutKeyframes } from "./shared";

export default function AgentMode() {
  const [agentState, setAgentState] = useState<string>("WY");
  const [agentRunId, setAgentRunId] = useState<number | null>(null);
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [agentPolling, setAgentPolling] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

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

  // Auto-detect existing agent runs when mounting or changing state
  useEffect(() => {
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
  }, [agentState]);

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

  return (
    <>
      <ScoutKeyframes />

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
  );
}
