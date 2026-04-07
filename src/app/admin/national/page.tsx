export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SkeletonCards } from "@/components/skeleton";
import { TabNav, TABS, type Tab } from "./tab-nav";
import { OverviewPanel } from "./overview-panel";
import { CallReportsPanel } from "./call-reports-panel";
import { EconomicPanel } from "./economic-panel";
import { HealthPanel } from "./health-panel";

export default async function NationalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const rawTab = params.tab ?? "overview";
  const validatedTab: Tab = (TABS as readonly string[]).includes(rawTab)
    ? (rawTab as Tab)
    : "overview";

  return (
    <div className="space-y-0">
      <div className="px-0 pt-0 pb-4 space-y-1">
        <Breadcrumbs
          items={[{ label: "Dashboard", href: "/admin" }, { label: "National Data" }]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          National Data Portal
        </h1>
      </div>

      <TabNav active={validatedTab} />

      <div className="pt-6">
        <Suspense fallback={<SkeletonCards count={4} />}>
          {validatedTab === "overview" && <OverviewPanel />}
          {validatedTab === "call-reports" && <CallReportsPanel />}
          {validatedTab === "economic" && <EconomicPanel />}
          {validatedTab === "health" && <HealthPanel />}
        </Suspense>
      </div>
    </div>
  );
}
