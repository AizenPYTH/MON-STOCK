/**
 * Fournisseurs de recherche web OFFICIELS (API documentées, clé fournie par l'utilisateur)
 * utilisés par la découverte de sources. Aucun scraping de moteur de recherche : sans API
 * configurée, la découverte est désactivée et le dit honnêtement.
 *
 * Configuration (voir .env.example) :
 *   SOURCING_DISCOVERY_PROVIDER=brave|none   (défaut : none)
 *   BRAVE_SEARCH_API_KEY=…                   (Brave Search API, en-tête X-Subscription-Token)
 *
 * Brave Search API — GET https://api.search.brave.com/res/v1/web/search?q=…&count=20&country=fr
 * en-têtes « Accept: application/json » et « X-Subscription-Token » ; réponse : web.results[]
 * { url, title, description }. Implémenté d'après la documentation publique, testé sur fixtures
 * uniquement (réseau sortant bloqué dans l'environnement de développement).
 *
 * Bornes : 6 requêtes maximum par recherche, cache mémoire de 24 h par requête, appels
 * séquentiels espacés (limite de débit du plan gratuit : 1 requête / seconde).
 */
import { z } from "zod";
import { fetchText } from "@/services/sourcing/http";

export interface WebSearchResult {
  url: string;
  title: string;
  description: string | null;
}

export interface WebSearchProvider {
  key: string;
  label: string;
  search(query: string): Promise<WebSearchResult[]>;
}

export type DiscoveryProviderKey = "brave" | "none";

export const DISCOVERY_DISABLED_MESSAGE = "Découverte désactivée : aucune API de recherche configurée";
export const MAX_DISCOVERY_QUERIES = 6;
export const DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
export const BRAVE_RESULT_COUNT = 20;
export const BRAVE_MIN_INTERVAL_MS = 1_100;

const discoveryEnvSchema = z.object({
  SOURCING_DISCOVERY_PROVIDER: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : undefined), z.enum(["brave", "none"]).default("none")),
  BRAVE_SEARCH_API_KEY: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().min(8).optional()),
});

export interface DiscoveryConfig {
  enabled: boolean;
  provider: DiscoveryProviderKey;
  apiKey: string | null;
  /** message affichable (raison de la désactivation, ou fournisseur actif) */
  message: string;
}

/** Lit et valide la configuration de découverte (jamais d'exception : configuration invalide = désactivée). */
export function readDiscoveryConfig(env: Record<string, string | undefined> = process.env): DiscoveryConfig {
  const parsed = discoveryEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { enabled: false, provider: "none", apiKey: null, message: `${DISCOVERY_DISABLED_MESSAGE} (configuration invalide : ${issue?.path.join(".") ?? "?"})` };
  }
  const { SOURCING_DISCOVERY_PROVIDER: provider, BRAVE_SEARCH_API_KEY: key } = parsed.data;
  if (provider === "none") return { enabled: false, provider: "none", apiKey: null, message: DISCOVERY_DISABLED_MESSAGE };
  if (!key) return { enabled: false, provider: "brave", apiKey: null, message: `${DISCOVERY_DISABLED_MESSAGE} (BRAVE_SEARCH_API_KEY manquante)` };
  return { enabled: true, provider: "brave", apiKey: key, message: "Découverte via l'API Brave Search" };
}

// ---------------------------------------------------------------------------
// Brave Search API
// ---------------------------------------------------------------------------

const braveResultSchema = z.object({
  url: z.string(),
  title: z.string().optional().default(""),
  description: z.string().nullable().optional(),
});

const braveResponseSchema = z.object({
  web: z
    .object({
      results: z.array(z.unknown()).optional().default([]),
    })
    .optional(),
});

/** Retire les balises de mise en évidence (<strong>…) et décode les entités courantes. */
function cleanSnippet(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Analyse la réponse JSON de l'API Brave (résultats invalides ignorés, URL http(s) uniquement). */
export function parseBraveResponse(json: unknown): WebSearchResult[] {
  const parsed = braveResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error("Réponse Brave Search inattendue (format non reconnu).");
  const out: WebSearchResult[] = [];
  for (const raw of parsed.data.web?.results ?? []) {
    const r = braveResultSchema.safeParse(raw);
    if (!r.success) continue;
    let url: URL;
    try {
      url = new URL(r.data.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    out.push({ url: url.toString(), title: cleanSnippet(r.data.title), description: r.data.description ? cleanSnippet(r.data.description) : null });
  }
  return out;
}

export interface BraveProviderOptions {
  fetchImpl?: typeof fetch;
  resolver?: (host: string) => Promise<Array<{ address: string }>>;
  userAgent?: string;
  timeoutMs?: number;
  country?: string;
  count?: number;
}

export function createBraveProvider(apiKey: string, options: BraveProviderOptions = {}): WebSearchProvider {
  return {
    key: "brave",
    label: "Brave Search API",
    async search(query: string): Promise<WebSearchResult[]> {
      const url = new URL(BRAVE_ENDPOINT);
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(options.count ?? BRAVE_RESULT_COUNT));
      url.searchParams.set("country", options.country ?? "fr");
      const res = await fetchText(url.toString(), {
        userAgent: options.userAgent ?? "MonStockBot/0.1",
        accept: "application/json",
        headers: { "X-Subscription-Token": apiKey },
        timeoutMs: options.timeoutMs ?? 10_000,
        maxBytes: 2 * 1024 * 1024,
        fetchImpl: options.fetchImpl,
        resolver: options.resolver,
      });
      if (res.status === 401 || res.status === 403) throw new Error(`Brave Search : clé API refusée (HTTP ${res.status}).`);
      if (res.status === 429) throw new Error("Brave Search : limite de requêtes atteinte (HTTP 429), réessayez plus tard.");
      if (!res.ok) throw new Error(`Brave Search : HTTP ${res.status}.`);
      let json: unknown;
      try {
        json = JSON.parse(res.text);
      } catch {
        throw new Error("Réponse Brave Search non JSON.");
      }
      return parseBraveResponse(json);
    },
  };
}

/** Fournisseur configuré, ou null (découverte désactivée) avec message honnête. */
export function createWebSearchProvider(env: Record<string, string | undefined> = process.env, options: BraveProviderOptions = {}): { provider: WebSearchProvider | null; config: DiscoveryConfig } {
  const config = readDiscoveryConfig(env);
  if (!config.enabled || !config.apiKey) return { provider: null, config };
  return { provider: createBraveProvider(config.apiKey, options), config };
}

// ---------------------------------------------------------------------------
// Exécution bornée + cache 24 h
// ---------------------------------------------------------------------------

const cache = new Map<string, { at: number; results: WebSearchResult[] }>();

export function clearDiscoveryCache(): void {
  cache.clear();
}

function cacheKey(provider: string, query: string): string {
  return `${provider}::${query.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export interface DiscoverySearchRun {
  query: string;
  results: WebSearchResult[];
  cached: boolean;
  error: string | null;
}

export interface RunSearchesOptions {
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  maxQueries?: number;
  minIntervalMs?: number;
  ttlMs?: number;
}

/**
 * Exécute au plus `MAX_DISCOVERY_QUERIES` requêtes (dédupliquées), séquentiellement et espacées,
 * avec un cache mémoire de 24 h par requête. Une erreur sur une requête n'arrête pas les suivantes,
 * sauf refus de clé / limite atteinte (inutile d'insister).
 */
export async function runDiscoverySearches(provider: WebSearchProvider, queries: string[], options: RunSearchesOptions = {}): Promise<DiscoverySearchRun[]> {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const max = Math.min(options.maxQueries ?? MAX_DISCOVERY_QUERIES, MAX_DISCOVERY_QUERIES);
  const interval = options.minIntervalMs ?? BRAVE_MIN_INTERVAL_MS;
  const ttl = options.ttlMs ?? DISCOVERY_CACHE_TTL_MS;

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    const k = cacheKey(provider.key, q);
    if (!q.trim() || seen.has(k)) continue;
    seen.add(k);
    unique.push(q.trim());
    if (unique.length >= max) break;
  }

  const runs: DiscoverySearchRun[] = [];
  let calledBefore = false;
  let halted: string | null = null;
  for (const query of unique) {
    const k = cacheKey(provider.key, query);
    const hit = cache.get(k);
    if (hit && now().getTime() - hit.at < ttl) {
      runs.push({ query, results: hit.results, cached: true, error: null });
      continue;
    }
    if (halted) {
      runs.push({ query, results: [], cached: false, error: halted });
      continue;
    }
    if (calledBefore && interval > 0) await sleep(interval);
    calledBefore = true;
    try {
      const results = await provider.search(query);
      cache.set(k, { at: now().getTime(), results });
      runs.push({ query, results, cached: false, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur de recherche.";
      if (/clé API refusée|limite de requêtes/.test(message)) halted = message;
      runs.push({ query, results: [], cached: false, error: message });
    }
  }
  return runs;
}
