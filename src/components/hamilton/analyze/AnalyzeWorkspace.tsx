"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useCallback, useRef, useEffect } from "react";
import { ANALYSIS_FOCUS_TABS, type AnalysisFocus } from "@/lib/hamilton/navigation";
import { saveAnalysis } from "@/app/pro/(hamilton)/analyze/actions";
import { AnalysisFocusTabs } from "./AnalysisFocusTabs";
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
 */
export function AnalyzeWorkspace({ userId, institutionId }: AnalyzeWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<AnalysisFocus>(ANALYSIS_FOCUS_TABS[0]);
  const [parsedResponse, setParsedResponse] = useState<ParsedResponse | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [input, setInput] = useState("");

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

  const analysisComplete = !isLoading && parsedResponse !== null;

  // Live-parse streaming content for progressive rendering
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");
  const streamingContent = lastAssistantMessage ? extractTextFromMessage(lastAssistantMessage) : "";
  const liveParsed = isLoading && streamingContent ? parseAnalyzeResponse(streamingContent) : null;
  const displayedResponse = parsedResponse ?? liveParsed;

  return (
    <div className="flex flex-col gap-4 pb-32">
      {/* Analysis Focus Tabs */}
      <AnalysisFocusTabs activeTab={activeTab} onTabChange={handleTabChange} />

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

      {/* Response sections */}
      {displayedResponse && (
        <div className="flex flex-col gap-3">
          <HamiltonViewPanel
            content={displayedResponse.hamiltonView}
            confidence={null}
            isStreaming={isLoading}
          />
          {(displayedResponse.whatThisMeans || isLoading) && (
            <WhatThisMeansPanel content={displayedResponse.whatThisMeans} isStreaming={isLoading} />
          )}
          {(displayedResponse.whyItMatters.length > 0 || isLoading) && (
            <WhyItMattersPanel items={displayedResponse.whyItMatters} isStreaming={isLoading} />
          )}
          {(displayedResponse.evidence.length > 0 || isLoading) && (
            <EvidencePanel metrics={displayedResponse.evidence} isStreaming={isLoading} />
          )}
        </div>
      )}

      {/* Explore Further — only after stream completes */}
      <ExploreFurtherPanel
        prompts={parsedResponse?.exploreFurther ?? []}
        onPromptSelect={handleExploreFurther}
        isVisible={analysisComplete}
      />

      {/* CTA Bar — only after stream completes (no Recommended Position element) */}
      <AnalyzeCTABar isVisible={analysisComplete} />

      {/* Save confirmation */}
      {isSaved && (
        <p className="text-xs text-center" style={{ color: "var(--hamilton-text-secondary)" }}>
          Analysis saved to workspace
        </p>
      )}

      {/* Input bar — fixed bottom */}
      <div className="fixed bottom-6 left-0 right-0 px-6 z-20">
        <div className="max-w-3xl mx-auto">
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
