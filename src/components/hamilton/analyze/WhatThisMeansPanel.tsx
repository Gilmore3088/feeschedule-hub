"use client";

interface WhatThisMeansPanelProps {
  content: string;
  isStreaming: boolean;
}

/**
 * WhatThisMeansPanel — Shows the practical implications of Hamilton's analysis.
 * Renders the "What This Means" section from the analyze response.
 * Uses serif body font matching the Hamilton editorial design system.
 * Skeleton shimmer while streaming and content is empty.
 */
export function WhatThisMeansPanel({ content, isStreaming }: WhatThisMeansPanelProps) {
  const showSkeleton = isStreaming && !content;

  return (
    <div
      className="hamilton-card p-5"
      style={{ fontFamily: "var(--hamilton-font-serif)" }}
    >
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: "var(--hamilton-text-secondary)" }}
      >
        What This Means
      </h3>

      {showSkeleton ? (
        <div className="space-y-2">
          <div className="skeleton h-4 rounded w-full" />
          <div className="skeleton h-4 rounded w-5/6" />
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
