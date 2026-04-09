import { FileText } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <FileText
        size={48}
        className="mb-6"
        style={{ color: "var(--hamilton-text-tertiary)" }}
      />
      <h3
        className="text-xl font-semibold mb-3"
        style={{
          fontFamily: "var(--hamilton-font-serif)",
          color: "var(--hamilton-text-primary)",
        }}
      >
        Select a report template
      </h3>
      <p
        className="text-[15px] leading-relaxed max-w-sm"
        style={{ color: "var(--hamilton-text-secondary)" }}
      >
        Choose a template, configure your scope, and Hamilton will generate a McKinsey-grade executive summary.
      </p>
    </div>
  );
}
