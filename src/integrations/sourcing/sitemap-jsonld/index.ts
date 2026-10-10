/**
 * Adaptateur « sitemap-jsonld » : boutiques sans API ni JSON public, mais qui publient
 *   1. un plan du site (sitemap XML) — fichier DESTINÉ aux robots d'indexation, annoncé dans
 *      robots.txt (`Sitemap:`) ou à l'emplacement standard /sitemap.xml ;
 *   2. des fiches produit portant des données structurées schema.org (JSON-LD Product/Offer),
 *      publiées pour les moteurs de recherche.
 *
 * Recherche : les URLs de fiches produit du sitemap sont filtrées par les mots de la requête
 * (« iphone-13-128go… »), puis quelques fiches (3 par défaut) sont lues — chacune vérifiée
 * contre robots.txt, une requête à la fois, délai de politesse ≥ 2 s. Seules les données
 * structurées sont extraites (prix, devise, disponibilité, état, marque, SKU, GTIN) : rien n'est
 * deviné depuis le HTML. Aucune connexion, aucun contournement (CAPTCHA, anti-bot, compte).
 */
import type { RawOffer } from "@/domain/sourcing/types";
import { parseQuery, type ParsedQuery } from "@/domain/sourcing/query-parser";
import { normalizeText } from "@/domain/sourcing/normalizer";
import type { AdapterRunContext, AdapterSearchResult, AdapterSourceConfig, SourceAdapter } from "@/integrations/sourcing/core";
import { createAdapterHttp, errorMessage, failedSearch, settingInt, settingString, trimSlash } from "@/integrations/sourcing/shared";
import { evaluateRobots, parseRobotsTxt, type RobotsRules } from "@/services/sourcing/crawler/robots";
import { parseJsonLdPage } from "@/integrations/sourcing/jsonld-public/parser";
import { mapJsonLdOffer } from "@/integrations/sourcing/jsonld-public/mapper";

export const SITEMAP_MAX_CHILDREN = 12;
export const SITEMAP_MAX_URLS = 80_000;
export const SITEMAP_DEFAULT_PAGES = 3;
export const SITEMAP_CACHE_TTL_MS = 6 * 3600_000;

interface SiteIndex {
  at: number;
  urls: string[];
  robots: RobotsRules | null;
  sitemaps: string[];
}

const cache = new Map<string, SiteIndex>();

export function clearSitemapCache(): void {
  cache.clear();
}

/** `<loc>` d'un sitemap ou d'un index de sitemaps (XML simple, sans dépendance). */
export function parseSitemapXml(xml: string): { kind: "index" | "urlset" | "unknown"; locs: string[] } {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? "index" : /<urlset[\s>]/i.test(xml) ? "urlset" : "unknown";
  const locs: string[] = [];
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && locs.length < SITEMAP_MAX_URLS) locs.push(m[1]!.replace(/&amp;/g, "&"));
  return { kind, locs };
}

/** Sous-sitemaps à lire en priorité : produits d'abord, jamais images/vidéos/blog. */
export function rankChildSitemaps(locs: string[]): string[] {
  const skip = /image|video|blog|post|article|news|cms|categor|page-sitemap|tag|author|brand|manufacturer/i;
  // « sitemap » contient les lettres « item » : mots entiers uniquement.
  const score = (u: string) => (/product|produit|(^|[^a-z])items?([^a-z]|$)/i.test(u) ? 0 : 1);
  return locs.filter((u) => !skip.test(u) && !/\.gz($|\?)/i.test(u)).sort((a, b) => score(a) - score(b));
}

const STOP = new Set(["de", "du", "des", "la", "le", "les", "en", "et", "pour", "avec", "go", "gb", "to", "tb", "reconditionne", "reconditionnee", "occasion", "neuf", "grade", "lot", "lots", "gros", "pas", "cher", "prix", "bas"]);

/** Mots significatifs de la requête (minuscules, sans accents) ; les nombres sont conservés (« 13 », « 128 »). */
export function queryTokens(rawQuery: string): string[] {
  return [...new Set(normalizeText(rawQuery).split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t)))].slice(0, 8);
}

/** URLs dont le chemin contient le plus de mots de la requête (au moins 2, ou tous s'il y en a moins). */
export function matchProductUrls(urls: string[], rawQuery: string, max: number): string[] {
  const tokens = queryTokens(rawQuery);
  if (tokens.length === 0) return [];
  const need = Math.min(2, tokens.length);
  const scored: Array<{ url: string; score: number; len: number }> = [];
  for (const url of urls) {
    let path: string;
    try {
      path = normalizeText(decodeURIComponent(new URL(url).pathname));
    } catch {
      continue;
    }
    const parts = new Set(path.split(/[^a-z0-9]+/));
    // Les nombres (modèle « 13 », capacité « 128 ») départagent : poids plus fort.
    let matched = 0;
    let score = 0;
    for (const t of tokens) {
      if (!parts.has(t)) continue;
      matched += 1;
      score += /^\d+$/.test(t) ? 1.5 : 1;
    }
    if (matched >= need) scored.push({ url, score, len: path.length });
  }
  scored.sort((a, b) => b.score - a.score || a.len - b.len);
  return scored.slice(0, max).map((s) => s.url);
}

async function loadIndex(base: string, ctx: AdapterRunContext, http: ReturnType<typeof createAdapterHttp>, settings: Record<string, unknown>): Promise<SiteIndex> {
  const now = (ctx.now ?? (() => new Date()))().getTime();
  const hit = cache.get(base);
  if (hit && now - hit.at < SITEMAP_CACHE_TTL_MS) return hit;
  let robots: RobotsRules | null = null;
  try {
    const r = await http.request(`${base}/robots.txt`, { accept: "text/plain" });
    robots = parseRobotsTxt(r.text.slice(0, 512 * 1024));
  } catch {
    robots = null; // absent ou inaccessible : la vérification préalable du pipeline fait foi
  }
  const configured = settingString(settings, "sitemap_url");
  const roots = configured ? [configured] : robots?.sitemaps.length ? robots.sitemaps.slice(0, 3) : [`${base}/sitemap.xml`];
  const urls: string[] = [];
  const read: string[] = [];
  const queue = [...roots];
  while (queue.length > 0 && read.length < SITEMAP_MAX_CHILDREN && urls.length < SITEMAP_MAX_URLS && !http.exhausted()) {
    const sm = queue.shift()!;
    if (new URL(sm).host !== new URL(base).host) continue;
    const res = await http.request(sm, { accept: "application/xml,text/xml;q=0.9,*/*;q=0.5", maxBytes: 15_000_000 });
    read.push(sm);
    const parsed = parseSitemapXml(res.text);
    if (parsed.kind === "index") queue.push(...rankChildSitemaps(parsed.locs).slice(0, SITEMAP_MAX_CHILDREN));
    else for (const u of parsed.locs) if (urls.length < SITEMAP_MAX_URLS) urls.push(u);
  }
  const index = { at: now, urls, robots, sitemaps: read };
  if (urls.length > 0) cache.set(base, index);
  return index;
}

function allowedByRobots(robots: RobotsRules | null, userAgent: string, url: string): boolean {
  if (!robots) return true;
  const u = new URL(url);
  return evaluateRobots(robots, userAgent, u.pathname + u.search).allowed;
}

export const sitemapJsonLdAdapter: SourceAdapter = {
  key: "sitemap-jsonld",
  label: "Boutique publique (sitemap + données structurées)",
  description:
    "Trouve les fiches produit correspondant à la recherche dans le plan du site (sitemap publié pour les robots), puis lit leurs données structurées schema.org (prix, devise, disponibilité, état, marque, SKU/GTIN). Chaque URL est vérifiée contre robots.txt ; 3 fiches par recherche, une requête à la fois.",
  method: "public_html",
  access: "public",
  capabilities: { search: true, catalog: false, stockQuantity: false },
  credentialFields: [],
  configFields: [
    { name: "sitemap_url", label: "URL du sitemap (facultatif)", required: false, help: "Par défaut : sitemaps déclarés dans robots.txt, sinon /sitemap.xml." },
    { name: "max_pages", label: "Fiches lues par recherche", required: false, placeholder: String(SITEMAP_DEFAULT_PAGES) },
  ],
  searchBudgetMs: 25_000,
  verification: "fixtures",
  urlsForQuery(config: AdapterSourceConfig): string[] {
    if (!config.baseUrl) return [];
    const base = trimSlash(config.baseUrl);
    return [settingString(config.settings, "sitemap_url") ?? `${base}/sitemap.xml`];
  },
  async search(config, _query: ParsedQuery, rawQuery, ctx): Promise<AdapterSearchResult> {
    if (!config.baseUrl) return failedSearch("public_html", "URL de base de la boutique manquante.");
    const base = trimSlash(config.baseUrl);
    const http = createAdapterHttp(ctx);
    try {
      const index = await loadIndex(base, ctx, http, config.settings);
      if (index.urls.length === 0) return failedSearch("public_html", "Plan du site (sitemap) introuvable ou vide : la boutique n'est pas interrogeable de cette façon.", http.requests);
      const max = settingInt(config.settings, "max_pages", SITEMAP_DEFAULT_PAGES, 1, 6);
      const candidates = matchProductUrls(index.urls, rawQuery, max * 2).filter((u) => new URL(u).host === new URL(base).host && allowedByRobots(index.robots, ctx.userAgent, u));
      if (candidates.length === 0) return { offers: [], method: "public_html", requests: http.requests, error: null, truncated: false };
      const offers: RawOffer[] = [];
      let pages = 0;
      for (const url of candidates) {
        if (pages >= max || http.exhausted()) break;
        try {
          const res = await http.request(url, { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", maxBytes: 4_000_000 });
          pages += 1;
          const found = parseJsonLdPage(res.text, res.finalUrl || url).map((o) => mapJsonLdOffer(o, config, res.finalUrl || url));
          http.countOffers(found.length);
          offers.push(...found);
        } catch {
          pages += 1; // la trace de la requête conserve l'erreur
        }
      }
      return { offers, method: "public_html", requests: http.requests, error: null, truncated: candidates.length > pages };
    } catch (e) {
      return failedSearch("public_html", errorMessage(e), http.requests);
    }
  },
  async testConnection(config, ctx) {
    const r = await sitemapJsonLdAdapter.search(config, parseQuery("iphone"), "iphone", ctx);
    return r.error ? { ok: false, message: r.error } : { ok: true, message: `${r.offers.length} offre(s) structurée(s) lue(s) pour « iphone ».` };
  },
};
