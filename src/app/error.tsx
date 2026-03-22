"use client";

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 24px", textAlign: "center", fontFamily: "Georgia, serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 400, color: "#1A1815", marginBottom: 12, letterSpacing: "-0.02em" }}>
        Something went wrong
      </h1>
      <p style={{ color: "#7A7062", marginBottom: 24, fontSize: 14 }}>
        An unexpected error occurred. Please try again.
      </p>
      <button
        onClick={reset}
        style={{
          padding: "10px 24px",
          fontSize: 13,
          fontWeight: 600,
          color: "#fff",
          background: "#C44B2E",
          border: "none",
          borderRadius: 999,
          cursor: "pointer",
          marginRight: 12,
        }}
      >
        Try again
      </button>
      <a
        href="/"
        style={{
          padding: "10px 24px",
          fontSize: 13,
          fontWeight: 500,
          color: "#5A5347",
          background: "transparent",
          border: "1px solid #E8DFD1",
          borderRadius: 999,
          textDecoration: "none",
        }}
      >
        Go home
      </a>
    </div>
  );
}
