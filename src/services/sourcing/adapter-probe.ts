import "server-only";
import { z } from "zod";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { getSourceAdapter } from "@/integrations/sourcing/registry";
import type { AdapterSourceConfig, SourceAdapter } from "@/integrations/sourcing/core";
import { checkRobotsForUrls } from "@/services/sourcing/crawler/robots";
import { sourcingUserAgent } from "@/lib/env";

/**
 * Essai RÉEL d'un connecteur sur un site candidat (outil d'administration, route cron protégée) :
 * exécute exactement le code de collecte (recherche ou première page de catalogue) contre le vrai
 * site et renvoie ce qui a été obtenu. AUCUNE écriture en base, aucun identifiant : seuls les
 * adaptateurs publics sont autorisés. robots.txt est vérifié avant toute requête.
 */

export const adapterProbeSchema = z.object({
  probes: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        adapter: z.string().min(1).max(40),
        baseUrl: z.string().url().max(300),
        query: z.string().min(2).max(80).default("iphone"),
        mode: z.enum(["search", "catalog"]).default("search"),
        settings: z.record(z.string(), z.unknown()).default({}),
        currency: z.string().length(3).optional(),
      }),
    )
    .min(1)
    .max(8),
});

export interface ProbeSample {
  title: string;
  price: number | null;
  currency: string | null;
  taxType: string | null;
  quantity: number | null;
  stockStatus: string | null;
  url: string | null;
  ean: string | null;
}

export interface ProbeResult {
  key: string;
  adapter: string;
  mode: "search" | "catalog";
  query: string;
  status: "ok" | "no_offers" | "robots_disallowed" | "error" | "refused" | "timeout";
  offers: number;
  priced: number;
  withStockInfo: number;
  withQuantity: number;
  withEan: number;
  currencies: string[];
  nextCursor: boolean;
  durationMs: number;
  message: string | null;
  requests: { url: string; status: number | null; durationMs: number; offers: number; error: string | null }[];
  samples: ProbeSample[];
}

const PROBE_TIMEOUT_MS = 55_000;

async function probeOne(p: z.infer<typeof adapterProbeSchema>["probes"][number]): Promise<ProbeResult> {
  const t0 = Date.now();
  const base: ProbeResult = { key: p.key, adapter: p.adapter, mode: p.mode, query: p.query, status: "error", offers: 0, priced: 0, withStockInfo: 0, withQuantity: 0, withEan: 0, currencies: [], nextCursor: false, durationMs: 0, message: null, requests: [], samples: [] };
  const adapter: SourceAdapter | null = getSourceAdapter(p.adapter);
  if (!adapter) return { ...base, message: `Adaptateur « ${p.adapter} » inconnu.` };
  if (adapter.access !== "public") return { ...base, status: "refused", message: "Adaptateur à compte : essai réservé aux comptes réels du revendeur." };
  if (p.mode === "catalog" && !(adapter.capabilities.catalog && adapter.fetchCatalog)) return { ...base, status: "refused", message: "Cet adaptateur ne sait pas parcourir un catalogue." };
  const config: AdapterSourceConfig = { baseUrl: p.baseUrl.replace(/\/+$/, ""), settings: p.settings, defaultCurrency: p.currency ?? null, defaultTaxType: "unknown", defaultCountry: null };
  const userAgent = sourcingUserAgent();
  const parsed = parseQuery(p.query);
  const urls = (p.mode === "search" ? adapter.urlsForQuery?.(config, parsed, p.query) : adapter.urlsForCatalog?.(config)) ?? [];
  try {
    const robots = await checkRobotsForUrls(config.baseUrl!, urls.length ? urls : [`${config.baseUrl}/`], userAgent);
    if (!robots.allowed) return { ...base, status: "robots_disallowed", message: robots.details, durationMs: Date.now() - t0 };
    const ctx = { userAgent, minDelayMs: Math.max(1500, (robots.crawlDelay ?? 0) * 1000), timeoutMs: 45_000, disallowedUrls: robots.disallowedUrls };
    const run = p.mode === "search" ? adapter.search(config, parsed, p.query, ctx).then((r) => ({ offers: r.offers, requests: r.requests, error: r.error, next: null as string | null })) : adapter.fetchCatalog!(config, null, ctx).then((r) => ({ offers: r.offers, requests: r.requests, error: null as string | null, next: r.nextCursor }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const r = await Promise.race([run, new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), PROBE_TIMEOUT_MS)))]).finally(() => timer && clearTimeout(timer));
    if (r === "timeout") return { ...base, status: "timeout", message: `Pas de réponse complète en ${PROBE_TIMEOUT_MS / 1000} s.`, durationMs: Date.now() - t0 };
    const priced = r.offers.filter((o) => o.price !== null && o.price > 0);
    return {
      ...base,
      status: priced.length > 0 ? "ok" : r.error ? "error" : "no_offers",
      offers: r.offers.length,
      priced: priced.length,
      withStockInfo: r.offers.filter((o) => (o.stockStatus && o.stockStatus !== "unknown") || (o.availableQuantity !== null && o.availableQuantity !== undefined)).length,
      withQuantity: r.offers.filter((o) => o.availableQuantity !== null && o.availableQuantity !== undefined).length,
      withEan: r.offers.filter((o) => Boolean(o.ean)).length,
      currencies: [...new Set(priced.map((o) => o.currency ?? "?"))],
      nextCursor: Boolean(r.next),
      durationMs: Date.now() - t0,
      message: r.error,
      // début (robots, plans du site) et fin (dernières fiches lues) : de quoi diagnostiquer un échec
      requests: r.requests.length > 10 ? [...r.requests.slice(0, 4), ...r.requests.slice(-6)] : r.requests,
      samples: priced.slice(0, 5).map((o) => ({ title: o.title.slice(0, 120), price: o.price, currency: o.currency ?? null, taxType: o.taxType ?? null, quantity: o.availableQuantity ?? null, stockStatus: o.stockStatus ?? null, url: o.url ?? null, ean: o.ean ?? null })),
    };
  } catch (e) {
    return { ...base, message: e instanceof Error ? e.message.slice(0, 300) : String(e), durationMs: Date.now() - t0 };
  }
}

/** Essais en parallèle sur des hôtes différents (une requête à la fois par hôte dans chaque essai). */
export async function runAdapterProbes(input: z.infer<typeof adapterProbeSchema>): Promise<ProbeResult[]> {
  return Promise.all(input.probes.map((p) => probeOne(p)));
}
