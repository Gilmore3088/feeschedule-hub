import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AnalyzeWorkspace } from "@/components/hamilton/analyze/AnalyzeWorkspace";
import { loadAnalysis } from "./actions";

export const metadata: Metadata = { title: "Analyze" };

/**
 * AnalyzePage — Server component that gates and hydrates the Analyze workspace.
 * Auth enforced at the layout level (canAccessPremium), but we also verify here
 * to ensure server-side redirect on direct navigation.
 * Reads optional ?analysis= searchParam to restore a saved analysis on load.
 * Passes userId, institutionId, and initialAnalysis to the client workspace shell.
 */
export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ analysis?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const { analysis: analysisId } = await searchParams;
  const initialAnalysis = analysisId ? await loadAnalysis(analysisId) : null;

  // institution_id is not yet on the User type; derive a stable identifier
  // from institution_name if available, otherwise pass null
  const institutionId = (user.institution_name ?? "").toLowerCase().replace(/\s+/g, "-") || null;

  return (
    <AnalyzeWorkspace
      userId={user.id}
      institutionId={institutionId}
      initialAnalysis={initialAnalysis}
    />
  );
}
