"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setFeeScheduleUrl, markOffline } from "./actions";

interface Props {
  id: number;
  institution_name: string;
  city: string | null;
  charter_type: string | null;
  asset_size_tier: string | null;
  fee_schedule_url: string | null;
  document_type: string | null;
  fee_count: number;
  last_crawled: string;
  stateCode: string;
}

function truncateUrl(url: string, maxLen = 35): string {
  try {
    const parsed = new URL(url);
    const display = parsed.hostname + parsed.pathname;
    return display.length > maxLen ? display.slice(0, maxLen) + "..." : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "..." : url;
  }
}

function statusBadge(
  feeUrl: string | null,
  docType: string | null,
  feeCount: number
): { label: string; cls: string } {
  if (docType === "offline")
    return { label: "Offline", cls: "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400" };
  if (feeCount > 0)
    return { label: `${feeCount} fees`, cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
  if (feeUrl)
    return { label: "URL only", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
  return { label: "No data", cls: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
}

export function InstitutionRow({
  id,
  institution_name,
  city,
  charter_type,
  fee_schedule_url,
  document_type,
  fee_count,
  last_crawled,
  stateCode,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(fee_schedule_url || "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [currentUrl, setCurrentUrl] = useState(fee_schedule_url);
  const [currentDocType, setCurrentDocType] = useState(document_type);

  function handleSaveUrl() {
    if (!url.trim()) return;
    startTransition(async () => {
      const result = await setFeeScheduleUrl(id, url.trim(), stateCode);
      if (result.error) {
        setMessage(result.error);
      } else {
        setCurrentUrl(url.trim());
        setCurrentDocType(null);
        setMessage("Saved");
        setEditing(false);
        setTimeout(() => setMessage(null), 2000);
      }
    });
  }

  function handleMarkOffline() {
    startTransition(async () => {
      await markOffline(id, stateCode);
      setCurrentUrl(null);
      setCurrentDocType("offline");
      setMessage("Marked offline");
      setTimeout(() => setMessage(null), 2000);
    });
  }

  const badge = statusBadge(currentUrl, currentDocType, fee_count);

  return (
    <tr className="hover:bg-gray-50/50 dark:hover:bg-white/[0.04] transition-colors">
      <td className="text-gray-900 dark:text-gray-100 font-medium">
        <Link
          href={`/admin/institution/${id}`}
          className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          {institution_name}
        </Link>
      </td>
      <td className="text-gray-500">{city ?? "-"}</td>
      <td className="text-gray-500">{charter_type ?? "-"}</td>
      <td>
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}
        >
          {badge.label}
        </span>
      </td>
      <td>
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              autoFocus
              className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 dark:border-white/[0.1] rounded bg-white dark:bg-white/[0.05] text-gray-900 dark:text-gray-100"
              onKeyDown={(e) => e.key === "Enter" && handleSaveUrl()}
            />
            <button
              onClick={handleSaveUrl}
              disabled={pending || !url.trim()}
              className="px-2 py-1 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 transition-colors disabled:opacity-50"
            >
              {pending ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setUrl(currentUrl || ""); }}
              className="px-2 py-1 text-[10px] font-semibold rounded bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {currentUrl ? (
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
                title={currentUrl}
              >
                {truncateUrl(currentUrl)}
              </a>
            ) : (
              <span className="text-gray-300">
                {currentDocType === "offline" ? "offline" : "none"}
              </span>
            )}
            {message ? (
              <span className="text-[10px] text-emerald-600">{message}</span>
            ) : (
              <div className="flex gap-1 ml-auto shrink-0">
                <button
                  onClick={() => setEditing(true)}
                  className="px-1.5 py-0.5 text-[10px] font-medium rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  {currentUrl ? "Edit" : "Set URL"}
                </button>
                {currentDocType !== "offline" && (
                  <button
                    onClick={handleMarkOffline}
                    disabled={pending}
                    className="px-1.5 py-0.5 text-[10px] font-medium rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                  >
                    Offline
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </td>
      <td className="text-right tabular-nums text-gray-400">
        {last_crawled}
      </td>
    </tr>
  );
}
