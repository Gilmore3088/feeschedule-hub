"use client";

import { useEffect, useState, useCallback } from "react";

export function ReviewKeyboardNav({ rowCount }: { rowCount: number }) {
  const [focusedRow, setFocusedRow] = useState(-1);

  const getRows = useCallback(() => {
    return document.querySelectorAll<HTMLTableRowElement>(
      "table tbody tr[data-fee-row]"
    );
  }, []);

  const scrollToRow = useCallback(
    (index: number) => {
      const rows = getRows();
      if (rows[index]) {
        rows[index].scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    },
    [getRows]
  );

  useEffect(() => {
    const rows = getRows();
    rows.forEach((row, i) => {
      if (i === focusedRow) {
        row.classList.add(
          "ring-1",
          "ring-blue-300",
          "bg-blue-50/40",
          "dark:ring-blue-700",
          "dark:bg-blue-900/10"
        );
      } else {
        row.classList.remove(
          "ring-1",
          "ring-blue-300",
          "bg-blue-50/40",
          "dark:ring-blue-700",
          "dark:bg-blue-900/10"
        );
      }
    });
  }, [focusedRow, getRows]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const rows = getRows();
      if (rows.length === 0) return;

      switch (e.key) {
        case "j": {
          e.preventDefault();
          const next = Math.min(focusedRow + 1, rows.length - 1);
          setFocusedRow(next);
          scrollToRow(next);
          break;
        }
        case "k": {
          e.preventDefault();
          const prev = Math.max(focusedRow - 1, 0);
          setFocusedRow(prev);
          scrollToRow(prev);
          break;
        }
        case "a": {
          if (focusedRow < 0 || focusedRow >= rows.length) return;
          e.preventDefault();
          const approveBtn =
            rows[focusedRow].querySelector<HTMLButtonElement>(
              "button[data-action='approve']"
            );
          if (approveBtn && !approveBtn.disabled) approveBtn.click();
          break;
        }
        case "x": {
          if (focusedRow < 0 || focusedRow >= rows.length) return;
          e.preventDefault();
          const rejectBtn =
            rows[focusedRow].querySelector<HTMLButtonElement>(
              "button[data-action='reject']"
            );
          if (rejectBtn && !rejectBtn.disabled) rejectBtn.click();
          break;
        }
        case "Enter": {
          if (focusedRow < 0 || focusedRow >= rows.length) return;
          e.preventDefault();
          const link =
            rows[focusedRow].querySelector<HTMLAnchorElement>(
              "a[data-detail-link]"
            );
          if (link) link.click();
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedRow, getRows, scrollToRow]);

  if (rowCount === 0) return null;

  return (
    <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500 px-4 py-2 border-t border-gray-100 dark:border-white/[0.04]">
      <span className="font-medium text-gray-500 dark:text-gray-400">Keyboard</span>
      <span>
        <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] text-[10px] font-mono">j</kbd>
        <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] text-[10px] font-mono ml-0.5">k</kbd>
        {" "}navigate
      </span>
      <span>
        <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] text-[10px] font-mono">a</kbd>
        {" "}approve
      </span>
      <span>
        <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] text-[10px] font-mono">x</kbd>
        {" "}reject
      </span>
      <span>
        <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] text-[10px] font-mono">Enter</kbd>
        {" "}detail
      </span>
    </div>
  );
}
