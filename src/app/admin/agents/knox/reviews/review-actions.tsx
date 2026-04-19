"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmRejection, overrideRejection } from "./actions";

interface Props {
  messageId: string;
  feeVerifiedId: number | null;
  disabled?: boolean;
}

function animateRowExit(btn: HTMLElement) {
  const row = btn.closest("tr");
  if (row) row.classList.add("row-exiting");
}

export function ConfirmButton({ messageId, disabled }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      start(async () => {
        animateRowExit(e.currentTarget);
        const res = await confirmRejection(messageId);
        if (!res.success) alert(res.error || "Failed to confirm");
        else router.refresh();
      });
    },
    [messageId, router]
  );

  return (
    <button
      data-action="confirm"
      disabled={pending || disabled}
      onClick={onClick}
      aria-label="Confirm Knox rejection"
      className="rounded px-2 py-1 text-xs font-medium bg-red-50 text-red-700
                 hover:bg-red-100 disabled:opacity-50
                 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
    >
      {pending ? "..." : "Confirm rejection"}
    </button>
  );
}

export function OverrideButton({ messageId, feeVerifiedId, disabled }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const onClick = useCallback(() => {
    start(async () => {
      const note = prompt("Override note (required, min 3 chars):");
      if (!note || note.trim().length < 3) return;
      const res = await overrideRejection(messageId, note);
      if (!res.success) {
        alert(res.error || "Failed to override");
        return;
      }
      if (res.promoted_fee_published_id) {
        alert(
          `Override accepted. Fee promoted as fees_published #${res.promoted_fee_published_id}.`
        );
      } else {
        alert(
          "Override recorded. Darwin has not yet posted accept; promotion will complete on the next pass."
        );
      }
      router.refresh();
    });
  }, [messageId, router]);

  return (
    <button
      data-action="override"
      disabled={pending || disabled || !feeVerifiedId}
      onClick={onClick}
      aria-label="Override Knox and promote fee"
      className="rounded px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700
                 hover:bg-emerald-100 disabled:opacity-50
                 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30 transition-colors"
    >
      {pending ? "..." : "Override & promote"}
    </button>
  );
}

export function SkipButton({ messageId }: { messageId: string }) {
  // Skip is a no-op navigation hint; leaves the row in 'pending'.
  const router = useRouter();
  return (
    <button
      data-action="skip"
      onClick={() => router.refresh()}
      aria-label={`Skip rejection ${messageId}`}
      className="rounded px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600
                 hover:bg-gray-200 dark:bg-white/[0.08] dark:text-gray-400
                 dark:hover:bg-white/[0.12] transition-colors"
    >
      Skip
    </button>
  );
}
