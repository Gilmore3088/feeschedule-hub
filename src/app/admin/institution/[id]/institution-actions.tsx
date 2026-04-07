"use client";

import { useState, useTransition } from "react";
import { updateFeeUrl, markInstitutionOffline, runExtract } from "./actions";

interface Props {
  institutionId: number;
  feeScheduleUrl: string | null;
  documentType: string | null;
}

export function InstitutionActions({
  institutionId,
  feeScheduleUrl,
  documentType,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(feeScheduleUrl ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [currentUrl, setCurrentUrl] = useState(feeScheduleUrl);
  const [currentDocType, setCurrentDocType] = useState(documentType);

  function handleSaveUrl() {
    if (!url.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await updateFeeUrl(institutionId, url.trim());
      if (result.error) {
        setError(result.error);
      } else {
        setCurrentUrl(url.trim());
        setCurrentDocType(null);
        setMessage("URL updated");
        setEditing(false);
        setTimeout(() => setMessage(null), 3000);
      }
    });
  }

  function handleMarkOffline() {
    setError(null);
    startTransition(async () => {
      const result = await markInstitutionOffline(institutionId);
      if (result.error) {
        setError(result.error);
      } else {
        setCurrentUrl(null);
        setCurrentDocType("offline");
        setMessage("Marked offline");
        setEditing(false);
        setTimeout(() => setMessage(null), 3000);
      }
    });
  }

  return (
    <div className="admin-card p-4">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-3">
        Admin Actions
      </h3>

      {/* Current URL display */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Fee Schedule URL
        </p>
        {currentDocType === "offline" ? (
          <p className="text-xs text-gray-400 italic">Marked offline</p>
        ) : currentUrl ? (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
          >
            {currentUrl}
          </a>
        ) : (
          <p className="text-xs text-gray-400">No URL set</p>
        )}
      </div>

      {/* Edit URL form */}
      {editing ? (
        <div className="space-y-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            autoFocus
            className="w-full px-3 py-1.5 text-xs border border-gray-200 dark:border-white/[0.1] rounded bg-white dark:bg-white/[0.05] text-gray-900 dark:text-gray-100"
            onKeyDown={(e) => e.key === "Enter" && handleSaveUrl()}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveUrl}
              disabled={pending || !url.trim()}
              className="px-3 py-1.5 text-[11px] font-semibold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 transition-colors disabled:opacity-50"
            >
              {pending ? "Saving..." : "Save URL"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setUrl(currentUrl ?? "");
                setError(null);
              }}
              className="px-3 py-1.5 text-[11px] font-semibold rounded bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 text-[11px] font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 transition-colors"
          >
            {currentUrl ? "Edit Fee URL" : "Set Fee URL"}
          </button>
          {currentDocType !== "offline" && (
            <button
              onClick={handleMarkOffline}
              disabled={pending}
              className="px-3 py-1.5 text-[11px] font-semibold rounded bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.1] transition-colors disabled:opacity-50"
            >
              {pending ? "..." : "Mark Offline"}
            </button>
          )}
          {currentUrl && currentDocType !== "offline" && (
            <button
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  setMessage("Triggering extraction...");
                  const result = await runExtract(institutionId);
                  if (result.error) {
                    setMessage(null);
                    setError(result.error);
                  } else {
                    setMessage("Agent triggered — extraction running. Refresh in a few minutes.");
                  }
                });
              }}
              disabled={pending}
              className="px-3 py-1.5 text-[11px] font-semibold rounded bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50"
            >
              {pending ? "Running..." : "Run Extract"}
            </button>
          )}
        </div>
      )}

      {/* Feedback messages */}
      {message && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
