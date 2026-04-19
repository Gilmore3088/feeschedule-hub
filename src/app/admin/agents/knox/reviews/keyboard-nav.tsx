"use client";

import { useCallback, useEffect, useState } from "react";

const HIGHLIGHT_CLASSES = [
  "ring-1",
  "ring-blue-300",
  "bg-blue-50/40",
  "dark:ring-blue-700",
  "dark:bg-blue-900/10",
];

/**
 * Mirror of /admin/review keyboard semantics:
 *   j/k    — move focus up/down
 *   Enter  — open detail
 *   c      — confirm rejection
 *   o      — override & promote
 *   s      — skip (refresh list, leave row pending)
 */
export function KnoxKeyboardNav({ rowCount }: { rowCount: number }) {
  const [focus, setFocus] = useState(-1);

  const rows = useCallback(
    () => document.querySelectorAll<HTMLTableRowElement>("table tbody tr[data-knox-row]"),
    []
  );

  useEffect(() => {
    const all = rows();
    all.forEach((r, i) => {
      if (i === focus) r.classList.add(...HIGHLIGHT_CLASSES);
      else r.classList.remove(...HIGHLIGHT_CLASSES);
    });
  }, [focus, rows]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "SELECT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable
      ) return;

      const all = rows();
      if (all.length === 0) return;

      const click = (sel: string) => {
        if (focus < 0 || focus >= all.length) return;
        const btn = all[focus].querySelector<HTMLButtonElement>(sel);
        if (btn && !btn.disabled) btn.click();
      };

      switch (e.key) {
        case "j": {
          e.preventDefault();
          const next = Math.min(focus + 1, all.length - 1);
          setFocus(next);
          all[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          break;
        }
        case "k": {
          e.preventDefault();
          const prev = Math.max(focus - 1, 0);
          setFocus(prev);
          all[prev]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          break;
        }
        case "Enter": {
          if (focus < 0) return;
          e.preventDefault();
          const link = all[focus].querySelector<HTMLAnchorElement>("a[data-detail-link]");
          link?.click();
          break;
        }
        case "c": {
          e.preventDefault();
          click("button[data-action='confirm']");
          break;
        }
        case "o": {
          e.preventDefault();
          click("button[data-action='override']");
          break;
        }
        case "s": {
          e.preventDefault();
          click("button[data-action='skip']");
          break;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, rows]);

  if (rowCount === 0) return null;

  return (
    <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500 px-4 py-2 border-t border-gray-100 dark:border-white/[0.04]">
      <span className="font-medium text-gray-500 dark:text-gray-400">Keyboard</span>
      {[
        ["j / k", "navigate"],
        ["Enter", "open"],
        ["c", "confirm"],
        ["o", "override"],
        ["s", "skip"],
      ].map(([k, l]) => (
        <span key={k}>
          <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] text-[10px] font-mono">
            {k}
          </kbd>
          {" "}{l}
        </span>
      ))}
    </div>
  );
}
