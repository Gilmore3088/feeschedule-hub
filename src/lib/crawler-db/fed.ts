import { sql } from "./connection";

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

    return await sql`
      SELECT id, release_date, release_code, fed_district, section_name,
             content_text, source_url
      FROM fed_beige_book
      WHERE fed_district = ${district} AND release_code = ${latest.release_code}
      ORDER BY id
    ` as BeigeBookSection[];
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

    return { text, release_date: row.release_date };
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
