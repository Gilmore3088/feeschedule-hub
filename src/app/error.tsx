"use client";

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#6b7280", marginBottom: 24 }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "8px 20px",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              background: "#0f172a",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              marginRight: 12,
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              padding: "8px 20px",
              fontSize: 14,
              fontWeight: 600,
              color: "#374151",
              background: "#f3f4f6",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            Go home
          </a>
        </div>
      </body>
    </html>
  );
}
