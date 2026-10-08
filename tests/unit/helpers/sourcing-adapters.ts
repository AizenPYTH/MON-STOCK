/**
 * Utilitaires de test des adaptateurs : fixtures (documents construits d'après les formats
 * documentés), fetch simulé par routes, résolveur DNS public (anti-SSRF) et contexte d'exécution.
 * Aucun accès réseau : « non testé en conditions réelles depuis cet environnement ».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import type { AdapterRunContext, AdapterSourceConfig } from "@/integrations/sourcing/core";

export const publicResolver = async () => [{ address: "93.184.216.34" }];

export function fixture(adapterKey: string, name: string): string {
  return readFileSync(path.resolve(__dirname, "../../fixtures/sourcing", adapterKey, name), "utf8");
}

export type Route = { status?: number; body: string; contentType?: string } | ((url: string, init?: RequestInit) => Response | Promise<Response>);

/** fetch simulé : la première route dont le motif (chaîne incluse ou RegExp) correspond à l'URL répond. */
export function mockFetch(routes: Array<[string | RegExp, Route]>): { fetchImpl: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    for (const [pattern, route] of routes) {
      const match = typeof pattern === "string" ? url.includes(pattern) : pattern.test(url);
      if (!match) continue;
      if (typeof route === "function") return route(url, init);
      return new Response(route.body, { status: route.status ?? 200, headers: { "content-type": route.contentType ?? "application/json; charset=utf-8" } });
    }
    return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  });
  return { fetchImpl: fn as unknown as typeof fetch, calls };
}

export function runCtx(overrides: Partial<AdapterRunContext> = {}): AdapterRunContext {
  return { userAgent: "MonStockBot/0.1 (+https://example.test/bot)", resolver: publicResolver, sleep: async () => undefined, now: () => new Date("2026-10-08T10:00:00.000Z"), ...overrides };
}

export function sourceConfig(overrides: Partial<AdapterSourceConfig> = {}): AdapterSourceConfig {
  return { baseUrl: null, settings: {}, defaultCurrency: null, defaultTaxType: "unknown", defaultCountry: null, ...overrides };
}
