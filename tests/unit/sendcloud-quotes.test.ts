import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toCents } from "@/domain/tools/decimal";
import { compareManualCards, optionFromQuote, sortOptions, type Parcel, type RateCard } from "@/domain/tools/shipping";
import { isConnectorError } from "@/integrations/core/errors";
import { mapSendcloudOptions, SENDCLOUD_SHIPPING_OPTIONS_URL, sendcloudConfigured, sendcloudQuotes, sendcloudShippingOptionsBody } from "@/integrations/shipping/sendcloud";
import { quoteShipping, shippingProvidersStatus } from "@/services/shipping/quotes";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const FIXTURE = JSON.parse(readFileSync(path.resolve(__dirname, "../fixtures/shipping/sendcloud-shipping-options-fr-1kg.json"), "utf8"));
const NOW = new Date("2026-10-11T08:00:00.000Z");
const REQ = { weightKg: 1, lengthCm: 30, widthCm: 20, heightCm: 10, fromCountry: "FR", fromPostcode: "75011", toCountry: "FR", toPostcode: "69003" };
const PARCEL: Parcel = { weightKg: 1, lengthCm: 30, widthCm: 20, heightCm: 10, fromCountry: "FR", toCountry: "FR" };
const KEYS = { SENDCLOUD_PUBLIC_KEY: "pub_test_0123456789", SENDCLOUD_SECRET_KEY: "sec_test_0123456789" };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const option = (over: Record<string, unknown> = {}) => ({
  code: "colissimo:home/fr",
  name: "Colissimo Home",
  carrier: { code: "colissimo", name: "Colissimo" },
  functionalities: { tracked: true, first_mile: "pickup_dropoff", last_mile: "home_delivery" },
  requirements: { fields: [], is_service_point_required: false },
  quotes: [{ price: { total: { value: "10.71", currency: "EUR" }, breakdown: [] }, lead_time: 48 }],
  quote_error: null,
  ...over,
});

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("aucune erreur levée");
}

describe("Sendcloud : lecture de la réponse réelle enregistrée (11/10/2026)", () => {
  const r = mapSendcloudOptions(FIXTURE, NOW.toISOString());

  it("garde les 5 offres suivies, prix exacts, sans HT/TTC supposé", () => {
    expect(r.quotes.map((q) => [q.carrier, q.service, q.priceVatUnknown])).toEqual([
      ["Mondial Relay", "Mondial Relay Point Relais", "4.39"],
      ["Mondial Relay", "Mondial Relay Locker Delivery", "4.29"],
      ["Colissimo", "Colissimo Home", "10.71"],
      ["Colissimo", "Colissimo Service Point", "8.85"],
      ["Mondial Relay", "Mondial Relay Home Domestic", "6.03"],
    ]);
    for (const q of r.quotes) {
      expect(q).toMatchObject({ provider: "sendcloud", providerLabel: "Sendcloud", priceInclVat: null, priceExclVat: null, currency: "EUR", estimatedDelivery: null, tracking: true });
    }
  });

  it("écarte la lettre non suivie à 0 €", () => {
    expect(r.excluded).toEqual([{ carrier: "Sendcloud", service: "Unstamped letter", reason: "Envoi sans suivi : exclu du comparateur." }]);
  });

  it("détaille la surcharge carburant et les conditions, sans inventer de délai", () => {
    const home = r.quotes.find((q) => q.service === "Colissimo Home")!;
    expect(home.restrictions).toEqual(["Dont Fuel surcharge (14.02%) : 1,32\u00a0€."]);
    expect([home.transitDaysMin, home.transitDaysMax]).toEqual([2, 2]);
    expect(home.deliveryToPickupPoint).toBe(false);
    expect(home.dropOff).toBeNull();
    const relay = r.quotes.find((q) => q.service === "Mondial Relay Point Relais")!;
    expect(relay.restrictions).toEqual(["Point relais à choisir pour l'étiquette.", "E-mail du destinataire requis pour l'étiquette."]);
    expect([relay.transitDaysMin, relay.transitDaysMax]).toEqual([null, null]);
    expect(relay.dropOff).toBe(true);
    expect(relay.deliveryToPickupPoint).toBe(true);
  });
});

describe("Sendcloud : tarifs nuls et réponses incomplètes", () => {
  it("n'affiche jamais un prix nul, négatif, absent ou non numérique", () => {
    const r = mapSendcloudOptions(
      {
        data: [
          option({ code: "a", quotes: [{ price: { total: { value: "0", currency: "EUR" } } }] }),
          option({ code: "b", quotes: [{ price: { total: { value: "0.00", currency: "EUR" } } }] }),
          option({ code: "c", quotes: [{ price: { total: { value: "-3", currency: "EUR" } } }] }),
          option({ code: "d", quotes: [{ price: { total: { value: "abc", currency: "EUR" } } }] }),
          option({ code: "e", quotes: [{ price: {} }] }),
          option({ code: "f", quotes: [] }),
          option({ code: "g", quotes: null }),
        ],
      },
      NOW.toISOString(),
    );
    expect(r.quotes).toEqual([]);
    expect(r.excluded).toHaveLength(7);
    expect(new Set(r.excluded.map((x) => x.reason))).toEqual(new Set(["Prix absent ou nul renvoyé : non affiché."]));
  });

  it("refuse un prix sans devise plutôt que de supposer l'euro", () => {
    const r = mapSendcloudOptions({ data: [option({ quotes: [{ price: { total: { value: "5.10" } } }] })] }, NOW.toISOString());
    expect(r.quotes).toEqual([]);
    expect(r.excluded[0]?.reason).toMatch(/Devise absente/);
  });

  it("écarte une option en erreur de devis ou illisible", () => {
    const r = mapSendcloudOptions({ data: [option({ quote_error: { detail: "weight too high" } }), { name: "sans code" }, null] }, NOW.toISOString());
    expect(r.quotes).toEqual([]);
    expect(r.excluded.map((x) => x.reason)).toEqual(["Sendcloud n'a pas pu calculer de prix pour cette option.", "Option incomplète dans la réponse Sendcloud.", "Option incomplète dans la réponse Sendcloud."]);
  });

  it("accepte une liste vide (aucune option) mais refuse une réponse sans liste", () => {
    expect(mapSendcloudOptions({ data: [] }, NOW.toISOString())).toEqual({ quotes: [], excluded: [] });
    expect(() => mapSendcloudOptions({ detail: "x" }, NOW.toISOString())).toThrow(/liste d'options absente/);
    expect(() => mapSendcloudOptions(null, NOW.toISOString())).toThrow(/liste d'options absente/);
  });
});

describe("Sendcloud : appel HTTP (consultation uniquement)", () => {
  it("sans clés : aucun appel réseau, erreur « non configuré »", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(sendcloudConfigured({})).toBe(false);
    expect(sendcloudConfigured({ SENDCLOUD_PUBLIC_KEY: "court", SENDCLOUD_SECRET_KEY: "court" })).toBe(false);
    expect(sendcloudConfigured(KEYS)).toBe(true);
    const e = await rejection(sendcloudQuotes(REQ, { SENDCLOUD_PUBLIC_KEY: KEYS.SENDCLOUD_PUBLIC_KEY }, NOW));
    expect(isConnectorError(e) && e.code).toBe("NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("n'appelle que le point d'accès de devis, en Basic, sans donnée client", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => (calls.push({ url, init }), json(FIXTURE))));
    const r = await sendcloudQuotes({ ...REQ, fromCity: "Paris", toCity: "Lyon", declaredValue: 300 }, KEYS, NOW);
    expect(r.quotes).toHaveLength(5);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(SENDCLOUD_SHIPPING_OPTIONS_URL);
    expect(calls[0]!.init.method).toBe("POST");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(`${KEYS.SENDCLOUD_PUBLIC_KEY}:${KEYS.SENDCLOUD_SECRET_KEY}`).toString("base64")}`);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual(sendcloudShippingOptionsBody(REQ));
    expect(String(calls[0]!.init.body)).not.toMatch(/Paris|Lyon|300/);
  });

  it("le module ne contient aucun point d'accès d'étiquette ou d'envoi", () => {
    const source = readFileSync(path.resolve(__dirname, "../../src/integrations/shipping/sendcloud.ts"), "utf8");
    expect([...new Set(source.match(/https:\/\/[^\s"'`]+/g))]).toEqual(["https://panel.sendcloud.sc/api/v3/shipping-options"]);
    expect(source).not.toMatch(/\/labels|\/shipments|\/parcels\b|announce|cancel/i);
  });

  it("401 : clés refusées ; 403 : formule ou droits insuffisants", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ errors: [{ detail: "Invalid credentials" }] }, 401)));
    const e401 = await rejection(sendcloudQuotes(REQ, KEYS, NOW));
    expect(isConnectorError(e401) && [e401.code, e401.httpStatus]).toEqual(["AUTH_EXPIRED", 401]);
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 403)));
    const e403 = await rejection(sendcloudQuotes(REQ, KEYS, NOW));
    expect(isConnectorError(e403) && e403.message).toMatch(/formule ou vos clés/);
  });

  it("400 : message d'erreur Sendcloud repris (tronqué)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ errors: [{ status: "400", code: "invalid", detail: "to_address.postal_code is invalid" }] }, 400)));
    const e = await rejection(sendcloudQuotes(REQ, KEYS, NOW));
    expect(isConnectorError(e) && e.code).toBe("API_ERROR");
    expect((e as Error).message).toMatch(/HTTP 400\) : to_address\.postal_code is invalid/);
  });

  it("5xx persistant : une seule nouvelle tentative puis erreur", async () => {
    const fetchMock = vi.fn(async () => new Response("oops", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const e = await rejection(sendcloudQuotes(REQ, KEYS, NOW));
    expect(isConnectorError(e) && [e.code, e.httpStatus]).toEqual(["API_ERROR", 503]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("429 : quota atteint signalé", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 429, { "Retry-After": "120" })));
    const e = await rejection(sendcloudQuotes(REQ, KEYS, NOW));
    expect(isConnectorError(e) && e.code).toBe("RATE_LIMITED");
  });

  it("délai dépassé : erreur explicite, aucun prix", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))),
    );
    const e = await rejection(sendcloudQuotes(REQ, KEYS, NOW, { timeoutMs: 30 }));
    expect(isConnectorError(e) && e.code).toBe("API_ERROR");
    expect((e as Error).message).toMatch(/délai/);
  });

  it("corps vide ou non JSON : réponse refusée", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>maintenance</html>", { status: 200 })));
    const e = await rejection(sendcloudQuotes(REQ, KEYS, NOW));
    expect(isConnectorError(e) && e.code).toBe("INVALID_RESPONSE");
  });
});

describe("Comparateur : intégration simulée (service de devis + écran)", () => {
  const card: RateCard = {
    id: "card-1",
    carrier: "La Poste",
    service: "Ma grille Colissimo",
    fromCountries: ["FR"],
    toCountries: ["FR"],
    bands: [{ maxWeightKg: 2, price: "8,99" }],
    currency: "EUR",
    maxLengthCm: null,
    maxDimensionsSumCm: null,
    volumetricDivisor: null,
    transitDaysMin: 2,
    transitDaysMax: 3,
    tracking: true,
    deliveryMode: null,
    notes: null,
    verifiedAt: "2026-09-01",
  };

  it("Sendcloud s'ajoute à Packlink et Boxtal sans les remplacer", () => {
    expect(shippingProvidersStatus({}).map((p) => p.id)).toEqual(["packlink", "boxtal", "sendcloud"]);
    expect(shippingProvidersStatus(KEYS).find((p) => p.id === "sendcloud")?.configured).toBe(true);
  });

  it("devis réels Sendcloud + grille manuelle : origines distinctes, HT/TTC inconnu, offre écartée signalée", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === SENDCLOUD_SHIPPING_OPTIONS_URL ? json(FIXTURE) : new Response("", { status: 404 }))));
    const result = await quoteShipping(REQ, KEYS, NOW);
    expect(result.providers).toEqual([
      expect.objectContaining({ id: "packlink", state: "not_configured" }),
      expect.objectContaining({ id: "boxtal", state: "not_configured" }),
      { id: "sendcloud", label: "Sendcloud", state: "ok", count: 5, message: "1 offre écartée (prix nul ou absent, envoi non suivi ou réponse incomplète)." },
    ]);
    const api = result.quotes.map((q) => optionFromQuote(q, PARCEL)).filter((o) => o !== null);
    expect(api).toHaveLength(5);
    for (const o of api) expect(o).toMatchObject({ origin: "api", provider: "Sendcloud", priceTax: "unknown" });
    const manual = compareManualCards([card], PARCEL, "price");
    const all = sortOptions([...api, ...manual.options], "price");
    expect(all.map((o) => [o.origin, o.service, toCents(o.price)])).toEqual([
      ["api", "Mondial Relay Locker Delivery", 429n],
      ["api", "Mondial Relay Point Relais", 439n],
      ["api", "Mondial Relay Home Domestic", 603n],
      ["api", "Colissimo Service Point", 885n],
      ["manual", "Ma grille Colissimo", 899n],
      ["api", "Colissimo Home", 1071n],
    ]);
    expect(all.find((o) => o.origin === "manual")?.priceTax).toBe("unknown");
  });

  it("Sendcloud en erreur n'empêche pas les autres sources", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 401)));
    const result = await quoteShipping(REQ, KEYS, NOW);
    expect(result.quotes).toEqual([]);
    expect(result.providers.find((p) => p.id === "sendcloud")).toMatchObject({ state: "error", message: expect.stringMatching(/Clés Sendcloud refusées/) });
  });

  it("uniquement des offres écartées : « aucun résultat » expliqué", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [option({ quotes: [{ price: { total: { value: "0", currency: "EUR" } } }] })] })));
    const result = await quoteShipping(REQ, KEYS, NOW);
    expect(result.providers.find((p) => p.id === "sendcloud")).toMatchObject({ state: "no_result", count: 0, message: expect.stringMatching(/Aucun service proposé.*1 offre écartée/) });
  });

  it("un prix nul n'est jamais une option, quelle que soit la plateforme", () => {
    const base = { key: "k", providerLabel: "Packlink PRO", carrier: "X", service: "Y", currency: "EUR", transitDaysMin: null, transitDaysMax: null, tracking: null, dropOff: null, deliveryToPickupPoint: null, restrictions: [], quotedAt: NOW.toISOString(), estimatedDelivery: null };
    expect(optionFromQuote({ ...base, priceInclVat: "0", priceExclVat: "0.00" }, PARCEL)).toBeNull();
    expect(optionFromQuote({ ...base, priceInclVat: null, priceExclVat: null, priceVatUnknown: "0" }, PARCEL)).toBeNull();
    expect(optionFromQuote({ ...base, priceInclVat: "0", priceExclVat: "8.44" }, PARCEL)?.priceTax).toBe("excl");
    expect(optionFromQuote({ ...base, priceInclVat: "10.13", priceExclVat: "8.44" }, PARCEL)?.priceTax).toBe("incl");
  });
});
