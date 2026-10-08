/**
 * Adaptateur « jsonld-public » : pages HTML publiques déclarant leurs produits en JSON-LD
 * schema.org. Méthode `public_html`, accès public (attestation de l'utilisateur + robots.txt
 * vérifiés par le pipeline avant toute requête).
 *
 * Vérification : testé sur des fixtures HTML construites d'après le vocabulaire schema.org ;
 * non testé en conditions réelles depuis cet environnement (réseau sortant bloqué).
 */
import type { AdapterCatalogPage, AdapterRunContext, AdapterSearchResult, AdapterSourceConfig, SourceAdapter } from "@/integrations/sourcing/core";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";
import { createAdapterHttp, errorMessage, failedSearch } from "@/integrations/sourcing/shared";
import { catalogUrls, searchUrlFor } from "./crawler";
import { jsonLdParser, parseJsonLdPage } from "./parser";
import { mapJsonLdOffer } from "./mapper";

const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";

async function fetchPage(config: AdapterSourceConfig, url: string, ctx: AdapterRunContext) {
  const http = createAdapterHttp(ctx);
  const res = await http.request(url, { accept: HTML_ACCEPT });
  const offers = parseJsonLdPage(res.text, res.finalUrl || url).map((o) => mapJsonLdOffer(o, config, res.finalUrl || url));
  http.countOffers(offers.length);
  return { offers, requests: http.requests };
}

export const jsonLdPublicAdapter: SourceAdapter = {
  key: "jsonld-public",
  label: "Page publique (JSON-LD schema.org)",
  description:
    "Lit les blocs JSON-LD Product/Offer déclarés par une page publique (nom, SKU, GTIN, MPN, marque, prix, devise, disponibilité, état). Recherche via une URL de recherche du site contenant {query} ; catalogue via une liste d'URLs. Sans JSON-LD, aucune offre n'est extraite. Vérifié sur fixtures uniquement.",
  method: "public_html",
  access: "public",
  capabilities: { search: true, catalog: true, stockQuantity: false },
  credentialFields: [],
  configFields: [
    { name: "search_url", label: "URL de recherche du site (avec {query})", required: false, placeholder: "https://boutique.example/recherche?q={query}", help: "Doit être sur le même hôte que l'URL de base. Sans cette URL, la source n'est pas interrogée en direct (catalogue uniquement)." },
    { name: "urls", label: "Pages de catalogue (une par ligne)", required: false, help: "Pages produit ou catégorie lues lors des synchronisations (50 maximum)." },
    { name: "max_pages", label: "Pages maximum par synchronisation", required: false, placeholder: "20" },
  ],
  htmlParser: jsonLdParser,
  verification: "fixtures",
  urlsForQuery(config, _query: ParsedQuery, rawQuery: string): string[] {
    const url = searchUrlFor(config, rawQuery);
    return url ? [url] : [];
  },
  urlsForCatalog(config): string[] {
    return catalogUrls(config);
  },
  async search(config, _query, rawQuery, ctx): Promise<AdapterSearchResult> {
    const url = searchUrlFor(config, rawQuery);
    if (!url) return failedSearch("public_html", "Aucune URL de recherche configurée (réglage search_url avec {query}) : recherche en direct impossible pour cette source.");
    if (ctx.disallowedUrls?.includes(url)) return failedSearch("public_html", "URL de recherche interdite par robots.txt.");
    try {
      const { offers, requests } = await fetchPage(config, url, ctx);
      return { offers, method: "public_html", requests, error: null, truncated: false };
    } catch (e) {
      return failedSearch("public_html", errorMessage(e));
    }
  },
  async fetchCatalog(config, cursor, ctx): Promise<AdapterCatalogPage> {
    const urls = catalogUrls(config);
    const index = cursor ? Number(cursor) : 0;
    const url = Number.isInteger(index) && index >= 0 ? urls[index] : undefined;
    if (!url) return { offers: [], method: "public_html", requests: [], nextCursor: null };
    if (ctx.disallowedUrls?.includes(url)) return { offers: [], method: "public_html", requests: [{ url, status: null, durationMs: 0, offers: 0, error: "Interdite par robots.txt" }], nextCursor: index + 1 < urls.length ? String(index + 1) : null };
    try {
      const { offers, requests } = await fetchPage(config, url, ctx);
      return { offers, method: "public_html", requests, nextCursor: index + 1 < urls.length ? String(index + 1) : null };
    } catch (e) {
      return { offers: [], method: "public_html", requests: [{ url, status: null, durationMs: 0, offers: 0, error: errorMessage(e) }], nextCursor: index + 1 < urls.length ? String(index + 1) : null };
    }
  },
  async testConnection(config, ctx) {
    const urls = catalogUrls(config);
    const probe = urls[0] ?? config.baseUrl;
    if (!probe) return { ok: false, message: "Aucune URL configurée (URL de base ou pages de catalogue)." };
    try {
      const http = createAdapterHttp(ctx);
      const res = await http.request(probe, { accept: HTML_ACCEPT, maxBytes: 5 * 1024 * 1024 });
      const offers = parseJsonLdPage(res.text, res.finalUrl || probe);
      return { ok: true, message: offers.length > 0 ? `Page lue : ${offers.length} offre(s) JSON-LD détectée(s).` : "Page lue, mais aucun bloc JSON-LD Product n'a été détecté : vérifiez que le site déclare ses produits en schema.org." };
    } catch (e) {
      return { ok: false, message: errorMessage(e) };
    }
  },
};
