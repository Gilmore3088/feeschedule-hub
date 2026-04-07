import { getSql, sql } from "./connection";

// ── RichIndicator ─────────────────────────────────────────────────────────────

export interface RichIndicator {
  current: number;
  history: { date: string; value: number }[];
  trend: "rising" | "falling" | "stable";
  asOf: string;
}

/**
 * Compute a trend label from the current value vs history.
 * Considers more than 0.5% change (relative) as rising or falling.
 */
export function deriveTrend(
  current: number,
  history: { value?: number; date?: string }[]
): "rising" | "falling" | "stable" {
  if (!history.length || current === 0) return "stable";
  const oldest = history[0].value ?? 0;
  if (oldest === 0) return "stable";
  const pctChange = ((current - oldest) / Math.abs(oldest)) * 100;
  if (pctChange > 0.5) return "rising";
  if (pctChange < -0.5) return "falling";
  return "stable";
}

// ── NationalEconomicSummary ───────────────────────────────────────────────────

export interface NationalEconomicSummary {
  fed_funds_rate: RichIndicator | null;
  unemployment_rate: RichIndicator | null;
  cpi_yoy_pct: RichIndicator | null;
  consumer_sentiment: RichIndicator | null;
}

async function fetchNationalIndicator(
  seriesId: string,
  limit = 5
): Promise<RichIndicator | null> {
  const db = getSql();
  try {
    const rows = await db`
      SELECT value, observation_date
      FROM fed_economic_indicators
      WHERE series_id = ${seriesId} AND value IS NOT NULL
      ORDER BY observation_date DESC
      LIMIT ${limit}
    ` as { value: number | string | null; observation_date: string | Date }[];

    if (!rows.length) return null;

    const normalized = rows.map((r) => ({
      value: Number(r.value),
      date: r.observation_date instanceof Date
        ? r.observation_date.toISOString().slice(0, 10)
        : String(r.observation_date),
    }));

    const current = normalized[0].value;
    const asOf = normalized[0].date;
    const history = normalized.slice(1).reverse();
    const trend = deriveTrend(current, history);

    return { current, history, trend, asOf };
  } catch {
    return null;
  }
}

async function fetchCpiYoy(): Promise<RichIndicator | null> {
  const db = getSql();
  try {
    const rows = await db`
      SELECT value, observation_date
      FROM fed_economic_indicators
      WHERE series_id = 'CPIAUCSL' AND value IS NOT NULL
      ORDER BY observation_date DESC
      LIMIT 17
    ` as { value: number | string | null; observation_date: string | Date }[];

    if (rows.length < 13) return null;

    const computeYoy = (idx: number): number | null => {
      const latestVal = Number(rows[idx].value);
      const priorVal = Number(rows[idx + 12]?.value);
      if (!priorVal || isNaN(latestVal) || isNaN(priorVal)) return null;
      return ((latestVal - priorVal) / priorVal) * 100;
    };

    const current = computeYoy(0);
    if (current === null) return null;

    const asOf = rows[0].observation_date instanceof Date
      ? rows[0].observation_date.toISOString().slice(0, 10)
      : String(rows[0].observation_date);

    // Build history from older readings
    const historyPoints: { date: string; value: number }[] = [];
    for (let i = 1; i < Math.min(rows.length - 12, 5); i++) {
      const yoy = computeYoy(i);
      if (yoy !== null) {
        const date = rows[i].observation_date instanceof Date
          ? (rows[i].observation_date as unknown as Date).toISOString().slice(0, 10)
          : String(rows[i].observation_date);
        historyPoints.unshift({ date, value: yoy });
      }
    }

    const trend = deriveTrend(current, historyPoints);
    return { current, history: historyPoints, trend, asOf };
  } catch {
    return null;
  }
}

export async function getNationalEconomicSummary(): Promise<NationalEconomicSummary> {
  const empty: NationalEconomicSummary = {
    fed_funds_rate: null,
    unemployment_rate: null,
    cpi_yoy_pct: null,
    consumer_sentiment: null,
  };

  try {
    const [fedFunds, unemploy, cpiYoy, sentiment] = await Promise.all([
      fetchNationalIndicator("FEDFUNDS", 5),
      fetchNationalIndicator("UNRATE", 5),
      fetchCpiYoy(),
      fetchNationalIndicator("UMCSENT", 5),
    ]);

    return {
      fed_funds_rate: fedFunds,
      unemployment_rate: unemploy,
      cpi_yoy_pct: cpiYoy,
      consumer_sentiment: sentiment,
    };
  } catch {
    return empty;
  }
}

// ── DistrictUnemployment ──────────────────────────────────────────────────────

export async function getDistrictUnemployment(): Promise<Map<number, number>> {
  const db = getSql();
  try {
    const rows = await db`
      SELECT DISTINCT ON (fed_district)
        fed_district,
        value
      FROM fed_economic_indicators
      WHERE series_id LIKE '%UNRATE%' AND fed_district IS NOT NULL AND value IS NOT NULL
      ORDER BY fed_district, observation_date DESC
    ` as { fed_district: number | string; value: number | string }[];

    const result = new Map<number, number>();
    for (const row of rows) {
      result.set(Number(row.fed_district), Number(row.value));
    }
    return result;
  } catch {
    return new Map();
  }
}

// ── DistrictBeigeBookSummaries ────────────────────────────────────────────────

export interface DistrictBeigeBookSummary {
  fed_district: number;
  district_summary: string;
  release_code: string;
  generated_at: string;
}

export async function getDistrictBeigeBookSummaries(
  releaseCode?: string
): Promise<DistrictBeigeBookSummary[]> {
  const db = getSql();
  try {
    let rows: { fed_district: number | string; district_summary: string; release_code: string; generated_at: string }[];

    if (releaseCode) {
      rows = await db`
        SELECT fed_district, district_summary, release_code, generated_at
        FROM beige_book_summaries
        WHERE release_code = ${releaseCode}
          AND fed_district IS NOT NULL
        ORDER BY fed_district
      ` as typeof rows;
    } else {
      rows = await db`
        SELECT fed_district, district_summary, release_code, generated_at
        FROM beige_book_summaries
        WHERE fed_district IS NOT NULL
          AND release_code = (
            SELECT release_code FROM beige_book_summaries
            WHERE fed_district IS NOT NULL
            ORDER BY generated_at DESC
            LIMIT 1
          )
        ORDER BY fed_district
      ` as typeof rows;
    }

    return rows.map((r) => ({
      fed_district: Number(r.fed_district),
      district_summary: r.district_summary,
      release_code: r.release_code,
      generated_at: (r.generated_at as unknown) instanceof Date
        ? (r.generated_at as unknown as Date).toISOString()
        : String(r.generated_at),
    }));
  } catch {
    return [];
  }
}

// ── NationalBeigeBookSummary ──────────────────────────────────────────────────

export interface NationalBeigeBookSummaryRow {
  release_code: string;
  national_summary: string;
  themes: Record<string, string> | null;
  generated_at: string;
}

export async function getNationalBeigeBookSummary(
  releaseCode?: string
): Promise<NationalBeigeBookSummaryRow | null> {
  const db = getSql();
  try {
    let rows: { release_code: string; national_summary: string; themes: unknown; generated_at: string | Date }[];

    if (releaseCode) {
      rows = await db`
        SELECT release_code, national_summary, themes, generated_at
        FROM beige_book_summaries
        WHERE release_code = ${releaseCode}
          AND fed_district IS NULL
        LIMIT 1
      ` as typeof rows;
    } else {
      rows = await db`
        SELECT release_code, national_summary, themes, generated_at
        FROM beige_book_summaries
        WHERE fed_district IS NULL
        ORDER BY generated_at DESC
        LIMIT 1
      ` as typeof rows;
    }

    if (!rows.length) return null;

    const row = rows[0];
    let themes: Record<string, string> | null = null;

    if (typeof row.themes === "object" && row.themes !== null) {
      themes = row.themes as Record<string, string>;
    } else if (typeof row.themes === "string") {
      try {
        themes = JSON.parse(row.themes) as Record<string, string>;
      } catch {
        themes = null;
      }
    }

    const generated_at = row.generated_at instanceof Date
      ? row.generated_at.toISOString()
      : String(row.generated_at);

    return {
      release_code: row.release_code,
      national_summary: row.national_summary,
      themes,
      generated_at,
    };
  } catch {
    return null;
  }
}

export interface BeigeBookSection {
  id: number;
  release_date: string;
  release_code: string;
  fed_district: number | null;
  section_name: string;
  content_text: string;
  source_url: string;
}

export async function getLatestBeigeBook(district: number): Promise<BeigeBookSection[]> {
  try {
    const [latest] = await sql`
      SELECT release_code FROM fed_beige_book
      WHERE fed_district = ${district}
      ORDER BY release_date DESC
      LIMIT 1
    `;

    if (!latest) return [];

    const rows = await sql`
      SELECT id, release_date, release_code, fed_district, section_name,
             content_text, source_url
      FROM fed_beige_book
      WHERE fed_district = ${district} AND release_code = ${latest.release_code}
      ORDER BY id
    ` as BeigeBookSection[];

    // Normalize Date objects from Postgres
    return rows.map((r) => ({
      ...r,
      id: Number(r.id),
      release_date: (r.release_date as unknown) instanceof Date
        ? (r.release_date as unknown as Date).toISOString().slice(0, 10)
        : String(r.release_date),
    }));
  } catch {
    return [];
  }
}

export async function getBeigeBookEditions(
  limit = 8
): Promise<{ release_code: string; release_date: string }[]> {
  try {
    return await sql`
      SELECT DISTINCT release_code, release_date
      FROM fed_beige_book
      ORDER BY release_date DESC
      LIMIT ${limit}
    ` as { release_code: string; release_date: string }[];
  } catch {
    return [];
  }
}

export async function getBeigeBookHeadline(
  district: number
): Promise<{ text: string; release_date: string } | null> {
  try {
    const [row] = await sql`
      SELECT content_text, release_date
      FROM fed_beige_book
      WHERE fed_district = ${district} AND section_name = 'Summary of Economic Activity'
      ORDER BY release_date DESC
      LIMIT 1
    `;

    if (!row) return null;

    const firstSentence = row.content_text.split(/(?<=[.!?])\s+/)[0] ?? "";
    const text =
      firstSentence.length > 80
        ? firstSentence.slice(0, 77) + "..."
        : firstSentence;

    const releaseDate = row.release_date instanceof Date
      ? row.release_date.toISOString().slice(0, 10)
      : String(row.release_date);
    return { text, release_date: releaseDate };
  } catch {
    return null;
  }
}

export interface FedContentItem {
  id: number;
  content_type: string;
  title: string;
  speaker: string | null;
  fed_district: number | null;
  source_url: string;
  published_at: string;
  description: string | null;
}

export async function getDistrictContent(
  district: number,
  limit = 10
): Promise<FedContentItem[]> {
  try {
    return await sql`
      SELECT id, content_type, title, speaker, fed_district, source_url,
             published_at, description
      FROM fed_content
      WHERE fed_district = ${district}
      ORDER BY published_at DESC
      LIMIT ${limit}
    ` as FedContentItem[];
  } catch {
    return [];
  }
}

export async function getRecentSpeeches(limit = 10): Promise<FedContentItem[]> {
  try {
    return await sql`
      SELECT id, content_type, title, speaker, fed_district, source_url,
             published_at, description
      FROM fed_content
      WHERE content_type IN ('speech', 'testimony')
      ORDER BY published_at DESC
      LIMIT ${limit}
    ` as FedContentItem[];
  } catch {
    return [];
  }
}

export interface EconomicIndicator {
  series_id: string;
  series_title: string | null;
  observation_date: string;
  value: number | null;
  units: string | null;
}

export async function getDistrictIndicators(
  district: number
): Promise<EconomicIndicator[]> {
  try {
    return await sql`
      SELECT series_id, series_title, observation_date, value, units
      FROM fed_economic_indicators
      WHERE fed_district = ${district} OR fed_district IS NULL
      ORDER BY series_id, observation_date DESC
    ` as EconomicIndicator[];
  } catch {
    return [];
  }
}

export async function getBeigeBookHeadlines(): Promise<Map<number, { text: string; release_date: string }>> {
  try {
    const rows = await sql`
      SELECT fed_district, content_text, release_date
      FROM fed_beige_book bb1
      WHERE section_name = 'Summary of Economic Activity'
        AND fed_district IS NOT NULL
        AND release_date = (
          SELECT MAX(bb2.release_date)
          FROM fed_beige_book bb2
          WHERE bb2.fed_district = bb1.fed_district
        )
    ` as { fed_district: number; content_text: string; release_date: string }[];

    const map = new Map<number, { text: string; release_date: string }>();
    for (const row of rows) {
      const firstSentence = row.content_text.split(/(?<=[.!?])\s+/)[0] ?? "";
      const text =
        firstSentence.length > 80
          ? firstSentence.slice(0, 77) + "..."
          : firstSentence;
      map.set(row.fed_district, { text, release_date: row.release_date });
    }
    return map;
  } catch {
    return new Map();
  }
}

export interface FredSummary {
  fed_funds_rate: number | null;
  unemployment_rate: number | null;
  cpi_yoy_pct: number | null;
  consumer_sentiment: number | null;
  as_of: string;
}

export async function getFredSummary(): Promise<FredSummary> {
  const empty: FredSummary = {
    fed_funds_rate: null,
    unemployment_rate: null,
    cpi_yoy_pct: null,
    consumer_sentiment: null,
    as_of: new Date().toISOString().slice(0, 10),
  };

  try {
    const rows = await sql`
      SELECT DISTINCT ON (series_id)
        series_id,
        value,
        observation_date
      FROM fed_economic_indicators
      WHERE series_id IN ('FEDFUNDS', 'UNRATE', 'CPIAUCSL', 'UMCSENT')
      ORDER BY series_id, observation_date DESC
    ` as { series_id: string; value: number | null; observation_date: string | Date }[];

    const byId = new Map<string, { value: number | null; observation_date: string }>();
    for (const row of rows) {
      const date = row.observation_date instanceof Date
        ? row.observation_date.toISOString().slice(0, 10)
        : String(row.observation_date);
      byId.set(row.series_id, { value: Number(row.value), observation_date: date });
    }

    const dates = Array.from(byId.values()).map((r) => r.observation_date).sort().reverse();
    const as_of = dates[0] ?? empty.as_of;

    // Compute CPI YoY change: compare latest value to 12 months prior
    let cpiYoy: number | null = null;
    try {
      const cpiRows = await sql`
        SELECT value, observation_date
        FROM fed_economic_indicators
        WHERE series_id = 'CPIAUCSL'
        ORDER BY observation_date DESC
        LIMIT 13
      ` as { value: number | string | null; observation_date: string | Date }[];

      if (cpiRows.length >= 13) {
        const latest = Number(cpiRows[0].value);
        const prior = Number(cpiRows[12].value);
        if (prior > 0 && !isNaN(latest) && !isNaN(prior)) {
          cpiYoy = ((latest - prior) / prior) * 100;
        }
      }
    } catch {
      // CPI YoY computation failed — leave as null
    }

    return {
      fed_funds_rate: byId.get("FEDFUNDS")?.value ?? null,
      unemployment_rate: byId.get("UNRATE")?.value ?? null,
      cpi_yoy_pct: cpiYoy,
      consumer_sentiment: byId.get("UMCSENT")?.value ?? null,
      as_of,
    };
  } catch {
    return empty;
  }
}
