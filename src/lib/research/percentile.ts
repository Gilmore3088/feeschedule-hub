/**
 * Percentile computation utility shared by ranking primitives.
 *
 * Uses nearest-rank method (floor index) to match the legacy
 * `rankInstitutions` behavior. Returns 0 for empty input so
 * downstream comparisons short-circuit safely.
 */
export interface Percentiles {
  p25: number;
  p50: number;
  p75: number;
}

export function computePercentiles(amounts: number[]): Percentiles {
  if (!amounts || amounts.length === 0) {
    return { p25: 0, p50: 0, p75: 0 };
  }
  const sorted = [...amounts].sort((a, b) => a - b);
  const n = sorted.length;
  const pick = (q: number): number => {
    const idx = Math.min(Math.floor(n * q), n - 1);
    return sorted[idx];
  };
  return {
    p25: pick(0.25),
    p50: pick(0.5),
    p75: pick(0.75),
  };
}
