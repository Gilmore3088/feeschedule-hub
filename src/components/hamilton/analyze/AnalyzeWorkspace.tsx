"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useCallback, useRef, useEffect } from "react";
import { ANALYSIS_FOCUS_TABS, type AnalysisFocus } from "@/lib/hamilton/navigation";
import { saveAnalysis } from "@/app/pro/(hamilton)/analyze/actions";
import { HamiltonViewPanel } from "./HamiltonViewPanel";
import { WhatThisMeansPanel } from "./WhatThisMeansPanel";
import { WhyItMattersPanel } from "./WhyItMattersPanel";
import { EvidencePanel } from "./EvidencePanel";
import { ExploreFurtherPanel } from "./ExploreFurtherPanel";
import { AnalyzeCTABar } from "./AnalyzeCTABar";
import { AnalysisInputBar } from "./AnalysisInputBar";
import type { AnalyzeResponse } from "@/lib/hamilton/types";

// ─── Section Parsing ─────────────────────────────────────────────────────────

interface ParsedResponse {
  hamiltonView: string;
  whatThisMeans: string;
  whyItMatters: string[];
  evidence: Array<{ label: string; value: string; note?: string }>;
  exploreFurther: string[];
}

/**
 * Parse Hamilton's structured analyze response into typed sections.
 * Expects ## headings: Hamilton's View, What This Means, Why It Matters, Evidence, Explore Further.
 * Falls back to raw content in hamiltonView if sections are not found.
 */
function parseAnalyzeResponse(content: string): ParsedResponse {
  const sections = content.split(/^##\s+/m);

  function getSection(name: string): string {
    const match = sections.find((s) => s.toLowerCase().startsWith(name.toLowerCase()));
    if (!match) return "";
    return match.replace(/^[^\n]+\n/, "").trim();
  }

  function parseBullets(text: string): string[] {
    return text
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }

  function parseEvidenceMetrics(
    text: string
  ): Array<{ label: string; value: string; note?: string }> {
    const metrics: Array<{ label: string; value: string; note?: string }> = [];
    for (const line of text.split("\n").filter((l) => l.trim())) {
      const bold = line.match(/^[-*]\s*\*\*(.+?)\*\*:\s*(.+?)(?:\s*[—–-]\s*(.+))?$/);
      if (bold) {
        metrics.push({ label: bold[1].trim(), value: bold[2].trim(), note: bold[3]?.trim() });
        continue;
      }
      const plain = line.match(/^[-*]?\s*(.+?):\s*(.+?)(?:\s*[—–]\s*(.+))?$/);
      if (plain) {
        metrics.push({
          label: plain[1].replace(/^[-*]\s*/, "").trim(),
          value: plain[2].trim(),
          note: plain[3]?.trim(),
        });
      }
    }
    return metrics;
  }

  const hamiltonViewRaw = getSection("hamilton");
  const whatThisMeansRaw = getSection("what this means");
  const whyItMattersRaw = getSection("why it matters");
  const evidenceRaw = getSection("evidence");
  const exploreFurtherRaw = getSection("explore further");

  if (!hamiltonViewRaw && !whatThisMeansRaw && !whyItMattersRaw) {
    return { hamiltonView: content.trim(), whatThisMeans: "", whyItMatters: [], evidence: [], exploreFurther: [] };
  }

  return {
    hamiltonView: hamiltonViewRaw,
    whatThisMeans: whatThisMeansRaw,
    whyItMatters: parseBullets(whyItMattersRaw),
    evidence: parseEvidenceMetrics(evidenceRaw),
    exploreFurther: parseBullets(exploreFurtherRaw),
  };
}

function extractTextFromMessage(message: { parts?: Array<{ type: string; text?: string }> }): string {
  return (
    message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") ?? ""
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface AnalyzeWorkspaceProps {
  userId: number;
  institutionId: string | null;
  /** Pre-populated analysis loaded from hamilton_saved_analyses via ?analysis= searchParam */
  initialAnalysis?: AnalyzeResponse | null;
}

/**
 * AnalyzeWorkspace — Main client shell for the /pro/analyze screen.
 * Owns: analysis focus tab state, useChat streaming, section parsing,
 * explore-further navigation, and auto-save on completion.
 *
 * Uses @ai-sdk/react v3 API: DefaultChatTransport, sendMessage, status.
 * Screen boundary rule enforced at two levels:
 * 1. System prompt via buildAnalyzeModeSuffix (API route)
 * 2. AnalyzeCTABar has no "Recommended Position" element (ARCH-05)
 *
 * When initialAnalysis is provided (via ?analysis= searchParam), parsedResponse
 * is pre-populated so the full analysis UI renders immediately on page load.
 */
export function AnalyzeWorkspace({ userId, institutionId, initialAnalysis }: AnalyzeWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<AnalysisFocus>(ANALYSIS_FOCUS_TABS[0]);
  const [parsedResponse, setParsedResponse] = useState<ParsedResponse | null>(() => {
    if (!initialAnalysis) return null;
    return {
      hamiltonView: initialAnalysis.hamiltonView,
      whatThisMeans: initialAnalysis.whatThisMeans,
      whyItMatters: initialAnalysis.whyItMatters,
      evidence: initialAnalysis.evidence.metrics,
      exploreFurther: initialAnalysis.exploreFurther,
    };
  });
  // If restoring a saved analysis, mark it already saved to prevent duplicate auto-save
  const [isSaved, setIsSaved] = useState(!!initialAnalysis);
  const [input, setInput] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Ref to always have latest activeTab inside async callbacks
  const activeTabRef = useRef<AnalysisFocus>(ANALYSIS_FOCUS_TABS[0]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Track the last prompt submitted for saving alongside the response
  const lastPromptRef = useRef<string>("");

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/research/hamilton",
      body: () => ({
        mode: "analyze",
        analysisFocus: activeTabRef.current,
      }),
    }),
    onFinish: async ({ message }) => {
      const content = extractTextFromMessage(message);
      const parsed = parseAnalyzeResponse(content);
      setParsedResponse(parsed);
      setIsSaved(false);

      // Auto-save if user context is available
      if (userId) {
        const result = await saveAnalysis({
          institutionId: institutionId ?? "",
          analysisFocus: activeTabRef.current,
          prompt: lastPromptRef.current,
          responseJson: {
            title: parsed.hamiltonView.slice(0, 80),
            confidence: { level: "medium", basis: [] },
            hamiltonView: parsed.hamiltonView,
            whatThisMeans: parsed.whatThisMeans,
            whyItMatters: parsed.whyItMatters,
            evidence: { metrics: parsed.evidence },
            exploreFurther: parsed.exploreFurther,
          } satisfies AnalyzeResponse,
        });
        if ("id" in result) setIsSaved(true);
      }
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  function handleTabChange(tab: AnalysisFocus) {
    setActiveTab(tab);
    setParsedResponse(null);
    setIsSaved(false);
    setMessages([]);
  }

  const handleAnalysisSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    lastPromptRef.current = trimmed;
    setParsedResponse(null);
    setIsSaved(false);
    sendMessage({ text: trimmed });
    setInput("");
  }, [input, isLoading, sendMessage]);

  const handleExploreFurther = useCallback(
    (prompt: string) => {
      lastPromptRef.current = prompt;
      setParsedResponse(null);
      setIsSaved(false);
      setMessages([]);
      sendMessage({ text: prompt });
    },
    [sendMessage, setMessages]
  );

  const handleExportPdf = useCallback(async () => {
    if (!parsedResponse || isExporting) return;
    setIsExporting(true);
    try {
      const res = await fetch("/api/pro/report-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "analysis",
          analysis: {
            title: parsedResponse.hamiltonView.slice(0, 80),
            confidence: { level: "medium", basis: [] },
            hamiltonView: parsedResponse.hamiltonView,
            whatThisMeans: parsedResponse.whatThisMeans,
            whyItMatters: parsedResponse.whyItMatters,
            evidence: { metrics: parsedResponse.evidence },
            exploreFurther: parsedResponse.exploreFurther,
          } satisfies AnalyzeResponse,
          analysisFocus: activeTab,
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hamilton-analysis-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [parsedResponse, isExporting, activeTab]);

  const analysisComplete = !isLoading && parsedResponse !== null;

  // Live-parse streaming content for progressive rendering
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");
  const streamingContent = lastAssistantMessage ? extractTextFromMessage(lastAssistantMessage) : "";
  const liveParsed = isLoading && streamingContent ? parseAnalyzeResponse(streamingContent) : null;
  const displayedResponse = parsedResponse ?? liveParsed;

  return (
    <div className="flex flex-col gap-6 pb-40">
      {/* Analysis prompt title when active */}
      {displayedResponse && (
        <div className="flex items-center gap-4 mb-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: "var(--hamilton-primary)", opacity: 0.6 }} aria-hidden="true">
            <path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <h1
            className="text-3xl italic tracking-tight"
            style={{
              fontFamily: "var(--hamilton-font-serif)",
              color: "var(--hamilton-text-primary)",
            }}
          >
            {activeTab} Assessment
          </h1>
        </div>
      )}

      {/* Empty state */}
      {!displayedResponse && !isLoading && messages.length === 0 && (
        <div className="text-center py-16" style={{ color: "var(--hamilton-text-secondary)" }}>
          <p className="text-base mb-1" style={{ fontFamily: "var(--hamilton-font-serif)" }}>
            Ask Hamilton to analyze a fee category or competitive position
          </p>
          <p className="text-sm">
            Currently viewing:{" "}
            <span style={{ color: "var(--hamilton-accent)" }}>{activeTab}</span> analysis
          </p>
        </div>
      )}

      {/* Intelligence architecture */}
      {displayedResponse && (
        <div className="space-y-6 max-w-5xl">
          {/* Hamilton's View card — contains What This Means inline */}
          <div
            className="p-10 rounded-xl border-l-4"
            style={{
              backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
              border: "1px solid rgba(216,194,184,0.3)",
              borderLeftWidth: "4px",
              borderLeftColor: "var(--hamilton-primary)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
            }}
          >
            <HamiltonViewPanel
              content={displayedResponse.hamiltonView}
              confidence={null}
              isStreaming={isLoading}
            />
            {(displayedResponse.whatThisMeans || isLoading) && (
              <WhatThisMeansPanel content={displayedResponse.whatThisMeans} isStreaming={isLoading} />
            )}
          </div>

          {/* CTA row — shown after stream completes */}
          <AnalyzeCTABar
            isVisible={analysisComplete}
            onExportPdf={handleExportPdf}
            isExporting={isExporting}
          />

          {/* Why It Matters */}
          {(displayedResponse.whyItMatters.length > 0 || isLoading) && (
            <WhyItMattersPanel items={displayedResponse.whyItMatters} isStreaming={isLoading} />
          )}

          {/* Evidence */}
          {(displayedResponse.evidence.length > 0 || isLoading) && (
            <EvidencePanel metrics={displayedResponse.evidence} isStreaming={isLoading} />
          )}

          {/* Save confirmation */}
          {isSaved && (
            <p className="text-xs text-center" style={{ color: "var(--hamilton-text-secondary)" }}>
              Analysis saved to workspace
            </p>
          )}
        </div>
      )}

      {/* Explore Further + floating input — always at bottom */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 px-12 py-10"
        style={{
          background: "linear-gradient(to top, var(--hamilton-surface) 60%, transparent)",
        }}
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <ExploreFurtherPanel
            prompts={parsedResponse?.exploreFurther ?? []}
            onPromptSelect={handleExploreFurther}
            isVisible={analysisComplete}
          />

          <AnalysisInputBar
            value={input}
            onChange={setInput}
            onSubmit={handleAnalysisSubmit}
            isLoading={isLoading}
            placeholder={`Analyze from the ${activeTab} lens…`}
          />
        </div>
      </div>
    </div>
  );
}
