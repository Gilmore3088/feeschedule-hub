import { ImageResponse } from "next/og";

export const alt = "Bank Fee Index — the national authority on banking fees";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #fdf7ee 0%, #f3ead7 55%, #e9d9b9 100%)",
          padding: "80px",
          justifyContent: "space-between",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            color: "#a34a1c",
            fontSize: "22px",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              background: "#a34a1c",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fdf7ee",
              fontSize: "26px",
              fontWeight: 700,
            }}
          >
            $
          </div>
          <span>Bank Fee Index</span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div
            style={{
              fontSize: "78px",
              fontWeight: 700,
              color: "#23170d",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            The national authority on banking fees.
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 400,
              color: "#5a4331",
              lineHeight: 1.3,
            }}
          >
            Research-grade fee intelligence across 8,000+ banks and credit unions.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            color: "#8b6b4f",
            fontSize: "20px",
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span>bankfeeindex.com</span>
          <span>Benchmarks · Peer intel · Hamilton research</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
