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
      {/* Icon — small, top-right corner. Title + description are the primary
          scan layer (audit M-3). The icon is decorative; title is what bankers
          read to choose a template. */}
      <span
        className="material-symbols-outlined text-[20px] absolute top-6 right-6 opacity-60"
        style={{ color: "var(--hamilton-primary)" }}
        aria-hidden="true"
      >
        {icon}
      </span>

      {/* Title */}
      <h3 className="font-headline text-2xl italic mb-3 pr-10">{title}</h3>

      {/* Description */}
      <p
        className="text-sm leading-relaxed mb-6"
        style={{ color: "var(--hamilton-secondary)" }}
      >
        {description}
      </p>

      {/* Tag chips */}
      <div className="flex items-center gap-3 mt-auto flex-wrap">
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
