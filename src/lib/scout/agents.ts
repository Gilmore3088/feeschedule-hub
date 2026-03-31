import Anthropic from "@anthropic-ai/sdk";
import type {
  InstitutionRow,
  ExtractedFeeRow,
  CrawlResultRow,
  MappedFee,
  FeeReport,
  ScoutResult,
  ClassifierResult,
  ExtractorResult,
} from "./types";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Emit = (msg: string) => void;

function normCategory(raw: string | null): string {
  if (!raw) return "other";
  const r = raw.toLowerCase();
  if (r.includes("overdraft") || r.includes("nsf") || r.includes("insufficient")) return "overdraft_nsf";
  if (r.includes("maintenance") || r.includes("monthly") || r.includes("account")) return "account_maintenance";
  if (r.includes("atm") || r.includes("cash")) return "atm";
  if (r.includes("wire") || r.includes("transfer")) return "wire";
  if (r.includes("card") || r.includes("debit")) return "card";
  if (r.includes("foreign") || r.includes("international") || r.includes("fx")) return "foreign";
  return "other";
}

function formatAmount(n: number | null): string {
  if (n === null || n === undefined) return "varies";
  if (n === 0) return "Free";
  if (n < 0) return "varies";
  return `$${n.toFixed(2)}`;
}

export function scout(
  institution: InstitutionRow,
  allTargets: InstitutionRow[],
  fees: ExtractedFeeRow[],
  crawlResults: CrawlResultRow[],
  emit: Emit
): ScoutResult {
  emit(`Matched: ${institution.institution_name}`);
  emit(
    `Asset tier: ${institution.asset_size_tier || "unknown"} | State: ${institution.state_code || "unknown"} | District: ${institution.fed_district || "unknown"}`
  );
  emit(`${fees.length} fee records | ${crawlResults.length} crawl records`);

  const successfulCrawl = crawlResults.find(
    (r) => r.status === "success" && r.document_url
  );
  if (successfulCrawl) {
    emit(`Source document: ${successfulCrawl.document_url}`);
  } else {
    emit("No successful crawl on record");
  }

  if (allTargets.length > 1) {
    emit(
      `Note: ${allTargets.length - 1} other match(es) in database — using largest by assets`
    );
  }

  return {
    found: true,
    institution,
    allTargets,
    fees,
    crawlResults,
    primaryDocUrl: successfulCrawl?.document_url || null,
  };
}

export function classifier(
  scoutResult: ScoutResult,
  emit: Emit
): ClassifierResult {
  const { fees, crawlResults, institution } = scoutResult;

  const approvedCount = fees.filter((f) => f.review_status === "approved").length;
  const stagedCount = fees.filter((f) => f.review_status === "staged").length;
  const hasAmounts = fees.filter((f) => f.amount != null).length;
  const categories = [
    ...new Set(fees.map((f) => f.fee_category).filter(Boolean)),
  ] as string[];
  const latestCrawl = crawlResults[0];

  let availability: "high" | "medium" | "low" = "low";
  if (fees.length >= 10 && hasAmounts >= 5) availability = "high";
  else if (fees.length >= 3) availability = "medium";

  emit(
    `Availability: ${availability} | ${fees.length} records (${approvedCount} approved, ${stagedCount} staged)`
  );
  emit(
    `Categories found: ${categories.length > 0 ? categories.join(", ") : "none"}`
  );
  emit(
    `Latest crawl: ${latestCrawl?.status || "never"} | Consecutive failures: ${institution.consecutive_failures}`
  );

  if (institution.consecutive_failures > 3) {
    emit(
      `${institution.consecutive_failures} consecutive crawl failures — data may be stale`
    );
  }

  return {
    availability,
    feeCount: fees.length,
    approvedCount,
    stagedCount,
    hasAmounts,
    categories,
    latestCrawlStatus: latestCrawl?.status || "unknown",
    latestCrawlDate: latestCrawl?.crawled_at || null,
    documentUrl: scoutResult.primaryDocUrl,
    consecutiveFailures: institution.consecutive_failures,
  };
}

export function extractor(
  scoutResult: ScoutResult,
  _classifierResult: ClassifierResult,
  emit: Emit
): ExtractorResult {
  const { fees } = scoutResult;

  if (!fees.length) {
    emit("No fee records in database for this institution");
    return {
      fees: [],
      confidence: 0,
      sourceType: "none",
      knowledgeDate: "unknown",
      rawCount: 0,
    };
  }

  const mapped: MappedFee[] = fees.map((f) => ({
    category: normCategory(f.fee_category),
    name: f.fee_name || "Unnamed fee",
    amount: formatAmount(f.amount),
    conditions:
      f.conditions || (f.frequency ? `Frequency: ${f.frequency}` : ""),
    waivable: false,
    waiver: "",
    review_status: f.review_status,
    confidence: f.extraction_confidence,
  }));

  const knowledgeDate = scoutResult.crawlResults.find(
    (r) => r.status === "success"
  )?.crawled_at
    ? new Date(
        scoutResult.crawlResults.find((r) => r.status === "success")!.crawled_at!
      ).toLocaleDateString("en-US", { year: "numeric", month: "short" })
    : "unknown";

  const confidence =
    fees.length >= 10 ? 0.95 : fees.length >= 5 ? 0.8 : 0.6;

  emit(
    `Structured ${mapped.length} fee records | confidence ${Math.round(confidence * 100)}%`
  );
  emit(`Data as of: ${knowledgeDate}`);

  return {
    fees: mapped,
    confidence,
    sourceType: "database",
    knowledgeDate,
    rawCount: fees.length,
  };
}

export async function analyst(
  scoutResult: ScoutResult,
  classifierResult: ClassifierResult,
  extractorResult: ExtractorResult,
  emit: Emit
): Promise<FeeReport> {
  emit(
    `Synthesising report — ${extractorResult.fees.length} fees | confidence ${Math.round(extractorResult.confidence * 100)}%`
  );
  emit("Sending to Claude Sonnet...");

  const payload = {
    institution_name: scoutResult.institution.institution_name,
    charter_type: scoutResult.institution.charter_type,
    asset_size_tier: scoutResult.institution.asset_size_tier,
    state: scoutResult.institution.state,
    fed_district: scoutResult.institution.fed_district,
    cbsa_name: scoutResult.institution.cbsa_name,
    data_availability: classifierResult.availability,
    approved_fees: classifierResult.approvedCount,
    staged_fees: classifierResult.stagedCount,
    consecutive_failures: classifierResult.consecutiveFailures,
    fees: extractorResult.fees.map((f) => ({
      category: f.category,
      name: f.name,
      amount: f.amount,
      conditions: f.conditions,
    })),
    knowledge_date: extractorResult.knowledgeDate,
    source_url: scoutResult.primaryDocUrl,
  };

  const system = `You are the Analyst for Bank Fee Index, a professional financial intelligence platform.
Produce a precise, evidence-based fee intelligence report. Reference specific fees and amounts.
Audience: bank executives, consultants, compliance officers, fintechs.

Consumer score rubric (1-10, 10 = most consumer-friendly):
- 8-10: Low/no fees, fee-competitive institution
- 5-7: Market average fee structure
- 1-4: Above-market, fee-heavy institution

Return ONLY raw JSON (no markdown fences):
{
  "data_quality": "excellent|good|partial|limited",
  "consumer_score": { "score": 6, "label": "Average", "rationale": "2 sentences citing specific fees." },
  "peer_context": "1-2 sentences comparing this institution to peers in same tier/charter.",
  "highlights": ["up to 3 specific positives with dollar amounts"],
  "warnings":   ["up to 3 specific concerns with dollar amounts"],
  "tips":       ["up to 3 actionable tips referencing real fees"],
  "verdict":    "2-3 sentence professional verdict citing specific fee data."
}

Only reference fees provided. Do not invent data.`;

  const response = await claude.messages.create(
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    },
    { timeout: 30_000 }
  );

  emit("Response received — building report...");

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const s = src.indexOf("{");
  const e = src.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("Analyst could not produce structured JSON");
  const parsed = JSON.parse(src.slice(s, e + 1));

  const cats: Record<string, MappedFee[]> = {
    account_maintenance: [],
    overdraft_nsf: [],
    atm: [],
    wire: [],
    card: [],
    foreign: [],
    other: [],
  };
  extractorResult.fees.forEach((f) => {
    const cat = f.category;
    if (cats[cat]) cats[cat].push(f);
    else cats.other.push(f);
  });

  emit(
    `Complete — quality: ${parsed.data_quality} | score: ${parsed.consumer_score?.score}/10`
  );

  return {
    institution: scoutResult.institution.institution_name,
    institution_meta: {
      asset_size_tier: scoutResult.institution.asset_size_tier,
      charter_type: scoutResult.institution.charter_type,
      state: scoutResult.institution.state,
      fed_district: scoutResult.institution.fed_district,
      cbsa_name: scoutResult.institution.cbsa_name,
      last_crawl_at: scoutResult.institution.last_crawl_at,
    },
    data_quality: parsed.data_quality,
    source_summary: {
      url: scoutResult.primaryDocUrl,
      type: "database",
      access: "verified",
      as_of: extractorResult.knowledgeDate,
    },
    consumer_score: parsed.consumer_score,
    peer_context: parsed.peer_context,
    highlights: parsed.highlights || [],
    warnings: parsed.warnings || [],
    fee_categories: cats,
    tips: parsed.tips || [],
    verdict: parsed.verdict || "",
  };
}
