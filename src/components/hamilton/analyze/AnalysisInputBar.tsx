"use client";

import { useRef, useEffect, type KeyboardEvent, type FormEvent } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

interface AnalysisInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  placeholder?: string;
}

/**
 * AnalysisInputBar — Floating editorial chat input for the Analyze screen.
 * Auto-resizing textarea with send button (ArrowUp icon).
 * Enter submits; Shift+Enter inserts a newline.
 * Send button is disabled and shows a spinner while loading.
 * Styled with Hamilton design tokens.
 */
export function AnalysisInputBar({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder = "Ask Hamilton to analyze a fee category, pricing position, or competitive signal…",
}: AnalysisInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea as content grows
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) {
        onSubmit();
      }
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLoading && value.trim()) {
      onSubmit();
    }
  }

  return (
    <div
      className="rounded-xl border shadow-sm"
      style={{
        backgroundColor: "var(--hamilton-surface)",
        borderColor: "var(--hamilton-border)",
      }}
    >
      <form onSubmit={handleFormSubmit} className="flex items-end gap-2 p-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-gray-400"
          style={{
            color: "var(--hamilton-text-primary)",
            fontFamily: "var(--hamilton-font-sans)",
            minHeight: "24px",
            maxHeight: "200px",
          }}
          aria-label="Analysis prompt"
        />

        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity disabled:opacity-40"
          style={{
            backgroundColor: "var(--hamilton-accent)",
            color: "var(--hamilton-accent-fg, #fff)",
            cursor: isLoading || !value.trim() ? "not-allowed" : "pointer",
          }}
          aria-label="Send"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </button>
      </form>

      <p className="px-3 pb-2 text-[11px]" style={{ color: "var(--hamilton-text-tertiary, #9ca3af)" }}>
        Shift+Enter for newline · Analyze only — for recommendations, use Simulate
      </p>
    </div>
  );
}
