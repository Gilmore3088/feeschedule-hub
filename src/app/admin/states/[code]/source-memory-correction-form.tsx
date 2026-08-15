"use client";

import { useActionState } from "react";
import type {
  StateReadStrategy,
  StateSourceKind,
  StateSourceMemoryProfile,
} from "@/lib/agents/state-lane-memory";
import {
  correctStateSourceMemory,
  type SourceMemoryCorrectionActionState,
} from "./actions";

const SOURCE_KIND_OPTIONS: Array<{ value: StateSourceKind; label: string }> = [
  { value: "pdf", label: "PDF" },
  { value: "html", label: "HTML" },
  { value: "scanned_pdf", label: "Scanned PDF" },
  { value: "unknown", label: "Unknown" },
  { value: "offline", label: "Offline" },
];

const READ_STRATEGY_OPTIONS: Array<{ value: "" | StateReadStrategy; label: string }> = [
  { value: "", label: "Infer" },
  { value: "pdf_text", label: "PDF text" },
  { value: "html_dom", label: "HTML DOM" },
  { value: "browser_render", label: "Browser render" },
  { value: "ocr", label: "OCR" },
  { value: "manual_review", label: "Manual review" },
];

const INITIAL_STATE: SourceMemoryCorrectionActionState | null = null;

export function SourceMemoryCorrectionForm({
  stateCode,
  row,
}: {
  stateCode: string;
  row: StateSourceMemoryProfile;
}) {
  const [state, formAction, isPending] = useActionState(correctStateSourceMemory, INITIAL_STATE);

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="institution_id" value={row.institutionId} />
      <input type="hidden" name="state_code" value={stateCode} />
      <label className="sr-only" htmlFor={`source-url-${row.institutionId}`}>Canonical source URL</label>
      <input
        id={`source-url-${row.institutionId}`}
        name="canonical_source_url"
        type="url"
        defaultValue={row.canonicalSourceUrl ?? row.feeScheduleUrl ?? ""}
        placeholder="https://institution.example/fees.pdf"
        disabled={isPending}
        aria-invalid={state?.ok === false ? true : undefined}
        className="min-h-8 rounded border border-gray-200 bg-white px-2 font-mono text-[10px] text-gray-700 outline-none transition-colors focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-[oklch(0.18_0_0)] dark:text-gray-100"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="sr-only" htmlFor={`source-kind-${row.institutionId}`}>Source kind</label>
        <select
          id={`source-kind-${row.institutionId}`}
          name="source_kind"
          defaultValue={row.sourceKind}
          disabled={isPending}
          className="min-h-8 rounded border border-gray-200 bg-white px-2 text-[10px] font-semibold text-gray-700 outline-none transition-colors focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-[oklch(0.18_0_0)] dark:text-gray-100"
        >
          {SOURCE_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`read-strategy-${row.institutionId}`}>Read strategy</label>
        <select
          id={`read-strategy-${row.institutionId}`}
          name="read_strategy"
          defaultValue={row.readStrategy ?? ""}
          disabled={isPending}
          className="min-h-8 rounded border border-gray-200 bg-white px-2 text-[10px] font-semibold text-gray-700 outline-none transition-colors focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-[oklch(0.18_0_0)] dark:text-gray-100"
        >
          {READ_STRATEGY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="sr-only" htmlFor={`correction-reason-${row.institutionId}`}>Correction reason</label>
        <input
          id={`correction-reason-${row.institutionId}`}
          name="reason"
          placeholder="Correction note"
          disabled={isPending}
          className="min-h-8 rounded border border-gray-200 bg-white px-2 text-[10px] text-gray-700 outline-none transition-colors focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-[oklch(0.18_0_0)] dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={isPending}
          className="min-h-8 rounded border border-blue-200 px-2 text-[10px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent dark:border-blue-900/60 dark:text-blue-300 dark:hover:bg-blue-950/30 dark:disabled:border-white/[0.08] dark:disabled:text-gray-500"
        >
          {isPending ? "Locking" : "Lock"}
        </button>
      </div>
      {state?.message && (
        <p role="status" className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          {state.message}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="rounded bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}
