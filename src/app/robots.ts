import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Seul le site public est indexable ; l'application (authentifiée) et les API ne le sont pas. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/$", "/confidentialite", "/conditions", "/mentions-legales", "/support"], disallow: "/" }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
