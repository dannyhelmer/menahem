import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/constants";

// Belt-and-suspenders alongside the (app) layout's noindex metadata --
// robots.txt keeps crawlers from even fetching private-beta account pages
// or API routes; noindex protects against them being indexed anyway if
// somehow linked from elsewhere.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/signup", "/signin", "/privacy", "/terms"],
      disallow: ["/api/", "/c/", "/workspace", "/settings", "/admin", "/research", "/private-beta"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
