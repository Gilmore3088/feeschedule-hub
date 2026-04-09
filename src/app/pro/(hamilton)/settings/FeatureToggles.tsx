"use client";

import { useState } from "react";

const FEATURES = [
  { key: "benchmarking", label: "Fee Benchmarking", description: "Peer-to-peer fee comparisons", alwaysOn: true },
  { key: "peer_comparison", label: "Peer Comparison", description: "Cross-institution analysis", alwaysOn: true },
  { key: "scenario_modeling", label: "Scenario Modeling", description: "What-if fee simulations", alwaysOn: false },
  { key: "report_generation", label: "Report Generation", description: "Executive-ready reports", alwaysOn: false },
  { key: "market_monitor", label: "Market Monitor", description: "Continuous surveillance", alwaysOn: false },
];

export function FeatureToggles() {
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(FEATURES.map((f) => [f.key, true]))
  );

  function handleToggle(key: string) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-3">
      {FEATURES.map((feature) => {
        const isOn = feature.alwaysOn || toggles[feature.key];
        return (
          <div key={feature.key} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--hamilton-text-primary)" }}>
                {feature.label}
              </p>
              <p className="text-xs" style={{ color: "var(--hamilton-text-tertiary)" }}>
                {feature.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => !feature.alwaysOn && handleToggle(feature.key)}
              disabled={feature.alwaysOn}
              className="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none disabled:cursor-default"
              style={{
                backgroundColor: isOn ? "var(--hamilton-accent)" : "var(--hamilton-surface-container-high)",
              }}
              aria-checked={isOn}
              role="switch"
            >
              <span
                className="inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200"
                style={{
                  transform: isOn ? "translateX(1.25rem)" : "translateX(0.125rem)",
                  marginTop: "0.125rem",
                }}
              />
            </button>
          </div>
        );
      })}
      <p className="text-[10px] mt-2" style={{ color: "var(--hamilton-text-tertiary)" }}>
        Toggle preferences are visual only. Persistence coming in a future update.
      </p>
    </div>
  );
}
