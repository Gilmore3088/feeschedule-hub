import type { Metadata } from "next";

export const metadata: Metadata = { title: "Scenario Modeling" };

export default function SimulatePage() {
  return (
    <div className="p-8">
      <h1
        className="text-2xl font-bold"
        style={{ fontFamily: "var(--hamilton-font-serif)" }}
      >
        Scenario Modeling
      </h1>
      <p style={{ color: "var(--hamilton-text-secondary)" }}>
        Phase 44 — coming soon.
      </p>
    </div>
  );
}
