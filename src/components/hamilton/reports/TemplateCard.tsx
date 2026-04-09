"use client";

import type { ReportTemplateType } from "@/app/pro/(hamilton)/reports/actions";

interface TemplateCardProps {
  type: ReportTemplateType;
  title: string;
  description: string;
  tags: string[];
  icon: string;
  isSelected: boolean;
  onClick: () => void;
}

export function TemplateCard({
  title,
  description,
  tags,
  icon,
  isSelected,
  onClick,
}: TemplateCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative bg-surface-container-lowest p-8 editorial-shadow cursor-pointer text-left w-full transition-all duration-300"
      style={{
        border: isSelected
          ? "1px solid var(--hamilton-primary)"
          : "1px solid transparent",
        outline: "none",
      }}
    >
      {/* Icon */}
      <div className="mb-8">
        <span
          className="material-symbols-outlined text-4xl"
          style={{ color: "var(--hamilton-primary)" }}
        >
          {icon}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-headline text-2xl italic mb-3">{title}</h3>

      {/* Description */}
      <p
        className="text-sm leading-relaxed mb-6"
        style={{ color: "var(--hamilton-secondary)" }}
      >
        {description}
      </p>

      {/* Tag chips */}
      <div className="flex items-center gap-4 mt-auto flex-wrap">
        {tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] uppercase tracking-widest px-2 py-1 bg-surface-container-high"
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}
