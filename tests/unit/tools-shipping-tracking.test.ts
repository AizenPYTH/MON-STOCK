import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toCents } from "@/domain/tools/decimal";
import { billableWeight, compareManualCards, highlights, optionFromQuote, parseBands, parseCountryList, parseParcel, quoteFromCard, rateCardFromRow, sortOptions, type Parcel, type RateCard } from "@/domain/tools/shipping";
import { chooseProvider, detectCarriers, laPosteEventStatus, nextCheckAt, normalizeTrackingNumber, s10CheckDigit, ship24MilestoneStatus, sortEvents, trackingAlerts, validateTrackingNumber, type TrackingSnapshot } from "@/domain/tools/tracking";
import { mapPacklinkServices, packlinkConfigured, packlinkQuotes, packlinkSearchUrl, parseTransit } from "@/integrations/shipping/packlink";
import { boxtalConfigured, boxtalQuoteUrl, mapBoxtalXml, nextCollectionDate } from "@/integrations/shipping/boxtal";
import { laPosteTrack, mapLaPosteResponse } from "@/integrations/tracking/laposte";
import { mapShip24Response, ship24Track } from "@/integrations/tracking/ship24";
import { quoteShipping } from "@/services/shipping/quotes";
import { refreshParcel } from "@/services/tracking/tracking";
import type { ShippingQuoteRequest } from "@/features/mobile-api/contract";

afterEach(() => vi.unstubAllGlobals());

const parcel: Parcel = { weightKg: 1.2, lengthCm: 30, widthCm: 20, heightCm: 10, fromCountry: "FR", toCountry: "FR" };
const card = (over: Partial<RateCard> = {}): RateCard => ({
  id: "c1",
  carrier: "Colissimo",
  service: "Domicile",
  fromCountries: ["FR"],
  toCountries: ["FR"],
  bands: [
    { maxWeightKg: 1, price: "7.35" },
    { maxWeightKg: 2, price: "8.65" },
    { maxWeightKg: 5, price: "12.9" },
  ],
  currency: "EUR",
  maxLengthCm: 100,
  maxDimensionsSumCm: 150,
  volumetricDivisor: null,
  transitDaysMin: 2,
  transitDaysMax: 3,
  tracking: true,
  deliveryMode: "dépôt bureau de poste",
  notes: null,
  verifiedAt: "2026-10-01",
  ...over,
});

describe("Comparateur de frais de port : grilles saisies", () => {
  it("choisit la tranche du poids facturable et signale le poids volumétrique", () => {
    const q = quoteFromCard(card(), parcel);
    expect("option" in q && toCents(q.option.price)).toBe(865n);
    const vol = quoteFromCard(card({ volumetricDivisor: 5000 }), { ...parcel, lengthCm: 40, widthCm: 30, heightCm: 20 }); // 24000/5000 = 4,8 kg
    expect("option" in vol && vol.option.billableWeightKg).toBe(4.8);
    expect("option" in vol && toCents(vol.option.price)).toBe(1290n);
    expect("option" in vol && vol.option.restrictions[0]).toMatch(/volumétrique/);
    expect(billableWeight(parcel, null)).toBe(1.2);
  });
  it("exclut avec la raison : destination, dimensions, poids au-delà de la dernière tranche", () => {
    expect(quoteFromCard(card(), { ...parcel, toCountry: "DE" })).toMatchObject({ exclusion: { reason: expect.stringMatching(/Destination DE/) } });
    expect(quoteFromCard(card(), { ...parcel, lengthCm: 120 })).toMatchObject({ exclusion: { reason: expect.stringMatching(/Plus grand côté/) } });
    expect(quoteFromCard(card({ maxLengthCm: null }), { ...parcel, lengthCm: 90, widthCm: 50, heightCm: 20 })).toMatchObject({ exclusion: { reason: expect.stringMatching(/L \+ l \+ h/) } });
    expect(quoteFromCard(card(), { ...parcel, weightKg: 7 })).toMatchObject({ exclusion: { reason: expect.stringMatching(/dernière tranche \(5 kg\)/) } });
    expect("option" in quoteFromCard(card({ toCountries: [] }), { ...parcel, toCountry: "IT" })).toBe(true);
  });
  it("tri par prix ou rapidité, badges, devises différentes jamais comparées", () => {
    const fast = card({ id: "c2", carrier: "Chronopost", bands: [{ maxWeightKg: 2, price: "18.5" }], transitDaysMin: 1, transitDaysMax: 1 });
    const { options, excluded } = compareManualCards([card(), fast, card({ id: "c3", toCountries: ["BE"] })], parcel);
    expect(options.map((o) => o.carrier)).toEqual(["Colissimo", "Chronopost"]);
    expect(excluded).toHaveLength(1);
    expect(sortOptions(options, "speed")[0]!.carrier).toBe("Chronopost");
    expect(highlights(options)).toEqual({ cheapest: "manual:c1", fastest: "manual:c2" });
    const gbp = card({ id: "c4", currency: "GBP", bands: [{ maxWeightKg: 2, price: "1" }] });
    expect(highlights(compareManualCards([card(), gbp], parcel).options).cheapest).toBeNull();
  });
  it("saisie du colis, des pays et des tranches", () => {
    expect(parseParcel({ weightKg: "1,2", lengthCm: "30", widthCm: "20", heightCm: "10", fromCountry: "fr", toCountry: "de" }).parcel).toMatchObject({ weightKg: 1.2, fromCountry: "FR", toCountry: "DE" });
    const bad = parseParcel({ weightKg: "", lengthCm: "-1", widthCm: "abc", heightCm: "10", fromCountry: "FRA", toCountry: "D" });
    expect(Object.keys(bad.errors).sort()).toEqual(["fromCountry", "lengthCm", "toCountry", "weightKg", "widthCm"]);
    expect(parseCountryList("fr, be ; de france")).toEqual({ countries: ["FR", "BE", "DE"], invalid: ["FRANCE"] });
    const b = parseBands([{ maxWeightKg: "2", price: "8,65 €" }, { maxWeightKg: "1", price: "7,35" }, { maxWeightKg: "", price: "" }]);
    expect(b).toEqual({ bands: [{ maxWeightKg: 1, price: "7.35" }, { maxWeightKg: 2, price: "8.65" }], errors: [] });
    expect(parseBands([{ maxWeightKg: "1", price: "x" }]).errors[0]).toMatch(/prix invalide/);
    expect(parseBands([{ maxWeightKg: "1", price: "2" }, { maxWeightKg: "1", price: "3" }]).errors[0]).toMatch(/même poids/);
    expect(parseBands([]).errors[0]).toMatch(/au moins une tranche/);
    expect(rateCardFromRow({ id: "x", carrier: "C", service: "", from_countries: [], to_countries: [], bands: [{ maxWeightKg: 1, price: "5" }, { bad: true }], currency: "EUR", max_length_cm: null, max_dimensions_sum_cm: null, volumetric_divisor: null, transit_days_min: null, transit_days_max: null, tracking: null, delivery_mode: null, notes: null, verified_at: null }).bands).toHaveLength(1);
  });
});

const req: ShippingQuoteRequest = { weightKg: 1.2, lengthCm: 29.5, widthCm: 20, heightCm: 10, fromCountry: "FR", fromPostcode: "75001", toCountry: "FR", toPostcode: "33000" };

/** Forme des services renvoyés par Packlink (champs lus dans le code officiel ecommerce_module_core). */
const PACKLINK_FIXTURE = [
  { id: 20615, carrier_name: "Colissimo", name: "Domicile", currency: "EUR", category: "standard", dropoff: true, delivery_to_parcelshop: false, transit_time: "2 DAYS", transit_hours: "48", first_estimated_delivery_date: "2026/10/14", price: { total_price: 10.13, tax_price: 1.69, base_price: 8.44 } },
  { id: 20616, carrier_name: "Chronopost", name: "Chrono 13", currency: "EUR", category: "express", dropoff: false, delivery_to_parcelshop: false, transit_time: "1 DAYS", transit_hours: "24", price: { total_price: "21.50", tax_price: "3.58", base_price: "17.92" } },
  { id: 20617, carrier_name: "Sans prix", name: "X", currency: "EUR", price: {} },
];

describe("Packlink PRO", () => {
  it("construit la requête du module officiel (dimensions entières arrondies au-dessus, source PRO)", () => {
    const u = new URL(packlinkSearchUrl(req));
    expect(u.origin + u.pathname).toBe("https://api.packlink.com/v1/services");
    expect(u.searchParams.get("packages[0][length]")).toBe("30");
    expect(u.searchParams.get("packages[0][weight]")).toBe("1.2");
    expect(u.searchParams.get("source")).toBe("PRO");
    expect(u.searchParams.get("to[zip]")).toBe("33000");
  });
  it("convertit les services en devis (prix exacts, délai, dépôt) et écarte ceux sans prix", () => {
    const q = mapPacklinkServices(PACKLINK_FIXTURE, "2026-10-11T08:00:00.000Z");
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ provider: "packlink", carrier: "Colissimo", priceInclVat: "10.13", priceExclVat: "8.44", transitDaysMin: 2, estimatedDelivery: "2026-10-14", dropOff: true, deliveryToPickupPoint: false });
    expect(q[1]!.priceInclVat).toBe("21.50");
    expect(parseTransit("3-5 DAYS", null)).toEqual({ min: 3, max: 5 });
    expect(parseTransit(null, "72")).toEqual({ min: 3, max: 3 });
    expect(() => mapPacklinkServices({ error: "x" }, "t")).toThrow(/inattendue/);
  });
  it("appelle l'API avec la clé brute dans Authorization et signale une clé refusée", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response(JSON.stringify(PACKLINK_FIXTURE), { status: 200 }))));
    const env = { PACKLINK_API_KEY: "pk_test_1234567890" };
    expect(packlinkConfigured(env)).toBe(true);
    const q = await packlinkQuotes(req, env);
    expect(q).toHaveLength(2);
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("pk_test_1234567890");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    await expect(packlinkQuotes(req, env)).rejects.toThrow(/refusée/);
  });
});

const BOXTAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cotation><shipment>
  <offer><mode>COM</mode><url>x</url>
    <operator><code>POFR</code><label>Colissimo</label><logo>l</logo></operator>
    <service><code>ColissimoAccess</code><label>Colissimo Access</label></service>
    <price><currency>EUR</currency><tax-exclusive>7.20</tax-exclusive><tax-inclusive>8.64</tax-inclusive></price>
    <collection><type><code>POST_OFFICE</code><label>Dépôt en bureau de poste</label></type><date>2026-10-12</date></collection>
    <delivery><type><code>HOME</code><label>Livraison à domicile</label></type><date>2026-10-14</date></delivery>
    <characteristics><label>Livraison en 48h</label><label>Sans signature</label></characteristics>
  </offer>
  <offer>
    <operator><code>MONR</code><label>Mondial Relay</label></operator>
    <service><code>CpourToi</code><label>C.pourToi</label></service>
    <price><currency>EUR</currency><tax-exclusive>4.10</tax-exclusive><tax-inclusive>4.92</tax-inclusive></price>
    <collection><type><code>DROPOFF_POINT</code></type></collection>
    <delivery><type><code>PICKUP_POINT</code></type></delivery>
  </offer>
</shipment></cotation>`;

describe("Boxtal (API v1)", () => {
  const env = { BOXTAL_V1_LOGIN: "moi", BOXTAL_V1_PASSWORD: "secret", BOXTAL_CONTENT_CODE: "50113" };
  it("configuration, paramètres du SDK officiel, date d'enlèvement hors dimanche", () => {
    expect(boxtalConfigured(env)).toBe(true);
    expect(boxtalConfigured({ ...env, BOXTAL_CONTENT_CODE: "" })).toBe(false);
    const u = new URL(boxtalQuoteUrl({ ...req, fromCity: "Paris" }, env, new Date("2026-10-10T10:00:00Z")));
    expect(u.pathname).toBe("/api/v1/cotation");
    expect(u.searchParams.get("colis_1.longueur")).toBe("30");
    expect(u.searchParams.get("shipper.ville")).toBe("Paris");
    expect(u.searchParams.get("content_code")).toBe("50113");
    expect(nextCollectionDate(new Date("2026-10-10T10:00:00Z"))).toBe("2026-10-12"); // samedi → lundi
  });
  it("lit les offres XML (HT/TTC, dépôt, livraison, caractéristiques) et les erreurs", () => {
    const q = mapBoxtalXml(BOXTAL_XML, "t");
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ carrier: "Colissimo", service: "Colissimo Access", priceInclVat: "8.64", priceExclVat: "7.20", dropOff: true, deliveryToPickupPoint: false, estimatedDelivery: "2026-10-14", restrictions: ["Livraison en 48h", "Sans signature"] });
    expect(q[1]).toMatchObject({ carrier: "Mondial Relay", dropOff: true, deliveryToPickupPoint: true });
    expect(() => mapBoxtalXml("<error><code>auth</code><message>Accès refusé</message></error>", "t")).toThrow(/Accès refusé/);
    expect(() => mapBoxtalXml("<autre/>", "t")).toThrow(/inattendue/);
  });
});

describe("Service de devis", () => {
  it("sans plateforme configurée : aucun prix, état « non configuré » (jamais de tarif inventé)", async () => {
    const r = await quoteShipping(req, {});
    expect(r.quotes).toEqual([]);
    expect(r.providers.map((p) => p.state)).toEqual(["not_configured", "not_configured"]);
  });
  it("une plateforme en erreur n'empêche pas les autres", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("packlink") ? new Response(JSON.stringify(PACKLINK_FIXTURE), { status: 200 }) : new Response("<error><message>Identifiants inconnus</message></error>", { status: 200 }))));
    const r = await quoteShipping(req, { PACKLINK_API_KEY: "pk_test_1234567890", BOXTAL_V1_LOGIN: "a", BOXTAL_V1_PASSWORD: "b", BOXTAL_CONTENT_CODE: "1" });
    expect(r.quotes).toHaveLength(2);
    expect(r.providers).toEqual([
      expect.objectContaining({ id: "packlink", state: "ok", count: 2 }),
      expect.objectContaining({ id: "boxtal", state: "error", message: expect.stringMatching(/Identifiants inconnus/) }),
    ]);
    const opt = optionFromQuote(r.quotes[0]!, parcel);
    expect(opt && toCents(opt.price)).toBe(1013n);
    expect(opt?.priceTax).toBe("incl");
  });
});

describe("Suivi : numéros et détection du transporteur", () => {
  it("normalise et valide", () => {
    expect(normalizeTrackingNumber(" 6a 1898-7970 674 ")).toBe("6A18987970674");
    expect(validateTrackingNumber("6a18987970674")).toEqual({ ok: true, number: "6A18987970674" });
    expect(validateTrackingNumber("")).toEqual({ ok: false, error: "empty" });
    expect(validateTrackingNumber("ABC12")).toEqual({ ok: false, error: "too_short" });
    expect(validateTrackingNumber("6A1898797067#")).toEqual({ ok: false, error: "invalid_chars" });
  });
  it("S10 avec clé de contrôle, UPS, Amazon, Colissimo, formats numériques ambigus", () => {
    expect(s10CheckDigit("12345678")).toBe(5); // exemple UPU RB123456785GB
    expect(detectCarriers("RB123456785FR")[0]).toMatchObject({ carrier: "laposte", confidence: "high" });
    expect(detectCarriers("RB123456780FR")[0]).toMatchObject({ carrier: "laposte", confidence: "medium" });
    expect(detectCarriers("RB123456785GB")[0]).toMatchObject({ carrier: "other" });
    expect(detectCarriers("1Z5R89390357567127")).toEqual([expect.objectContaining({ carrier: "ups", confidence: "high" })]);
    expect(detectCarriers("TBA000000000000")[0]!.carrier).toBe("amazon");
    expect(detectCarriers("6A18987970674")[0]).toMatchObject({ carrier: "colissimo", confidence: "medium" });
    const digits = detectCarriers("09980000020033");
    expect(digits.every((c) => c.confidence === "low")).toBe(true);
    expect(digits.map((c) => c.carrier)).toContain("dpd");
    expect(detectCarriers("ABCDEFGHIJ")).toEqual([]);
  });
  it("routage : La Poste pour son groupe, Ship24 sinon, rien si aucune clé", () => {
    expect(chooseProvider("colissimo", { laposte: true, ship24: true })).toBe("laposte");
    expect(chooseProvider("ups", { laposte: true, ship24: true })).toBe("ship24");
    expect(chooseProvider("ups", { laposte: true, ship24: false })).toBeNull();
    expect(chooseProvider(null, { laposte: true, ship24: false })).toBe("laposte");
    expect(chooseProvider("colissimo", { laposte: false, ship24: false })).toBeNull();
  });
  it("statuts La Poste et Ship24 ; code inconnu jamais interprété", () => {
    expect(laPosteEventStatus("DI1")).toBe("delivered");
    expect(laPosteEventStatus("MD2")).toBe("out_for_delivery");
    expect(laPosteEventStatus("ET1")).toBe("in_transit");
    expect(laPosteEventStatus("RE1")).toBe("returned");
    expect(laPosteEventStatus("ZZ9")).toBeNull();
    expect(ship24MilestoneStatus("failed_attempt")).toBe("failed_attempt");
    expect(ship24MilestoneStatus("bizarre")).toBe("unknown");
  });
  it("calendrier d'actualisation sobre", () => {
    const now = new Date("2026-10-11T10:00:00Z");
    const created = "2026-10-10T10:00:00Z";
    expect(nextCheckAt("delivered", now, { createdAt: created, checkCount: 3 })).toBeNull();
    expect(nextCheckAt("out_for_delivery", now, { createdAt: created, checkCount: 3 })!.toISOString()).toBe("2026-10-11T12:00:00.000Z");
    expect(nextCheckAt("in_transit", now, { createdAt: created, checkCount: 3 })!.toISOString()).toBe("2026-10-11T14:00:00.000Z");
    expect(nextCheckAt("not_found", now, { createdAt: "2026-10-01T00:00:00Z", checkCount: 9 })).toBeNull();
    expect(nextCheckAt("in_transit", now, { createdAt: "2026-07-01T00:00:00Z", checkCount: 99 })).toBeNull();
  });
  it("alertes : livraison, problème, retard (uniquement avec une date estimée fournie)", () => {
    const base: TrackingSnapshot = { status: "in_transit", statusDetail: null, estimatedDelivery: null, deliveredAt: null, events: [], carrierLabel: null, providerUrl: null };
    const p = { id: "p1", label: "iPhone", trackingNumber: "6A18987970674" };
    const now = new Date("2026-10-15T10:00:00Z");
    expect(trackingAlerts(p, "in_transit", base, now)).toEqual([]);
    expect(trackingAlerts(p, "in_transit", { ...base, status: "delivered", deliveredAt: "2026-10-14T12:00:00+02:00" }, now)).toEqual([expect.objectContaining({ kind: "parcel_delivered", message: "iPhone a été livré le 14/10/2026." })]);
    expect(trackingAlerts(p, "delivered", { ...base, status: "delivered" }, now)).toEqual([]);
    expect(trackingAlerts(p, "in_transit", { ...base, status: "exception", statusDetail: "Adresse incomplète" }, now)[0]).toMatchObject({ kind: "parcel_problem", severity: "warning" });
    expect(trackingAlerts(p, "in_transit", { ...base, estimatedDelivery: "2026-10-13" }, now)[0]).toMatchObject({ kind: "parcel_delayed", dedupeKey: "parcel_delayed:p1:2026-10-13" });
    expect(trackingAlerts(p, "in_transit", { ...base, estimatedDelivery: "2026-10-14" }, new Date("2026-10-14T20:00:00Z"))).toEqual([]); // jour estimé pas encore écoulé
  });
});

/** Réponse au format de La Poste « Suivi v2 » (champs de la bibliothèque communautaire debuss/lapostesuivi). */
const LAPOSTE_200 = {
  lang: "fr_FR",
  returnCode: 200,
  shipment: {
    idShip: "6A18987970674",
    product: "colissimo",
    isFinal: false,
    event: [
      { order: 99, label: "Votre Colissimo va bientôt nous être confié !", date: "2026-10-10T15:05:47+02:00", code: "DR1" },
      { order: 100, label: "Votre colis est en transit sur nos plateformes logistiques.", date: "2026-10-11T01:25:12+02:00", code: "ET1" },
    ],
    estimDate: "2026-10-13T00:00:00+02:00",
    url: "https://www.laposte.fr/outils/suivre-vos-envois?code=6A18987970674",
  },
};

describe("Connecteur La Poste Suivi v2", () => {
  it("statut du dernier événement connu, date estimée de l'API, lien officiel", () => {
    const s = mapLaPosteResponse(LAPOSTE_200, 200);
    expect(s.status).toBe("in_transit");
    expect(s.events.map((e) => e.code)).toEqual(["ET1", "DR1"]);
    expect(s.estimatedDelivery).toBe("2026-10-13T00:00:00+02:00");
    expect(s.carrierLabel).toBe("Colissimo");
    expect(s.providerUrl).toMatch(/^https:\/\/www\.laposte\.fr/);
  });
  it("404 = numéro inconnu ; code d'événement inconnu = statut inconnu (rien d'inventé)", () => {
    expect(mapLaPosteResponse({ returnCode: 404, returnMessage: "Not Found" }, 404).status).toBe("not_found");
    const s = mapLaPosteResponse({ returnCode: 200, shipment: { event: [{ code: "QQ1", label: "Étape", date: "2026-10-11T10:00:00Z" }] } }, 200);
    expect(s.status).toBe("unknown");
    expect(s.estimatedDelivery).toBeNull();
  });
  it("appel réel simulé : en-tête X-Okapi-Key, numéro dans le chemin", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => (seen.push(url, (init.headers as Record<string, string>)["X-Okapi-Key"]!), new Response(JSON.stringify(LAPOSTE_200), { status: 200 }))));
    const s = await laPosteTrack("6A18987970674", { LAPOSTE_OKAPI_KEY: "okapi-key-123456" });
    expect(seen).toEqual(["https://api.laposte.fr/suivi/v2/idships/6A18987970674?lang=fr_FR", "okapi-key-123456"]);
    expect(s.status).toBe("in_transit");
    await expect(laPosteTrack("6A18987970674", {})).rejects.toThrow(/LAPOSTE_OKAPI_KEY/);
  });
});

/** Extrait de l'exemple de la spécification OpenAPI officielle Ship24. */
const SHIP24_200 = {
  data: {
    trackings: [
      {
        tracker: { trackerId: "26148317-7502-d3ac-44a9-546d240ac0dd", trackingNumber: "9400115901047177598206", isSubscribed: true },
        shipment: { statusCode: "delivery_delivered", statusCategory: "delivery", statusMilestone: "delivered", delivery: { estimatedDeliveryDate: "2021-03-04T18:00:00" } },
        events: [
          { status: "Out for delivery", occurrenceDatetime: "2021-03-04T10:12:57", location: "SAN RAFAEL, CA 94901", courierCode: "us-post", statusMilestone: "out_for_delivery" },
          { status: "Delivered to the addressee", occurrenceDatetime: "2021-03-04T17:12:57", location: "SAN RAFAEL, CA 94901", courierCode: "us-post", statusMilestone: "delivered" },
        ],
        statistics: { timestamps: { deliveredDatetime: "2021-03-04T17:12:57" } },
      },
    ],
  },
};

describe("Connecteur Ship24", () => {
  it("lit le jalon, les événements triés, la date estimée et la livraison", () => {
    const s = mapShip24Response(SHIP24_200);
    expect(s.status).toBe("delivered");
    expect(s.events[0]!.label).toBe("Delivered to the addressee");
    expect(s.deliveredAt).toBe("2021-03-04T17:12:57");
    expect(s.carrierLabel).toBe("us-post");
    expect(mapShip24Response({ data: { trackings: [] } }).status).toBe("not_found");
    expect(() => mapShip24Response({ nope: 1 })).toThrow(/inattendue/);
  });
  it("POST avec Bearer, sans donnée client ; numéro refusé → introuvable", async () => {
    let body = "";
    let auth = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => ((body = String(init.body)), (auth = (init.headers as Record<string, string>).Authorization!), new Response(JSON.stringify(SHIP24_200), { status: 200 }))));
    await ship24Track("9400115901047177598206", { destinationCountry: "US" }, { SHIP24_API_KEY: "ship24-key-123456" });
    expect(auth).toBe("Bearer ship24-key-123456");
    expect(JSON.parse(body)).toEqual({ trackingNumber: "9400115901047177598206", destinationCountryCode: "US" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [] }), { status: 400 })));
    expect((await ship24Track("123", {}, { SHIP24_API_KEY: "ship24-key-123456" })).status).toBe("not_found");
  });
});

/** Client administrateur minimal : enregistre les mises à jour et les alertes. */
function fakeAdmin() {
  const updates: Record<string, unknown>[] = [];
  const alerts: Record<string, unknown>[] = [];
  const admin = {
    from(table: string) {
      const chain = {
        update(row: Record<string, unknown>) {
          updates.push({ table, ...row });
          return { eq: async () => ({ error: null }) };
        },
        select() {
          const q = { eq: () => q, neq: () => q, maybeSingle: async () => ({ data: null, error: null }) };
          return q;
        },
        insert: async (row: Record<string, unknown>) => (alerts.push(row), { error: null }),
      };
      return chain;
    },
  };
  return { admin: admin as never, updates, alerts };
}

describe("Service de suivi (actualisation)", () => {
  const row = { id: "p1", organization_id: "o1", tracking_number: "6A18987970674", carrier_code: "colissimo", label: "iPhone", status: "in_transit", destination_country: null, created_at: "2026-10-10T08:00:00Z", check_count: 2, archived_at: null };
  const now = new Date("2026-10-11T10:00:00Z");

  it("sans clé : aucun statut écrit, nouvel essai programmé, message clair", async () => {
    const f = fakeAdmin();
    const r = await refreshParcel(f.admin, row, now, {});
    expect(r).toMatchObject({ checked: false, provider: null, message: expect.stringMatching(/Aucune API de suivi/) });
    expect(f.updates[0]).not.toHaveProperty("status");
    expect(f.updates[0]).toMatchObject({ next_check_at: "2026-10-11T22:00:00.000Z" });
  });
  it("avec La Poste : statut et événements de l'API enregistrés, alerte de livraison", async () => {
    const f = fakeAdmin();
    const delivered: TrackingSnapshot = { status: "delivered", statusDetail: "Votre colis est livré.", estimatedDelivery: null, deliveredAt: "2026-10-11T09:00:00+02:00", events: sortEvents([{ at: "2026-10-11T09:00:00+02:00", label: "Votre colis est livré.", location: null, status: "delivered", code: "DI1" }]), carrierLabel: "Colissimo", providerUrl: null };
    const r = await refreshParcel(f.admin, row, now, { LAPOSTE_OKAPI_KEY: "okapi-key-123456" }, { laposte: async () => delivered, ship24: async () => { throw new Error("ne doit pas être appelé"); } });
    expect(r).toMatchObject({ checked: true, provider: "laposte", status: "delivered" });
    expect(f.updates[0]).toMatchObject({ status: "delivered", provider: "laposte", next_check_at: null, check_count: 3, last_error: null });
    expect(f.alerts[0]).toMatchObject({ type: "parcel_delivered", dedupe_key: "parcel_delivered:p1", organization_id: "o1" });
  });
  it("API en erreur : statut connu conservé, erreur enregistrée, nouvel essai dans 6 h", async () => {
    const f = fakeAdmin();
    const { ConnectorError } = await import("@/integrations/core/errors");
    const r = await refreshParcel(f.admin, row, now, { SHIP24_API_KEY: "ship24-key-123456", LAPOSTE_OKAPI_KEY: "okapi-key-123456" }, { laposte: async () => { throw new ConnectorError("RATE_LIMITED", "laposte", "Quota API laposte atteint (HTTP 429) : réessayez dans quelques minutes."); }, ship24: async () => { throw new Error("non"); } });
    expect(r).toMatchObject({ checked: false, provider: "laposte" });
    expect(f.updates[0]).not.toHaveProperty("status");
    expect(f.updates[0]).toMatchObject({ next_check_at: "2026-10-11T16:00:00.000Z", last_error: expect.stringMatching(/Quota/) });
    expect(f.alerts).toEqual([]);
  });
});
