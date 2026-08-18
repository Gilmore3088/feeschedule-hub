/**
 * HamiltonStatusBanner — honest status affordance for the Executive Briefing
 * home screen when the thesis could not be generated this request.
 * Server component — no "use client". Renders nothing when status is "current"
 * so the happy path is visually unchanged.
 */

import { CONTACT_EMAIL } from "@/lib/constants";
import type { ThesisStatus } from "@/lib/hamilton/home-data";

interface HamiltonStatusBannerProps {
  status: ThesisStatus;
}

const STATUS_COPY: Record<Exclude<ThesisStatus, "current">, string> = {
  paused: `Hamilton analysis is paused for maintenance. Your data is safe — try again shortly or email ${CONTACT_EMAIL}.`,
  unavailable: "Hamilton couldn't generate today's analysis. The rest of your workspace is unaffected — try again shortly.",
};

export function HamiltonStatusBanner({ status }: HamiltonStatusBannerProps) {
  if (status === "current") return null;

  const isPaused = status === "paused";

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.875rem 1.25rem",
        borderRadius: "0.5rem",
        backgroundColor: isPaused
          ? "var(--hamilton-tertiary-container)"
          : "var(--hamilton-error-container)",
        color: isPaused ? "var(--hamilton-tertiary)" : "var(--hamilton-error)",
        fontSize: "0.875rem",
      }}
    >
      {STATUS_COPY[status]}
    </div>
  );
}
