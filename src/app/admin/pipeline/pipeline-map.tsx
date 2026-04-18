import type { PipelineMapData, PipelineStageAgent, AgentStatus } from "@/lib/admin-queries";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function statusColor(status: AgentStatus): string {
  switch (status) {
    case "live":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30";
    case "stubbed":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30";
    case "missing":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30";
  }
}

function statusLabel(status: AgentStatus): string {
  switch (status) {
    case "live":
      return "Live";
    case "stubbed":
      return "Stubbed";
    case "missing":
      return "Missing";
  }
}

function AgentRow({ agent }: { agent: PipelineStageAgent }) {
  return (
    <li className="flex items-start gap-2 text-[11px] leading-tight">
      <span
        className={`inline-flex items-center shrink-0 px-1.5 py-0.5 rounded-sm border font-semibold uppercase tracking-wider text-[9px] ${statusColor(
          agent.status,
        )}`}
        title={`Status: ${statusLabel(agent.status)}`}
      >
        {statusLabel(agent.status)}
      </span>
      <span className="flex-1">
        <span className="font-medium text-gray-900 dark:text-gray-100">{agent.name}</span>
        {agent.note ? (
          <span className="block text-gray-500 dark:text-gray-400">{agent.note}</span>
        ) : null}
      </span>
    </li>
  );
}

export function PipelineMap({ data }: { data: PipelineMapData }) {
  const { stages } = data;

  return (
    <section className="admin-card p-5">
      <header className="mb-4">
        <h2 className="text-sm font-bold tracking-tight text-gray-900 dark:text-gray-100">
          End-to-End Pipeline
        </h2>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
          Five stages move raw scrapes into the public fee index. Each stage has one or more agents
          responsible. <span className="text-emerald-600 dark:text-emerald-400 font-medium">Live</span> agents run today.{" "}
          <span className="text-amber-600 dark:text-amber-400 font-medium">Stubbed</span> means the agent exists
          but is simulated (for example, <code className="font-mono text-[10px]">publish-fees</code> plays both sides
          of the Darwin+Knox handshake because real Knox has not shipped yet).{" "}
          <span className="text-red-600 dark:text-red-400 font-medium">Missing</span> means no code exists.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {stages.map((stage, idx) => (
          <div
            key={stage.id}
            className="rounded-md border border-gray-200 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] p-3 flex flex-col gap-3"
          >
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                  Stage {idx + 1}
                </div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {stage.label}
                </h3>
              </div>
              <div className="text-right">
                <div
                  className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100"
                  title={`${stage.current_label}: ${formatNumber(stage.current)}`}
                >
                  {formatNumber(stage.current)}
                </div>
                <div className="text-[9px] text-gray-400 uppercase tracking-wider">
                  {stage.current_label}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-snug">
              {stage.one_liner}
            </p>

            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Agents
              </div>
              <ul className="space-y-1.5">
                {stage.agents.map((a) => (
                  <AgentRow key={a.name} agent={a} />
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-black/[0.06] dark:border-white/[0.06]">
              <span className="text-[9px] text-gray-400 uppercase tracking-wider">
                Last 24h
              </span>
              <span className="text-[11px] font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                +{formatNumber(stage.throughput_24h)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 text-[11px] text-gray-500 dark:text-gray-400 border-t border-black/[0.06] dark:border-white/[0.06] pt-3 max-w-3xl">
        <strong className="text-gray-700 dark:text-gray-200">Reading this page:</strong> every new
        fee starts at Scrape and drops down one tier each time an agent approves it. A row that sits
        in Extraction for a long time means Darwin has not classified it yet. A row that sits in
        Review means the adversarial handshake has not happened. The daily Modal cron at 06:00 UTC
        runs{" "}
        <code className="font-mono text-[10px]">categorize → auto-review → publish-fees → snapshot → publish-index</code>,
        so Tier 2 → Tier 3 promotion is now automatic.
      </div>

      <div className="mt-4 rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/[0.05] p-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-1.5">
          Known gaps (not yet built)
        </h4>
        <ul className="text-[11px] text-amber-900 dark:text-amber-200 space-y-1 list-disc pl-4">
          <li>
            <strong>Real Knox agent:</strong> today `publish-fees` writes both darwin-accept and
            knox-accept messages itself. There is no independent challenger catching bad fees.
          </li>
          <li>
            <strong>Hamilton automation:</strong> Hamilton (report synthesis) only runs on demand
            from the admin UI — no scheduled report generation.
          </li>
          <li>
            <strong>Atlas orchestrator:</strong> the AGENT_CLASSES dispatcher dict is empty in
            prod, so pg_cron review_ticks fire into the void. Modal’s run_post_processing bypasses
            the dispatcher entirely.
          </li>
        </ul>
      </div>
    </section>
  );
}
