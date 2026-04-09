import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SimulateWorkspace } from "@/components/hamilton/simulate";

export const metadata: Metadata = { title: "Scenario Modeling" };

/**
 * SimulatePage — Server component that gates and hydrates the Simulate workspace.
 * Auth enforced at the layout level (canAccessPremium) but also verified here
 * to ensure server-side redirect on direct navigation.
 * Passes userId and institutionContext to the client workspace shell.
 */
export default async function SimulatePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const params = await searchParams;
  const initialCategory = params.category || undefined;

  const institutionId =
    (user.institution_name ?? "").toLowerCase().replace(/\s+/g, "-") || null;

  const institutionContext = {
    name: user.institution_name ?? undefined,
    type: user.institution_type ?? undefined,
    assetTier: user.asset_tier ?? undefined,
    fedDistrict: user.fed_district ?? null,
  };

  return (
    <SimulateWorkspace
      userId={user.id}
      institutionId={institutionId}
      institutionContext={institutionContext}
      initialCategory={initialCategory}
    />
  );
}
