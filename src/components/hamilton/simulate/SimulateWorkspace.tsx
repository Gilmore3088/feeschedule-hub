"use client";

import { useState, useEffect, useCallback } from "react";
import { SlidersHorizontal } from "lucide-react";
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
import { DISPLAY_NAMES } from "@/lib/fee-taxonomy";
import {
  getSimulationCategories,
  getDistributionForCategory,
  getInstitutionFee,
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
  initialCategory?: string;
}

function formatDollar(v: number): string {
  return `$${v.toFixed(2)}`;
}

function formatCategory(cat: string): string {
  return DISPLAY_NAMES[cat] ?? cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SimulateWorkspace({ userId: _userId, institutionId, institutionContext, initialCategory }: Props) {
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
  const [usingInstitutionFee, setUsingInstitutionFee] = useState(false);

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

      // Use institution's actual fee if available, otherwise national median
      const instFee = institutionId ? await getInstitutionFee(institutionId, feeCategory) : null;
      const hasInstFee = instFee !== null;
      const startingFee = hasInstFee ? Math.round(instFee.amount) : result.distribution.median_amount;
      setUsingInstitutionFee(hasInstFee);
      setCurrentFee(startingFee);
      setProposedFee(startingFee);
    }

    setLoadingCategory(false);
  }, [institutionId]);

  // ─── Initialization ───────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingCategories(true);
    getSimulationCategories()
      .then((cats) => {
        setCategories(cats);
        if (initialCategory && cats.some((c) => c.fee_category === initialCategory)) {
          handleCategorySelect(initialCategory);
        }
      })
      .catch(() => setError("Failed to load fee categories"))
      .finally(() => setLoadingCategories(false));

    listScenarios()
      .then(setScenarios)
      .catch(() => {});
  }, [initialCategory, handleCategorySelect]);

  // ─── Slider Handlers ──────────────────────────────────────────────────────
  const handleSliderChange = useCallback((value: number[]) => {
    const newFee = value[0];
    if (newFee !== undefined) {
      setProposedFee(newFee);
      setSavedScenarioId(null);
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

  const handleInputChange = useCallback(
    (value: number) => {
      if (!distribution) return;
      const clamped = Math.max(distribution.min_amount, Math.min(distribution.max_amount, value));
      setProposedFee(clamped);
      setSavedScenarioId(null);
    },
    [distribution]
  );

  const handleInputCommit = useCallback(async () => {
    if (!distribution || !selectedCategory) return;
    await complete("", {
      body: {
        feeCategory: selectedCategory,
        currentFee,
        proposedFee,
        distributionData: distribution,
        institutionContext,
      },
    });
  }, [distribution, selectedCategory, currentFee, proposedFee, institutionContext, complete]);

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

  const handleReset = useCallback(() => {
    if (!distribution) return;
    setProposedFee(distribution.median_amount);
    setSavedScenarioId(null);
  }, [distribution]);

  // ─── Generate Board Summary ───────────────────────────────────────────────
  const handleGenerateSummary = useCallback(async () => {
    let scenarioId = savedScenarioId;
    if (!scenarioId) {
      scenarioId = await handleSave();
    }
    if (scenarioId) {
      router.push(`/pro/reports?scenario_id=${scenarioId}`);
    }
  }, [savedScenarioId, handleSave, router]);

  // ─── Restore Scenario ─────────────────────────────────────────────────────
  const handleScenarioSelect = useCallback(
    async (scenario: ScenarioListItem) => {
      setSelectedScenarioId(scenario.id);
      setSavedScenarioId(scenario.id);

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

  // ─── Derived display values ────────────────────────────────────────────────
  const categoryLabel = selectedCategory ? formatCategory(selectedCategory) : "Fee Simulation";
  const hasDistribution = distribution && confidenceTier && !loadingCategory;
  const hasSimulation = hasDistribution && !simulationBlocked && currentPosition && proposedPosition;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--hamilton-surface)" }}>

      {/* Page Header ─────────────────────────────────────────────────────── */}
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1
            className="font-headline text-4xl leading-tight tracking-tight mb-1"
            style={{ color: "var(--hamilton-on-surface)" }}
          >
            {selectedCategory ? `Fee Simulation: ${categoryLabel}` : "Fee Simulation"}
          </h1>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
          style={{
            color: "var(--hamilton-primary)",
            background: "color-mix(in srgb, var(--hamilton-primary) 5%, transparent)",
            borderColor: "color-mix(in srgb, var(--hamilton-primary) 10%, transparent)",
          }}
        >
          <span className="relative flex h-2 w-2">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: "var(--hamilton-primary)" }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: "var(--hamilton-primary)" }}
            />
          </span>
          <span className="font-label text-[9px] font-bold uppercase tracking-widest">
            Live Simulation Mode
          </span>
        </div>
      </div>

      {error && (
        <p className="mb-4 text-sm" style={{ color: "rgb(186 26 26)" }}>
          {error}
        </p>
      )}

      {/* Section 1: Scenario Setup ─────────────────────────────────────────── */}
      <section
        className="mb-8 bg-white p-6 rounded border editorial-shadow"
        style={{
          borderColor: "rgb(231 229 228)",
          boxShadow: "0 0 15px rgba(138, 76, 39, 0.1)",
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-center">
          {/* Category */}
          <div className="flex flex-col border-r pr-8" style={{ borderColor: "rgb(245 245 244)" }}>
            <label className="font-label text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--hamilton-on-surface-variant)" }}>
              Category
            </label>
            {loadingCategories || loadingCategory ? (
              <div className="skeleton h-6 w-32 rounded" />
            ) : (
              <ScenarioCategorySelector
                categories={categories}
                selected={selectedCategory}
                loading={loadingCategories || loadingCategory}
                onSelect={handleCategorySelect}
              />
            )}
          </div>

          {/* Current Point */}
          <div className="flex flex-col border-r pr-8" style={{ borderColor: "rgb(245 245 244)" }}>
            <label className="font-label text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--hamilton-on-surface-variant)" }}>
              {usingInstitutionFee ? "Your Current Fee" : "National Median"}
            </label>
            <div
              className="font-headline text-2xl"
              style={{ color: "rgb(120 113 108)" }}
            >
              {formatDollar(currentFee)}
            </div>
          </div>

          {/* Active Simulation Target */}
          <div
            className="md:col-span-2 flex flex-col p-4 rounded border"
            style={{ background: "rgb(250 249 248)", borderColor: "rgb(231 229 228)" }}
          >
            {hasDistribution && !simulationBlocked ? (
              <FeeSlider
                min={distribution!.min_amount}
                max={distribution!.max_amount}
                step={1}
                currentFee={currentFee}
                proposedFee={proposedFee}
                median={distribution!.median_amount}
                p75={distribution!.p75_amount}
                onValueChange={handleSliderChange}
                onValueCommit={handleSliderCommit}
                onInputChange={handleInputChange}
                onInputCommit={handleInputCommit}
              />
            ) : (
              <div
                style={{
                  backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
                  padding: "2.5rem",
                  borderLeft: "4px solid var(--hamilton-outline-variant, #d8c2b8)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                  borderRadius: "0.5rem",
                }}
              >
                <div style={{ textAlign: "center", maxWidth: "28rem", margin: "0 auto" }}>
                  <div style={{
                    width: "3rem",
                    height: "3rem",
                    borderRadius: "50%",
                    backgroundColor: "var(--hamilton-surface-container-high)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 1.25rem",
                  }}>
                    <SlidersHorizontal size={20} stroke="var(--hamilton-primary)" strokeWidth={1.5} />
                  </div>
                  <h3
                    style={{
                      fontFamily: "var(--hamilton-font-serif)",
                      fontSize: "1.25rem",
                      fontStyle: "italic",
                      fontWeight: 400,
                      color: "var(--hamilton-on-surface)",
                      margin: "0 0 0.75rem",
                    }}
                  >
                    Configure Your Scenario
                  </h3>
                  <p
                    style={{
                      fontFamily: "var(--hamilton-font-sans)",
                      fontSize: "0.875rem",
                      color: "var(--hamilton-text-secondary)",
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    Select a fee category from the sidebar to model pricing changes and see competitive positioning impacts.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Insufficient confidence gate */}
      {hasDistribution && simulationBlocked && (
        <InsufficientConfidenceGate reason={blockedReason} />
      )}

      {/* Section 2 + 3: Comparison + Analysis ─────────────────────────────── */}
      {hasSimulation && (
        <>
          {/* Side-by-side comparison */}
          <section className="mb-8">
            <CurrentVsProposed
              feeCategory={selectedCategory!}
              currentFee={currentFee}
              proposedFee={proposedFee}
              currentPosition={currentPosition!}
              proposedPosition={proposedPosition!}
            />
          </section>

          {/* Section 3+4: Interpretation + Operational Impact */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-24">
            {/* Hamilton Strategy Interpretation — col-span-7 */}
            <div className="lg:col-span-7 space-y-4">
              <h2
                className="font-label text-[10px] uppercase tracking-widest border-b pb-2"
                style={{ color: "var(--hamilton-on-surface-variant)", borderColor: "rgb(231 229 228)" }}
              >
                Hamilton Strategy Interpretation
              </h2>

              <HamiltonInterpretation
                interpretation={completion}
                isStreaming={isStreaming}
              />

              {/* Finalize / Board Summary CTA */}
              <div className="space-y-2">
                <GenerateBoardSummaryButton
                  disabled={!canGenerateSummary}
                  savedScenarioId={savedScenarioId}
                  onGenerate={handleGenerateSummary}
                />
                {proposedPosition && (
                  <RecommendedPositionCard
                    confidenceTier={confidenceTier!}
                    proposedFee={proposedFee}
                    proposedPosition={proposedPosition!}
                    median={distribution!.median_amount}
                    p25={distribution!.p25_amount}
                  />
                )}
              </div>
            </div>

            {/* Operational Impact — col-span-5 */}
            <div className="lg:col-span-5 space-y-4">
              <h2
                className="font-label text-[10px] uppercase tracking-widest border-b pb-2"
                style={{ color: "var(--hamilton-on-surface-variant)", borderColor: "rgb(231 229 228)" }}
              >
                Operational Impact
              </h2>
              <StrategicTradeoffs tradeoffs={tradeoffs} />
            </div>
          </section>
        </>
      )}

      {/* Scenario archive (collapsible, shown below main content on mobile) */}
      <div className="block lg:hidden mt-4">
        <ScenarioArchive
          scenarios={scenarios}
          selectedId={selectedScenarioId}
          onSelect={handleScenarioSelect}
        />
      </div>

      {/* Fixed Action Bar ──────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white border-t flex items-center justify-between z-40 px-12 py-4"
        style={{ borderColor: "rgb(231 229 228)" }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={isSaving || !hasSimulation}
            className="font-label text-[10px] uppercase tracking-widest px-4 py-2 rounded border transition-all hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color: "rgb(87 83 78)",
              background: "rgb(250 249 248)",
              borderColor: "rgb(214 211 208)",
            }}
          >
            {isSaving ? "Saving..." : "Save Draft"}
          </button>
          <button
            onClick={handleReset}
            disabled={!hasSimulation}
            className="font-label text-[10px] uppercase tracking-widest px-4 py-2 rounded border transition-all hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color: "rgb(87 83 78)",
              background: "rgb(250 249 248)",
              borderColor: "rgb(214 211 208)",
            }}
          >
            Reset Simulation
          </button>
        </div>
        <div className="flex items-center gap-6">
          <button
            className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest font-bold transition-all hover:opacity-80"
            style={{ color: "var(--hamilton-primary)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export Data
          </button>
          <button
            className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest font-bold transition-all hover:opacity-80"
            style={{ color: "var(--hamilton-primary)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Collaborate
          </button>
        </div>
      </div>
    </div>
  );
}
