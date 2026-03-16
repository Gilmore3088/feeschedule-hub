"use client";

import { useState } from "react";
import { updateFeeScheduleUrl, crawlInstitution } from "../actions";

interface FeeUrlActionsProps {
  institutionId: number;
  currentUrl: string | null;
  institutionName: string;
}

export function FeeUrlActions({ institutionId, currentUrl, institutionName }: FeeUrlActionsProps) {
  const [url, setUrl] = useState(currentUrl || "");
  const [saving, setSaving] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await updateFeeScheduleUrl(institutionId, url);
    setSaving(false);
    if (result.success) {
      setMessage({ type: "success", text: "URL saved" });
    } else {
      setMessage({ type: "error", text: result.error || "Failed to save" });
    }
  }

  async function handleCrawl() {
    if (!url.trim()) {
      setMessage({ type: "error", text: "Set a fee schedule URL first" });
      return;
    }
    // Save URL first if it changed
    if (url !== currentUrl) {
      const saveResult = await updateFeeScheduleUrl(institutionId, url);
      if (!saveResult.success) {
        setMessage({ type: "error", text: saveResult.error || "Failed to save URL" });
        return;
      }
    }
    setCrawling(true);
    setMessage(null);
    const result = await crawlInstitution(institutionId);
    setCrawling(false);
    if (result.success) {
      setMessage({ type: "success", text: `Crawl job #${result.jobId} started for ${institutionName}` });
    } else {
      setMessage({ type: "error", text: result.error || "Failed to start crawl" });
    }
  }

  return (
    <div className="admin-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Fee Schedule Source
        </h3>
        {currentUrl && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-blue-500 hover:text-blue-600 transition-colors"
          >
            View source
          </a>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/fees.pdf"
          className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-mono
                     dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100
                     focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSave}
          disabled={saving || url === currentUrl}
          className="rounded-md border border-gray-300 dark:border-white/[0.12] px-3 py-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
        >
          {saving ? "..." : "Save"}
        </button>
        <button
          onClick={handleCrawl}
          disabled={crawling || !url.trim()}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {crawling ? "Starting..." : "Crawl Now"}
        </button>
      </div>

      {message && (
        <div className={`mt-2 text-[11px] ${message.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
