"use client";

interface EvidenceMetric {
  label: string;
  value: string;
  note?: string;
}

interface EvidencePanelProps {
  metrics: EvidenceMetric[];
  isStreaming: boolean;
}

/**
 * EvidencePanel — Shows supporting data metrics for the analysis.
 * Renders the "Evidence" section from the analyze response.
 * Two-column layout: label | value, with optional sub-note below the value.
 * Values use tabular-nums for alignment.
 * Skeleton shimmer while streaming and metrics are empty.
 */
export function EvidencePanel({ metrics, isStreaming }: EvidencePanelProps) {
  const showSkeleton = isStreaming && metrics.length === 0;

  return (
    <div className="hamilton-card p-5">
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: "var(--hamilton-text-secondary)" }}
      >
        Evidence
      </h3>

      {showSkeleton ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton h-4 rounded w-1/3" />
              <div className="skeleton h-4 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : metrics.length === 0 ? null : (
        <table className="w-full text-sm">
          <tbody>
            {metrics.map((m, i) => (
              <tr
                key={i}
                className="border-b last:border-b-0"
                style={{ borderColor: "var(--hamilton-border)" }}
              >
                <td
                  className="py-2 pr-4 align-top text-sm"
                  style={{ color: "var(--hamilton-text-secondary)", width: "50%" }}
                >
                  {m.label}
                </td>
                <td className="py-2 align-top">
                  <span
                    className="font-medium tabular-nums"
                    style={{
                      color: "var(--hamilton-text-primary)",
                      fontFamily: "var(--hamilton-font-mono, monospace)",
                    }}
                  >
                    {m.value}
                  </span>
                  {m.note && (
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: "var(--hamilton-text-secondary)" }}
                    >
                      {m.note}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
