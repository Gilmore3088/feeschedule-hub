import type { Metadata } from "next";
import { getPublicStats, getDataFreshness } from "@/lib/crawler-db/core";
import { LandingHero } from "./landing-hero";
import { LandingValueCards } from "./landing-value-cards";
import { LandingHowItWorks } from "./landing-how-it-works";
import { LandingGuideTeasers } from "./landing-guide-teasers";
import { LandingB2BStrip } from "./landing-b2b-strip";
import { LandingTrustStats } from "./landing-trust-stats";
import { CustomerFooter } from "@/components/customer-footer";

export const metadata: Metadata = {
  title: "Bank Fee Index -- Find What Your Bank Really Charges",
  description:
    "Compare fees across 8,000+ banks and credit unions. See how your bank's fees compare to the national median. Free, no account required.",
  openGraph: {
    title: "Bank Fee Index -- Find What Your Bank Really Charges",
    description:
      "Compare fees across 8,000+ banks and credit unions. See how your bank's fees compare to the national median.",
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
      <LandingValueCards />
      <LandingHowItWorks />
      <LandingGuideTeasers />
      <LandingB2BStrip />
      <LandingTrustStats stats={stats} freshness={freshness} />
      <CustomerFooter />
    </div>
  );
}
