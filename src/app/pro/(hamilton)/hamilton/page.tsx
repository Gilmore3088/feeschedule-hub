import { Suspense } from "react";
import { unstable_noStore } from "next/cache";
import type { Metadata } from "next";
import { fetchHomeBriefingData, fetchHomeBriefingSignals } from "@/lib/hamilton/home-data";
import { getCurrentUser } from "@/lib/auth";
import { HamiltonViewCard } from "@/components/hamilton/home/HamiltonViewCard";
import { PositioningEvidence } from "@/components/hamilton/home/PositioningEvidence";
import { WhatChangedCard } from "@/components/hamilton/home/WhatChangedCard";
import { PriorityAlertsCard } from "@/components/hamilton/home/PriorityAlertsCard";
import { MonitorFeedPreview } from "@/components/hamilton/home/MonitorFeedPreview";
import { RecommendedActionCard } from "@/components/hamilton/home/RecommendedActionCard";
import type { HomeBriefingSignals } from "@/lib/hamilton/home-data";

export const revalidate = 86400; // Per D-09: 24h ISR for thesis generation cost control

export const metadata: Metadata = { title: "Executive Briefing" };

/**
 * Skeleton placeholder for fresh-data signal components while loading.
 * Uses .skeleton shimmer class from globals.css.
 */
function SignalsSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div
        style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "2rem" }}
      >
        <div className="hamilton-card skeleton" style={{ minHeight: "12rem" }} />
        <div className="hamilton-card skeleton" style={{ minHeight: "12rem" }} />
      </div>
      <div className="hamilton-card skeleton" style={{ minHeight: "5rem" }} />
    </div>
  );
}

/**
 * BriefingSignals — fetches time-sensitive signal/alert data fresh on every load.
 * Per D-11: unstable_noStore() opts this async component out of ISR caching.
 */
async function BriefingSignals() {
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
      {/* Second Row: WhatChanged (8 col) + PriorityAlerts (4 col) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "2rem",
        }}
      >
        <WhatChangedCard signals={signals.whatChanged} />
        <PriorityAlertsCard alerts={signals.priorityAlerts} />
      </div>

      {/* Monitor Feed — full-width timeline */}
      <MonitorFeedPreview signals={signals.monitorFeed} />
    </>
  );
}

export default async function HamiltonHomePage() {
  const data = await fetchHomeBriefingData();

  return (
    <div>
      {/* Page header — "Executive Briefing" + subtitle pills */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "3rem",
        }}
      >
        <div>
          <h1
            className="font-headline"
            style={{
              fontSize: "3rem",
              fontStyle: "italic",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "var(--hamilton-on-surface)",
              lineHeight: 1.1,
              marginBottom: "0.5rem",
            }}
          >
            Executive Briefing
          </h1>
          <span
            className="font-label"
            style={{
              fontSize: "0.625rem",
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--hamilton-on-surface-variant)",
            }}
          >
            {data.thesis ? "Analysis current" : "Analysis unavailable"}
          </span>
        </div>

        <div style={{ display: "flex", gap: "1rem", flexShrink: 0 }}>
          <button
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "var(--hamilton-surface-container-high)",
              color: "var(--hamilton-on-surface)",
              fontSize: "0.875rem",
              fontWeight: 500,
              borderRadius: "var(--hamilton-radius-lg)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Export PDF
          </button>
          <button
            className="burnished-cta editorial-shadow"
            style={{
              padding: "0.5rem 1rem",
              color: "var(--hamilton-on-primary)",
              fontSize: "0.875rem",
              fontWeight: 500,
              borderRadius: "var(--hamilton-radius-lg)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Full Dashboard
          </button>
        </div>
      </header>

      {/* Content grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        {/* Row 1: Hamilton's View — full width */}
        <HamiltonViewCard thesis={data.thesis} confidence={data.confidence} />

        {/* Row 2: Positioning Evidence — full width */}
        <PositioningEvidence entries={data.positioning} />

        {/* Row 3: Recommended Action — full width */}
        <RecommendedActionCard
          recommendedCategory={data.recommendedCategory}
          thesisExists={data.thesis !== null}
        />

        {/* Fresh signal rows via Suspense (WhatChanged + PriorityAlerts + MonitorFeed) */}
        <Suspense fallback={<SignalsSkeleton />}>
          <BriefingSignals />
        </Suspense>
      </div>
    </div>
  );
}
