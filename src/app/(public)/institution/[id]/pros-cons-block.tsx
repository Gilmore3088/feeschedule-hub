interface ProsConsBlockProps {
  strengths: string[];
  watch: string[];
}

/**
 * ProsConsBlock — Spec #5, D-09.
 *
 * Renders up to 2 strengths and 2 watch items derived from fee-vs-median
 * analysis. Returns null when both arrays are empty. Two-column layout on
 * desktop, stacked on mobile.
 */
export function ProsConsBlock({ strengths, watch }: ProsConsBlockProps) {
  const cappedStrengths = strengths.slice(0, 2);
  const cappedWatch = watch.slice(0, 2);

  if (cappedStrengths.length === 0 && cappedWatch.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* Strengths */}
      {cappedStrengths.length > 0 && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-600">
            Strengths
          </p>
          <ul className="mt-2.5 space-y-2">
            {cappedStrengths.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                {/* Checkmark icon */}
                <svg
                  className="mt-[1px] h-4 w-4 shrink-0 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-[13px] leading-snug text-emerald-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Watch items */}
      {cappedWatch.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-amber-600">
            Watch
          </p>
          <ul className="mt-2.5 space-y-2">
            {cappedWatch.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                {/* Warning icon */}
                <svg
                  className="mt-[1px] h-4 w-4 shrink-0 text-amber-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <span className="text-[13px] leading-snug text-amber-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
