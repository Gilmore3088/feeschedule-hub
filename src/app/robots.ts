import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/v1/openapi.json"],
        // /r/ hosts per-institution report links; they are private by token, not for indexing.
        // /account and /pro/ are session-gated, non-public surfaces.
        disallow: ["/admin/", "/api/", "/r/", "/account", "/pro/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
