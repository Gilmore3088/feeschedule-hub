import type { Metadata } from "next";

export const metadata: Metadata = { title: "Institutional Monitor" };

export default function MonitorPage() {
  return (
    <div className="p-8">
      <h1
        className="text-2xl font-bold"
        style={{ fontFamily: "var(--hamilton-font-serif)" }}
      >
        Institutional Monitor
      </h1>
      <p style={{ color: "var(--hamilton-text-secondary)" }}>
        Phase 46 — coming soon.
      </p>
    </div>
  );
}
