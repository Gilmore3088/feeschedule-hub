import { sql } from "@/lib/crawler-db/connection";
import type { InstitutionRow, ExtractedFeeRow, CrawlResultRow } from "./types";

export async function searchInstitutions(
  query: string
): Promise<InstitutionRow[]> {
  const pattern = `%${query}%`;
  const rows = await sql<InstitutionRow[]>`
    SELECT * FROM crawl_targets
    WHERE institution_name ILIKE ${pattern}
      AND status = 'active'
    ORDER BY asset_size DESC NULLS LAST
    LIMIT 10
  `;
  return rows;
}

export async function getExtractedFees(
  crawlTargetId: number
): Promise<ExtractedFeeRow[]> {
  const rows = await sql<ExtractedFeeRow[]>`
    SELECT * FROM extracted_fees
    WHERE crawl_target_id = ${crawlTargetId}
    ORDER BY fee_category
    LIMIT 500
  `;
  return rows;
}

export async function getCrawlResults(
  crawlTargetId: number
): Promise<CrawlResultRow[]> {
  const rows = await sql<CrawlResultRow[]>`
    SELECT * FROM crawl_results
    WHERE crawl_target_id = ${crawlTargetId}
    ORDER BY id DESC
    LIMIT 10
  `;
  return rows;
}

export async function autocompleteInstitutions(query: string) {
  const pattern = `%${query}%`;
  const rows = await sql<
    { id: number; institution_name: string; state_code: string | null; asset_size_tier: string | null }[]
  >`
    SELECT id, institution_name, state_code, asset_size_tier
    FROM crawl_targets
    WHERE institution_name ILIKE ${pattern}
      AND status = 'active'
    ORDER BY asset_size DESC NULLS LAST
    LIMIT 8
  `;
  return rows;
}
