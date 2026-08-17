// Renders live DB-backed stats at request time; must not be statically prerendered.
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getPublicStats, getDataFreshness } from "@/lib/data-store/core";
import { LandingHero } from "./landing-hero";
import { LandingTrustStats } from "./landing-trust-stats";
import { CustomerFooter } from "@/components/customer-footer";

export const metadata: Metadata = {
  title: { absolute: "Fee Insight -- The Bank Fee Index" },
  description:
    "Find bank and credit union fees by district, state, size, and type. Consumers: look up your bank free. Institutions: peer benchmarking, analysis, and board-ready reports.",
  openGraph: {
    title: "Fee Insight -- The Bank Fee Index",
    description:
      "Find bank and credit union fees by district, state, size, and type. Free consumer lookup. Professional-grade intelligence for banking teams.",
  },
};

export default async function LandingPage() {
  const [stats, freshness] = await Promise.all([
    getPublicStats(),
    getDataFreshness(),
  ]);

  return (
    <div className="min-h-screen bg-[#FAF7F2] consumer-brand">
      <LandingHero totalInstitutions={stats.total_institutions} />
      <LandingTrustStats stats={stats} freshness={freshness} />
      <CustomerFooter />
    </div>
  );
}
