// Auth-gated, renders live DB-backed data at request time; not statically prerendered.
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPublishedReports } from "@/lib/hamilton/pro-tables";
import { ReportWorkspace } from "@/components/hamilton/reports/ReportWorkspace";
import { getHamiltonInstitutionContext } from "@/lib/hamilton/institution-context";

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
  searchParams: Promise<{ scenario_id?: string; instId?: string; intent?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const params = await searchParams;
  const publishedReports = await getPublishedReports();
  const { institution: selectedInstitution } = await getHamiltonInstitutionContext(params.instId);

  // Pull the user's real institution name (audit H-4 round 2) so the
  // Configuration sidebar shows it instead of the hardcoded "Your Institution".
  const institutionName =
    selectedInstitution?.name ||
    user.institution_name?.trim() ||
    user.display_name ||
    "Your institution";

  return (
    <ReportWorkspace
      userId={user.id}
      institutionName={institutionName}
      publishedReports={publishedReports}
      initialScenarioId={params.scenario_id ?? null}
      selectedInstitution={selectedInstitution}
      initialIntent={params.intent ?? null}
    />
  );
}
