/**
 * Qualité de l'analyse : type de produit (S-13), rattachement offre → SKU limité aux appareils
 * (I-18), « bonne affaire » fondée sur des annonces publiées (I-19), économie unitaire (S-20).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb, type MemoryDb } from "./helpers/memory-db";
import { analyzeDeal, detectKind, productSignature, type DealComparable, type DealOfferInput } from "@/domain/sourcing/deal-analysis";
import { computeUnitEconomics, EMPTY_COST_SETTINGS, evaluateRadarOffer, PRICE_ORIGIN_LABEL, type RadarCostSettings } from "@/domain/sourcing/radar";
import { normalizeProduct } from "@/domain/sourcing/normalizer";

let db: MemoryDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => db.client }));
vi.mock("@/services/sourcing/fx-rates", () => ({ getFxRate: async () => ({ rate: 1, date: null }) }));

const { storeOffer, storeOffersBatch, productKeyOf } = await import("@/services/sourcing/offer-storage");
const { priceOriginOf } = await import("@/services/radar/radar");

const ORG = "11111111-1111-4111-8111-111111111111";

describe("S-13 : détection du type de produit", () => {
  it.each([
    ["Samsung Galaxy S23 8GB RAM 256GB Noir", "device"],
    ["Xiaomi Redmi Note 12 4GB RAM 128GB", "device"],
    ["Xiaomi Redmi Note 13 8 Go de RAM 256 Go", "device"],
    ["iPhone 12 64GB bundle chargeur", "device"],
    ["iPhone 13 128 Go avec boîte caja original", "device"],
    ["Apple iPhone 14 Pro 128 Go - Vitre arrière fissurée", "device"],
    ["iPhone 13 Pro écran cassé", "device"],
    ["iPhone 12 128 Go + coque offerte", "device"],
    // vraies pièces / accessoires / lots : inchangés
    ["Vitre arrière iPhone 14 Pro violet", "back_glass"],
    ["Coque iPhone 13 128 Go silicone", "case"],
    ["Ecran OLED iPhone 12", "screen"],
    ["Batterie iPhone 11 3110 mAh", "battery"],
    ["Ramka Samsung A52 (rama środkowa)", "frame"],
    ["Lot de 10 iPhone 11 64GB", "lot"],
    ["Carte mère iPhone 13 128 Go", "board"],
  ])("%s → %s", (title, kind) => {
    expect(detectKind(title)).toBe(kind);
  });

  it("téléphone à vitre arrière fissurée : appareil endommagé, jamais comparé à une vitre arrière", () => {
    const sig = productSignature({ title: "Apple iPhone 14 Pro 128 Go - Vitre arrière fissurée" });
    expect(sig).toMatchObject({ kind: "device", damaged: true });
  });
});

describe("I-18 : une pièce n'hérite jamais du SKU de l'appareil qu'elle cite", () => {
  const device = normalizeProduct("Apple iPhone 13 128 Go Noir");
  beforeEach(() => {
    db = memoryDb({ sourcing_products: [{ id: "prod-device", organization_id: ORG, normalized_key: productKeyOf(device, "device"), sku_id: "sku-iphone-13" }], sourcing_offers: [], product_matches: [], skus: [] });
  });
  const ctx = () => ({ supabase: db.client, organizationId: ORG, organizationCurrency: "EUR", supplierId: "sup", sourceId: "src", sourceType: "CSV" as const, defaultCurrency: "EUR", suggestMatches: false, now: new Date("2026-10-22T10:00:00Z") });
  const raw = (id: string, title: string) => ({ externalOfferId: id, title, price: 20, currency: "EUR" });

  it("storeOffer : l'appareil hérite du SKU, la coque « iPhone 13 128 Go » non (clé distincte par type)", async () => {
    await storeOffer(ctx() as never, raw("a", "Apple iPhone 13 128 Go Noir"));
    await storeOffer(ctx() as never, raw("b", "Coque Apple iPhone 13 128 Go Noir"));
    const byId = Object.fromEntries(db.tables.sourcing_offers!.map((o) => [o.external_offer_id, o]));
    expect(byId.a!.sku_id).toBe("sku-iphone-13");
    expect(byId.b!.sku_id).toBeNull();
    const caseProduct = db.tables.sourcing_products!.find((p) => p.id === byId.b!.normalized_product_id)!;
    expect(caseProduct.normalized_key).toMatch(/\|kind:case$/);
  });

  it("écriture en masse : même règle", async () => {
    const r = await storeOffersBatch(ctx() as never, [raw("a", "Apple iPhone 13 128 Go Noir"), raw("c", "Ecran Apple iPhone 13 128 Go Noir")]);
    expect(r.items.every((i) => i.outcome === "stored")).toBe(true);
    const byId = Object.fromEntries(db.tables.sourcing_offers!.map((o) => [o.external_offer_id, o]));
    expect(byId.a!.sku_id).toBe("sku-iphone-13");
    expect(byId.c!.sku_id).toBeNull();
  });
});

const FULL: RadarCostSettings = { vatRegime: "margin", vatRate: 20, vatRecoverable: false, marketplaceFeePercent: 10, paymentFeePercent: 0, paymentFeeFixed: 0, shippingToCustomer: 5, packagingCost: 1, returnProvisionPercent: 0, importDutyPercent: 0 };

describe("I-19 : annonces publiées ≠ ventes observées", () => {
  it("offres eBay (Browse) : origine « annonce publiée », jamais « vérifié en direct »", () => {
    expect(priceOriginOf("API", { adapter: "ebay-browse", library_key: "ebay-fr" })).toBe("marketplace_listing");
    expect(priceOriginOf("API", { adapter: "bigbuy" })).toBe("verified_live");
    const e = evaluateRadarOffer(
      { offerId: "o", supplierName: "eBay", supplierCountry: "FR", title: "iPhone 13 128 Go", sourceUrl: null, price: 300, currency: "EUR", taxType: "ttc", shippingCost: 0, moq: 1, availableQuantity: null, stockStatus: "unknown", lastSeenAt: "2026-10-22T10:00:00Z", priceOrigin: "marketplace_listing", previousPrice: null, saved: false },
      { skuId: "s", code: "C", name: "iPhone 13", currency: "EUR", avgSalePrice30d: 450, salePrice: null, currentCost: null, units30d: 2, quantityAvailable: 0, reorderPoint: null },
      FULL,
      new Date("2026-10-22T12:00:00Z"),
    );
    expect(e.cautions.join(" ")).toContain(PRICE_ORIGIN_LABEL.marketplace_listing);
  });

  it("prix de marché sur annonces eBay : signalé comme prix DEMANDÉS, pas des ventes", () => {
    const offer: DealOfferInput = { offerId: "o1", supplierId: "s1", title: "Apple iPhone 13 128GB Noir Grade A reconditionné", price: 300, originalCurrency: "EUR", orgCurrency: "EUR", taxType: "ttc", shippingCost: 0, moq: 1, supplierCountry: "FR", stockStatus: "in_stock", availableQuantity: 5, lastSeenAt: "2026-10-22T08:00:00Z", marketplace: false, publicPrice: true };
    const listing = (id: string, price: number): DealComparable => ({ offerId: id, supplierId: "ebay", title: "Apple iPhone 13 128GB Noir Grade A reconditionné", price, marketplace: true });
    const d = analyzeDeal(offer, [listing("e1", 420), listing("e2", 430), listing("e3", 440)], FULL, null, new Date("2026-10-22T12:00:00Z"));
    expect(d.marketBasis).toBe("marketplace");
    expect(d.uncertainties.join(" ")).toMatch(/prix DEMANDÉS par les vendeurs, pas des ventes constatées/);
    expect(d.uncertainties.join(" ")).toMatch(/bas des annonces publiées/);
  });
});

describe("S-20 : économie unitaire (TVA, valeur en douane CIF, TVA à l'import)", () => {
  const base = { salePrice: 200, saleLabel: "Vente", purchasePrice: 100, supplierShipping: 20, moq: 2, supplierOrigin: "eu" as const };

  it("prix TTC, TVA récupérable, taux inconnu : le taux manquant est signalé (le TTC n'est plus retenu en silence)", () => {
    const e = computeUnitEconomics({ ...base, purchaseTaxType: "ttc" }, { ...EMPTY_COST_SETTINGS, vatRegime: "normal", vatRecoverable: true });
    expect(e.missing).toContain("taux de TVA (conversion du prix d'achat TTC en HT)");
  });

  it("prix HT, TVA non récupérable, taux inconnu : taux demandé (et non la récupération)", () => {
    const e = computeUnitEconomics({ ...base, purchaseTaxType: "ht" }, { ...EMPTY_COST_SETTINGS, vatRegime: "margin", vatRecoverable: false });
    expect(e.missing).toContain("taux de TVA (TVA non récupérable à ajouter au prix d'achat HT)");
    expect(e.missing).not.toContain("récupération de la TVA sur achats (paramètres de coûts)");
  });

  it("hors UE, TVA non récupérable : droits sur la valeur CIF, puis TVA à l'import sur CIF + droits", () => {
    const e = computeUnitEconomics({ ...base, purchaseTaxType: "ht", supplierOrigin: "non_eu", originLabel: "CN" }, { ...FULL, importDutyPercent: 10 });
    // transport 20 ÷ 2 = 10 ; CIF = 110 ; droits 11 ; TVA import 20 % × 121 = 24,20 ; achat HT non majoré de la TVA fournisseur
    expect(e.landedCost).toBe(145.2);
    expect(e.breakdown.map((l) => l.label)).toEqual(expect.arrayContaining(["Douane / import (10 % de la valeur CIF)", "Douane : TVA à l'import non récupérable (20 %)"]));
  });

  it("hors UE, TVA récupérable : pas de surcoût, avance de TVA signalée ; transport inconnu : base CIF sous-estimée signalée", () => {
    const e = computeUnitEconomics({ ...base, purchaseTaxType: "ht", supplierOrigin: "non_eu" }, { ...FULL, vatRecoverable: true, importDutyPercent: 10 });
    expect(e.landedCost).toBe(121);
    expect(e.cautions.join(" ")).toMatch(/TVA à l'import avancée/);
    const noShip = computeUnitEconomics({ ...base, supplierShipping: null, purchaseTaxType: "ht", supplierOrigin: "non_eu" }, { ...FULL, vatRecoverable: true, importDutyPercent: 10 });
    expect(noShip.cautions.join(" ")).toMatch(/sans le transport/);
  });

  it("transport réparti sur la quantité réellement achetée (scénario), pas toujours sur le minimum", () => {
    const e = computeUnitEconomics({ ...base, purchaseTaxType: "ht", quantity: 4 }, { ...FULL, vatRecoverable: true });
    expect(e.breakdown).toEqual(expect.arrayContaining([{ label: "Transport fournisseur (÷ 4)", amount: 5 }]));
  });
});
