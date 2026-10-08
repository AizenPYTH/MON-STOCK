/**
 * Outils communs aux adaptateurs de source (purs, sans dépendance serveur) :
 * client HTTP tracé et borné, gabarits d'URL, filtrage d'un catalogue par requête,
 * détection d'état / de grade dans un texte descriptif (déduction documentée).
 */
import type { AdapterRequestTrace, AdapterRunContext, AdapterSearchResult, RetrievalMethod } from "@/integrations/sourcing/core";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";
import { normalizeCondition, normalizeGrade, normalizeProduct, normalizeText, type ProductCondition } from "@/domain/sourcing/normalizer";
import { fetchText, type FetchTextResult } from "@/services/sourcing/http";

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_SEARCH_BUDGET_MS = 8_000;

export interface AdapterHttpRequestOptions {
  accept?: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  maxBytes?: number;
}

export interface AdapterHttp {
  /** requêtes effectuées (traçabilité affichée à l'utilisateur) */
  readonly requests: AdapterRequestTrace[];
  /** GET/POST borné : délai de politesse, budget de temps, trace. Lève une erreur en cas d'échec réseau ou HTTP ≠ 2xx. */
  request(url: string, options?: AdapterHttpRequestOptions): Promise<FetchTextResult>;
  /** renseigne le nombre d'offres extraites de la dernière réponse */
  countOffers(n: number): void;
  /** budget restant (ms) ; Infinity sans budget */
  remainingMs(): number;
  /** vrai si le budget de temps est épuisé */
  exhausted(): boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Client HTTP d'un run d'adaptateur : au plus une requête à la fois, délai minimal entre
 * deux requêtes (`ctx.minDelayMs`), budget global (`ctx.timeoutMs`), chaque requête tracée.
 */
export function createAdapterHttp(ctx: AdapterRunContext): AdapterHttp {
  const requests: AdapterRequestTrace[] = [];
  const startedAt = Date.now();
  const budget = ctx.timeoutMs ?? null;
  const sleep = ctx.sleep ?? defaultSleep;
  let lastRequestAt: number | null = null;
  const remainingMs = () => (budget === null ? Number.POSITIVE_INFINITY : Math.max(0, budget - (Date.now() - startedAt)));
  return {
    requests,
    remainingMs,
    exhausted: () => remainingMs() <= 0,
    countOffers(n) {
      const last = requests[requests.length - 1];
      if (last) last.offers = n;
    },
    async request(url, options = {}) {
      const minDelay = ctx.minDelayMs ?? 0;
      if (lastRequestAt !== null && minDelay > 0) {
        const wait = minDelay - (Date.now() - lastRequestAt);
        if (wait > 0) await sleep(wait);
      }
      const remaining = remainingMs();
      if (remaining <= 0) throw new Error("Budget de temps épuisé avant la requête.");
      const t0 = Date.now();
      lastRequestAt = t0;
      let traced = false;
      try {
        const res = await fetchText(url, {
          userAgent: ctx.userAgent,
          fetchImpl: ctx.fetchImpl,
          resolver: ctx.resolver,
          accept: options.accept,
          headers: options.headers,
          method: options.method,
          body: options.body,
          maxBytes: options.maxBytes,
          timeoutMs: Math.min(DEFAULT_REQUEST_TIMEOUT_MS, Number.isFinite(remaining) ? remaining : DEFAULT_REQUEST_TIMEOUT_MS),
        });
        requests.push({ url, status: res.status, durationMs: Date.now() - t0, offers: 0, error: res.ok ? null : `HTTP ${res.status}` });
        traced = true;
        if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
        return res;
      } catch (e) {
        if (!traced) requests.push({ url, status: null, durationMs: Date.now() - t0, offers: 0, error: errorMessage(e) });
        throw e;
      }
    },
  };
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function failedSearch(method: RetrievalMethod, error: string, requests: AdapterRequestTrace[] = []): AdapterSearchResult {
  return { offers: [], method, requests, error, truncated: false };
}

/** Remplace `{query}` dans un gabarit d'URL par la requête encodée. */
export function applyQueryTemplate(template: string, rawQuery: string): string {
  return template.replace(/\{query\}/g, encodeURIComponent(rawQuery.trim()));
}

export function trimSlash(base: string): string {
  return base.replace(/\/+$/, "");
}

export function joinUrl(base: string, path: string): string {
  return `${trimSlash(base)}/${path.replace(/^\/+/, "")}`;
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export function digits(v: unknown): string | null {
  const s = str(v)?.replace(/\D/g, "") ?? "";
  return s.length >= 8 ? s : null;
}

/** Retire les balises HTML (descriptions) : texte brut pour la détection d'état / de grade. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export interface InferredCondition {
  condition: ProductCondition | null;
  grade: string | null;
  /** champs déduits d'un texte descriptif (et non d'une donnée structurée) */
  inferred: Array<"condition" | "grade">;
}

/**
 * Détection d'état et de grade dans un texte descriptif (titre + description), via le
 * normaliseur uniquement : un mot explicite (« reconditionné », « Grade A »…) est requis.
 * Rien n'est deviné ; les champs trouvés sont marqués `inferred`.
 */
export function inferConditionFromText(text: string | null | undefined): InferredCondition {
  const t = (text ?? "").slice(0, 4000);
  if (!t.trim()) return { condition: null, grade: null, inferred: [] };
  const inferred: Array<"condition" | "grade"> = [];
  const condition = normalizeCondition(t);
  const normalizedForGrade = normalizeProduct(t);
  const grade = normalizedForGrade.grade ?? normalizeGrade(t.match(/\b(?:grade|gr\.?)\s?[abc]\+?\b/i)?.[0] ?? null);
  if (condition !== "unknown") inferred.push("condition");
  if (grade) inferred.push("grade");
  return { condition: condition === "unknown" ? null : condition, grade, inferred };
}

export interface QueryCandidate {
  title: string;
  brand?: string | null;
  ean?: string | null;
  mpn?: string | null;
  sku?: string | null;
  extraText?: string | null;
}

function cleanId(s: string | null | undefined): string {
  return (s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

/**
 * Filtre d'un catalogue par requête (sources sans recherche en direct : flux, catalogues API).
 * EAN → égalité ; MPN → égalité ou présence ; requête structurée → marque / modèle / stockage /
 * couleur normalisés cohérents ; sinon tous les tokens présents dans le texte normalisé.
 */
export function matchesQuery(parsed: ParsedQuery, candidate: QueryCandidate): boolean {
  if (parsed.kind === "empty") return false;
  const text = normalizeText(`${candidate.title} ${candidate.brand ?? ""} ${candidate.mpn ?? ""} ${candidate.sku ?? ""} ${candidate.extraText ?? ""}`);
  if (parsed.ean) {
    const ean = (candidate.ean ?? "").replace(/\D/g, "");
    return ean.length >= 8 && (ean === parsed.ean || ean.replace(/^0+/, "") === parsed.ean.replace(/^0+/, ""));
  }
  if (parsed.kind === "mpn" && parsed.mpn) {
    const q = cleanId(parsed.mpn);
    if (cleanId(candidate.mpn) === q || cleanId(candidate.sku) === q) return true;
    return text.replace(/[^a-z0-9]/g, "").includes(q.toLowerCase());
  }
  const tokensOk = parsed.tokens.length > 0 && parsed.tokens.every((t) => text.includes(t));
  if (parsed.kind !== "structured") return tokensOk;
  const n = normalizeProduct(candidate.title, { brand: candidate.brand ?? null, ean: candidate.ean ?? null, mpn: candidate.mpn ?? null });
  const c = parsed.criteria;
  if (c.brand && n.brand && c.brand !== n.brand) return false;
  if (c.model && n.model && !n.inferred.includes("model") && c.model !== n.model) return false;
  if (c.model && (!n.model || n.inferred.includes("model"))) return tokensOk;
  if (c.storage && n.storage && c.storage !== n.storage) return false;
  if (c.color && n.color && c.color !== n.color) return false;
  if (c.grade && n.grade && c.grade !== n.grade) return false;
  return Boolean(c.model || tokensOk);
}

export function nowIso(ctx: AdapterRunContext): string {
  return (ctx.now ? ctx.now() : new Date()).toISOString();
}

/** Lecture typée d'un réglage de configuration (chaîne non vide ou null). */
export function settingString(settings: Record<string, unknown>, key: string): string | null {
  return str(settings[key]);
}

export function settingInt(settings: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const v = settings[key];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Cache mémoire simple à durée de vie (catalogues filtrés, jetons OAuth). */
export class TtlCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();
  constructor(private readonly ttlMs: number) {}
  get(key: string, now = Date.now()): T | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= now) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }
  set(key: string, value: T, now = Date.now(), ttlMs = this.ttlMs): void {
    this.store.set(key, { value, expiresAt: now + ttlMs });
  }
  clear(): void {
    this.store.clear();
  }
}
