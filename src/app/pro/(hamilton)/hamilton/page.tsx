import { Suspense } from "react";
import { unstable_noStore } from "next/cache";
import type { Metadata } from "next";
import { fetchHomeBriefingData, fetchHomeBriefingSignals } from "@/lib/hamilton/home-data";
import { getCurrentUser } from "@/lib/auth";
import { HamiltonViewCard } from "@/components/hamilton/home/HamiltonViewCard";
import { PositioningEvidence } from "@/components/hamilton/home/PositioningEvidence";
import { WhatChangedCard } from "@/components/hamilton/home/WhatChangedCard";
import { PriorityAlertsCard } from "@/components/hamilton/home/PriorityAlertsCard";
import { RecommendedActionCard } from "@/components/hamilton/home/RecommendedActionCard";
import { MonitorFeedPreview } from "@/components/hamilton/home/MonitorFeedPreview";
import type { HomeBriefingSignals } from "@/lib/hamilton/home-data";

export const revalidate = 86400; // Per D-09: 24h ISR for thesis generation cost control

export const metadata: Metadata = { title: "Executive Briefing" };

/**
 * Skeleton placeholder for fresh-data signal components while loading.
 * Uses .skeleton shimmer class from globals.css.
 */
function SignalsSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* What Changed + Priority Alerts row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1rem",
        }}
      >
        <div
          className="hamilton-card skeleton"
          style={{ padding: "1.25rem", minHeight: "10rem" }}
        />
        <div
          className="hamilton-card skeleton"
          style={{ padding: "1.25rem", minHeight: "10rem" }}
        />
      </div>
      {/* Recommended Action + Monitor Feed */}
      <div
        className="hamilton-card skeleton"
        style={{ padding: "1.5rem", minHeight: "5rem" }}
      />
      <div
        className="hamilton-card skeleton"
        style={{ padding: "1.25rem", minHeight: "8rem" }}
      />
    </div>
  );
}

/**
 * BriefingSignals — fetches time-sensitive signal/alert data fresh on every load.
 * Per D-11: unstable_noStore() opts this async component out of ISR caching.
 * Per T-42-07: getCurrentUser() called here to scope alerts to current user.
 */
async function BriefingSignals({
  recommendedCategory,
  thesisExists,
}: {
  recommendedCategory: string | null;
  thesisExists: boolean;
}) {
  unstable_noStore();

  let signals: HomeBriefingSignals = {
    whatChanged: [],
    priorityAlerts: [],
    monitorFeed: [],
  };

  try {
    const user = await getCurrentUser();
    if (user) {
      signals = await fetchHomeBriefingSignals(user.id);
    }
  } catch {
    // Auth or DB unavailable — render empty states
  }

  return (
    <>
      {/* What Changed + Priority Alerts — 2-column grid on lg */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(1, 1fr)",
          gap: "1rem",
        }}
        className="briefing-signal-row"
      >
        <WhatChangedCard signals={signals.whatChanged} />
        <PriorityAlertsCard alerts={signals.priorityAlerts} />
      </div>

      {/* Recommended Action — full width prominent CTA */}
      <RecommendedActionCard
        recommendedCategory={recommendedCategory}
        thesisExists={thesisExists}
      />

      {/* Monitor Feed Preview — full width compact timeline */}
      <MonitorFeedPreview signals={signals.monitorFeed} />
    </>
  );
}

export default async function HamiltonHomePage() {
  const data = await fetchHomeBriefingData();

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div style={{ maxWidth: "56rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Page header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1
          style={{
            fontFamily: "var(--hamilton-font-serif)",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--hamilton-text-primary)",
            marginBottom: "0.375rem",
            lineHeight: 1.2,
          }}
        >
          Executive Briefing
        </h1>
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--hamilton-text-tertiary)",
          }}
        >
          {dateLabel} &mdash;{" "}
          {data.totalInstitutions.toLocaleString()} institutions
        </p>
      </div>

      {/* Content — ISR-cached thesis data renders immediately */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Module 1: Hamilton's View — thesis + confidence (ISR-cached) */}
        <HamiltonViewCard thesis={data.thesis} confidence={data.confidence} />

        {/* Module 2: Positioning Evidence — spotlight fee metrics (ISR-cached) */}
        <PositioningEvidence entries={data.positioning} />

        {/* Modules 3-6: Signal-driven cards — fresh on every load via Suspense */}
        <Suspense fallback={<SignalsSkeleton />}>
          <BriefingSignals
            recommendedCategory={data.recommendedCategory}
            thesisExists={data.thesis !== null}
          />
        </Suspense>
      </div>
    </div>
  );
}
