import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analysis Workspace" };

export default function AnalyzePage() {
  return (
    <div className="p-8">
      <h1
        className="text-2xl font-bold"
        style={{ fontFamily: "var(--hamilton-font-serif)" }}
      >
        Analysis Workspace
      </h1>
      <p style={{ color: "var(--hamilton-text-secondary)" }}>
        Phase 43 — coming soon.
      </p>
    </div>
  );
}
