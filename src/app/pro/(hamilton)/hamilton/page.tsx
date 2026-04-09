import type { Metadata } from "next";
import { fetchHomeBriefingData } from "@/lib/hamilton/home-data";
import { HamiltonViewCard } from "@/components/hamilton/home/HamiltonViewCard";
import { PositioningEvidence } from "@/components/hamilton/home/PositioningEvidence";

export const revalidate = 86400; // Per D-09: 24h ISR for thesis generation cost control

export const metadata: Metadata = { title: "Executive Briefing" };

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

      {/* Content */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <HamiltonViewCard thesis={data.thesis} confidence={data.confidence} />

        <PositioningEvidence entries={data.positioning} />

        {/* Plan 02: WhatChangedCard */}
        {/* Plan 02: PriorityAlertsCard */}
        {/* Plan 02: RecommendedActionCard */}
        {/* Plan 02: MonitorFeedPreview */}
      </div>
    </div>
  );
}
