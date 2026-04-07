import { sql } from "./connection";

export interface RichIndicator {
  current: number;
  history: { date: string; value: number }[];
  trend: 'rising' | 'falling' | 'stable';
  asOf: string;
}

export function deriveTrend(
  current: number,
  history: { value: number }[]
): 'rising' | 'falling' | 'stable' {
  if (history.length < 2) return 'stable';
  const oldest = history[0].value;
  if (oldest === 0) return 'stable';
  const diffPct = ((current - oldest) / Math.abs(oldest)) * 100;
  if (diffPct > 0.5) return 'rising';
  if (diffPct < -0.5) return 'falling';
  return 'stable';
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
  } catch (err) {
    console.error('[fed] getLatestBeigeBook failed:', err);
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
  } catch (err) {
    console.error('[fed] getBeigeBookEditions failed:', err);
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
  } catch (err) {
    console.error('[fed] getBeigeBookHeadline failed:', err);
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
  } catch (err) {
    console.error('[fed] getDistrictContent failed:', err);
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
  } catch (err) {
    console.error('[fed] getRecentSpeeches failed:', err);
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
  } catch (err) {
    console.error('[fed] getDistrictIndicators failed:', err);
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
  } catch (err) {
    console.error('[fed] getBeigeBookHeadlines failed:', err);
    return new Map();
  }
}

export interface NationalEconomicSummary {
  fed_funds_rate: RichIndicator | null;
  unemployment_rate: RichIndicator | null;
  cpi_yoy_pct: RichIndicator | null;
  consumer_sentiment: RichIndicator | null;
}

async function fetchRichIndicator(seriesId: string): Promise<RichIndicator | null> {
  try {
    const rows = await sql`
      SELECT observation_date, value
      FROM fed_economic_indicators
      WHERE series_id = ${seriesId}
        AND value IS NOT NULL
      ORDER BY observation_date DESC
      LIMIT 5
    ` as { observation_date: string | Date; value: number | string }[];

    if (rows.length === 0) return null;

    const current = Number(rows[0].value);
    const asOf = rows[0].observation_date instanceof Date
      ? rows[0].observation_date.toISOString().slice(0, 10)
      : String(rows[0].observation_date);

    const historyDesc = rows.slice(1);
    const history = historyDesc.reverse().map((r) => ({
      date: r.observation_date instanceof Date
        ? r.observation_date.toISOString().slice(0, 10)
        : String(r.observation_date),
      value: Number(r.value),
    }));

    return { current, history, trend: deriveTrend(current, history), asOf };
  } catch (err) {
    console.error('[fed] fetchRichIndicator failed:', err);
    return null;
  }
}

async function fetchCpiYoyIndicator(): Promise<RichIndicator | null> {
  try {
    const rows = await sql`
      SELECT observation_date, value
      FROM fed_economic_indicators
      WHERE series_id = 'CPIAUCSL'
        AND value IS NOT NULL
      ORDER BY observation_date DESC
      LIMIT 17
    ` as { observation_date: string | Date; value: number | string }[];

    if (rows.length < 13) return null;

    const yoyPoints: { date: string; value: number }[] = [];
    for (let offset = 0; offset < Math.min(4, rows.length - 12); offset++) {
      const latest = Number(rows[offset].value);
      const prior = Number(rows[offset + 12].value);
      if (prior > 0 && !isNaN(latest) && !isNaN(prior)) {
        const yoy = ((latest - prior) / prior) * 100;
        const date = rows[offset].observation_date instanceof Date
          ? rows[offset].observation_date.toISOString().slice(0, 10)
          : String(rows[offset].observation_date);
        yoyPoints.push({ date, value: Math.round(yoy * 100) / 100 });
      }
    }

    if (yoyPoints.length === 0) return null;

    const current = yoyPoints[0].value;
    const asOf = yoyPoints[0].date;
    const history = yoyPoints.slice(1).reverse();

    return { current, history, trend: deriveTrend(current, history), asOf };
  } catch (err) {
    console.error('[fed] fetchCpiYoyIndicator failed:', err);
    return null;
  }
}

export async function getNationalEconomicSummary(): Promise<NationalEconomicSummary> {
  try {
    const [fedFunds, unemployment, cpiYoy, sentiment] = await Promise.all([
      fetchRichIndicator('FEDFUNDS'),
      fetchRichIndicator('UNRATE'),
      fetchCpiYoyIndicator(),
      fetchRichIndicator('UMCSENT'),
    ]);

    return {
      fed_funds_rate: fedFunds,
      unemployment_rate: unemployment,
      cpi_yoy_pct: cpiYoy,
      consumer_sentiment: sentiment,
    };
  } catch (err) {
    console.error('[fed] getNationalEconomicSummary failed:', err);
    return {
      fed_funds_rate: null,
      unemployment_rate: null,
      cpi_yoy_pct: null,
      consumer_sentiment: null,
    };
  }
}

export interface DistrictBeigeBookSummary {
  fed_district: number;
  district_summary: string;
  release_code: string;
  generated_at: string;
}

export interface BeigeBookThemes {
  growth: string | null;
  employment: string | null;
  prices: string | null;
  lending: string | null;
}

export interface NationalBeigeBookSummary {
  release_code: string;
  national_summary: string;
  themes: BeigeBookThemes | null;
  generated_at: string;
}

export async function getDistrictBeigeBookSummaries(
  releaseCode?: string
): Promise<DistrictBeigeBookSummary[]> {
  try {
    let rows: {
      fed_district: number | string;
      district_summary: string;
      release_code: string;
      generated_at: string | Date;
    }[];

    if (releaseCode) {
      rows = await sql`
        SELECT fed_district, district_summary, release_code, generated_at
        FROM beige_book_summaries
        WHERE release_code = ${releaseCode}
          AND fed_district IS NOT NULL
          AND district_summary IS NOT NULL
        ORDER BY fed_district
      ` as typeof rows;
    } else {
      rows = await sql`
        SELECT fed_district, district_summary, release_code, generated_at
        FROM beige_book_summaries
        WHERE release_code = (
          SELECT MAX(release_code) FROM beige_book_summaries
          WHERE fed_district IS NOT NULL
        )
          AND fed_district IS NOT NULL
          AND district_summary IS NOT NULL
        ORDER BY fed_district
      ` as typeof rows;
    }

    return rows.map((r) => ({
      fed_district: Number(r.fed_district),
      district_summary: String(r.district_summary),
      release_code: String(r.release_code),
      generated_at: r.generated_at instanceof Date
        ? r.generated_at.toISOString()
        : String(r.generated_at),
    }));
  } catch (err) {
    console.error('[fed] getDistrictBeigeBookSummaries failed:', err);
    return [];
  }
}

export async function getNationalBeigeBookSummary(
  releaseCode?: string
): Promise<NationalBeigeBookSummary | null> {
  try {
    let rows: {
      release_code: string;
      national_summary: string;
      themes: unknown;
      generated_at: string | Date;
    }[];

    if (releaseCode) {
      rows = await sql`
        SELECT release_code, national_summary, themes, generated_at
        FROM beige_book_summaries
        WHERE release_code = ${releaseCode}
          AND fed_district IS NULL
        ORDER BY generated_at DESC
        LIMIT 1
      ` as typeof rows;
    } else {
      rows = await sql`
        SELECT release_code, national_summary, themes, generated_at
        FROM beige_book_summaries
        WHERE fed_district IS NULL
        ORDER BY generated_at DESC
        LIMIT 1
      ` as typeof rows;
    }

    if (rows.length === 0) return null;

    const row = rows[0];

    // Parse themes: Postgres returns JSONB as object; SQLite stores as string
    let themes: BeigeBookThemes | null = null;
    try {
      if (row.themes !== null && row.themes !== undefined) {
        const parsed = typeof row.themes === "string"
          ? JSON.parse(row.themes)
          : row.themes;
        themes = {
          growth: parsed.growth ?? null,
          employment: parsed.employment ?? null,
          prices: parsed.prices ?? null,
          lending: parsed.lending ?? null,
        };
      }
    } catch {
      themes = null;
    }

    return {
      release_code: String(row.release_code),
      national_summary: String(row.national_summary),
      themes,
      generated_at: row.generated_at instanceof Date
        ? row.generated_at.toISOString()
        : String(row.generated_at),
    };
  } catch (err) {
    console.error('[fed] getNationalBeigeBookSummary failed:', err);
    return null;
  }
}

export async function getDistrictUnemployment(): Promise<Map<number, number>> {
  try {
    const rows = await sql`
      SELECT DISTINCT ON (fed_district)
        fed_district, value
      FROM fed_economic_indicators
      WHERE series_id LIKE '%UR'
        AND fed_district IS NOT NULL
        AND value IS NOT NULL
      ORDER BY fed_district, observation_date DESC
    ` as { fed_district: number | string; value: number | string }[];

    const map = new Map<number, number>();
    for (const row of rows) {
      map.set(Number(row.fed_district), Number(row.value));
    }
    return map;
  } catch (err) {
    console.error('[fed] getDistrictUnemployment failed:', err);
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
  } catch (err) {
    console.error('[fed] getFredSummary failed:', err);
    return empty;
  }
}
