"use client";

import { useState, useTransition } from "react";
import { deleteIntelligenceAction } from "./intelligence-actions";

export function IntelligenceDeleteButton({ id }: { id: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm("Delete this intelligence record?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteIntelligenceAction(id);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-[11px] font-medium text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? "Deleting..." : "Delete"}
      </button>
      {error && (
        <span className="text-[10px] text-red-500 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}
