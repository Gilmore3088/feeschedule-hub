"use client";

import { useState, useTransition } from "react";
import { updateFeeScheduleUrl } from "./actions";

interface UrlCorrectionFormProps {
  targetId: number;
  currentUrl: string | null;
  currentDocType: string | null;
  onComplete?: () => void;
}

export function UrlCorrectionForm({
  targetId,
  currentUrl,
  currentDocType,
  onComplete,
}: UrlCorrectionFormProps) {
  const [url, setUrl] = useState(currentUrl ?? "");
  const [docType, setDocType] = useState<"pdf" | "html">(
    (currentDocType as "pdf" | "html") ?? "html"
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      new URL(url);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    startTransition(async () => {
      try {
        await updateFeeScheduleUrl(targetId, url, docType, note || undefined);
        onComplete?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update URL");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Fee Schedule URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          required
          className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Document Type
        </label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as "pdf" | "html")}
          className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300"
        >
          <option value="html">HTML</option>
          <option value="pdf">PDF</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Note (optional)
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why this URL was corrected..."
          className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300"
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-8 rounded-md bg-gray-900 dark:bg-white/10 px-4 text-xs font-medium text-white hover:bg-gray-800 dark:hover:bg-white/20 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Saving..." : "Update URL"}
      </button>
    </form>
  );
}
