import { Suspense } from "react";
import { DarwinConsole } from "./components/darwin-console";
import { LoopPanels } from "./components/loop-panels";
import { fetchDarwinStatus } from "./actions";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { AgentHandoffStrip } from "@/components/agent-console/agent-handoff-strip";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DarwinPage() {
  await requireAuth("view");
  const status = await fetchDarwinStatus().catch(() => ({
    pending: 0,
    today_promoted: 0,
    today_cost_usd: 0,
    circuit: { halted: false },
    recent_run_avg_tokens_per_row: null,
  }));

  return (
    <div className="space-y-7">
      <header>
        <Breadcrumbs items={[{ label: "Atlas", href: "/admin" }, { label: "Darwin" }]} />
        <p className="admin-eyebrow mt-3">Agent · Classify</p>
        <h1 className="admin-display-title mt-1">Darwin</h1>
        <p className="admin-lede mt-2">
          Turns raw extracted fee rows into verified categories, amounts, and review-ready exceptions.
        </p>
      </header>
      <AgentHandoffStrip
        steps={[
          {
            label: "Input",
            title: "Extracted raw fees",
            detail: "Magellan creates rows that still need normalized categories.",
            href: "/admin/magellan",
          },
          {
            label: "Current",
            title: "Darwin classifies",
            detail: "Apply cache, model checks, and budget guardrails to raw fee rows.",
            href: "/admin/darwin",
            current: true,
          },
          {
            label: "Next",
            title: "Knox reviews exceptions",
            detail: "Resolve flagged fees and rejected classification decisions.",
            href: "/admin/knox",
          },
          {
            label: "Publish",
            title: "Inspect the index",
            detail: "Review benchmark output once fees are verified and published.",
            href: "/admin/index",
          },
        ]}
      />
      <div className="border-y border-black/[0.06] py-5 dark:border-white/[0.06]">
        <div className="grid gap-4 sm:grid-cols-3">
          <Step number="1" title="Read raw fees" detail="Pull unclassified rows from the extraction queue." />
          <Step number="2" title="Classify safely" detail="Apply cache and model checks within the active budget guard." />
          <Step number="3" title="Send exceptions" detail="Promote confident rows and hand uncertain cases to Knox." />
        </div>
      </div>
      <DarwinConsole initialStatus={status} />
      <div>
        <h2 className="mb-2 text-sm font-bold text-gray-800 dark:text-gray-200">Classifier loop</h2>
        <Suspense fallback={<div className="skeleton h-40 w-full" />}>
          <LoopPanels />
        </Suspense>
      </div>
    </div>
  );
}

function Step({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-[11px] font-bold text-[var(--brand-primary)]">{number}</span>
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
        <p className="admin-meta mt-1">{detail}</p>
      </div>
    </div>
  );
}
