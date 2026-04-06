"use client";

import { useState, useTransition } from "react";
import { setFeeScheduleUrl, markOffline } from "./actions";

interface Props {
  institutionId: number;
  institutionName: string;
  websiteUrl: string | null;
  stateCode: string;
  failureReason: string | null;
}

export function ManualReviewRow({
  institutionId,
  institutionName,
  websiteUrl,
  stateCode,
  failureReason,
}: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSetUrl() {
    if (!url.trim()) return;
    startTransition(async () => {
      const result = await setFeeScheduleUrl(institutionId, url.trim(), stateCode);
      if (result.error) {
        setMessage(result.error);
      } else {
        setMessage("URL saved. Run the state agent to extract fees.");
        setMode("view");
      }
    });
  }

  function handleMarkOffline() {
    startTransition(async () => {
      await markOffline(institutionId, stateCode);
      setMessage("Marked as offline");
    });
  }

  if (message) {
    return (
      <tr className="bg-emerald-50/30 dark:bg-emerald-900/10">
        <td className="text-gray-900 dark:text-gray-100 font-medium">
          {institutionName}
        </td>
        <td colSpan={2}>
          <span className="text-emerald-700 dark:text-emerald-400 text-xs">
            {message}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50/50 dark:hover:bg-white/[0.04] transition-colors">
      <td className="text-gray-900 dark:text-gray-100 font-medium">
        {institutionName}
      </td>
      <td>
        {websiteUrl ? (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {websiteUrl.replace(/^https?:\/\/(www\.)?/, "").slice(0, 35)}
          </a>
        ) : (
          <span className="text-gray-300">no website</span>
        )}
      </td>
      <td>
        {mode === "view" ? (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 max-w-[200px] truncate text-xs">
              {failureReason ?? "-"}
            </span>
            <div className="flex gap-1 ml-auto shrink-0">
              <button
                onClick={() => setMode("edit")}
                className="px-2 py-1 text-[10px] font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
              >
                Set URL
              </button>
              <button
                onClick={handleMarkOffline}
                disabled={pending}
                className="px-2 py-1 text-[10px] font-semibold rounded bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.1] transition-colors disabled:opacity-50"
              >
                Offline
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/fee-schedule.pdf"
              autoFocus
              className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 dark:border-white/[0.1] rounded bg-white dark:bg-white/[0.05] text-gray-900 dark:text-gray-100 placeholder-gray-400"
              onKeyDown={(e) => e.key === "Enter" && handleSetUrl()}
            />
            <button
              onClick={handleSetUrl}
              disabled={pending || !url.trim()}
              className="px-2 py-1 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 transition-colors disabled:opacity-50"
            >
              {pending ? "..." : "Save"}
            </button>
            <button
              onClick={() => setMode("view")}
              className="px-2 py-1 text-[10px] font-semibold rounded bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
