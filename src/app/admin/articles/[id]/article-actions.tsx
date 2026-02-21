"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateArticleStatus } from "../actions";
import type { ArticleStatus } from "@/lib/crawler-db/types";

const TRANSITIONS: Record<string, { label: string; target: ArticleStatus; style: string }[]> = {
  draft: [
    { label: "Submit for Review", target: "review", style: "bg-blue-600 text-white hover:bg-blue-700" },
    { label: "Reject", target: "rejected", style: "bg-red-50 text-red-600 hover:bg-red-100" },
  ],
  review: [
    { label: "Approve", target: "approved", style: "bg-emerald-600 text-white hover:bg-emerald-700" },
    { label: "Reject", target: "rejected", style: "bg-red-50 text-red-600 hover:bg-red-100" },
    { label: "Back to Draft", target: "draft", style: "bg-gray-100 text-gray-600 hover:bg-gray-200" },
  ],
  approved: [
    { label: "Publish", target: "published", style: "bg-purple-600 text-white hover:bg-purple-700" },
    { label: "Reject", target: "rejected", style: "bg-red-50 text-red-600 hover:bg-red-100" },
  ],
  published: [
    { label: "Unpublish", target: "approved", style: "bg-gray-100 text-gray-600 hover:bg-gray-200" },
  ],
  rejected: [
    { label: "Back to Draft", target: "draft", style: "bg-gray-100 text-gray-600 hover:bg-gray-200" },
  ],
};

export function ArticleActions({
  articleId,
  status,
}: {
  articleId: number;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const actions = TRANSITIONS[status] ?? [];

  if (actions.length === 0) return null;

  async function handleAction(target: ArticleStatus) {
    setLoading(target);
    const result = await updateArticleStatus(articleId, target);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error ?? "Action failed");
    }
    setLoading(null);
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {actions.map((action) => (
        <button
          key={action.target}
          onClick={() => handleAction(action.target)}
          disabled={loading !== null}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${action.style}`}
        >
          {loading === action.target ? "..." : action.label}
        </button>
      ))}
    </div>
  );
}
