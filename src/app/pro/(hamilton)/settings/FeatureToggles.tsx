"use client";

import Link from "next/link";
import { hrefWithInstitutionContext } from "@/lib/hamilton/context-link";

const FEATURES = [
  {
    key: "analysis",
    label: "Institution Analysis",
    status: "Active",
    href: "/pro/analyze",
    description: "Provisional-first Hamilton analysis with verified-only benchmark caveats.",
  },
  {
    key: "benchmarking",
    label: "Peer Benchmarking",
    status: "Active",
    href: "/pro/analyze?intent=benchmark",
    description: "Verified medians exclude provisional evidence unless a workflow labels it separately.",
  },
  {
    key: "reports",
    label: "Consulting Reports",
    status: "Evidence gated",
    href: "/pro/reports",
    description: "Briefs use selected-institution evidence; thin profiles return diligence next steps.",
  },
  {
    key: "scenario_modeling",
    label: "Scenario Modeling",
    status: "Active",
    href: "/pro/simulate",
    description: "Saved scenarios retain evidence policy, peer baseline, and selected institution context.",
  },
  {
    key: "market_monitor",
    label: "Market Monitor",
    status: "Context scoped",
    href: "/pro/monitor",
    description: "Alerts and refresh actions stay tied to selected or watchlisted institutions.",
  },
];

interface FeatureTogglesProps {
  selectedInstitutionId?: string | null;
}

export function FeatureToggles({ selectedInstitutionId = null }: FeatureTogglesProps) {
  return (
    <div className="space-y-3">
      {FEATURES.map((feature) => (
        <Link
          key={feature.key}
          href={hrefWithInstitutionContext(feature.href, selectedInstitutionId)}
          className="block rounded-md border px-3 py-2 no-underline transition-colors hover:bg-white"
          style={{
            borderColor: "var(--hamilton-border)",
            backgroundColor: "var(--hamilton-surface-container-lowest, #fffdf9)",
          }}
        >
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium" style={{ color: "var(--hamilton-text-primary)" }}>
                {feature.label}
              </span>
              <span className="mt-0.5 block text-xs leading-5" style={{ color: "var(--hamilton-text-tertiary)" }}>
                {feature.description}
              </span>
            </span>
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                borderColor: "var(--hamilton-border)",
                color: "var(--hamilton-text-secondary)",
                backgroundColor: "var(--hamilton-surface-elevated)",
              }}
            >
              {feature.status}
            </span>
          </span>
        </Link>
      ))}
      <p className="text-[10px] leading-4" style={{ color: "var(--hamilton-text-tertiary)" }}>
        Hamilton capabilities are governed by selected institution context, evidence tier, and workspace access.
      </p>
    </div>
  );
}
