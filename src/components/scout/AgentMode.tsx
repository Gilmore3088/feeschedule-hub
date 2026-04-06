"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentRun, AgentRunResult } from "@/lib/scout/agent-types";
import { US_STATES, Spinner, ScoutKeyframes } from "./shared";

const STAGES = ["discover", "classify", "extract", "validate"] as const;
type Stage = (typeof STAGES)[number];

function formatDetail(stage: Stage, detail: Record<string, unknown>): string {
  if (stage === "extract" && typeof detail.fee_count === "number") {
    return `${detail.fee_count} fees`;
  }
  if (stage === "validate" && typeof detail.data_quality === "string") {
    return detail.data_quality as string;
  }
  if (typeof detail.document_type === "string") {
    return detail.document_type as string;
  }
  if (typeof detail.reason === "string") {
    return detail.reason as string;
  }
  if (typeof detail.error === "string") {
    return (detail.error as string).slice(0, 60);
  }
  return "";
}

function InstitutionResultsTable({ results }: { results: AgentRunResult[] }) {
  // Group results by crawl_target_id, preserving insertion order
  const rowMap = new Map<number, Partial<Record<Stage, AgentRunResult>>>();
  for (const r of results) {
    if (!rowMap.has(r.crawl_target_id)) {
      rowMap.set(r.crawl_target_id, {});
    }
    rowMap.get(r.crawl_target_id)![r.stage] = r;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-200">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Per-Institution Results
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Institution ID
              </th>
              {STAGES.map((s) => (
                <th
                  key={s}
                  className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider"
                >
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Array.from(rowMap.entries()).map(([targetId, stageMap]) => (
              <tr key={targetId} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-2.5 font-sans text-sm text-gray-900 tabular-nums">
                  {targetId}
                </td>
                {STAGES.map((s) => {
                  const result = stageMap[s];
                  if (!result) {
                    return (
                      <td key={s} className="px-4 py-2.5 font-sans text-sm text-gray-300">
                        &mdash;
                      </td>
                    );
                  }
                  const detail = formatDetail(s, result.detail);
                  const isFailed = result.status === "failed";
                  return (
                    <td key={s} className="px-4 py-2.5 font-sans text-sm">
                      <span
                        className={
                          isFailed ? "text-red-600" : "text-emerald-600"
                        }
                      >
                        {result.status}
                      </span>
                      {detail && (
                        <span className="ml-1 text-gray-400 text-[11px]">
                          ({detail})
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
          {/* Stage summary table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
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
          {/* Per-institution results table */}
          {agentRun.results && agentRun.results.length > 0 && (
            <InstitutionResultsTable results={agentRun.results} />
          )}
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
