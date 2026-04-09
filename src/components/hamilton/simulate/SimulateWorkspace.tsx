"use client";

import { useState, useEffect, useCallback } from "react";
import { useCompletion } from "@ai-sdk/react";
import { useRouter } from "next/navigation";
import {
  computeFeePosition,
  computeTradeoffs,
  type DistributionData,
  type FeePosition,
  type TradeoffDeltas,
} from "@/lib/hamilton/simulation";
import { canSimulate, type ConfidenceTier } from "@/lib/hamilton/confidence";
import {
  getSimulationCategories,
  getDistributionForCategory,
  saveScenario,
  listScenarios,
} from "@/app/pro/(hamilton)/simulate/actions";
import { ScenarioCategorySelector, type SimulationCategory } from "./ScenarioCategorySelector";
import { FeeSlider } from "./FeeSlider";
import { CurrentVsProposed } from "./CurrentVsProposed";
import { StrategicTradeoffs } from "./StrategicTradeoffs";
import { RecommendedPositionCard } from "./RecommendedPositionCard";
import { HamiltonInterpretation } from "./HamiltonInterpretation";
import { ScenarioArchive, type ScenarioListItem } from "./ScenarioArchive";
import { InsufficientConfidenceGate } from "./InsufficientConfidenceGate";
import { GenerateBoardSummaryButton } from "./GenerateBoardSummaryButton";

interface InstitutionContext {
  name?: string;
  type?: string;
  assetTier?: string;
  fedDistrict?: number | null;
}

interface Props {
  userId: number;
  institutionId: string | null;
  institutionContext: InstitutionContext;
}

export function SimulateWorkspace({ userId: _userId, institutionId, institutionContext }: Props) {
  const router = useRouter();

  // ─── Category + Distribution ───────────────────────────────────────────────
  const [categories, setCategories] = useState<SimulationCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [distribution, setDistribution] = useState<DistributionData | null>(null);
  const [confidenceTier, setConfidenceTier] = useState<ConfidenceTier | null>(null);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Fee Values ───────────────────────────────────────────────────────────
  const [currentFee, setCurrentFee] = useState(0);
  const [proposedFee, setProposedFee] = useState(0);

  // ─── Scenario Persistence ─────────────────────────────────────────────────
  const [savedScenarioId, setSavedScenarioId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  // ─── Streaming Interpretation ────────────────────────────────────────────
  const { complete, completion, isLoading: isStreaming } = useCompletion({
    api: "/api/hamilton/simulate",
  });

  // ─── Derived State ────────────────────────────────────────────────────────
  let currentPosition: FeePosition | null = null;
  let proposedPosition: FeePosition | null = null;
  let tradeoffs: TradeoffDeltas | null = null;

  if (distribution) {
    currentPosition = computeFeePosition(currentFee, distribution);
    proposedPosition = computeFeePosition(proposedFee, distribution);
    tradeoffs = computeTradeoffs(currentFee, proposedFee, currentPosition, proposedPosition);
  }

  const simulationBlocked =
    confidenceTier !== null && !canSimulate(confidenceTier).allowed;
  const blockedReason =
    confidenceTier !== null && !canSimulate(confidenceTier).allowed
      ? (canSimulate(confidenceTier) as { allowed: false; reason: string }).reason
      : "";

  const canGenerateSummary = !isStreaming && completion.length > 0 && !simulationBlocked;

  // ─── Initialization ───────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingCategories(true);
    getSimulationCategories()
      .then((cats) => setCategories(cats))
      .catch(() => setError("Failed to load fee categories"))
      .finally(() => setLoadingCategories(false));

    listScenarios()
      .then(setScenarios)
      .catch(() => {});
  }, []);

  // ─── Category Selection ───────────────────────────────────────────────────
  const handleCategorySelect = useCallback(async (feeCategory: string) => {
    setSelectedCategory(feeCategory);
    setLoadingCategory(true);
    setError(null);
    setSavedScenarioId(null);
    setSelectedScenarioId(null);

    const result = await getDistributionForCategory(feeCategory);
    if ("error" in result) {
      setError(result.error);
      setDistribution(null);
      setConfidenceTier(null);
    } else {
      setDistribution(result.distribution);
      setConfidenceTier(result.confidenceTier);
      // Default: both current and proposed start at median
      setCurrentFee(result.distribution.median_amount);
      setProposedFee(result.distribution.median_amount);
    }

    setLoadingCategory(false);
  }, []);

  // ─── Slider Handlers ──────────────────────────────────────────────────────
  const handleSliderChange = useCallback((value: number[]) => {
    const newFee = value[0];
    if (newFee !== undefined) {
      setProposedFee(newFee);
      setSavedScenarioId(null); // reset saved state on new value
    }
  }, []);

  const handleSliderCommit = useCallback(
    async (value: number[]) => {
      const proposed = value[0];
      if (proposed === undefined || !distribution || !selectedCategory) return;

      setProposedFee(proposed);
      setSavedScenarioId(null);

      await complete("", {
        body: {
          feeCategory: selectedCategory,
          currentFee,
          proposedFee: proposed,
          distributionData: distribution,
          institutionContext,
        },
      });
    },
    [distribution, selectedCategory, currentFee, institutionContext, complete]
  );

  // ─── Save Scenario ────────────────────────────────────────────────────────
  const handleSave = useCallback(async (): Promise<string | null> => {
    if (!selectedCategory || !distribution || !confidenceTier || !proposedPosition) return null;
    if (simulationBlocked) return null;

    setIsSaving(true);
    const result = await saveScenario({
      institutionId: institutionId ?? "",
      feeCategory: selectedCategory,
      currentValue: currentFee,
      proposedValue: proposedFee,
      resultJson: {
        currentFee,
        proposedFee,
        currentPosition,
        proposedPosition,
        interpretation: completion,
      },
      confidenceTier,
    });

    setIsSaving(false);

    if ("error" in result) {
      setError(result.error);
      return null;
    }

    setSavedScenarioId(result.id);
    // Refresh archive
    listScenarios().then(setScenarios).catch(() => {});
    return result.id;
  }, [
    selectedCategory,
    distribution,
    confidenceTier,
    proposedPosition,
    simulationBlocked,
    institutionId,
    currentFee,
    proposedFee,
    currentPosition,
    completion,
  ]);

  // ─── Generate Board Summary ───────────────────────────────────────────────
  const handleGenerateSummary = useCallback(async () => {
    let scenarioId = savedScenarioId;
    if (!scenarioId) {
      scenarioId = await handleSave();
    }
    if (scenarioId) {
      router.push(`/pro/report?scenario_id=${scenarioId}`);
    }
  }, [savedScenarioId, handleSave, router]);

  // ─── Restore Scenario ─────────────────────────────────────────────────────
  const handleScenarioSelect = useCallback(
    async (scenario: ScenarioListItem) => {
      setSelectedScenarioId(scenario.id);
      setSavedScenarioId(scenario.id);

      // Re-load the category for this scenario
      if (scenario.fee_category !== selectedCategory) {
        await handleCategorySelect(scenario.fee_category);
      }

      const current = parseFloat(scenario.current_value);
      const proposed = parseFloat(scenario.proposed_value);
      if (!isNaN(current)) setCurrentFee(current);
      if (!isNaN(proposed)) setProposedFee(proposed);
    },
    [selectedCategory, handleCategorySelect]
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex gap-6 p-6 min-h-screen"
      style={{ background: "var(--hamilton-surface)" }}
    >
      {/* Main workspace */}
      <div className="flex-1 flex flex-col gap-5 min-w-0">
        {/* Screen heading */}
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: "var(--hamilton-font-serif)", color: "var(--hamilton-text-primary)" }}
          >
            Scenario Modeling
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--hamilton-text-secondary)" }}>
            Model a fee change to see strategic position, peer tradeoffs, and Hamilton&apos;s recommendation.
          </p>
        </div>

        {/* Category selector */}
        <ScenarioCategorySelector
          categories={categories}
          selected={selectedCategory}
          loading={loadingCategories || loadingCategory}
          onSelect={handleCategorySelect}
        />

        {error && (
          <p className="text-sm" style={{ color: "rgb(220 38 38)" }}>
            {error}
          </p>
        )}

        {/* Main simulation UI — shown once a category is selected and data loaded */}
        {distribution && confidenceTier && !loadingCategory && (
          <>
            {simulationBlocked ? (
              <InsufficientConfidenceGate reason={blockedReason} />
            ) : (
              <>
                {/* Slider */}
                <div
                  className="rounded-lg border p-4"
                  style={{
                    borderColor: "var(--hamilton-border)",
                    background: "var(--hamilton-surface-elevated)",
                  }}
                >
                  <FeeSlider
                    min={distribution.min_amount}
                    max={distribution.max_amount}
                    step={0.5}
                    currentFee={currentFee}
                    proposedFee={proposedFee}
                    median={distribution.median_amount}
                    p75={distribution.p75_amount}
                    onValueChange={handleSliderChange}
                    onValueCommit={handleSliderCommit}
                  />
                </div>

                {/* Current vs Proposed comparison */}
                {currentPosition && proposedPosition && (
                  <CurrentVsProposed
                    feeCategory={selectedCategory!}
                    currentFee={currentFee}
                    proposedFee={proposedFee}
                    currentPosition={currentPosition}
                    proposedPosition={proposedPosition}
                  />
                )}

                {/* Hamilton interpretation (streams after slider commit) */}
                <HamiltonInterpretation
                  interpretation={completion}
                  isStreaming={isStreaming}
                />

                {/* Strategic tradeoffs */}
                <StrategicTradeoffs tradeoffs={tradeoffs} />

                {/* Recommended position */}
                {proposedPosition && (
                  <RecommendedPositionCard
                    confidenceTier={confidenceTier}
                    proposedFee={proposedFee}
                    proposedPosition={proposedPosition}
                    median={distribution.median_amount}
                    p25={distribution.p25_amount}
                  />
                )}

                {/* Save + Board Summary CTA */}
                <div className="flex flex-col gap-2">
                  {!savedScenarioId && completion && (
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="self-start text-sm px-4 py-2 rounded-md border transition-colors disabled:opacity-50"
                      style={{
                        borderColor: "var(--hamilton-border)",
                        color: "var(--hamilton-text-secondary)",
                        background: "var(--hamilton-surface-elevated)",
                      }}
                    >
                      {isSaving ? "Saving..." : "Save Scenario"}
                    </button>
                  )}
                  <GenerateBoardSummaryButton
                    disabled={!canGenerateSummary}
                    savedScenarioId={savedScenarioId}
                    onGenerate={handleGenerateSummary}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Right rail: scenario archive */}
      <div className="w-64 flex-shrink-0 hidden lg:block">
        <ScenarioArchive
          scenarios={scenarios}
          selectedId={selectedScenarioId}
          onSelect={handleScenarioSelect}
        />
      </div>
    </div>
  );
}
