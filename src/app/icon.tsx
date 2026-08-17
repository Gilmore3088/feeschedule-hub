import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const PARCHMENT = "#FAF7F2";
const TERRACOTTA = "#C44B2E";

/** Favicon: the Fee Insight three-bars mark (same geometry as customer-nav) on parchment. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PARCHMENT,
          borderRadius: 6,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width={26}
          height={26}
          fill="none"
          stroke={TERRACOTTA}
          strokeWidth={1.5}
        >
          <rect x="4" y="13" width="4" height="8" rx="1" />
          <rect x="10" y="8" width="4" height="13" rx="1" />
          <rect x="16" y="3" width="4" height="18" rx="1" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
