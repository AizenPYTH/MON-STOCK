import type { MetadataRoute } from "next";
import { LEGAL } from "@/content/legal";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const updated = new Date(LEGAL.lastUpdated);
  return ["", "/confidentialite", "/conditions", "/mentions-legales", "/support"].map((path) => ({ url: `${base}${path}`, lastModified: updated }));
}
