/**
 * Résilience des appels eBay (fetch simulé, aucun réseau) : délai dépassé, 429 + Retry-After,
 * 5xx bornés, corps coupé, 401 → rafraîchissement forcé, codes d'erreur Trading API,
 * réponses mal formées (Zod) et clés publiques des notifications.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { fetchWithRetry, MAX_RETRY_AFTER_MS, parseRetryAfterMs, readBodyText } from "@/integrations/core/http";
import { ConnectorError } from "@/integrations/core/errors";
import type { ConnectorAuth } from "@/integrations/core/connector";
import { ebayRestGet } from "@/integrations/ebay/rest";
import { createEbayConfig } from "@/integrations/ebay/config";
import { assertTradingAck, iterateGetMyeBaySelling, reviseInventoryStatus } from "@/integrations/ebay/trading";
import { iterateEbayOrders } from "@/integrations/ebay/fulfillment";
import { EbayNotificationKeyStore, isUnknownKeyError, PublicKeyNotFoundError } from "@/integrations/ebay/notification-keys";
import { refreshAccessToken } from "@/integrations/ebay/oauth";

const config = createEbayConfig({ EBAY_ENV: "production", EBAY_CLIENT_ID: "app", EBAY_CLIENT_SECRET: "cert", EBAY_RU_NAME: "ru" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function auth(): ConnectorAuth & { calls: Array<{ forceRefresh?: boolean } | undefined> } {
  const calls: Array<{ forceRefresh?: boolean } | undefined> = [];
  return {
    calls,
    getAccessToken: async (options) => {
      calls.push(options);
      return options?.forceRefresh ? "token-refreshed" : "token-initial";
    },
  };
}

function xml(call: string, ack: string, errors: Array<{ code: string; short: string; severity?: string }> = [], inner = ""): string {
  const errs = errors.map((e) => `<Errors><ShortMessage>${e.short}</ShortMessage><LongMessage>${e.short}</LongMessage><ErrorCode>${e.code}</ErrorCode><SeverityCode>${e.severity ?? "Error"}</SeverityCode></Errors>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><${call}Response xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>${ack}</Ack>${errs}${inner}</${call}Response>`;
}

describe("fetchWithRetry : pannes réseau et quotas", () => {
  it("délai dépassé à chaque tentative → API_ERROR en français, nombre d'essais borné", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    vi.stubGlobal("fetch", fetchMock);
    const err = await fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", timeoutMs: 20, retries: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect((err as ConnectorError).code).toBe("API_ERROR");
    expect((err as ConnectorError).message).toMatch(/n'a pas répondu dans le délai imparti/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("5xx : nouvelles tentatives bornées (retries + 1 appels) puis API_ERROR", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const p = fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", retries: 3 }).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = (await p) as ConnectorError;
    expect(err.code).toBe("API_ERROR");
    expect(err.httpStatus).toBe(503);
    expect(err.details).toMatchObject({ attempts: 4 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("429 avec Retry-After court : attend le délai demandé puis réessaie", async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? new Response("", { status: 429, headers: { "retry-after": "2" } }) : new Response("ok", { status: 200 }))));
    const p = fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", retries: 2 });
    await vi.advanceTimersByTimeAsync(1_900);
    expect(n).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    expect((await p).status).toBe(200);
    expect(n).toBe(2);
  });

  it("429 avec Retry-After long (quota journalier) : aucune attente ni nouvelle tentative, RATE_LIMITED explicite", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 429, headers: { "retry-after": "3600" } }));
    vi.stubGlobal("fetch", fetchMock);
    const err = (await fetchWithRetry("https://api.ebay.com/x", {}, { provider: "ebay", retries: 3 }).catch((e: unknown) => e)) as ConnectorError;
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.message).toMatch(/réessayez dans 60 min/);
    expect(err.details).toMatchObject({ retryAfterSeconds: 3600 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("parseRetryAfterMs : secondes, date HTTP, valeurs invalides", () => {
    const now = Date.parse("2026-10-08T10:00:00Z");
    expect(parseRetryAfterMs("5", now)).toBe(5000);
    expect(parseRetryAfterMs("Thu, 08 Oct 2026 10:00:30 GMT", now)).toBe(30_000);
    expect(parseRetryAfterMs("n'importe quoi", now)).toBeNull();
    expect(parseRetryAfterMs(null, now)).toBeNull();
    expect(MAX_RETRY_AFTER_MS).toBeGreaterThan(0);
  });

  it("corps coupé pendant la lecture → ConnectorError typée (jamais une erreur brute)", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<partial"));
        controller.error(Object.assign(new Error("socket hang up"), { name: "TypeError" }));
      },
    });
    const err = await readBodyText(new Response(body, { status: 200 }), "ebay", "test").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect((err as ConnectorError).code).toBe("API_ERROR");
  });
});

describe("ebayRestGet : 401 / 403", () => {
  it("401 → UN rafraîchissement forcé puis succès", async () => {
    const a = auth();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const h = init?.headers as Record<string, string>;
      return h.Authorization === "Bearer token-refreshed" ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : new Response(JSON.stringify({ errors: [{ errorId: 1001, message: "Invalid access token" }] }), { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await ebayRestGet(a, "https://api.ebay.com/sell/fulfillment/v1/order", "t")).toEqual({ ok: true });
    expect(a.calls).toEqual([{ forceRefresh: false }, { forceRefresh: true }]);
  });

  it("401 persistant → AUTH_EXPIRED (sans token dans le message ni les détails) ; 403 → AUTH_EXPIRED (scope)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ errorId: 1001, message: "Invalid access token" }] }), { status: 401 })));
    const err = (await ebayRestGet(auth(), "https://api.ebay.com/x", "t").catch((e: unknown) => e)) as ConnectorError;
    expect(err.code).toBe("AUTH_EXPIRED");
    expect(JSON.stringify(err.details) + err.message).not.toContain("token-");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ errorId: 1100, message: "Access denied" }] }), { status: 403 })));
    await expect(ebayRestGet(auth(), "https://api.ebay.com/x", "t")).rejects.toMatchObject({ code: "AUTH_EXPIRED", httpStatus: 403 });
  });
});

describe("Trading API : codes d'erreur", () => {
  it("token invalide renvoyé en HTTP 200 (Ack=Failure, code 932) → rafraîchissement forcé puis succès", async () => {
    const a = auth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const token = (init?.headers as Record<string, string>)["X-EBAY-API-IAF-TOKEN"];
        return new Response(token === "token-refreshed" ? xml("ReviseInventoryStatus", "Success") : xml("ReviseInventoryStatus", "Failure", [{ code: "932", short: "Auth token is hard expired." }]), { status: 200 });
      }),
    );
    await expect(reviseInventoryStatus(config, a, { externalListingId: "1", variationSku: null }, 3)).resolves.toMatchObject({ ok: true, quantity: 3 });
    expect(a.calls.at(-1)).toEqual({ forceRefresh: true });
  });

  it("518 (quota d'appels) → RATE_LIMITED ; 10007 → API_ERROR réessayable ; autre → API_ERROR avec le message eBay", () => {
    const parse = (s: string) => {
      try {
        assertTradingAck("GetMyeBaySelling", (new XMLParser({ removeNSPrefix: true }).parse(s) as Record<string, Record<string, unknown>>).GetMyeBaySellingResponse ?? null);
        return null;
      } catch (e) {
        return e as ConnectorError;
      }
    };
    expect(parse(xml("GetMyeBaySelling", "Failure", [{ code: "518", short: "Call usage limit has been reached." }]))).toMatchObject({ code: "RATE_LIMITED", retryable: true });
    expect(parse(xml("GetMyeBaySelling", "Failure", [{ code: "10007", short: "Internal error to the application." }]))).toMatchObject({ code: "API_ERROR", retryable: true });
    const other = parse(xml("GetMyeBaySelling", "Failure", [{ code: "21916750", short: "Annonce créée avec l'Inventory API." }]));
    expect(other).toMatchObject({ code: "API_ERROR", retryable: false });
    expect(other!.message).toContain("Inventory API");
    expect(parse(xml("GetMyeBaySelling", "Warning", [{ code: "21917091", short: "Avertissement", severity: "Warning" }]))).toBeNull();
  });

  it("annonce illisible dans une page : comptée invalide, les autres sont lues", async () => {
    const items = `<ActiveList><ItemArray><Item><ItemID>111</ItemID><Title>OK</Title><Quantity>2</Quantity><SellingStatus><CurrentPrice currencyID="EUR">10</CurrentPrice><QuantitySold>0</QuantitySold></SellingStatus></Item><Item><Title>Sans identifiant</Title></Item></ItemArray><PaginationResult><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult></ActiveList>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml("GetMyeBaySelling", "Success", [], items), { status: 200 })));
    const pages = [];
    for await (const p of iterateGetMyeBaySelling(config, auth())) pages.push(p);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.listings.map((l) => l.externalListingId)).toEqual(["111"]);
    expect(pages[0]!.invalid).toHaveLength(1);
  });
});

describe("Fulfillment API : réponses mal formées", () => {
  it("une commande invalide n'interrompt pas la page ; une page illisible lève INVALID_RESPONSE", async () => {
    const good = { orderId: "O-1", creationDate: "2026-10-07T10:00:00.000Z", lastModifiedDate: "2026-10-07T10:00:00.000Z", orderPaymentStatus: "PAID", pricingSummary: { total: { value: "10.00", currency: "EUR" } }, lineItems: [{ lineItemId: "L1", legacyItemId: "1", quantity: 1, title: "x" }] };
    const bad = { orderId: "O-2", creationDate: "2026-10-07T10:00:00.000Z", lineItems: [{ lineItemId: "L1", quantity: -3 }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ total: 2, orders: [good, bad] }), { status: 200 })));
    const pages = [];
    for await (const p of iterateEbayOrders(config, auth(), { since: new Date("2026-10-01T00:00:00Z") })) pages.push(p);
    expect(pages[0]!.orders.map((o) => o.externalOrderId)).toEqual(["O-1"]);
    expect(pages[0]!.invalid).toEqual([expect.objectContaining({ orderId: "O-2" })]);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ orders: "pas un tableau" }), { status: 200 })));
    const it = iterateEbayOrders(config, auth(), { since: new Date("2026-10-01T00:00:00Z") })[Symbol.asyncIterator]();
    await expect(it.next()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("OAuth : erreurs de rafraîchissement", () => {
  it("invalid_scope au rafraîchissement → AUTH_EXPIRED (nouvelles autorisations à accorder)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_scope", error_description: "The requested scope is invalid" }), { status: 400 })));
    await expect(refreshAccessToken(config, "rt")).rejects.toMatchObject({ code: "AUTH_EXPIRED", message: expect.stringMatching(/nouvelles autorisations/) });
  });
});

describe("clés publiques des notifications", () => {
  it("kid inconnu (404) → PublicKeyNotFoundError, mis en cache négatif (un seul appel eBay)", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify({ access_token: "app", expires_in: 7200 }), { status: 200 });
        return new Response(JSON.stringify({ errors: [{ errorId: 195000, message: "Not found" }] }), { status: 404 });
      }),
    );
    const store = new EbayNotificationKeyStore(() => config);
    await expect(store.getPublicKey("unknown-kid")).rejects.toBeInstanceOf(PublicKeyNotFoundError);
    await expect(store.getPublicKey("unknown-kid")).rejects.toBeInstanceOf(PublicKeyNotFoundError);
    expect(calls.filter((u) => u.includes("public_key"))).toHaveLength(1);
    // kid malformé : rejeté sans appel réseau.
    await expect(store.getPublicKey("../../etc")).rejects.toBeInstanceOf(PublicKeyNotFoundError);
    expect(calls.filter((u) => u.includes("public_key"))).toHaveLength(1);
  });

  it("400 non attribuable au kid (token d'application refusé) → erreur d'infrastructure, token redemandé, AUCUN cache négatif", async () => {
    let tokenCalls = 0;
    let keyCalls = 0;
    let badRequest = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/oauth2/token")) {
          tokenCalls++;
          return new Response(JSON.stringify({ access_token: `app-${tokenCalls}`, expires_in: 7200 }), { status: 200 });
        }
        keyCalls++;
        return badRequest
          ? new Response(JSON.stringify({ errors: [{ errorId: 1001, domain: "OAuth", category: "REQUEST", message: "Invalid access token", longMessage: "Invalid access token. Check the value of the Authorization HTTP request header." }] }), { status: 400 })
          : new Response(JSON.stringify({ key: "-----BEGIN PUBLIC KEY-----abc-----END PUBLIC KEY-----", algorithm: "ECDSA", digest: "SHA1" }), { status: 200 });
      }),
    );
    const store = new EbayNotificationKeyStore(() => config);
    const err = await store.getPublicKey("kid-genuine").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err).not.toBeInstanceOf(PublicKeyNotFoundError);
    expect(err).toMatchObject({ code: "API_ERROR", httpStatus: 400 });
    // eBay redélivre : le kid authentique n'est pas mis en cache négatif, le token d'application est redemandé.
    badRequest = false;
    await expect(store.getPublicKey("kid-genuine")).resolves.toMatchObject({ digest: "SHA1" });
    expect(keyCalls).toBe(2);
    expect(tokenCalls).toBe(2);
    // 400 sans corps exploitable : même traitement (jamais « kid inconnu »).
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("/oauth2/token") ? new Response(JSON.stringify({ access_token: "app", expires_in: 7200 }), { status: 200 }) : new Response("Bad Request", { status: 400 }))));
    const fresh = new EbayNotificationKeyStore(() => config);
    const err2 = await fresh.getPublicKey("kid-2").catch((e: unknown) => e);
    expect(err2).toBeInstanceOf(ConnectorError);
    expect(err2).not.toBeInstanceOf(PublicKeyNotFoundError);
  });

  it("400 dont le corps eBay désigne l'identifiant de clé → kid inconnu (401), mis en cache négatif", async () => {
    let keyCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify({ access_token: "app", expires_in: 7200 }), { status: 200 });
        keyCalls++;
        return new Response(JSON.stringify({ errors: [{ errorId: 195001, domain: "API_NOTIFICATION", category: "REQUEST", message: "The specified public key id is invalid.", parameters: [{ name: "public_key_id", value: "kid-x" }] }] }), { status: 400 });
      }),
    );
    const store = new EbayNotificationKeyStore(() => config);
    await expect(store.getPublicKey("kid-x")).rejects.toBeInstanceOf(PublicKeyNotFoundError);
    await expect(store.getPublicKey("kid-x")).rejects.toBeInstanceOf(PublicKeyNotFoundError);
    expect(keyCalls).toBe(1);
  });

  it("isUnknownKeyError : seul un corps d'erreur eBay bien formé désignant la clé compte", () => {
    expect(isUnknownKeyError({ errors: [{ message: "Public key not found" }] })).toBe(true);
    expect(isUnknownKeyError({ errors: [{ message: "x", parameters: [{ name: "public_key_id", value: "k" }] }] })).toBe(true);
    expect(isUnknownKeyError({ errors: [{ message: "Invalid access token" }] })).toBe(false);
    expect(isUnknownKeyError({ errors: [{ message: "Invalid public key request: authorization token missing" }] })).toBe(false);
    expect(isUnknownKeyError({ message: "public key not found" })).toBe(false);
    expect(isUnknownKeyError(null)).toBe(false);
    expect(isUnknownKeyError("public key not found")).toBe(false);
  });

  it("panne eBay (5xx) → erreur d'infrastructure (pas PublicKeyNotFoundError) ; clé valide mise en cache", async () => {
    vi.useFakeTimers();
    let down = true;
    let keyCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify({ access_token: "app", expires_in: 7200 }), { status: 200 });
        keyCalls++;
        return down ? new Response("", { status: 503 }) : new Response(JSON.stringify({ key: "-----BEGIN PUBLIC KEY-----abc-----END PUBLIC KEY-----", algorithm: "ECDSA", digest: "SHA1" }), { status: 200 });
      }),
    );
    const store = new EbayNotificationKeyStore(() => config);
    const p = store.getPublicKey("kid-1").catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = await p;
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err).not.toBeInstanceOf(PublicKeyNotFoundError);
    down = false;
    await expect(store.getPublicKey("kid-1")).resolves.toMatchObject({ digest: "SHA1" });
    const before = keyCalls;
    await store.getPublicKey("kid-1");
    expect(keyCalls).toBe(before);
  });
});
