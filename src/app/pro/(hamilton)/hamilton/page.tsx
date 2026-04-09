import type { Metadata } from "next";

export const metadata: Metadata = { title: "Executive Briefing" };

export default function HamiltonHomePage() {
  return (
    <div className="p-8">
      <h1
        className="text-2xl font-bold"
        style={{ fontFamily: "var(--hamilton-font-serif)" }}
      >
        Executive Briefing
      </h1>
      <p style={{ color: "var(--hamilton-text-secondary)" }}>
        Phase 42 — coming soon.
      </p>
    </div>
  );
}
