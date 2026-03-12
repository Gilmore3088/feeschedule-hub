import type { MetadataRoute } from "next";
import { FEE_FAMILIES } from "@/lib/fee-taxonomy";
import { STATE_CODES } from "@/lib/us-states";

const BASE_URL = "https://bankfeeindex.com";

export default function sitemap(): MetadataRoute.Sitemap {
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

  return [...staticPages, ...categoryPages, ...statePages, ...districtPages];
}
