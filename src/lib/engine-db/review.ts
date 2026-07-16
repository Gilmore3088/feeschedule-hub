/**
 * Review queue + provenance — Darwin's flagged fees and the source document a
 * fee traces to. The provenance view is the console's differentiator: every fee
 * links back to the exact document snapshot + char span it came from.
 */

import { sql } from "@/lib/crawler-db/connection";

export interface FlaggedFee {
  feeRawId: number;
  institutionId: number;
  institutionName: string | null;
  feeName: string;
  amount: number | null;
  confidence: number | null;
  flags: string[];
  documentId: number | null;
}

/** Darwin-flagged raw fees awaiting review (rule-flagged / low-confidence / unclassified). */
export async function getReviewQueue(limit = 100): Promise<FlaggedFee[]> {
  try {
    const rows = await sql<
      {
        fee_raw_id: string;
        institution_id: string;
        institution_name: string | null;
        fee_name: string;
        amount: string | null;
        extraction_confidence: string | null;
        outlier_flags: string[] | null;
        document_id: string | null;
      }[]
    >`
      SELECT fr.fee_raw_id, fr.institution_id, t.institution_name, fr.fee_name,
             fr.amount, fr.extraction_confidence, fr.outlier_flags, fr.document_id
        FROM fees_raw fr
        LEFT JOIN crawl_targets t ON t.id = fr.institution_id
       WHERE jsonb_array_length(fr.outlier_flags) > 0
       ORDER BY fr.created_at DESC
       LIMIT ${limit}
    `;
    return rows.map((r) => ({
      feeRawId: Number(r.fee_raw_id),
      institutionId: Number(r.institution_id),
      institutionName: r.institution_name,
      feeName: r.fee_name,
      amount: r.amount == null ? null : Number(r.amount),
      confidence: r.extraction_confidence == null ? null : Number(r.extraction_confidence),
      flags: r.outlier_flags ?? [],
      documentId: r.document_id == null ? null : Number(r.document_id),
    }));
  } catch {
    return [];
  }
}

export interface Provenance {
  feeName: string;
  amount: number | null;
  canonicalKey: string | null;
  confidence: number | null;
  charStart: number | null;
  charEnd: number | null;
  extractorVersion: string | null;
  documentId: number | null;
  sourceUrl: string | null;
  r2Key: string | null;
  contentSha: string | null;
  fetchedAt: string | null;
  renderMode: string | null;
}

/** Full provenance for one raw fee: the document snapshot + span it came from. */
export async function getProvenance(feeRawId: number): Promise<Provenance | null> {
  try {
    const [r] = await sql<
      {
        fee_name: string;
        amount: string | null;
        canonical_fee_key: string | null;
        extraction_confidence: string | null;
        char_start: string | null;
        char_end: string | null;
        extractor_version: string | null;
        document_id: string | null;
        source_url: string | null;
        r2_key: string | null;
        content_sha256: string | null;
        fetched_at: string | null;
        render_mode: string | null;
      }[]
    >`
      SELECT fr.fee_name, fr.amount, v.canonical_fee_key, fr.extraction_confidence,
             fr.char_start, fr.char_end, fr.extractor_version,
             fr.document_id, d.source_url, d.r2_key, d.content_sha256, d.fetched_at, d.render_mode
        FROM fees_raw fr
        LEFT JOIN fees_verified v ON v.fee_raw_id = fr.fee_raw_id
        LEFT JOIN documents d     ON d.id = fr.document_id
       WHERE fr.fee_raw_id = ${feeRawId}
    `;
    if (!r) return null;
    return {
      feeName: r.fee_name,
      amount: r.amount == null ? null : Number(r.amount),
      canonicalKey: r.canonical_fee_key,
      confidence: r.extraction_confidence == null ? null : Number(r.extraction_confidence),
      charStart: r.char_start == null ? null : Number(r.char_start),
      charEnd: r.char_end == null ? null : Number(r.char_end),
      extractorVersion: r.extractor_version,
      documentId: r.document_id == null ? null : Number(r.document_id),
      sourceUrl: r.source_url,
      r2Key: r.r2_key,
      contentSha: r.content_sha256,
      fetchedAt: r.fetched_at,
      renderMode: r.render_mode,
    };
  } catch {
    return null;
  }
}
