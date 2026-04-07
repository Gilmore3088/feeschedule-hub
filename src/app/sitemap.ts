import type { MetadataRoute } from "next";
import { FEE_FAMILIES } from "@/lib/fee-taxonomy";
import { STATE_CODES } from "@/lib/us-states";
import { getInstitutionIdsWithFees, getCitiesInState } from "@/lib/crawler-db";
import { GUIDES } from "@/lib/guides";
import { getSql } from "@/lib/crawler-db/connection";

import { SITE_URL } from "@/lib/constants";

const BASE_URL = SITE_URL;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/check`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/fees`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/research`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const allCategories = Object.values(FEE_FAMILIES).flat();

  const categoryPages: MetadataRoute.Sitemap = allCategories.map((category) => ({
    url: `${BASE_URL}/fees/${category}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const statePages: MetadataRoute.Sitemap = STATE_CODES.map((code) => ({
    url: `${BASE_URL}/research/state/${code}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const districtPages: MetadataRoute.Sitemap = Array.from({ length: 12 }, (_, i) => ({
    url: `${BASE_URL}/research/district/${i + 1}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const nationalIndexPage: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/research/national-fee-index`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
  ];

  const institutionIds = await getInstitutionIdsWithFees();
  const institutionPages: MetadataRoute.Sitemap = institutionIds.map((id) => ({
    url: `${BASE_URL}/institution/${id}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  const researchPages: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/research/fee-revenue-analysis`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/guides`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
  ];

  const guidePages: MetadataRoute.Sitemap = GUIDES.map((g) => ({
    url: `${BASE_URL}/guides/${g.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // City fee pages (state directories + top city pages)
  const stateCityDirPages: MetadataRoute.Sitemap = STATE_CODES.map((code) => ({
    url: `${BASE_URL}/fees/city/${code.toLowerCase()}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const cityPages: MetadataRoute.Sitemap = [];
  for (const code of STATE_CODES) {
    try {
      const cities = await getCitiesInState(code);
      for (const c of cities.slice(0, 20)) { // Top 20 cities per state
        cityPages.push({
          url: `${BASE_URL}/fees/city/${code.toLowerCase()}/${encodeURIComponent(c.city.toLowerCase())}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        });
      }
    } catch {
      // Skip states with no data
    }
  }

  // Published report catalog entry
  const reportsCatalogPage: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/reports`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
  ];

  // Individual published report landing pages
  let reportPages: MetadataRoute.Sitemap = [];
  try {
    const sql = getSql();
    const reportRows = await sql<Array<{ slug: string; published_at: string }>>`
      SELECT slug, published_at
      FROM published_reports
      WHERE is_public = true
      ORDER BY published_at DESC
      LIMIT 500
    `;
    reportPages = reportRows.map((r) => ({
      url: `${BASE_URL}/reports/${r.slug}`,
      lastModified: new Date(r.published_at),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }));
  } catch {
    // No published_reports table yet or DB unavailable — return empty
    reportPages = [];
  }

  return [
    ...staticPages,
    ...reportsCatalogPage,
    ...categoryPages,
    ...statePages,
    ...districtPages,
    ...nationalIndexPage,
    ...institutionPages,
    ...researchPages,
    ...guidePages,
    ...stateCityDirPages,
    ...cityPages,
    ...reportPages,
  ];
}
