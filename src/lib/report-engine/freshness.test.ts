/**
 * Freshness gate tests — Phase 13-01
 *
 * All three behavior scenarios from the plan:
 *   1. National stale  (medianAge=130 > 120 threshold) → fresh:false
 *   2. National fresh  (medianAge=100 <= 120 threshold) → fresh:true
 *   3. State stale     (medianAge=95  > 90 threshold)   → fresh:false
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkFreshness } from './freshness';

// ─── Mock the DB connection ───────────────────────────────────────────────

vi.mock('@/lib/crawler-db/connection', () => {
  const mockSql = vi.fn();
  // Make the mock callable as a tagged template literal
  const sqlProxy = new Proxy(mockSql, {
    get(target, prop) {
      return target[prop as keyof typeof target];
    },
    apply(target, _thisArg, args) {
      return target(...args);
    },
  });
  return {
    getSql: () => sqlProxy,
    sql: sqlProxy,
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Build the tagged-template mock return for a given median age. */
function makeQueryResult(medianAge: number | null) {
  return [{ median_age: medianAge === null ? null : String(medianAge) }];
}

/** Re-import getSql after mocking. */
async function getMockSql() {
  const { getSql } = await import('@/lib/crawler-db/connection');
  return getSql() as unknown as ReturnType<typeof vi.fn>;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('checkFreshness()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('national: returns fresh:false when median age is 130 days (> 120 threshold)', async () => {
    const mockSql = await getMockSql();
    mockSql.mockResolvedValue(makeQueryResult(130));

    const result = await checkFreshness('national');

    expect(result.fresh).toBe(false);
    expect(result.medianAgeDays).toBeCloseTo(130);
    expect(result.threshold).toBe(120);
    expect(result.reason).toContain('130');
    expect(result.reason).toContain('120');
  });

  it('national: returns fresh:true when median age is 100 days (<= 120 threshold)', async () => {
    const mockSql = await getMockSql();
    mockSql.mockResolvedValue(makeQueryResult(100));

    const result = await checkFreshness('national');

    expect(result.fresh).toBe(true);
    expect(result.medianAgeDays).toBeCloseTo(100);
    expect(result.threshold).toBe(120);
    expect(result.reason).toBeUndefined();
  });

  it('state: returns fresh:false when median age is 95 days (> 90 threshold)', async () => {
    const mockSql = await getMockSql();
    mockSql.mockResolvedValue(makeQueryResult(95));

    const result = await checkFreshness('state', 'WY');

    expect(result.fresh).toBe(false);
    expect(result.medianAgeDays).toBeCloseTo(95);
    expect(result.threshold).toBe(90);
    expect(result.reason).toContain('95');
    expect(result.reason).toContain('90');
  });

  it('treats null DB result as age=999 days (fail-safe)', async () => {
    const mockSql = await getMockSql();
    mockSql.mockResolvedValue(makeQueryResult(null));

    const result = await checkFreshness('national');

    expect(result.fresh).toBe(false);
    expect(result.medianAgeDays).toBe(999);
  });
});
