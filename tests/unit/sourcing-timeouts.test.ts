import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { clearEbayAppTokenCache, ebayBrowseAdapter } from "@/integrations/sourcing/ebay-browse";
import { FX_MAX_AGE_DAYS, fxRateAgeDays, isFxRateStale, refreshFxRates } from "@/services/sourcing/fx-rates";
import { runCtx, sourceConfig } from "./helpers/sourcing-adapters";

/**
 * I-24 : appels sortants BCE et jeton d'application eBay Browse bornés dans le temps ; âge
 * maximal des taux de change signalé.
 */

/** fetch qui ne répond jamais : seul l'abandon via `signal` le termine. */
function hangingFetch(seen: Array<AbortSignal | null | undefined>): typeof fetch {
  return ((_input: string | URL | Request, init?: RequestInit) => {
    seen.push(init?.signal);
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  }) as typeof fetch;
}

describe("BCE : délai d'attente et âge des taux (I-24)", () => {
  it("l'appel reçoit un signal d'abandon et échoue proprement au-delà du délai", async () => {
    const seen: Array<AbortSignal | null | undefined> = [];
    await expect(refreshFxRates({ fetchImpl: hangingFetch(seen), timeoutMs: 30 })).rejects.toThrow(/BCE : délai dépassé/);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
  });

  it("âge des taux : week-end et Pâques tolérés, au-delà signalé comme périmé", () => {
    const monday = new Date("2026-10-19T08:00:00Z");
    expect(fxRateAgeDays("2026-10-16", monday)).toBe(3); // vendredi → lundi matin
    expect(isFxRateStale("2026-10-16", monday)).toBe(false);
    expect(isFxRateStale("2026-04-02", new Date("2026-04-07T10:00:00Z"))).toBe(false); // jeudi saint → mardi de Pâques
    expect(isFxRateStale("2026-10-12", monday)).toBe(true);
    expect(fxRateAgeDays("2026-10-12", monday)).toBeGreaterThan(FX_MAX_AGE_DAYS);
    expect(isFxRateStale("pas une date", monday)).toBe(true);
  });
});

describe("eBay Browse : jeton d'application borné dans le temps (I-24)", () => {
  const KEYS = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_RU_NAME", "EBAY_ENV"] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.EBAY_CLIENT_ID = "app-id";
    process.env.EBAY_CLIENT_SECRET = "cert-id";
    process.env.EBAY_RU_NAME = "ru-name";
    process.env.EBAY_ENV = "production";
    clearEbayAppTokenCache();
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("un serveur de jetons muet ne bloque pas la recherche : erreur « délai dépassé »", async () => {
    const seen: Array<AbortSignal | null | undefined> = [];
    const t0 = Date.now();
    const r = await ebayBrowseAdapter.search(sourceConfig(), parseQuery("iphone"), "iphone", runCtx({ fetchImpl: hangingFetch(seen), timeoutMs: 40 }));
    expect(r.error).toMatch(/Jeton d'application eBay : délai dépassé/);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(Date.now() - t0).toBeLessThan(5_000);
  });
});
