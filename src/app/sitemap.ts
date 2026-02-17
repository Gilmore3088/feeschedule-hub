import type { MetadataRoute } from "next";
import { FEE_FAMILIES } from "@/lib/fee-taxonomy";
import { STATE_NAMES, STATE_TO_DISTRICT } from "@/lib/fed-districts";

const BASE_URL = "https://bankfeeindex.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const allCategories = Object.values(FEE_FAMILIES).flat();
  const allStates = Object.keys(STATE_NAMES).filter(
    (code) => code.length === 2 && STATE_TO_DISTRICT[code]
  );

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/fees`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/districts`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/research`,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  const categoryPages: MetadataRoute.Sitemap = allCategories.map((cat) => ({
    url: `${BASE_URL}/fees/${cat}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const statePages: MetadataRoute.Sitemap = allCategories.flatMap((cat) =>
    allStates.map((state) => ({
      url: `${BASE_URL}/fees/${cat}/by-state/${state.toLowerCase()}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }))
  );

  const districtPages: MetadataRoute.Sitemap = Array.from(
    { length: 12 },
    (_, i) => ({
      url: `${BASE_URL}/districts/${i + 1}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })
  );

  return [...staticPages, ...categoryPages, ...districtPages, ...statePages];
}
