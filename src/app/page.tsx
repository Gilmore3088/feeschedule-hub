import type { Metadata } from "next";
import { getPublicStats, getDataFreshness } from "@/lib/crawler-db/core";
import { LandingHero } from "./landing-hero";
import { LandingDataAuthority } from "./landing-data-authority";
import { LandingTwoTrack } from "./landing-two-track";
import { LandingTrustStats } from "./landing-trust-stats";
import { CustomerFooter } from "@/components/customer-footer";

export const metadata: Metadata = {
  title: "Bank Fee Index -- Fee Intelligence for Consumers & Institutions",
  description:
    "Compare fees across 8,000+ banks and credit unions. Consumers: look up your bank free. Institutions: peer benchmarking, AI research, and board-ready reports.",
  openGraph: {
    title: "Bank Fee Index -- Fee Intelligence for Consumers & Institutions",
    description:
      "Compare fees across 8,000+ banks and credit unions. Free consumer lookup. Professional-grade intelligence for banking teams.",
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
      <LandingDataAuthority stats={stats} />
      <LandingTwoTrack />
      <LandingTrustStats stats={stats} freshness={freshness} />
      <CustomerFooter />
    </div>
  );
}
