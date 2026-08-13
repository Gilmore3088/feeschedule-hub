import { createHash } from "crypto";
import sanitizeHtml from "sanitize-html";

import { sql } from "@/lib/data-store/connection";

type SqlTag = typeof sql;
type Fetcher = typeof fetch;

export const ROSETTA_READ_DEFAULT_LIMIT = 25;
export const ROSETTA_READ_MAX_LIMIT = 50;

const USER_AGENT = "AiBI-Rosetta/1.0 (+https://theaibankinginstitute.com)";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TEXT_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_PDF_PAGES = 150;
const PDF_EXTRACTION_TIMEOUT_MS = 20_000;

interface ReadCandidateRow {
  crawl_result_id: number | string;
  crawl_target_id: number | string;
  institution_name: string;
  document_url: string | null;
  content_hash: string | null;
}

type ReadStatus = "completed" | "empty" | "needs_ocr" | "failed" | "skipped";

interface PdfTextExtraction {
  text: string;
  totalPages: number;
}

type PdfTextExtractor = (bytes: Uint8Array) => Promise<PdfTextExtraction>;

interface ReadResult {
  crawlResultId: number;
  crawlTargetId: number;
  institutionName: string;
  sourceUrl: string | null;
  status: ReadStatus;
  documentType: string | null;
  contentType: string | null;
  sourceHash: string | null;
  textHash: string | null;
  charCount: number;
  error: string | null;
}

export interface RunRosettaReadOptions {
  runId: number;
  limit?: number;
  institutionId?: number;
  dryRun?: boolean;
  db?: SqlTag;
  fetchImpl?: Fetcher;
  pdfTextExtractor?: PdfTextExtractor;
}

export interface RunRosettaReadResult {
  selected: number;
  processed: number;
  completed: number;
  empty: number;
  needsOcr: number;
  failed: number;
  skipped: number;
  chars: number;
  limit: number;
  dryRun: boolean;
  results: ReadResult[];
}

function boundedLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return ROSETTA_READ_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), ROSETTA_READ_MAX_LIMIT);
}

function normalizeHttpUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function detectDocumentType(url: string, contentType: string | null): string {
  const lowerType = contentType?.toLowerCase() ?? "";
  const lowerUrl = url.toLowerCase();
  if (lowerType.includes("application/pdf") || lowerUrl.endsWith(".pdf")) return "pdf";
  if (lowerType.includes("text/html")) return "html";
  if (lowerType.includes("text/plain")) return "text";
  return "unknown";
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function extractHtmlText(html: string): string {
  const withoutDeadBlocks = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|section|article|main|header|footer|li|tr|td|th|h[1-6])>/gi, "\n");
  return normalizeWhitespace(
    sanitizeHtml(withoutDeadBlocks, {
      allowedTags: [],
      allowedAttributes: {},
      disallowedTagsMode: "discard",
    }),
  );
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function extractPdfText(bytes: Uint8Array): Promise<PdfTextExtraction> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  return withTimeout(
    (async () => {
      const pdf = await getDocumentProxy(bytes, {
        maxImageSize: 16_777_216,
      });

      try {
        const totalPages = Number(pdf.numPages ?? 0);
        if (totalPages > MAX_PDF_PAGES) {
          throw new Error(`PDF has too many pages for Rosetta text read: ${totalPages}`);
        }

        const extracted = await extractText(pdf, { mergePages: true });
        return { text: extracted.text, totalPages: extracted.totalPages };
      } finally {
        await pdf.destroy?.();
      }
    })(),
    PDF_EXTRACTION_TIMEOUT_MS,
    "PDF text extraction",
  );
}

async function fetchWithTimeout(fetchImpl: Fetcher, url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,text/plain,application/pdf;q=0.9,*/*;q=0.5",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readCandidate(
  row: ReadCandidateRow,
  fetchImpl: Fetcher,
  pdfTextExtractor: PdfTextExtractor,
): Promise<{
  result: ReadResult;
  normalizedText: string | null;
}> {
  const crawlResultId = Number(row.crawl_result_id);
  const crawlTargetId = Number(row.crawl_target_id);
  const institutionName = String(row.institution_name);
  const sourceUrl = normalizeHttpUrl(row.document_url);
  if (!sourceUrl) {
    return {
      normalizedText: null,
      result: {
        crawlResultId,
        crawlTargetId,
        institutionName,
        sourceUrl: row.document_url,
        status: "skipped",
        documentType: null,
        contentType: null,
        sourceHash: row.content_hash,
        textHash: null,
        charCount: 0,
        error: "Invalid or missing document_url",
      },
    };
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(fetchImpl, sourceUrl);
  } catch (error) {
    return {
      normalizedText: null,
      result: {
        crawlResultId,
        crawlTargetId,
        institutionName,
        sourceUrl,
        status: "failed",
        documentType: null,
        contentType: null,
        sourceHash: row.content_hash,
        textHash: null,
        charCount: 0,
        error: `Read fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  const contentType = response.headers.get("content-type");
  const documentType = detectDocumentType(response.url || sourceUrl, contentType);
  if (!response.ok) {
    return {
      normalizedText: null,
      result: {
        crawlResultId,
        crawlTargetId,
        institutionName,
        sourceUrl,
        status: "failed",
        documentType,
        contentType,
        sourceHash: row.content_hash,
        textHash: null,
        charCount: 0,
        error: `HTTP ${response.status}`,
      },
    };
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_TEXT_DOCUMENT_BYTES) {
    return {
      normalizedText: null,
      result: {
        crawlResultId,
        crawlTargetId,
        institutionName,
        sourceUrl,
        status: "failed",
        documentType,
        contentType,
        sourceHash: row.content_hash,
        textHash: null,
        charCount: 0,
        error: `Document too large for Rosetta text read: ${contentLength} bytes`,
      },
    };
  }

  if (documentType === "pdf") {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      return {
        normalizedText: null,
        result: {
          crawlResultId,
          crawlTargetId,
          institutionName,
          sourceUrl,
          status: "failed",
          documentType,
          contentType,
          sourceHash: row.content_hash,
          textHash: null,
          charCount: 0,
          error: `PDF read failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }

    if (bytes.byteLength > MAX_TEXT_DOCUMENT_BYTES) {
      return {
        normalizedText: null,
        result: {
          crawlResultId,
          crawlTargetId,
          institutionName,
          sourceUrl,
          status: "failed",
          documentType,
          contentType,
          sourceHash: row.content_hash,
          textHash: null,
          charCount: 0,
          error: `Document too large for Rosetta text read: ${bytes.byteLength} bytes`,
        },
      };
    }

    try {
      const extracted = await pdfTextExtractor(bytes);
      const normalizedText = normalizeWhitespace(extracted.text);
      const status: ReadStatus = normalizedText.length > 0 ? "completed" : "needs_ocr";
      return {
        normalizedText,
        result: {
          crawlResultId,
          crawlTargetId,
          institutionName,
          sourceUrl,
          status,
          documentType,
          contentType,
          sourceHash: row.content_hash,
          textHash: normalizedText.length > 0 ? hashText(normalizedText) : null,
          charCount: normalizedText.length,
          error:
            status === "needs_ocr"
              ? `No embedded PDF text found across ${extracted.totalPages} pages; OCR required`
              : null,
        },
      };
    } catch (error) {
      return {
        normalizedText: null,
        result: {
          crawlResultId,
          crawlTargetId,
          institutionName,
          sourceUrl,
          status: "failed",
          documentType,
          contentType,
          sourceHash: row.content_hash,
          textHash: null,
          charCount: 0,
          error: `PDF text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  const raw = await response.text();
  const normalizedText =
    documentType === "html" ? extractHtmlText(raw) : normalizeWhitespace(raw);
  const status: ReadStatus = normalizedText.length > 0 ? "completed" : "empty";
  return {
    normalizedText,
    result: {
      crawlResultId,
      crawlTargetId,
      institutionName,
      sourceUrl,
      status,
      documentType,
      contentType,
      sourceHash: row.content_hash,
      textHash: normalizedText.length > 0 ? hashText(normalizedText) : null,
      charCount: normalizedText.length,
      error: status === "empty" ? "No readable text found" : null,
    },
  };
}

async function selectCandidates(
  db: SqlTag,
  limit: number,
  institutionId?: number,
): Promise<ReadCandidateRow[]> {
  const targetFilter = institutionId ? "AND cr.crawl_target_id = $2" : "";
  const params = institutionId ? [limit, institutionId] : [limit];
  return db.unsafe<ReadCandidateRow[]>(
    `
      SELECT cr.id AS crawl_result_id,
             cr.crawl_target_id,
             ct.institution_name,
             cr.document_url,
             cr.content_hash
        FROM source_documents cr
        JOIN institution_sources ct ON ct.id = cr.crawl_target_id
       WHERE cr.status = 'success'
         AND cr.document_url IS NOT NULL
         ${targetFilter}
         AND NOT EXISTS (
           SELECT 1
             FROM agent_document_texts adt
            WHERE adt.crawl_result_id = cr.id
              AND adt.source_hash IS NOT DISTINCT FROM cr.content_hash
              AND adt.status IN ('completed', 'empty', 'needs_ocr')
         )
       ORDER BY cr.crawled_at DESC NULLS LAST, cr.id DESC
       LIMIT $1
    `,
    params,
  );
}

async function recordReadResult(
  db: SqlTag,
  runId: number,
  result: ReadResult,
  normalizedText: string | null,
): Promise<void> {
  await db`
    INSERT INTO agent_document_texts
      (agent_run_id, crawl_result_id, crawl_target_id, source_url,
       document_type, content_type, source_hash, status, normalized_text,
       text_hash, char_count, error_message, updated_at)
    VALUES
      (${runId}, ${result.crawlResultId}, ${result.crawlTargetId}, ${result.sourceUrl},
       ${result.documentType}, ${result.contentType}, ${result.sourceHash},
       ${result.status}, ${normalizedText}, ${result.textHash}, ${result.charCount},
       ${result.error}, NOW())
    ON CONFLICT (crawl_result_id)
    DO UPDATE SET
      agent_run_id = EXCLUDED.agent_run_id,
      source_url = EXCLUDED.source_url,
      document_type = EXCLUDED.document_type,
      content_type = EXCLUDED.content_type,
      source_hash = EXCLUDED.source_hash,
      status = EXCLUDED.status,
      normalized_text = EXCLUDED.normalized_text,
      text_hash = EXCLUDED.text_hash,
      char_count = EXCLUDED.char_count,
      error_message = EXCLUDED.error_message,
      updated_at = NOW()
  `;
}

export async function runRosettaRead(
  options: RunRosettaReadOptions,
): Promise<RunRosettaReadResult> {
  const db = options.db ?? sql;
  const fetchImpl = options.fetchImpl ?? fetch;
  const pdfTextExtractor = options.pdfTextExtractor ?? extractPdfText;
  const limit = boundedLimit(options.limit);
  const dryRun = Boolean(options.dryRun);
  const rows = await selectCandidates(db, limit, options.institutionId);

  const results: ReadResult[] = [];
  for (const row of rows) {
    const { result, normalizedText } = await readCandidate(
      row,
      fetchImpl,
      pdfTextExtractor,
    );
    results.push(result);
    if (!dryRun) await recordReadResult(db, options.runId, result, normalizedText);
  }

  return {
    selected: rows.length,
    processed: results.length,
    completed: results.filter((result) => result.status === "completed").length,
    empty: results.filter((result) => result.status === "empty").length,
    needsOcr: results.filter((result) => result.status === "needs_ocr").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    chars: results.reduce((total, result) => total + result.charCount, 0),
    limit,
    dryRun,
    results,
  };
}
