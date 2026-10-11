import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KARRIO_LIVE_RATING_CARRIERS, karrioConfigured, karrioRateRequest, karrioTrackingStatus, mapKarrioRates } from "@/integrations/shipping/prototypes/karrio";
import { mapSendcloudOptions, sendcloudConfigured, sendcloudShippingOptionsBody } from "@/integrations/shipping/prototypes/sendcloud";
import { decimalText, isPositiveDecimal } from "@/integrations/shipping/prototypes/types";

const fixture = (name: string) => JSON.parse(readFileSync(path.resolve(__dirname, "../fixtures/shipping-prototypes", name), "utf8"));
const NOW = "2026-10-11T08:00:00.000Z";
const REQ = { weightKg: 1, lengthCm: 30, widthCm: 20, heightCm: 10, fromCountry: "FR", fromPostcode: "75011", toCountry: "FR", toPostcode: "69003" };

describe("prototype Sendcloud (réponse réelle du 11/10/2026)", () => {
  const result = mapSendcloudOptions(fixture("sendcloud-shipping-options-fr-1kg.json"), NOW);

  it("garde les 5 offres suivies avec leur prix exact, supplément carburant compris", () => {
    expect(result.quotes.map((q) => [q.service, q.price])).toEqual([
      ["Mondial Relay Point Relais", "4.39"],
      ["Mondial Relay Locker Delivery", "4.29"],
      ["Colissimo Home", "10.71"],
      ["Colissimo Service Point", "8.85"],
      ["Mondial Relay Home Domestic", "6.03"],
    ]);
    const home = result.quotes.find((q) => q.service === "Colissimo Home");
    expect(home?.surcharges).toEqual([{ label: "Fuel surcharge (14.02%)", amount: "1.32" }]);
  });

  it("écarte la lettre non suivie à 0 € au lieu de l'afficher comme un prix", () => {
    expect(result.quotes.some((q) => q.price === "0")).toBe(false);
    expect(result.rejected).toEqual([{ carrier: "Sendcloud", service: "Unstamped letter", reason: "Envoi non suivi : exclu du comparateur." }]);
  });

  it("ne suppose ni la TVA ni un délai absent, et indique l'origine du prix", () => {
    for (const q of result.quotes) {
      expect(q.vatIncluded).toBeNull();
      expect(q.priceBasis).toBe("aggregator_tariff");
    }
    expect(result.quotes.find((q) => q.service === "Mondial Relay Point Relais")?.transitHours).toBeNull();
    expect(result.quotes.find((q) => q.service === "Colissimo Home")?.transitHours).toBe(48);
  });

  it("signale les conditions (point relais, e-mail, téléphone)", () => {
    const relay = result.quotes.find((q) => q.service === "Mondial Relay Point Relais");
    expect(relay?.deliveryToPickupPoint).toBe(true);
    expect(relay?.requirements).toEqual(["Point relais à choisir.", "E-mail du destinataire requis."]);
    expect(result.quotes.find((q) => q.service === "Colissimo Home")?.deliveryToPickupPoint).toBe(false);
  });

  it("écarte un devis en erreur ou sans prix", () => {
    const r = mapSendcloudOptions({ data: [{ code: "x:y", name: "X", carrier: { name: "X" }, functionalities: { tracked: true }, quotes: [], quote_error: { detail: "weight" } }] }, NOW);
    expect(r.quotes).toHaveLength(0);
    expect(r.rejected[0]?.reason).toMatch(/Erreur de devis/);
  });

  it("refuse une réponse sans liste « data »", () => {
    expect(() => mapSendcloudOptions({ detail: "Unauthorized" }, NOW)).toThrow(/inattendue/);
  });

  it("n'envoie que pays et code postal", () => {
    const body = sendcloudShippingOptionsBody({ ...REQ, fromCity: "Paris", toCity: "Lyon" });
    expect(body).toEqual({
      from_address: { country_code: "FR", postal_code: "75011" },
      to_address: { country_code: "FR", postal_code: "69003" },
      parcels: [{ weight: { value: "1", unit: "kg" }, dimensions: { length: "30", width: "20", height: "10", unit: "cm" } }],
      calculate_quotes: true,
    });
    expect(sendcloudConfigured({})).toBe(false);
    expect(sendcloudConfigured({ SENDCLOUD_PUBLIC_KEY: "a", SENDCLOUD_SECRET_KEY: "b" })).toBe(true);
  });
});

describe("prototype Karrio (réponses d'un serveur Karrio 2026.1.32 local)", () => {
  it("ne produit aucun prix quand les connecteurs français échouent ou ne desservent pas la France", () => {
    const r = mapKarrioRates(fixture("karrio-rates-fr-local.json"), NOW);
    expect(r.quotes).toHaveLength(0);
    expect(r.rejected.map((x) => x.carrier).sort()).toEqual(["chronopost", "colissimo", "dpd", "gls"]);
    expect(r.rejected.find((x) => x.carrier === "colissimo")?.reason).toMatch(/parse_rate_response/);
  });

  it("écarte le « 0.0 EUR » de la grille statique GLS au lieu de l'afficher", () => {
    const r = mapKarrioRates(fixture("karrio-rates-de-static.json"), NOW);
    expect(r.quotes).toHaveLength(0);
    expect(r.rejected.find((x) => x.carrier === "gls")?.reason).toMatch(/Grille statique/);
  });

  it("garde un tarif API positif et ignore la ligne « Base Charge »", () => {
    const r = mapKarrioRates(
      {
        rates: [
          { carrier_name: "chronopost", carrier_id: "chrono", service: "chronopost_13", total_charge: 14.2, currency: "EUR", transit_days: 1, extra_charges: [{ name: "Base Charge", amount: 12.5 }, { name: "Fuel", amount: 1.7 }], meta: { service_name: "Chrono 13" } },
          { carrier_name: "ups", carrier_id: "ups", service: "ups_standard", total_charge: 0, currency: "EUR" },
        ],
        messages: [],
      },
      NOW,
    );
    expect(r.quotes).toEqual([
      expect.objectContaining({ carrier: "chronopost", service: "Chrono 13", price: "14.2", transitHours: 24, surcharges: [{ label: "Fuel", amount: "1.7" }], priceBasis: "carrier_api", vatIncluded: null }),
    ]);
    expect(r.rejected).toEqual([{ carrier: "ups", service: "ups_standard", reason: "Prix absent ou nul renvoyé : non affiché." }]);
  });

  it("ne classe en tarification réelle que les connecteurs qui appellent une API", () => {
    for (const c of ["colissimo", "laposte", "dpd", "gls", "hermes", "dhl_parcel_de"]) expect(KARRIO_LIVE_RATING_CARRIERS.has(c)).toBe(false);
    for (const c of ["chronopost", "ups", "dhl_express", "fedex"]) expect(KARRIO_LIVE_RATING_CARRIERS.has(c)).toBe(true);
  });

  it("traduit les statuts de suivi sans en inventer", () => {
    expect(karrioTrackingStatus("delivered")).toEqual({ status: "delivered", carrierFlaggedDelay: false });
    expect(karrioTrackingStatus("delivery_delayed")).toEqual({ status: "in_transit", carrierFlaggedDelay: true });
    expect(karrioTrackingStatus("ready_for_pickup").status).toBe("available_for_pickup");
    expect(karrioTrackingStatus("return_to_sender").status).toBe("returned");
    expect(karrioTrackingStatus("on_hold").status).toBe("exception");
    expect(karrioTrackingStatus(undefined).status).toBe("unknown");
    expect(karrioTrackingStatus("quelque_chose").status).toBe("unknown");
  });

  it("construit la requête sans donnée client et exige une URL https", () => {
    expect(karrioRateRequest(REQ, ["chrono"])).toEqual({
      shipper: { country_code: "FR", postal_code: "75011" },
      recipient: { country_code: "FR", postal_code: "69003" },
      parcels: [{ weight: 1, weight_unit: "KG", length: 30, width: 20, height: 10, dimension_unit: "CM" }],
      carrier_ids: ["chrono"],
    });
    expect(karrioConfigured({ KARRIO_API_URL: "http://127.0.0.1:5002", KARRIO_API_KEY: "x".repeat(40) })).toBe(false);
    expect(karrioConfigured({ KARRIO_API_URL: "https://karrio.example.org", KARRIO_API_KEY: "x".repeat(40) })).toBe(true);
  });
});

describe("montants", () => {
  it("lit les décimaux exacts et détecte zéro", () => {
    expect(decimalText("10.71")).toBe("10.71");
    expect(decimalText(0)).toBe("0");
    expect(decimalText("-1")).toBeNull();
    expect(decimalText("abc")).toBeNull();
    expect(isPositiveDecimal("0.00")).toBe(false);
    expect(isPositiveDecimal("0.01")).toBe(true);
  });
});
