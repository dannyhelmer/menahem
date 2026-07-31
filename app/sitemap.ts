import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/constants";

// Everything else lives behind account approval (private beta) and is
// explicitly noindexed via the (app) layout's metadata -- only genuinely
// public, crawlable pages belong here.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: SITE_URL, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/signup`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/pricing`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/signin`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/about`, lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
