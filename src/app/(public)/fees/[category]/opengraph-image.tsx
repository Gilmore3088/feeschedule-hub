import { ImageResponse } from "next/og";
import { getNationalIndex } from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

export default async function OGImage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const displayName = getDisplayName(category);
  const entries = getNationalIndex();
  const entry = entries.find((e) => e.fee_category === category);

  const median = entry?.median_amount;
  const count = entry?.institution_count ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          background: "#0f172a",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            color: "#94a3b8",
            fontSize: 24,
            letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
            marginBottom: 16,
          }}
        >
          Bank Fee Index
        </div>
        <div
          style={{
            color: "#f8fafc",
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.15,
            marginBottom: 32,
          }}
        >
          {displayName}: 2026 National Benchmark
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "24px",
          }}
        >
          <div
            style={{
              color: "#fbbf24",
              fontSize: 80,
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            {median != null ? `$${median.toFixed(2)}` : "N/A"}
          </div>
          <div style={{ color: "#64748b", fontSize: 24 }}>
            national median across {count.toLocaleString()} institutions
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
