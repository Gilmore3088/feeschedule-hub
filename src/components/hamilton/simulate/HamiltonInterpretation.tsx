"use client";

interface Props {
  interpretation: string;
  isStreaming: boolean;
}

export function HamiltonInterpretation({ interpretation, isStreaming }: Props) {
  // Empty and not streaming: placeholder
  if (!isStreaming && !interpretation) {
    return (
      <div
        className="rounded-lg border px-4 py-4"
        style={{
          borderColor: "var(--hamilton-border)",
          background: "var(--hamilton-surface-elevated)",
        }}
      >
        <p
          className="text-sm italic"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          Commit a fee change above to receive Hamilton&apos;s strategic interpretation.
        </p>
      </div>
    );
  }

  // Streaming but no content yet: skeleton
  if (isStreaming && !interpretation) {
    return (
      <div
        className="rounded-lg border px-4 py-4 flex flex-col gap-2"
        style={{
          borderColor: "var(--hamilton-border)",
          background: "var(--hamilton-surface-elevated)",
        }}
      >
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-5/6 rounded" />
        <div className="skeleton h-4 w-4/6 rounded" />
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border px-4 py-4"
      style={{
        borderColor: "var(--hamilton-border)",
        background: "var(--hamilton-surface-elevated)",
      }}
    >
      <p
        className="text-base leading-relaxed"
        style={{
          fontFamily: "var(--hamilton-font-serif)",
          color: "var(--hamilton-text-primary)",
        }}
      >
        {interpretation}
        {isStreaming && (
          <span
            className="ml-0.5 inline-block animate-pulse"
            style={{ color: "var(--hamilton-accent)" }}
          >
            ▋
          </span>
        )}
      </p>
    </div>
  );
}
