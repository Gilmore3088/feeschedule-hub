import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          borderRadius: 36,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <span
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: "#f8fafc",
              letterSpacing: -3,
              lineHeight: 1,
            }}
          >
            BFI
          </span>
          <div
            style={{
              width: 80,
              height: 3,
              background: "#3b82f6",
              borderRadius: 2,
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
