"use client";

interface WhyItMattersPanelProps {
  items: string[];
  isStreaming: boolean;
}

/**
 * WhyItMattersPanel — Shows bullet-point strategic importance items.
 * Renders the "Why It Matters" section from the analyze response.
 * Each item has a colored accent bullet matching the Hamilton design system.
 * Skeleton shimmer while streaming and items are empty.
 */
export function WhyItMattersPanel({ items, isStreaming }: WhyItMattersPanelProps) {
  const showSkeleton = isStreaming && items.length === 0;

  return (
    <div className="hamilton-card p-5">
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: "var(--hamilton-text-secondary)" }}
      >
        Why It Matters
      </h3>

      {showSkeleton ? (
        <div className="space-y-2">
          <div className="skeleton h-4 rounded w-full" />
          <div className="skeleton h-4 rounded w-5/6" />
          <div className="skeleton h-4 rounded w-4/5" />
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "var(--hamilton-accent)" }}
                aria-hidden="true"
              />
              <span
                className="text-sm leading-relaxed"
                style={{
                  color: "var(--hamilton-text-primary)",
                  fontFamily: "var(--hamilton-font-serif)",
                }}
              >
                {item}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
