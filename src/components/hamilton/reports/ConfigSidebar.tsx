"use client";

import { Loader2 } from "lucide-react";
import type { ReportTemplateType } from "@/app/pro/(hamilton)/reports/actions";

type NarrativeTone = "consulting" | "academic" | "executive" | "technical";

interface ConfigSidebarProps {
  selectedTemplate: ReportTemplateType | null;
  institution: string;
  peerSet: string;
  focusArea: string;
  narrativeTone: NarrativeTone;
  isGenerating: boolean;
  onInstitutionChange: (v: string) => void;
  onPeerSetChange: (v: string) => void;
  onFocusAreaChange: (v: string) => void;
  onNarrativeToneChange: (v: NarrativeTone) => void;
  onGenerate: () => void;
}

const TONES: Array<{ value: NarrativeTone; label: string }> = [
  { value: "consulting", label: "Consulting" },
  { value: "academic", label: "Academic" },
  { value: "executive", label: "Executive" },
  { value: "technical", label: "Technical" },
];

const FOCUS_AREAS = [
  "Capital Allocation",
  "Risk Mitigation",
  "Yield Optimization",
  "Sustainable Growth",
];

export function ConfigSidebar({
  selectedTemplate,
  institution,
  peerSet,
  focusArea,
  narrativeTone,
  isGenerating,
  onInstitutionChange,
  onPeerSetChange,
  onFocusAreaChange,
  onNarrativeToneChange,
  onGenerate,
}: ConfigSidebarProps) {
  const canGenerate = selectedTemplate !== null && !isGenerating;

  return (
    <aside className="col-span-12 lg:col-span-4 sticky top-32">
      {/* Configuration panel */}
      <div className="bg-surface-container-low p-8">
        <div className="mb-10">
          <h2 className="font-headline text-3xl italic mb-1">Configuration</h2>
          <p
            className="text-xs tracking-wide"
            style={{ color: "var(--hamilton-secondary)" }}
          >
            Adjust parameters to refine narrative output.
          </p>
        </div>

        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            onGenerate();
          }}
        >
          {/* Institution */}
          <div>
            <label
              className="block text-[10px] uppercase tracking-[0.2em] mb-3"
              style={{ color: "var(--hamilton-secondary)" }}
            >
              Institution
            </label>
            <select
              value={institution}
              onChange={(e) => onInstitutionChange(e.target.value)}
              className="w-full bg-transparent border-0 focus:ring-0 text-sm py-2 appearance-none"
              style={{
                borderBottom: "1px solid rgba(134,115,107,0.4)",
                color: "var(--hamilton-on-surface)",
              }}
            >
              <option>Hamilton Global Partners</option>
              <option>Standard Meridian</option>
              <option>Axiom Wealth</option>
            </select>
          </div>

          {/* Peer Set */}
          <div>
            <label
              className="block text-[10px] uppercase tracking-[0.2em] mb-3"
              style={{ color: "var(--hamilton-secondary)" }}
            >
              Peer Set
            </label>
            <div className="flex flex-wrap gap-2">
              <span
                className="text-white text-[10px] uppercase tracking-widest px-3 py-1.5 flex items-center gap-2 cursor-pointer"
                style={{ backgroundColor: "var(--hamilton-primary)" }}
                onClick={() => onPeerSetChange("tier1")}
              >
                Tier 1 Banks
                <span className="material-symbols-outlined text-xs">close</span>
              </span>
              <span
                className="text-[10px] uppercase tracking-widest px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-surface-container-highest transition-colors bg-surface-container-high"
                onClick={() => onPeerSetChange("emea")}
              >
                EMEA Private
                <span className="material-symbols-outlined text-xs">add</span>
              </span>
            </div>
          </div>

          {/* Focus Area */}
          <div>
            <label
              className="block text-[10px] uppercase tracking-[0.2em] mb-3"
              style={{ color: "var(--hamilton-secondary)" }}
            >
              Focus Area
            </label>
            <select
              value={focusArea}
              onChange={(e) => onFocusAreaChange(e.target.value)}
              className="w-full bg-transparent border-0 focus:ring-0 text-sm py-2 appearance-none"
              style={{
                borderBottom: "1px solid rgba(134,115,107,0.4)",
                color: "var(--hamilton-on-surface)",
              }}
            >
              {FOCUS_AREAS.map((area) => (
                <option key={area}>{area}</option>
              ))}
            </select>
          </div>

          {/* Narrative Tone */}
          <div>
            <label
              className="block text-[10px] uppercase tracking-[0.2em] mb-3"
              style={{ color: "var(--hamilton-secondary)" }}
            >
              Narrative Tone
            </label>
            <div className="grid grid-cols-2 gap-4">
              {TONES.map((tone) => {
                const isActive = narrativeTone === tone.value;
                return (
                  <button
                    key={tone.value}
                    type="button"
                    onClick={() => onNarrativeToneChange(tone.value)}
                    className="p-4 text-center cursor-pointer transition-colors"
                    style={{
                      border: isActive
                        ? "1px solid var(--hamilton-primary)"
                        : "1px solid transparent",
                      backgroundColor: isActive
                        ? "var(--hamilton-surface-container-lowest)"
                        : "var(--hamilton-surface-container-high)",
                    }}
                  >
                    <span
                      className="text-[10px] uppercase tracking-widest block"
                      style={{
                        fontWeight: isActive ? 700 : 400,
                        color: isActive
                          ? "var(--hamilton-on-surface)"
                          : "var(--hamilton-secondary)",
                      }}
                    >
                      {tone.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CTA */}
          <div className="pt-8">
            <button
              type="submit"
              disabled={!canGenerate}
              className="w-full burnished-cta text-white py-5 px-8 flex items-center justify-center gap-3 transition-transform active:scale-95"
              style={{ opacity: canGenerate ? 1 : 0.6, cursor: canGenerate ? "pointer" : "not-allowed" }}
            >
              {isGenerating ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <span className="material-symbols-outlined">auto_awesome</span>
              )}
              <span className="text-[10px] uppercase tracking-[0.3em] font-bold">
                {isGenerating ? "Generating..." : "Generate Intelligence"}
              </span>
            </button>
            <p
              className="text-[9px] text-center mt-4 uppercase tracking-widest opacity-60"
              style={{ color: "var(--hamilton-secondary)" }}
            >
              Estimated processing time: 4s
            </p>
          </div>
        </form>
      </div>

      {/* Pull quote */}
      <div
        className="mt-8 px-8 py-6 italic font-headline text-lg"
        style={{
          borderLeft: "2px solid rgba(138,76,39,0.2)",
          color: "var(--hamilton-secondary)",
        }}
      >
        &ldquo;Accuracy is the only currency that matters in private intelligence.&rdquo;
      </div>
    </aside>
  );
}
