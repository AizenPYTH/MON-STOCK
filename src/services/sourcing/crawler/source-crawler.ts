/**
 * Crawl borné d'une source publique : pages listées dans config.urls (même hôte que la
 * source), User-Agent explicite, aucun cookie ni login, délai entre requêtes ≥ max(2 s,
 * Crawl-delay robots.txt, délai configuré), nombre de pages limité.
 */
import { z } from "zod";
import type { RawOffer } from "@/domain/sourcing/types";
import { fetchText } from "@/services/sourcing/http";
import type { SourceParser } from "@/services/sourcing/crawler/parsers/types";

export const crawlConfigSchema = z.object({
  urls: z.array(z.string().url()).max(50).default([]),
  parser: z.string().max(60).optional(),
  max_pages: z.number().int().min(1).max(50).optional(),
  delay_seconds: z.number().min(0).max(120).optional(),
});
export type CrawlConfig = z.infer<typeof crawlConfigSchema>;

export const MIN_DELAY_SECONDS = 2;
export const DEFAULT_MAX_PAGES = 20;

export interface CrawlPageResult {
  url: string;
  status: number | null;
  offers: number;
  error: string | null;
}

export interface CrawlResult {
  offers: RawOffer[];
  pages: CrawlPageResult[];
  skippedUrls: string[];
  delaySeconds: number;
}

export interface CrawlSourceParams {
  baseUrl: string | null;
  config: CrawlConfig;
  robotsCrawlDelay: number | null;
  parser: SourceParser;
  userAgent: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** URLs interdites par robots.txt (déjà évaluées) */
  disallowedUrls?: string[];
}

export function parseCrawlConfig(raw: unknown): CrawlConfig {
  const parsed = crawlConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { urls: [] };
}

export function allowedHost(baseUrl: string | null, urls: string[]): string | null {
  const first = baseUrl ?? urls[0];
  if (!first) return null;
  try {
    return new URL(first).host.toLowerCase();
  } catch {
    return null;
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function crawlSource(params: CrawlSourceParams): Promise<CrawlResult> {
  const sleep = params.sleep ?? defaultSleep;
  const host = allowedHost(params.baseUrl, params.config.urls);
  const delaySeconds = Math.max(MIN_DELAY_SECONDS, params.robotsCrawlDelay ?? 0, params.config.delay_seconds ?? 0);
  const maxPages = Math.min(params.config.max_pages ?? DEFAULT_MAX_PAGES, 50);
  const disallowed = new Set(params.disallowedUrls ?? []);
  const pages: CrawlPageResult[] = [];
  const skippedUrls: string[] = [];
  const offers: RawOffer[] = [];
  const seen = new Set<string>();

  const targets: string[] = [];
  for (const u of params.config.urls) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      skippedUrls.push(u);
      continue;
    }
    if (!host || parsed.host.toLowerCase() !== host || disallowed.has(u)) {
      skippedUrls.push(u);
      continue;
    }
    if (targets.length < maxPages) targets.push(u);
    else skippedUrls.push(u);
  }

  for (const [i, url] of targets.entries()) {
    if (i > 0) await sleep(delaySeconds * 1000);
    try {
      const res = await fetchText(url, { userAgent: params.userAgent, fetchImpl: params.fetchImpl, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" });
      if (!res.ok) {
        pages.push({ url, status: res.status, offers: 0, error: `HTTP ${res.status}` });
        continue;
      }
      const found = params.parser.parse(res.text, res.finalUrl || url);
      let added = 0;
      for (const o of found) {
        if (seen.has(o.externalOfferId)) continue;
        seen.add(o.externalOfferId);
        offers.push(o);
        added++;
      }
      pages.push({ url, status: res.status, offers: added, error: null });
    } catch (e) {
      pages.push({ url, status: null, offers: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { offers, pages, skippedUrls, delaySeconds };
}
