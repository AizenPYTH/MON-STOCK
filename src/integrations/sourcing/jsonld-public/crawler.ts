/**
 * jsonld-public — stratégie d'URLs.
 *   recherche : `search_url` (gabarit contenant {query}) sur le même hôte que la source ;
 *   catalogue : `urls` (liste bornée de pages produit / catégorie), une page par curseur.
 * Le pipeline appelant vérifie robots.txt sur ces URLs avant toute requête.
 */
import { z } from "zod";
import type { AdapterSourceConfig } from "@/integrations/sourcing/core";
import { applyQueryTemplate } from "@/integrations/sourcing/shared";

export const jsonLdSettingsSchema = z.object({
  search_url: z.string().max(2000).optional(),
  urls: z.array(z.string().max(2000)).max(50).optional(),
  max_pages: z.number().int().min(1).max(50).optional(),
});
export type JsonLdSettings = z.infer<typeof jsonLdSettingsSchema>;

export const DEFAULT_MAX_PAGES = 20;

export function parseJsonLdSettings(settings: Record<string, unknown>): JsonLdSettings {
  const parsed = jsonLdSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : {};
}

function sameHost(baseUrl: string | null, url: string): boolean {
  if (!baseUrl) return true;
  try {
    return new URL(url).host.toLowerCase() === new URL(baseUrl).host.toLowerCase();
  } catch {
    return false;
  }
}

/** URL de recherche pour une requête, ou null si le gabarit est absent, invalide ou hors hôte. */
export function searchUrlFor(config: AdapterSourceConfig, rawQuery: string): string | null {
  const settings = parseJsonLdSettings(config.settings);
  const template = settings.search_url?.trim();
  if (!template || !template.includes("{query}") || !rawQuery.trim()) return null;
  const url = applyQueryTemplate(template, rawQuery);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return sameHost(config.baseUrl, url) ? url : null;
}

/** Pages de catalogue déclarées (même hôte, bornées). */
export function catalogUrls(config: AdapterSourceConfig): string[] {
  const settings = parseJsonLdSettings(config.settings);
  const max = Math.min(settings.max_pages ?? DEFAULT_MAX_PAGES, 50);
  return (settings.urls ?? []).filter((u) => sameHost(config.baseUrl, u)).slice(0, max);
}
