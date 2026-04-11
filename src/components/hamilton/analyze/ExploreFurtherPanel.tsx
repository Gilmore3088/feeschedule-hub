"use client";

const DEFAULT_PROMPTS = [
  "How does this compare to similar-sized banks?",
  "When did we become an outlier?",
  "Which peers moved first?",
  "What's driving complaint alignment?",
];

interface ExploreFurtherPanelProps {
  prompts: string[];
  onPromptSelect: (prompt: string) => void;
  isVisible: boolean;
}

/**
 * ExploreFurtherPanel — Centered "EXPLORE FURTHER" divider + prompt pills.
 * Matches HTML prototype: horizontal rule dividers flanking italic label,
 * pill-shaped prompt buttons with outlined style + hover primary border/color.
 * Falls back to DEFAULT_PROMPTS when Hamilton hasn't returned suggestions yet.
 */
export function ExploreFurtherPanel({
  prompts,
  onPromptSelect,
  isVisible,
}: ExploreFurtherPanelProps) {
  if (!isVisible) return null;

  const displayPrompts = prompts.length > 0 ? prompts : DEFAULT_PROMPTS;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Divider with label */}
      <div className="flex items-center gap-3" style={{ color: "var(--hamilton-text-tertiary)" }}>
        <span className="h-px w-12 block" style={{ backgroundColor: "var(--hamilton-outline-variant, #d8c2b8)" }} />
        <span
          className="text-[10px] uppercase tracking-[0.2em] font-bold italic"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          Explore further
        </span>
        <span className="h-px w-12 block" style={{ backgroundColor: "var(--hamilton-outline-variant, #d8c2b8)" }} />
      </div>

      {/* Prompt pills */}
      <div className="flex flex-wrap justify-center gap-3">
        {displayPrompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => onPromptSelect(prompt)}
            className="px-5 py-3 rounded-xl text-[11px] font-semibold border transition-all"
            style={{
              backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
              borderColor: "rgba(216,194,184,0.5)",
              color: "var(--hamilton-text-secondary)",
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = "var(--hamilton-primary)";
              el.style.color = "var(--hamilton-primary)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = "rgba(216,194,184,0.5)";
              el.style.color = "var(--hamilton-text-secondary)";
            }}
          >
            &ldquo;{prompt}&rdquo;
          </button>
        ))}
      </div>
    </div>
  );
}
