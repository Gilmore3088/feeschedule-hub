"use client";

import { TierMultiSelect } from "@/components/tier-multi-select";
import { CharterToggle } from "@/components/charter-toggle";

interface PeerFilterPanelProps {
  tierCounts: { tier: string; count: number }[];
  selectedTiers: string[];
  selectedCharter: string;
  basePath: string;
}

export function PeerFilterPanel({
  tierCounts,
  selectedTiers,
  selectedCharter,
  basePath,
}: PeerFilterPanelProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Charter Type
        </h3>
        <CharterToggle selected={selectedCharter} basePath={basePath} />
      </div>

      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Asset Size Tiers
        </h3>
        <TierMultiSelect
          tiers={tierCounts}
          selected={selectedTiers}
          basePath={basePath}
        />
      </div>
    </div>
  );
}
