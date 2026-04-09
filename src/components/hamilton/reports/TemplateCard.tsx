"use client";

import type { ReportTemplateType } from "@/app/pro/(hamilton)/reports/actions";

interface TemplateCardProps {
  type: ReportTemplateType;
  title: string;
  description: string;
  estimatedTime: string;
  isSelected: boolean;
  onClick: () => void;
}

const TYPE_LABELS: Record<ReportTemplateType, string> = {
  quarterly_strategy: "Quarterly",
  peer_brief: "Peer",
  monthly_pulse: "Monthly",
  state_index: "State",
};

export function TemplateCard({
  type,
  title,
  description,
  estimatedTime,
  isSelected,
  onClick,
}: TemplateCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onClick}
      className="hamilton-card text-left w-full p-4 cursor-pointer transition-all"
      style={{
        outline: "none",
        boxShadow: isSelected
          ? `0 0 0 2px var(--hamilton-accent), 0 0 0 4px var(--hamilton-surface)`
          : "var(--hamilton-shadow-card)",
        borderColor: isSelected ? "var(--hamilton-accent)" : "var(--hamilton-border)",
      }}
    >
      {/* Type badge */}
      <span
        className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded mb-3"
        style={{
          backgroundColor: "var(--hamilton-accent-subtle)",
          color: "var(--hamilton-text-accent)",
        }}
      >
        {TYPE_LABELS[type]}
      </span>

      {/* Title */}
      <h3
        className="text-base font-semibold mb-1 leading-snug"
        style={{ color: "var(--hamilton-text-primary)" }}
      >
        {title}
      </h3>

      {/* Description */}
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: "var(--hamilton-text-secondary)" }}
      >
        {description}
      </p>

      {/* Estimated time */}
      <span
        className="text-[11px] font-medium"
        style={{ color: "var(--hamilton-text-tertiary)" }}
      >
        {estimatedTime}
      </span>
    </button>
  );
}
