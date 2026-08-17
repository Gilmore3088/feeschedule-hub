import type { InstitutionSearchResult } from "@/lib/data-store/search";

export const DIRECTORY_PAGE_SIZE = 25;

/**
 * Largest result set we pull in one query so the verified-first sort spans the
 * whole list rather than one page. Larger sets fall back to per-page sorting.
 */
export const DIRECTORY_SORT_WINDOW = 1_500;

export function hasVerifiedFees(row: Pick<InstitutionSearchResult, "published_fee_count">): boolean {
  return row.published_fee_count > 0;
}

/** Verified-first, then alphabetical by institution name. */
export function sortVerifiedFirst<T extends Pick<InstitutionSearchResult, "published_fee_count" | "institution_name">>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const verifiedDelta = Number(hasVerifiedFees(b)) - Number(hasVerifiedFees(a));
    if (verifiedDelta !== 0) return verifiedDelta;
    return a.institution_name.localeCompare(b.institution_name);
  });
}

export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = Math.max(0, page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}
