import { Suspense } from "react";
import { DarwinConsole } from "./components/darwin-console";
import { LoopPanels } from "./components/loop-panels";
import { fetchDarwinStatus } from "./actions";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const dynamic = "force-dynamic";

export default async function DarwinPage() {
  const status = await fetchDarwinStatus().catch(() => ({
    pending: 0,
    today_promoted: 0,
    today_cost_usd: 0,
    circuit: { halted: false },
    recent_run_avg_tokens_per_row: null,
  }));

  return (
    <div className="admin-content space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Darwin" },
        ]}
      />
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">Darwin</h1>
        <p className="text-sm text-gray-500">
          Classifier agent — promotes fees_raw to fees_verified.
        </p>
      </div>
      <DarwinConsole initialStatus={status} />
      <div>
        <h2 className="text-sm font-bold text-gray-800 mb-2">5-step loop</h2>
        <Suspense fallback={<div className="skeleton h-40 w-full" />}>
          <LoopPanels />
        </Suspense>
      </div>
    </div>
  );
}
