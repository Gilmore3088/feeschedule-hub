"use client";

import { useTransition } from "react";
import { deleteIntelligenceAction } from "./intelligence-actions";

export function IntelligenceDeleteButton({ id }: { id: number }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Delete this intelligence record?")) return;
    startTransition(async () => {
      await deleteIntelligenceAction(id);
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-[11px] font-medium text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {isPending ? "Deleting..." : "Delete"}
    </button>
  );
}
