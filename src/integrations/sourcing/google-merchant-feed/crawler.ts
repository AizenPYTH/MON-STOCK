/**
 * google-merchant-feed — récupération du flux produit (une URL, format Google Merchant :
 * RSS 2.0 ou Atom avec espace de noms g:, ou TSV/CSV à en-tête). Le flux est lu en entier
 * puis mis en cache (10 min) : une recherche = un filtrage local, pas une nouvelle requête.
 */
import type { AdapterSourceConfig } from "@/integrations/sourcing/core";
import { settingString } from "@/integrations/sourcing/shared";

export const GMC_FEED_ACCEPT = "application/xml,text/xml,application/rss+xml,application/atom+xml,text/csv,text/tab-separated-values,text/plain;q=0.9,*/*;q=0.5";
export const GMC_CACHE_TTL_MS = 10 * 60_000;
/** taille d'une page de catalogue servie depuis le flux lu */
export const GMC_CATALOG_PAGE_SIZE = 1000;
/** taille maximale du flux lu (octets) */
export const GMC_MAX_BYTES = 50 * 1024 * 1024;

/** URL du flux : réglage `feed_url`, sinon l'URL de base de la source si elle pointe vers un fichier. */
export function feedUrlOf(config: AdapterSourceConfig): string | null {
  const explicit = settingString(config.settings, "feed_url");
  if (explicit) return explicit;
  const base = config.baseUrl?.trim();
  if (!base) return null;
  return /\.(xml|rss|atom|tsv|csv|txt)(\?.*)?$/i.test(base) ? base : null;
}

export function detectFeedFormat(text: string, contentType: string | null): "xml" | "tsv" {
  const head = text.slice(0, 2000).trimStart();
  if (head.startsWith("<")) return "xml";
  if (contentType && /xml/i.test(contentType) && !/csv|tab-separated/i.test(contentType)) return "xml";
  return "tsv";
}
