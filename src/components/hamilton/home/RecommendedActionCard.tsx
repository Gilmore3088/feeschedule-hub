/**
 * RecommendedActionCard — Single CTA linking to Simulate screen.
 * Server component — no "use client".
 * Per copy rules: primary CTA label is "Simulate Change".
 * Per D-07: links to /pro/simulate?category={recommendedCategory}.
 */

import Link from "next/link";

interface RecommendedActionCardProps {
  recommendedCategory: string | null;
  thesisExists: boolean;
}

function deriveDisplayName(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RecommendedActionCard({
  recommendedCategory,
  thesisExists,
}: RecommendedActionCardProps) {
  const category = recommendedCategory ?? "overdraft";
  const displayName = deriveDisplayName(category);

  return (
    <div className="hamilton-card" style={{ padding: "1.5rem" }}>
      {/* Section label */}
      <span
        style={{
          display: "block",
          fontSize: "0.625rem",
          fontWeight: 600,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--hamilton-text-secondary)",
          marginBottom: "1rem",
        }}
      >
        Recommended Action
      </span>

      {thesisExists ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          <p
            style={{
              fontSize: "0.9375rem",
              lineHeight: 1.55,
              color: "var(--hamilton-text-primary)",
              fontFamily: "var(--hamilton-font-serif)",
              flex: 1,
              minWidth: "16rem",
            }}
          >
            Explore how adjusting your{" "}
            <strong style={{ fontWeight: 600 }}>{displayName}</strong> fee
            affects your competitive position.
          </p>
          <Link
            href={`/pro/simulate?category=${category}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--hamilton-gradient-cta)",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 600,
              borderRadius: "0.5rem",
              padding: "0.75rem 1.5rem",
              textDecoration: "none",
              flexShrink: 0,
              letterSpacing: "0.01em",
            }}
          >
            Simulate Change
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          <p
            style={{
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "var(--hamilton-text-secondary)",
              flex: 1,
              minWidth: "16rem",
            }}
          >
            Complete your institution setup in Settings to receive personalized
            recommendations.
          </p>
          <Link
            href="/pro/settings"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "var(--hamilton-surface-sunken)",
              color: "var(--hamilton-text-accent)",
              fontSize: "0.875rem",
              fontWeight: 500,
              borderRadius: "0.5rem",
              padding: "0.75rem 1.5rem",
              textDecoration: "none",
              flexShrink: 0,
              border: "1px solid var(--hamilton-border)",
            }}
          >
            Go to Settings
          </Link>
        </div>
      )}
    </div>
  );
}
