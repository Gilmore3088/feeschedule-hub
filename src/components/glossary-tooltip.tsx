"use client";

import { useState, useRef, useEffect } from "react";

const GLOSSARY: Record<string, string> = {
  median:
    "The middle value when all observations are sorted. Less sensitive to outliers than the mean.",
  p25: "25th percentile. 25% of observed fees fall at or below this value.",
  p75: "75th percentile. 75% of observed fees fall at or below this value.",
  iqr: "Interquartile Range. The spread between P25 and P75, representing the middle 50% of values.",
  nsf: "Non-Sufficient Funds. Fee charged when a transaction is declined due to insufficient account balance.",
  overdraft:
    "Fee charged when the bank covers a transaction that exceeds the available account balance.",
  "fed district":
    "One of 12 regional Federal Reserve Bank territories that divide the United States.",
  "charter type":
    "Whether an institution is chartered as a commercial bank or a credit union.",
  "asset tier":
    "Classification of financial institutions by total asset size, from community to super regional.",
  maturity:
    "Data quality indicator. 'Strong' means 10+ approved observations; 'Provisional' means 10+ total observations.",
  "beige book":
    "Federal Reserve report published 8 times yearly summarizing regional economic conditions.",
  benchmark:
    "A standard point of reference against which fees can be compared or assessed.",
};

export function GlossaryTerm({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const definition = GLOSSARY[term.toLowerCase()];

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  if (!definition) return <>{children}</>;

  return (
    <span ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="border-b border-dashed border-slate-300 text-inherit hover:border-slate-500 transition-colors cursor-help"
      >
        {children}
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg w-64">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            {term}
          </span>
          <span className="block text-[12px] leading-relaxed text-slate-600">
            {definition}
          </span>
          <span className="absolute left-1/2 top-full -translate-x-1/2 -mt-px">
            <svg width="12" height="6" viewBox="0 0 12 6" className="text-white">
              <path d="M0 0L6 6L12 0" fill="currentColor" />
            </svg>
          </span>
        </span>
      )}
    </span>
  );
}
