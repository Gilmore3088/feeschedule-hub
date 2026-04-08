"use client";

import { useActionState, useRef } from "react";
import { addIntelligenceAction, type ActionResult } from "./intelligence-actions";

const CATEGORIES = [
  { value: "research", label: "Research" },
  { value: "survey", label: "Survey" },
  { value: "regulation", label: "Regulation" },
  { value: "news", label: "News" },
  { value: "analysis", label: "Analysis" },
] as const;

const INITIAL_STATE: ActionResult | null = null;

export function IntelligenceAddForm() {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => {
      const result = await addIntelligenceAction(formData);
      if (result.ok) {
        formRef.current?.reset();
      }
      return result;
    },
    INITIAL_STATE
  );

  return (
    <div className="admin-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
          Add Intelligence Record
        </h2>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Curate external research for Hamilton to reference during analysis.
        </p>
      </div>

      <form ref={formRef} action={formAction} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="source_name"
              className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"
            >
              Source Name <span className="text-red-500">*</span>
            </label>
            <input
              id="source_name"
              name="source_name"
              type="text"
              required
              placeholder="e.g. CFPB Consumer Financial Protection Survey 2024"
              className="w-full rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 dark:focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="source_date"
              className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"
            >
              Source Date <span className="text-red-500">*</span>
            </label>
            <input
              id="source_date"
              name="source_date"
              type="date"
              required
              className="w-full rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 dark:focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="category"
              className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"
            >
              Category <span className="text-red-500">*</span>
            </label>
            <select
              id="category"
              name="category"
              required
              className="w-full rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 dark:focus:border-blue-500"
            >
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="source_url"
              className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"
            >
              Source URL
            </label>
            <input
              id="source_url"
              name="source_url"
              type="url"
              placeholder="https://..."
              className="w-full rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 dark:focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="tags"
            className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"
          >
            Tags
          </label>
          <input
            id="tags"
            name="tags"
            type="text"
            placeholder="overdraft, credit-union, 2024 (comma-separated)"
            className="w-full rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 dark:focus:border-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="content_text"
            className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1"
          >
            Content <span className="text-red-500">*</span>
          </label>
          <textarea
            id="content_text"
            name="content_text"
            required
            rows={5}
            placeholder="Paste the key findings, statistics, or relevant excerpts from the source..."
            className="w-full rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 dark:focus:border-blue-500 resize-y"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded bg-gray-900 hover:bg-gray-700 dark:bg-gray-100 dark:hover:bg-gray-300 text-white dark:text-gray-900 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving..." : "Add Record"}
          </button>

          {state && !state.ok && (
            <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
          )}
          {state && state.ok && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">Record saved.</p>
          )}
        </div>
      </form>
    </div>
  );
}
