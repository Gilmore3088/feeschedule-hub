"use client";

const TIER_CONFIG = {
  strong: {
    label: "Strong",
    bg: "bg-green-100",
    text: "text-green-700",
  },
  provisional: {
    label: "Provisional",
    bg: "bg-yellow-100",
    text: "text-yellow-700",
  },
  insufficient: {
    label: "Insufficient",
    bg: "bg-gray-100",
    text: "text-gray-500",
  },
} as const;

export function MaturityBadge({
  tier,
  approved,
  total,
}: {
  tier: "strong" | "provisional" | "insufficient";
  approved: number;
  total: number;
}) {
  const config = TIER_CONFIG[tier];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text} cursor-default`}
      title={`${approved} approved of ${total} total observations`}
    >
      {config.label}
    </span>
  );
}
