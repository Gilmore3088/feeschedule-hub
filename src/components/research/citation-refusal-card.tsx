/**
 * CitationRefusalCard
 *
 * Renders the `{status: "refused", reason: "insufficient_citations"}` shape
 * returned by /api/research/hamilton when the citation gate blocks a report.
 *
 * Uses the consumer-side warm palette (terracotta/amber) so the refusal reads
 * as editorial rather than a system error — matching the "empty states not
 * fake data" rule and avoiding a generic dashboard error toast.
 *
 * Pure presentational — no client hooks. Safe to render from server
 * components or as a child of a client chat shell.
 */

interface CitationRefusalMetrics {
  claims: number;
  citations: number;
  density: number;
  threshold: number;
  countThreshold: number;
}

export interface CitationRefusal {
  status: "refused";
  reason: "insufficient_citations";
  metrics: CitationRefusalMetrics;
  suggestion: string;
  claims_without_citations: string[];
}

export function CitationRefusalCard({ refusal }: { refusal: CitationRefusal }) {
  const { metrics, suggestion, claims_without_citations } = refusal;
  const densityLabel = `${metrics.citations} of ${metrics.claims} claims`;

  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-lg border border-warm-200 bg-warm-50/60 p-5 text-warm-900 dark:border-warm-800 dark:bg-warm-900/40 dark:text-warm-100"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#C44B2E]" aria-hidden />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#C44B2E]">
          Report withheld
        </p>
      </div>

      <h3
        className="mt-2 text-lg font-semibold leading-snug"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Hamilton declined to publish this report.
      </h3>

      <p className="mt-2 text-[13px] leading-relaxed text-warm-700 dark:text-warm-300">
        {suggestion}
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-warm-200 pt-3 dark:border-warm-800">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-warm-500">
            Citations
          </dt>
          <dd className="mt-0.5 text-sm tabular-nums text-warm-900 dark:text-warm-100">
            {densityLabel}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-warm-500">
            Density
          </dt>
          <dd className="mt-0.5 text-sm tabular-nums text-warm-900 dark:text-warm-100">
            {metrics.density.toFixed(2)} / {metrics.threshold.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-warm-500">
            Minimum
          </dt>
          <dd className="mt-0.5 text-sm tabular-nums text-warm-900 dark:text-warm-100">
            {metrics.countThreshold} citations
          </dd>
        </div>
      </dl>

      {claims_without_citations.length > 0 && (
        <details className="mt-4 text-[12px] text-warm-700 dark:text-warm-300">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-warm-500 hover:text-warm-700">
            Sample uncited claims ({claims_without_citations.length})
          </summary>
          <ul className="mt-2 space-y-1.5 pl-3">
            {claims_without_citations.map((claim, idx) => (
              <li key={idx} className="list-disc leading-relaxed">
                {claim}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function isCitationRefusal(value: unknown): value is CitationRefusal {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.status === "refused" && v.reason === "insufficient_citations";
}
