"use client";

import { Loader2 } from "lucide-react";
import type { ReportTemplateType } from "@/app/pro/(hamilton)/reports/actions";

type NarrativeTone = "consulting" | "academic" | "executive" | "technical";

interface ConfigSidebarProps {
  selectedTemplate: ReportTemplateType | null;
  institutionName: string;
  /**
   * Peer set label — kept in props for context display but no longer
   * surfaced as an editable field (manage at /pro/peers instead).
   */
  peerSetLabel: string;
  focusArea: string;
  narrativeTone: NarrativeTone;
  isGenerating: boolean;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onFocusAreaChange: (v: string) => void;
  onNarrativeToneChange: (v: NarrativeTone) => void;
  onGenerate: () => void;
}

/**
 * The only configurable knob is AUDIENCE. Everything else (institution,
 * peer set, focus area) inherits from the user's profile and the chosen
 * template. The audience values map 1:1 onto the existing NarrativeTone
 * enum so the API contract is unchanged — we just relabel the buttons.
 */
const AUDIENCES: Array<{ value: NarrativeTone; label: string; hint: string }> = [
  { value: "executive",  label: "Board",        hint: "Bold, headline-led, ~6 slides" },
  { value: "consulting", label: "Internal Team", hint: "Consulting tone, action-oriented" },
  { value: "technical",  label: "Analysts",     hint: "Full data, methodology footnotes" },
  { value: "academic",   label: "Research",     hint: "Deep context, citations" },
];

export function ConfigSidebar({
  selectedTemplate,
  institutionName,
  peerSetLabel,
  narrativeTone,
  isGenerating,
  onNarrativeToneChange,
  onGenerate,
}: ConfigSidebarProps) {
  const canGenerate = selectedTemplate !== null && !isGenerating;
  const activeAudience = AUDIENCES.find((a) => a.value === narrativeTone) ?? AUDIENCES[0];

  return (
    <aside className="col-span-12 lg:col-span-4 sticky top-32">
      <div className="bg-surface-container-low p-8">
        <div className="mb-8">
          <h2 className="font-headline text-3xl italic mb-1">Audience</h2>
          <p
            className="text-xs tracking-wide leading-relaxed"
            style={{ color: "var(--hamilton-secondary)" }}
          >
            Who is this report for? Hamilton tunes voice, depth, and structure
            to match.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onGenerate();
          }}
        >
          {/* Audience picker — the only knob. Vertical list so each option
              has room for a one-line hint about what changes. */}
          <div className="space-y-3" role="radiogroup" aria-label="Audience">
            {AUDIENCES.map((aud) => {
              const isActive = narrativeTone === aud.value;
              return (
                <button
                  key={aud.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => onNarrativeToneChange(aud.value)}
                  className="w-full text-left p-4 cursor-pointer transition-colors"
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
                    className="text-[12px] uppercase tracking-widest block"
                    style={{
                      fontWeight: isActive ? 700 : 600,
                      color: isActive
                        ? "var(--hamilton-on-surface)"
                        : "var(--hamilton-secondary)",
                    }}
                  >
                    {aud.label}
                  </span>
                  <span
                    className="text-[11px] mt-0.5 block"
                    style={{ color: "var(--hamilton-secondary)" }}
                  >
                    {aud.hint}
                  </span>
                </button>
              );
            })}
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
                <span className="material-symbols-outlined" aria-hidden="true">auto_awesome</span>
              )}
              <span className="text-[10px] uppercase tracking-[0.3em] font-bold">
                {isGenerating
                  ? "Generating..."
                  : `Generate ${activeAudience.label} Report`}
              </span>
            </button>

            {/* Implicit context — what this run will use. Quiet, single line.
                Replaces the old Institution / Peer Set / Focus Area inputs. */}
            <p
              className="text-[10px] text-center mt-4 leading-relaxed"
              style={{ color: "var(--hamilton-secondary)" }}
            >
              For{" "}
              <span style={{ color: "var(--hamilton-on-surface)" }}>
                {institutionName || "your institution"}
              </span>
              {" · "}
              {peerSetLabel || "national peers"}
              {" · "}
              <a
                href="/pro/settings"
                className="underline underline-offset-2 hover:opacity-70"
              >
                change defaults
              </a>
            </p>
          </div>
        </form>
      </div>
    </aside>
  );
}
