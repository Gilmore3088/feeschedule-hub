import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AnalyzeWorkspace } from "@/components/hamilton/analyze/AnalyzeWorkspace";

export const metadata: Metadata = { title: "Analyze" };

/**
 * AnalyzePage — Server component that gates and hydrates the Analyze workspace.
 * Auth enforced at the layout level (canAccessPremium), but we also verify here
 * to ensure server-side redirect on direct navigation.
 * Passes userId and institutionId to the client workspace shell.
 */
export default async function AnalyzePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  // institution_id is not yet on the User type; derive a stable identifier
  // from institution_name if available, otherwise pass null
  const institutionId = (user.institution_name ?? "").toLowerCase().replace(/\s+/g, "-") || null;

  return (
    <AnalyzeWorkspace
      userId={user.id}
      institutionId={institutionId}
    />
  );
}
