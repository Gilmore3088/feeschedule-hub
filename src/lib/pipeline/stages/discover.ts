/**
 * discover stage — find each target's fee-schedule URL by probing common paths
 * on its website. Discovery is mostly HTTP probing, so this stage uses plain
 * fetch (no sandbox needed); JS-heavy rediscovery is a later increment.
 *
 * Dry-run (default): count targets that have a website but no fee URL.
 * Apply (apply=true): probe candidate paths and set crawl_targets.fee_schedule_url
 * to the first that responds.
 */

import { sql } from "@/lib/crawler-db/connection";
import { numParam, boolParam, type Stage, type StageContext, type StageResult } from "../stage";

const DEFAULT_LIMIT = 20;
const PROBE_TIMEOUT_MS = 8000;

// Common fee-schedule paths, ordered by how often banks/credit unions use them.
const CANDIDATE_PATHS = [
  "/fees",
  "/fee-schedule",
  "/fees-and-charges",
  "/schedule-of-fees",
  "/personal/fees",
  "/disclosures/fee-schedule",
  "/about/fees",
  "/rates-and-fees",
];

interface Target {
  id: number;
  website_url: string;
}

export const discoverStage: Stage = {
  name: "discover",
  description:
    "Find each target's fee-schedule URL by probing common paths. Dry-run counts targets missing a URL.",

  async run(ctx: StageContext): Promise<StageResult> {
    const limit = numParam(ctx.params.limit, DEFAULT_LIMIT);
    const apply = boolParam(ctx.params.apply);

    if (!apply) {
      const rows = (await sql`
        SELECT count(*)::int AS n
          FROM crawl_targets
         WHERE (fee_schedule_url IS NULL OR fee_schedule_url = '')
           AND website_url IS NOT NULL AND website_url <> ''
      `) as { n: number }[];
      const n = Number(rows[0]?.n ?? 0);
      return {
        rowsIn: n,
        rowsOut: 0,
        notes: { mode: "dry-run", message: `${n} target(s) missing a fee URL` },
      };
    }

    const candidates = (await sql`
      SELECT id, website_url
        FROM crawl_targets
       WHERE (fee_schedule_url IS NULL OR fee_schedule_url = '')
         AND website_url IS NOT NULL AND website_url <> ''
       ORDER BY id
       LIMIT ${limit}
    `) as Target[];

    let found = 0;
    let notFound = 0;
    for (const target of candidates) {
      const url = await probeFeeUrl(target.website_url);
      if (url) {
        await sql`UPDATE crawl_targets SET fee_schedule_url = ${url} WHERE id = ${target.id}`;
        found++;
      } else {
        notFound++;
      }
    }

    return {
      rowsIn: candidates.length,
      rowsOut: found,
      notes: { mode: "apply", found, notFound },
    };
  },
};

export function normalizeBase(websiteUrl: string): string {
  let base = websiteUrl.trim();
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base.replace(/\/+$/, "");
}

export async function probeFeeUrl(
  websiteUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const base = normalizeBase(websiteUrl);
  for (const path of CANDIDATE_PATHS) {
    const url = `${base}${path}`;
    try {
      const res = await fetchImpl(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (res.ok) return url;
    } catch {
      // unreachable path — try the next candidate
    }
  }
  return null;
}
