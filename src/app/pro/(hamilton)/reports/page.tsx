import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPublishedReports } from "@/lib/hamilton/pro-tables";
import { ReportWorkspace } from "@/components/hamilton/reports/ReportWorkspace";

export const metadata: Metadata = { title: "Report Builder" };

/**
 * ReportsPage — Server component that gates and hydrates the Report Builder workspace.
 * Auth enforced at the layout level (canAccessPremium), but we also verify here
 * to ensure server-side redirect on direct navigation.
 *
 * Reads ?scenario_id= URL param (Next.js 16 Promise-based searchParams pattern).
 * Loads published BFI-authored reports server-side for the library section.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario_id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const { scenario_id } = await searchParams;
  const publishedReports = await getPublishedReports();

  return (
    <ReportWorkspace
      userId={user.id}
      publishedReports={publishedReports}
      initialScenarioId={scenario_id ?? null}
    />
  );
}
