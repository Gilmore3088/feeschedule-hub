import { formatMoney, formatNumber } from "./format";
import type { CanonicalBenchmark } from "./benchmarks/canonical";

const TOKEN_PATTERN = /\{\{(median|p25|p75|n)\}\}/g;
const NO_DATA_PLACEHOLDER = "—"; // em-dash

type MoneyToken = "median" | "p25" | "p75";

function resolveToken(token: string, bench: CanonicalBenchmark | null): string {
  if (!bench) return NO_DATA_PLACEHOLDER;

  if (token === "n") {
    return Number.isFinite(bench.institution_count)
      ? formatNumber(bench.institution_count)
      : NO_DATA_PLACEHOLDER;
  }

  const value = bench[token as MoneyToken];
  return value === null || value === undefined ? NO_DATA_PLACEHOLDER : formatMoney(value);
}

/**
 * Fills `{{median}}`, `{{p25}}`, `{{p75}}`, and `{{n}}` tokens in guide prose
 * from a single fee category's live canonical benchmark, so guide copy can
 * never drift from the number shown in the index on the same page. Falls
 * back to an em-dash per token when the benchmark (or that specific field)
 * is unavailable, rather than asserting a stale or fabricated number.
 */
export function renderGuideProse(content: string, bench: CanonicalBenchmark | null): string {
  return content.replace(TOKEN_PATTERN, (_match, token: string) => resolveToken(token, bench));
}
