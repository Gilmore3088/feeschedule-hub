import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ReportWorkspace } from "@/components/hamilton/reports/ReportWorkspace";

export const metadata: Metadata = { title: "Report Builder" };

/**
 * ReportsPage — Server component that gates and hydrates the Report Builder workspace.
 * Auth enforced at the layout level (canAccessPremium), but we also verify here
 * to ensure server-side redirect on direct navigation.
 */
export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  return <ReportWorkspace userId={user.id} />;
}
