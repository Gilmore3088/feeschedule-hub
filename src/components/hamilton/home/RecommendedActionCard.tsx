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
    <div
      style={{
        padding: "1.5rem 2rem",
        backgroundColor: "var(--hamilton-surface-container-low)",
        borderRadius: "var(--hamilton-radius-lg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1.5rem",
        flexWrap: "wrap",
      }}
    >
      <p
        className="font-headline"
        style={{
          fontSize: "1rem",
          fontStyle: "italic",
          lineHeight: 1.5,
          color: "var(--hamilton-on-surface)",
          flex: 1,
          minWidth: "16rem",
          margin: 0,
        }}
      >
        {thesisExists ? (
          <>
            Explore how adjusting your{" "}
            <strong style={{ fontWeight: 600 }}>{displayName}</strong> fee
            affects your competitive position.
          </>
        ) : (
          "Complete your institution setup in Settings to receive personalized recommendations."
        )}
      </p>

      {thesisExists ? (
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
            borderRadius: "var(--hamilton-radius-lg)",
            padding: "0.75rem 1.5rem",
            textDecoration: "none",
            flexShrink: 0,
            letterSpacing: "0.01em",
            boxShadow: "var(--hamilton-shadow-card)",
          }}
        >
          Simulate Change
        </Link>
      ) : (
        <Link
          href="/pro/settings"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--hamilton-surface-container)",
            color: "var(--hamilton-primary)",
            fontSize: "0.875rem",
            fontWeight: 500,
            borderRadius: "var(--hamilton-radius-lg)",
            padding: "0.75rem 1.5rem",
            textDecoration: "none",
            flexShrink: 0,
            border: "1px solid var(--hamilton-outline-variant)",
          }}
        >
          Go to Settings
        </Link>
      )}
    </div>
  );
}
