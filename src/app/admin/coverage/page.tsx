import { MagellanConsole } from "./components/magellan-console";
import { fetchMagellanStatus } from "./actions";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  const status = await fetchMagellanStatus().catch(() => ({
    pending: 0,
    rescued: 0,
    dead: 0,
    needs_human: 0,
    retry_after: 0,
    today_cost_usd: 0,
    circuit: { halted: false },
  }));

  return (
    <div className="admin-content space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Coverage" },
        ]}
      />
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">Coverage (Magellan)</h1>
        <p className="text-sm text-gray-500">
          Rescue agent — runs a 5-rung ladder on URLs with no fees yet.
        </p>
      </div>
      <MagellanConsole initialStatus={status} />
    </div>
  );
}
