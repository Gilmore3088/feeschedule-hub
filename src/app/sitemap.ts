import type { MetadataRoute } from "next";
import { FEE_FAMILIES } from "@/lib/fee-taxonomy";
import { STATE_NAMES, STATE_TO_DISTRICT } from "@/lib/fed-districts";
import { getRecentPublishedSlugs, getCategoryStatePairs } from "@/lib/crawler-db";

const BASE_URL = "https://bankfeeindex.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const allCategories = Object.values(FEE_FAMILIES).flat();
  const allStates = Object.keys(STATE_NAMES).filter(
    (code) => code.length === 2 && STATE_TO_DISTRICT[code]
  );

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/fees`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/check`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/districts`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/research`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const categoryPages: MetadataRoute.Sitemap = allCategories.map((cat) => ({
    url: `${BASE_URL}/fees/${cat}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // Only include state pages that have actual fee data
  let statePages: MetadataRoute.Sitemap = [];
  try {
    const pairs = getCategoryStatePairs();
    statePages = pairs.map(({ fee_category, state_code }) => ({
      url: `${BASE_URL}/fees/${fee_category}/by-state/${state_code.toLowerCase()}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  } catch {
    // fall back to generating all combos if query fails
    statePages = allCategories.flatMap((cat) =>
      allStates.map((state) => ({
        url: `${BASE_URL}/fees/${cat}/by-state/${state.toLowerCase()}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      }))
    );
  }

  const districtPages: MetadataRoute.Sitemap = Array.from(
    { length: 12 },
    (_, i) => ({
      url: `${BASE_URL}/districts/${i + 1}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })
  );

  // Research articles
  let articlePages: MetadataRoute.Sitemap = [];
  try {
    const slugs = getRecentPublishedSlugs(500);
    articlePages = slugs.map((slug) => ({
      url: `${BASE_URL}/research/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  } catch {
    // articles table may not exist yet
  }

  return [...staticPages, ...categoryPages, ...districtPages, ...statePages, ...articlePages];
}
