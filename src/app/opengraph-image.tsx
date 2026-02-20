import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Bank Fee Index - National Benchmark for Retail Banking Fees";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="48"
            height="48"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.5"
          >
            <path d="M3 17l4-8 4 5 4-10 6 13" />
          </svg>
          <span
            style={{
              fontSize: "48px",
              fontWeight: 700,
              color: "white",
              letterSpacing: "-0.025em",
            }}
          >
            Bank Fee Index
          </span>
        </div>
        <p
          style={{
            fontSize: "24px",
            color: "#94a3b8",
            maxWidth: "700px",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          The national benchmark for retail banking fees across U.S. banks and
          credit unions.
        </p>
        <p
          style={{
            fontSize: "16px",
            color: "#64748b",
            marginTop: "24px",
          }}
        >
          bankfeeindex.com
        </p>
      </div>
    ),
    { ...size }
  );
}
