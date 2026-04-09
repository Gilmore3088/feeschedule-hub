"use client";

interface ExploreFurtherPanelProps {
  prompts: string[];
  onPromptSelect: (prompt: string) => void;
  isVisible: boolean;
}

/**
 * ExploreFurtherPanel — Shows follow-up question pills after analysis completes.
 * Clicking a pill pre-fills the analysis input with that question.
 * Only renders when visible and at least one prompt is available.
 * Renders prompts as rounded pill buttons with hover fill.
 */
export function ExploreFurtherPanel({
  prompts,
  onPromptSelect,
  isVisible,
}: ExploreFurtherPanelProps) {
  if (!isVisible || prompts.length === 0) return null;

  return (
    <div className="px-1 py-2">
      <p
        className="text-sm font-semibold mb-3"
        style={{ color: "var(--hamilton-text-secondary)" }}
      >
        Explore Further
      </p>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => onPromptSelect(prompt)}
            className="text-sm px-4 py-2 rounded-full border transition-colors"
            style={{
              borderColor: "var(--hamilton-border)",
              color: "var(--hamilton-text-primary)",
              backgroundColor: "transparent",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "var(--hamilton-surface-hover, rgba(0,0,0,0.04))";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
            }}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
