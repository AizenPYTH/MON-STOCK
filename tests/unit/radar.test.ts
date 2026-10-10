import { describe, expect, it } from "vitest";
import { compareRadar, EMPTY_COST_SETTINGS, evaluateRadarOffer, freshnessOf, missingSettings, type RadarCostSettings, type RadarOfferInput, type RadarSkuInput } from "@/domain/sourcing/radar";

/**
 * Radar d'opportunités : montants vérifiés à la main, coûts manquants jamais supposés nuls,
 * TVA jamais supposée récupérable, données anciennes signalées.
 */
const NOW = new Date("2026-10-10T12:00:00Z");
const settings: RadarCostSettings = {
  vatRegime: "normal",
  vatRate: 20,
  vatRecoverable: true,
  marketplaceFeePercent: 12,
  paymentFeePercent: 0,
  paymentFeeFixed: 0.35,
  shippingToCustomer: 8,
  packagingCost: 1.5,
  returnProvisionPercent: 2,
  importDutyPercent: null,
};
const offer = (o: Partial<RadarOfferInput> = {}): RadarOfferInput => ({
  offerId: "o1",
  supplierName: "Fournisseur",
  supplierCountry: "FR",
  title: "iPhone 13 128 Go Noir grade A",
  sourceUrl: null,
  price: 300,
  currency: "EUR",
  taxType: "ht",
  shippingCost: 20,
  moq: 2,
  availableQuantity: 5,
  stockStatus: "in_stock",
  lastSeenAt: "2026-10-10T08:00:00Z",
  priceOrigin: "verified_live",
  previousPrice: null,
  saved: false,
  ...o,
});
const sku = (s: Partial<RadarSkuInput> = {}): RadarSkuInput => ({ skuId: "s1", code: "IP13-128-NR-A", name: "iPhone 13", currency: "EUR", avgSalePrice30d: 600, salePrice: 620, currentCost: 330, units30d: 4, quantityAvailable: 1, reorderPoint: 2, ...s });

describe("calcul économique", () => {
  it("régime normal, TVA récupérable : CA HT, coût rendu, marge brute, frais, bénéfice", () => {
    const e = evaluateRadarOffer(offer(), sku(), settings, NOW);
    expect(e.revenue).toBe(600);
    expect(e.revenueExVat).toBe(500);
    expect(e.purchaseCost).toBe(300);
    expect(e.landedCost).toBe(310); // 300 + 20 / 2
    expect(e.grossMargin).toBe(190);
    // 72 (12 %) + 0.35 + 8 + 1.5 + 12 (2 %) = 93.85
    expect(e.estimatedProfit).toBe(96.15);
    expect(e.marginPercent).toBeCloseTo(16.03, 1); // 96.15 / 600
    expect(e.missing).toEqual([]);
    expect(e.status).toBe("profitable");
    expect(e.reasons.join(" ")).toMatch(/9 % sous votre coût d'achat/);
    expect(e.reasons.join(" ")).toMatch(/Stock bas \(1\)/);
  });

  it("régime de la marge : TVA due sur la marge seulement", () => {
    const e = evaluateRadarOffer(offer(), sku(), { ...settings, vatRegime: "margin" }, NOW);
    expect(e.revenueExVat).toBe(600);
    // TVA sur marge = (600 − 310) × 20 / 120 = 48.33 ; marge brute = 600 − 310 − 48.33
    expect(e.grossMargin).toBe(241.67);
    expect(e.breakdown.find((l) => l.label === "TVA sur marge")?.amount).toBe(48.33);
  });

  it("TVA non récupérable : ajoutée au prix HT ; jamais supposée récupérable", () => {
    const notRecoverable = evaluateRadarOffer(offer(), sku(), { ...settings, vatRecoverable: false }, NOW);
    expect(notRecoverable.purchaseCost).toBe(360);
    const unknown = evaluateRadarOffer(offer({ taxType: "ttc" }), sku(), { ...settings, vatRecoverable: null }, NOW);
    expect(unknown.purchaseCost).toBe(300); // TTC payé, rien de déduit
    expect(unknown.missing).toContain("récupération de la TVA sur achats (paramètres de coûts)");
    expect(unknown.status).toBe("estimated");
    const recoverable = evaluateRadarOffer(offer({ taxType: "ttc" }), sku(), settings, NOW);
    expect(recoverable.purchaseCost).toBe(250);
  });

  it("coûts inconnus listés, bénéfice partiel jamais présenté comme certain", () => {
    const e = evaluateRadarOffer(offer({ shippingCost: null, taxType: "unknown" }), sku(), { ...EMPTY_COST_SETTINGS }, NOW);
    expect(e.status).toBe("estimated");
    expect(e.missing).toEqual(
      expect.arrayContaining(["type de prix fournisseur (HT ou TTC)", "transport fournisseur", "régime de TVA (normal, marge ou franchise)", "commission marketplace", "frais de paiement", "expédition au client", "emballage", "provision retours / garantie"]),
    );
    expect(e.breakdown.at(-1)?.label).toBe("Bénéfice estimé (coûts connus seulement)");
    expect(missingSettings(EMPTY_COST_SETTINGS)).toHaveLength(8);
  });

  it("fournisseur hors UE : douane demandée ; appliquée si le taux est connu", () => {
    const e = evaluateRadarOffer(offer({ supplierCountry: "US" }), sku(), settings, NOW);
    expect(e.missing).toContain("droits de douane (fournisseur hors UE : US)");
    const withDuty = evaluateRadarOffer(offer({ supplierCountry: "US" }), sku(), { ...settings, importDutyPercent: 5 }, NOW);
    expect(withDuty.landedCost).toBe(325); // 300 + 10 + 15
  });

  it("sans prix de vente ni prix fournisseur, ou devises différentes : données insuffisantes", () => {
    expect(evaluateRadarOffer(offer(), sku({ avgSalePrice30d: null, salePrice: null }), settings, NOW).status).toBe("insufficient_data");
    expect(evaluateRadarOffer(offer({ price: null }), sku(), settings, NOW).status).toBe("insufficient_data");
    const fx = evaluateRadarOffer(offer({ currency: "USD" }), sku(), settings, NOW);
    expect(fx.status).toBe("insufficient_data");
    expect(fx.missing[0]).toMatch(/aucune conversion supposée/);
  });

  it("offre non rentable reconnue comme telle", () => {
    const e = evaluateRadarOffer(offer({ price: 520 }), sku(), settings, NOW);
    expect(e.status).toBe("unprofitable");
    expect(e.estimatedProfit).toBeLessThan(0);
  });
});

describe("qualité et fraîcheur des données", () => {
  it("prix ancien : signalé et jamais « rentable vérifié »", () => {
    expect(freshnessOf("2026-10-09T12:00:00Z", NOW)).toEqual({ freshness: "fresh", ageDays: 1 });
    expect(freshnessOf("2026-10-05T12:00:00Z", NOW).freshness).toBe("recent");
    expect(freshnessOf(null, NOW).freshness).toBe("unknown");
    const e = evaluateRadarOffer(offer({ lastSeenAt: "2026-09-20T12:00:00Z" }), sku(), settings, NOW);
    expect(e.freshness).toBe("stale");
    expect(e.status).toBe("estimated");
    expect(e.cautions.join(" ")).toMatch(/il y a 20 jours/);
  });

  it("origine du prix affichée (catalogue importé ≠ vérifié en direct)", () => {
    const e = evaluateRadarOffer(offer({ priceOrigin: "catalog_import" }), sku(), settings, NOW);
    expect(e.cautions).toContain("Prix importé d'un catalogue fournisseur.");
  });

  it("baisse de prix détectée depuis l'historique", () => {
    const e = evaluateRadarOffer(offer({ previousPrice: 340 }), sku(), settings, NOW);
    expect(e.reasons.join(" ")).toMatch(/baisse de 12 %/);
  });

  it("tri : rentables d'abord, puis par score / bénéfice", () => {
    const items = [
      { offer: offer({ price: 520 }), evaluation: evaluateRadarOffer(offer({ price: 520 }), sku(), settings, NOW) },
      { offer: offer({ price: 250 }), evaluation: evaluateRadarOffer(offer({ price: 250 }), sku(), settings, NOW) },
      { offer: offer(), evaluation: evaluateRadarOffer(offer(), sku(), settings, NOW) },
    ];
    const sorted = [...items].sort(compareRadar("profit")).map((i) => i.offer.price);
    expect(sorted).toEqual([250, 300, 520]);
    expect([...items].sort(compareRadar("score"))[0]!.offer.price).toBe(250);
  });
});
