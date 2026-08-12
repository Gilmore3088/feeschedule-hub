"use client";

import { useState, useTransition } from "react";
import { RotateCw, X } from "lucide-react";
import { cancelAtlasJob } from "./atlas-actions";

export function AtlasCancelButton({ jobId }: { jobId: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAtlasJob(jobId);
      if (!result.success) {
        setError(result.error ?? "Modal could not confirm cancellation");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        aria-label={`Cancel job ${jobId}`}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-black/10 px-2.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-300"
      >
        {pending ? <RotateCw className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        {pending ? "Requesting" : "Cancel"}
      </button>
      {error && <p role="alert" className="max-w-52 text-right text-[10px] text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
