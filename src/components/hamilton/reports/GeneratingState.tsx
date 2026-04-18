"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * GeneratingState — what the user sees while Hamilton drafts the report.
 *
 * Three Anthropic API calls run in parallel server-side (executive summary,
 * strategic analysis, recommendation). Realistic total: ~10–15 seconds.
 *
 * Pure-client elapsed timer; the progress steps are heuristic (we don't
 * stream actual server progress yet — would require SSE wiring). The steps
 * advance on a schedule that roughly matches typical generation timing so
 * the UX doesn't feel frozen.
 */

const STEPS: { atSeconds: number; label: string }[] = [
  { atSeconds: 0,  label: "Pulling fee index data and peer baselines" },
  { atSeconds: 3,  label: "Drafting executive summary, strategic analysis, and recommendation" },
  { atSeconds: 12, label: "Hamilton is finishing the recommendation" },
  { atSeconds: 22, label: "Almost there — finalizing structure" },
];

export function GeneratingState() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, []);

  const currentStep =
    STEPS.filter((s) => elapsed >= s.atSeconds).slice(-1)[0] ?? STEPS[0];

  return (
    <div className="flex flex-col items-center justify-center py-20 px-8">
      <Loader2
        size={32}
        className="animate-spin mb-6"
        style={{ color: "var(--hamilton-accent)" }}
      />
      <p
        className="text-[15px] leading-relaxed text-center max-w-md mb-3"
        style={{ color: "var(--hamilton-text-secondary)" }}
      >
        {currentStep.label}…
      </p>
      <p
        className="text-[11px] uppercase tracking-widest tabular-nums"
        style={{ color: "var(--hamilton-text-tertiary, #86736b)" }}
      >
        {elapsed}s elapsed · typical run is 10–15s
      </p>
    </div>
  );
}
