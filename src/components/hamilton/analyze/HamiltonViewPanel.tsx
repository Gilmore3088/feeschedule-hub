"use client";

interface ConfidenceBadgeProps {
  level: string;
}

function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  const colors: Record<string, { bg: string; text: string }> = {
    high: { bg: "var(--hamilton-confidence-high-bg, #ecfdf5)", text: "var(--hamilton-confidence-high, #059669)" },
    medium: { bg: "var(--hamilton-confidence-medium-bg, #fffbeb)", text: "var(--hamilton-confidence-medium, #d97706)" },
    low: { bg: "var(--hamilton-confidence-low-bg, #fff1f2)", text: "var(--hamilton-confidence-low, #e11d48)" },
  };
  const { bg, text } = colors[level.toLowerCase()] ?? colors.medium;

  return (
    <span
      className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ backgroundColor: bg, color: text }}
    >
      {level} confidence
    </span>
  );
}

interface HamiltonViewPanelProps {
  content: string;
  confidence: { level: string; basis: string[] } | null;
  isStreaming: boolean;
}

/**
 * HamiltonViewPanel — Shows Hamilton's core analytical finding.
 * Displays the "Hamilton's View" section from the analyze response.
 * Shows a confidence badge (High/Medium/Low) when available.
 * Skeleton shimmer while streaming and content is empty.
 */
export function HamiltonViewPanel({ content, confidence, isStreaming }: HamiltonViewPanelProps) {
  const showSkeleton = isStreaming && !content;

  return (
    <div
      className="hamilton-card p-5"
      style={{ fontFamily: "var(--hamilton-font-serif)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--hamilton-text-secondary)" }}
        >
          Hamilton&apos;s View
        </h3>
        {confidence && !showSkeleton && (
          <ConfidenceBadge level={confidence.level} />
        )}
      </div>

      {showSkeleton ? (
        <div className="space-y-2">
          <div className="skeleton h-4 rounded w-full" />
          <div className="skeleton h-4 rounded w-5/6" />
          <div className="skeleton h-4 rounded w-4/6" />
        </div>
      ) : (
        <p
          className="leading-relaxed text-base"
          style={{ color: "var(--hamilton-text-primary)" }}
        >
          {content}
        </p>
      )}
    </div>
  );
}
