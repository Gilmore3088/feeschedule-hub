import { Suspense } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { ensureHamiltonProTables } from "@/lib/hamilton/pro-tables";
import { HAMILTON_NAV } from "@/lib/hamilton/navigation";
import { HamiltonShell } from "@/components/hamilton/layout/HamiltonShell";
import { HamiltonUpgradeGate } from "@/components/hamilton/layout/HamiltonUpgradeGate";
import { sql } from "@/lib/data-store/connection";
import { getSavedPeerSets } from "@/lib/data-store/saved-peers";
import { getHamiltonInstitutionContext } from "@/lib/hamilton/institution-context";

export const metadata: Metadata = {
  title: {
    default: "Hamilton | Bank Fee Index",
    template: "%s | Hamilton",
  },
};

export default function HamiltonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Material Symbols stylesheet hoisted to root app/layout.tsx (was here, but
  // Next.js 16 streaming emitted it after the body painted, breaking icons on
  // first render — see audit C-1 2026-04-17).
  return (
    <Suspense fallback={null}>
      <HamiltonLayoutInner>{children}</HamiltonLayoutInner>
    </Suspense>
  );
}

async function HamiltonLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // DB not available or session expired
  }

  if (!user || !canAccessPremium(user)) {
    return <HamiltonUpgradeGate />;
  }

  // Fire-and-forget: ensure Hamilton Pro tables exist (non-blocking per D-15)
  ensureHamiltonProTables().catch(() => {});

  const isAdmin = user.role === "admin" || user.role === "analyst";

  // Derive activeHref server-side from request headers so the initial HTML
  // contains the correct active nav state without waiting for client JS (SC-2).
  const headersList = await headers();
  const requestPath =
    headersList.get("x-invoke-path") ||
    headersList.get("x-next-url") ||
    headersList.get("x-pathname") ||
    "/pro/monitor";
  const pathname = requestPath.split("?")[0] || requestPath;
  const queryString = requestPath.includes("?") ? requestPath.split("?")[1] : "";
  const selectedInstId = queryString
    ? new URLSearchParams(queryString).get("instId")
    : null;
  const { institution: selectedInstitution } =
    await getHamiltonInstitutionContext(selectedInstId);
  const institutionContext = selectedInstitution
    ? {
        name: selectedInstitution.name,
        type: selectedInstitution.charterType,
        assetTier: selectedInstitution.assetTierLabel ?? selectedInstitution.assetTier,
        fedDistrict: selectedInstitution.fedDistrict,
        feePublicationLabel: selectedInstitution.feePublicationLabel,
        publishedFeeCount: selectedInstitution.publishedFeeCount,
        provisionalFeeCount: selectedInstitution.provisionalFeeCount,
        selectedFromUrl: true,
      }
    : {
        name: user.institution_name,
        type: user.institution_type,
        assetTier: user.asset_tier,
        fedDistrict: user.fed_district ?? null,
        feePublicationLabel: null,
        publishedFeeCount: null,
        provisionalFeeCount: null,
        selectedFromUrl: false,
      };
  const activeHref =
    HAMILTON_NAV.find(
      (n) => pathname === n.href || pathname.startsWith(n.href + "/")
    )?.href ?? "/pro/monitor";

  // Fetch saved analyses for left rail — user-scoped (T-40-04)
  let savedAnalyses: Array<{
    id: string;
    title: string;
    analysis_focus: string;
    updated_at: string;
  }> = [];
  try {
    const rows = await sql`
      SELECT id, title, analysis_focus, updated_at
      FROM hamilton_saved_analyses
      WHERE user_id = ${user.id} AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 10
    `;
    savedAnalyses = rows.map((r) => ({
      id: String(r.id),
      title: r.title as string,
      analysis_focus: r.analysis_focus as string,
      updated_at: String(r.updated_at),
    }));
  } catch {
    // Table may not have data yet — empty array is fine
  }

  // Fetch recent scenarios for left rail — user-scoped (T-40-04)
  let recentScenarios: Array<{
    id: string;
    fee_category: string;
    updated_at: string;
  }> = [];
  try {
    const rows = await sql`
      SELECT id, fee_category, updated_at
      FROM hamilton_scenarios
      WHERE user_id = ${user.id} AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 10
    `;
    recentScenarios = rows.map((r) => ({
      id: String(r.id),
      fee_category: r.fee_category as string,
      updated_at: String(r.updated_at),
    }));
  } catch {
    // Table may not have data yet — empty array is fine
  }

  // Fetch pinned institutions (watchlist) for left rail (D-10)
  let pinnedInstitutions: string[] = [];
  try {
    const rows = await sql`
      SELECT institution_id
      FROM hamilton_watchlists
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `;
    pinnedInstitutions = rows.map((r) => r.institution_id as string);
  } catch {
    // Table may not have data yet — empty array is fine
  }

  // Fetch saved peer sets for left rail (D-11)
  let peerSets: Array<{ id: number; name: string }> = [];
  try {
    const sets = await getSavedPeerSets(String(user.id));
    peerSets = sets.map((s) => ({ id: s.id, name: s.name }));
  } catch {
    // Empty is fine
  }

  return (
    <HamiltonShell
      user={user}
      isAdmin={isAdmin}
      institutionContext={institutionContext}
      activeHref={activeHref}
      savedAnalyses={savedAnalyses}
      recentScenarios={recentScenarios}
      pinnedInstitutions={pinnedInstitutions}
      peerSets={peerSets}
    >
      {children}
    </HamiltonShell>
  );
}
