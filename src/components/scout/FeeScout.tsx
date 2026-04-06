"use client";

import { useState } from "react";
import ResearchMode from "./ResearchMode";
import AuditMode from "./AuditMode";
import AgentMode from "./AgentMode";

type Mode = "research" | "audit" | "agent";

const MODE_LABELS: { key: Mode; label: string }[] = [
  { key: "research", label: "Research" },
  { key: "audit",    label: "URL Audit" },
  { key: "agent",    label: "Agent" },
];

export default function FeeScout() {
  const [mode, setMode] = useState<Mode>("research");

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex justify-center mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {MODE_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors border-none cursor-pointer ${
                mode === key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 bg-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "research" && <ResearchMode />}
      {mode === "audit" && <AuditMode />}
      {mode === "agent" && <AgentMode />}
    </div>
  );
}
