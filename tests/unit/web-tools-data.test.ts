import { describe, expect, it } from "vitest";
import type { RateCard } from "@/domain/tools/shipping";
import { batchSummary, orderLinkLabel, parcelFromRow, parcelUpdateRow, type ParcelRow } from "@/features/tools/parcels";
import { newPortRateCardInput, rateCardFormFrom, rateCardInputWithBands, rateCardRow, validateRateCardForm, type RateCardForm } from "@/features/tools/rate-cards";
import { evaluateTrackingEntry, parseTrackingLines, queuedText } from "@/features/tools/tracking-input";

const row = (over: Partial<ParcelRow> = {}): ParcelRow => ({
  id: "6f1c1d2e-0000-4000-8000-000000000001",
  tracking_number: "6A12345678901",
  carrier_code: "colissimo",
  carrier_source: "auto",
  label: "iPhone",
  order_id: null,
  destination_country: "FR ",
  provider: null,
  status: "unknown",
  status_detail: null,
  carrier_label: null,
  estimated_delivery: null,
  delivered_at: null,
  events: [{ at: "2026-10-12T10:00:00Z", label: "Pris en charge", location: "Paris", status: "in_transit", code: "PCH" }],
  provider_url: null,
  last_checked_at: null,
  next_check_at: null,
  last_error: null,
  archived_at: null,
  created_at: "2026-10-12T09:00:00Z",
  order: [{ order_number: "A-1", buyer_username: "bob" }],
  ...over,
});

describe("web outils : colis", () => {
  it("lit une ligne tracked_parcels (jointure commande tableau ou objet, transporteur inconnu ignoré)", () => {
    const p = parcelFromRow(row());
    expect(p.order).toEqual({ orderNumber: "A-1", buyer: "bob" });
    expect(p.destinationCountry).toBe("FR");
    expect(p.events).toHaveLength(1);
    expect(parcelFromRow(row({ carrier_code: "pigeon", order: null, events: "x", destination_country: null, carrier_source: "manual" }))).toMatchObject({ carrierCode: null, order: null, events: [], destinationCountry: null, carrierSource: "manual" });
    expect(parcelFromRow(row({ order: { order_number: null, buyer_username: null } })).order).toEqual({ orderNumber: null, buyer: null });
  });

  it("modifications permises : changer de transporteur avance la vérification, archivage daté", () => {
    const now = new Date("2026-10-20T08:00:00.000Z");
    expect(parcelUpdateRow({ carrierCode: "ups" }, now)).toEqual({ carrier_code: "ups", carrier_source: "manual", next_check_at: "2026-10-20T08:00:00.000Z" });
    expect(parcelUpdateRow({ archived: true, label: "  Lot  " }, now)).toEqual({ archived_at: "2026-10-20T08:00:00.000Z", label: "Lot" });
    expect(parcelUpdateRow({ archived: false, orderId: null }, now)).toEqual({ archived_at: null, order_id: null });
    expect(parcelUpdateRow({}, now)).toEqual({});
  });

  it("libellés de commande et résumé d'ajout en série", () => {
    expect(orderLinkLabel({ order_number: null, external_order_id: "12-345", buyer_username: "ann" })).toBe("12-345 · ann");
    expect(orderLinkLabel({ order_number: "A-2", external_order_id: null, buyer_username: null })).toBe("A-2");
    expect(batchSummary(3, 1, 2)).toBe("3 colis ajoutés · 1 déjà suivi · 2 en échec (gardés dans la liste)");
    expect(batchSummary(1, 0, 0)).toBe("1 colis ajouté");
  });
});

describe("web outils : saisie d'un numéro de suivi", () => {
  it("valide, détecte et laisse corriger le transporteur", () => {
    const ups = evaluateTrackingEntry("1z 999 aa1 01 2345 6784", { enabled: false, carrier: null });
    expect(ups.number).toBe("1Z999AA10123456784");
    expect(ups.carrier).toBe("ups");
    expect(ups.detectedText).toBe("UPS détecté");
    const manual = evaluateTrackingEntry("1Z999AA10123456784", { enabled: true, carrier: "dhl" });
    expect(manual.carrier).toBe("dhl");
    expect(manual.detectedText).toBe("DHL choisi");
    expect(evaluateTrackingEntry("abc", { enabled: false, carrier: null }).error).toBe("Numéro trop court (8 caractères minimum).");
    expect(evaluateTrackingEntry("", { enabled: false, carrier: null })).toMatchObject({ number: null, error: null, detectedText: null });
  });

  it("format numérique ambigu : aucune détection forcée", () => {
    const e = evaluateTrackingEntry("12345678", { enabled: false, carrier: null });
    expect(e.carrier).toBeNull();
    expect(e.detectedText).toBe("Transporteur détecté au premier suivi");
    expect(e.candidates[0]?.carrier).toBe("mondial_relay");
  });

  it("liste collée : un numéro par ligne, doublons et lignes illisibles signalés", () => {
    const r = parseTrackingLines("1Z999AA10123456784\n\n  1Z999AA10123456784 \n???\nTBA123456789012", [{ number: "TBA123456789012", carrier: "amazon" }]);
    expect(r.items).toEqual([{ number: "1Z999AA10123456784", carrier: "ups" }]);
    expect(r.duplicates).toEqual(["1Z999AA10123456784", "TBA123456789012"]);
    expect(r.rejected).toEqual(["???"]);
    expect(queuedText({ number: "TBA123456789012", carrier: "amazon" })).toBe("TBA123456789012 · Amazon Logistics");
  });
});

const card: RateCard = {
  id: "c1",
  carrier: "Colissimo",
  service: "Domicile",
  fromCountries: ["FR"],
  toCountries: ["FR", "BE"],
  bands: [
    { maxWeightKg: 0.5, price: "5.25" },
    { maxWeightKg: 1, price: "7.35" },
  ],
  currency: "EUR",
  maxLengthCm: 100,
  maxDimensionsSumCm: null,
  volumetricDivisor: 5000,
  transitDaysMin: 2,
  transitDaysMax: 3,
  tracking: true,
  deliveryMode: "dépôt bureau de poste",
  notes: null,
  verifiedAt: "2026-09-01",
};

describe("web outils : grilles tarifaires", () => {
  it("formulaire prérempli depuis une grille, puis revalidé à l'identique", () => {
    const f = rateCardFormFrom(card);
    expect(f.bands).toEqual([
      { maxWeightKg: "0,5", price: "5,25" },
      { maxWeightKg: "1", price: "7,35" },
    ]);
    expect(f.verifiedToday).toBe(false);
    const v = validateRateCardForm(f, card.verifiedAt, "2026-10-20");
    expect(v).toEqual({ ok: true, input: { ...card, id: undefined, notes: null } as unknown });
  });

  it("nouvelle grille : France → France, vérifiée aujourd'hui", () => {
    const f: RateCardForm = { ...rateCardFormFrom(null), carrier: "Mondial Relay", bands: [{ maxWeightKg: "1", price: "4,40" }] };
    const v = validateRateCardForm(f, null, "2026-10-20");
    expect(v.ok && v.input).toMatchObject({ carrier: "Mondial Relay", fromCountries: ["FR"], toCountries: ["FR"], bands: [{ maxWeightKg: 1, price: "4.4" }], verifiedAt: "2026-10-20", tracking: null });
  });

  it("messages d'erreur (première erreur, comme l'application)", () => {
    const base = rateCardFormFrom(card);
    expect(validateRateCardForm({ ...base, carrier: " " }, null, "2026-10-20")).toEqual({ ok: false, error: "Indiquez le transporteur." });
    expect(validateRateCardForm({ ...base, toText: "FR, BEL" }, null, "2026-10-20")).toEqual({ ok: false, error: "Codes pays invalides : BEL (2 lettres, ex. FR, BE)." });
    expect(validateRateCardForm({ ...base, bands: [{ maxWeightKg: "", price: "" }] }, null, "2026-10-20")).toEqual({ ok: false, error: "Ajoutez au moins une tranche de poids avec son prix." });
    expect(validateRateCardForm({ ...base, divisor: "50" }, null, "2026-10-20")).toEqual({ ok: false, error: "Diviseur volumétrique : valeur entre 1000 et 10000." });
    expect(validateRateCardForm({ ...base, dMin: "5", dMax: "2" }, null, "2026-10-20")).toEqual({ ok: false, error: "Le délai minimal dépasse le délai maximal." });
    expect(validateRateCardForm({ ...base, currency: "E" }, null, "2026-10-20")).toEqual({ ok: false, error: "Devise : code ISO à 3 lettres (ex. EUR)." });
  });

  it("ligne enregistrée : textes nettoyés, vides → null", () => {
    const r = rateCardRow({ ...newPortRateCardInput("Colissimo", [{ maxWeightKg: 0.5, price: "5.25" }], "2026-10-20"), deliveryMode: "  ", notes: " fragile " });
    expect(r).toMatchObject({ carrier: "Colissimo", service: "", from_countries: ["FR"], to_countries: ["FR"], delivery_mode: null, notes: "fragile", verified_at: "2026-10-20", currency: "EUR" });
  });

  it("outil Port : seules les tranches changent et la grille est vérifiée aujourd'hui", () => {
    const input = rateCardInputWithBands(card, [{ maxWeightKg: 0.5, price: "5" }], "2026-10-20");
    expect(input).toMatchObject({ carrier: "Colissimo", volumetricDivisor: 5000, bands: [{ maxWeightKg: 0.5, price: "5" }], verifiedAt: "2026-10-20" });
  });
});
