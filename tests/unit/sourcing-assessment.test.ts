import { describe, expect, it } from "vitest";
import { assessCompetitiveness, assessDataConfidence, assessOffer, assessSourceReliability, orderableQuantity, quantityScenarios, type AssessmentInput } from "@/domain/sourcing/assessment";
import type { RadarCostSettings } from "@/domain/sourcing/radar";

const settings: RadarCostSettings = { vatRegime: "margin", vatRate: 20, vatRecoverable: false, marketplaceFeePercent: 12, paymentFeePercent: 0, paymentFeeFixed: 0.35, shippingToCustomer: 8, packagingCost: 1, returnProvisionPercent: 3, importDutyPercent: null };

const base: AssessmentInput = {
  landedUnitCost: 300,
  peerLandedCosts: [320, 340],
  estimatedProfit: 60,
  marginPercent: 15,
  availableQuantity: 12,
  stockStatus: "in_stock",
  moq: 5,
  ageDays: 1,
  priceOrigin: "supplier_communicated",
  taxType: "ht",
  vatRegime: "margin",
  shippingKnown: true,
  deliveryKnown: true,
  gradeOrCondition: true,
  warrantyKnown: true,
  source: { runs: 10, successfulRuns: 10, consecutiveFailures: 0, receivedPurchaseOrders: 4, supplierScore: 82 },
};

describe("appréciation d'une offre : trois notes séparées", () => {
  it("opportunité : bénéfice, stock confirmé, prix récent, coût rendu le plus bas", () => {
    const a = assessOffer(base);
    expect(a.verdict).toBe("opportunity");
    expect(a.competitiveness.reasons[0]).toMatch(/le plus bas parmi 3 offres/);
    expect(a.sourceReliability.score).toBeGreaterThan(70);
    expect(a.dataConfidence.missing).toEqual([]);
  });

  it("100 € sans stock confirmé n'est pas mieux classée que 105 € disponible", () => {
    const cheapUnknown = assessCompetitiveness({ ...base, landedUnitCost: 100, peerLandedCosts: [105], availableQuantity: null, stockStatus: "unknown" });
    const confirmed = assessCompetitiveness({ ...base, landedUnitCost: 105, peerLandedCosts: [100] });
    expect(cheapUnknown.score).toBeLessThanOrEqual(70);
    expect(cheapUnknown.reasons.join(" ")).toMatch(/Stock non confirmé : note plafonnée à 70/);
    expect(confirmed.score!).toBeGreaterThan(cheapUnknown.score!);
    expect(assessOffer({ ...base, landedUnitCost: 100, peerLandedCosts: [105], availableQuantity: null, stockStatus: "unknown" }).verdict).toBe("to_verify");
  });

  it("rupture, perte ou prix très ancien : offre risquée", () => {
    expect(assessOffer({ ...base, availableQuantity: 0, stockStatus: "out_of_stock" }).verdict).toBe("risky");
    expect(assessOffer({ ...base, estimatedProfit: -5, marginPercent: -2 }).verdict).toBe("risky");
    const old = assessOffer({ ...base, ageDays: 45 });
    expect(old.verdict).toBe("risky");
    expect(old.dataConfidence.reasons.join(" ")).toMatch(/45 jours/);
  });

  it("coût rendu inconnu : « données insuffisantes », jamais une note par défaut", () => {
    const a = assessOffer({ ...base, landedUnitCost: null, estimatedProfit: null, marginPercent: null });
    expect(a.verdict).toBe("insufficient_data");
    expect(a.competitiveness).toMatchObject({ score: null, label: "insufficient_data" });
    expect(a.dataConfidence.score).toBeNull();
  });

  it("fournisseur inconnu jamais jugé excellent ; source inconnue sans historique : données insuffisantes", () => {
    expect(assessSourceReliability({ priceOrigin: "unknown", source: null })).toMatchObject({ score: null, label: "insufficient_data" });
    const fresh = assessSourceReliability({ priceOrigin: "verified_live", source: { runs: 20, successfulRuns: 20, consecutiveFailures: 0, receivedPurchaseOrders: 0, supplierScore: null } });
    expect(fresh.score).toBeLessThanOrEqual(70);
    const failing = assessSourceReliability({ priceOrigin: "supplier_communicated", source: { runs: 10, successfulRuns: 5, consecutiveFailures: 3, receivedPurchaseOrders: 0, supplierScore: null } });
    expect(failing.score!).toBeLessThan(40);
    expect(failing.reasons.join(" ")).toMatch(/3 échec\(s\) consécutif/);
  });

  it("confiance des données : champs manquants listés, ancienneté pénalisée", () => {
    const d = assessDataConfidence({ ...base, moq: null, shippingKnown: false, vatRegime: null, warrantyKnown: false, ageDays: 10 });
    expect(d.missing).toEqual(["quantité minimale", "frais de port", "régime de TVA", "garantie"]);
    expect(d.score).toBe(31); // 5/9 → 55,6 − 25
  });

  it("stock inférieur au minimum de commande : plafonné et signalé", () => {
    const c = assessCompetitiveness({ ...base, availableQuantity: 3, moq: 5 });
    expect(c.score).toBeLessThanOrEqual(50);
    expect(c.reasons.join(" ")).toMatch(/inférieur au minimum de commande/);
  });
});

describe("scénarios de quantité", () => {
  it("quantité commandable : minimum et multiple respectés", () => {
    expect(orderableQuantity(7, 5, null)).toBe(7);
    expect(orderableQuantity(7, 5, 5)).toBe(10);
    expect(orderableQuantity(1, null, null)).toBe(1);
    expect(orderableQuantity(3, 10, 4)).toBe(12);
  });

  it("minimum, double, tout le stock : capital et bénéfice total ; transport réparti signalé comme hypothèse", () => {
    const s = quantityScenarios(
      { salePrice: 450, saleLabel: "Prix de vente moyen constaté (30 j)", purchasePrice: 300, purchaseTaxType: "ht", supplierShipping: 40, moq: 5, orderMultiple: null, availableQuantity: 20, supplierOrigin: "eu", originLabel: "BE" },
      settings,
    );
    expect(s.map((x) => [x.quantity, x.label])).toEqual([
      [5, "Quantité minimale"],
      [10, "Deux fois le minimum"],
      [20, "Tout le stock annoncé"],
    ]);
    expect(s[0]!.unitLandedCost).toBe(368); // 300 HT + 20 % de TVA non récupérable + 40 ÷ 5
    expect(s[1]!.unitLandedCost).toBe(364);
    expect(s[0]!.capital).toBe(1840);
    expect(s[2]!.assumption).toMatch(/forfait par commande supposé/);
    expect(s[2]!.totalProfit).toBeCloseTo(s[2]!.unitProfit! * 20, 1);
    expect(s.every((x) => !x.exceedsStock)).toBe(true);
  });

  it("quantité demandée au-delà du stock : signalée ; données manquantes listées", () => {
    const s = quantityScenarios({ salePrice: 450, saleLabel: "x", purchasePrice: 300, purchaseTaxType: "unknown", supplierShipping: null, moq: null, orderMultiple: null, availableQuantity: 3, supplierOrigin: "unknown", originLabel: null }, settings, [10]);
    const ten = s.find((x) => x.quantity === 10)!;
    expect(ten.exceedsStock).toBe(true);
    expect(ten.missing).toEqual(expect.arrayContaining(["type de prix fournisseur (HT ou TTC)", "transport fournisseur"]));
    expect(ten.assumption).toBeNull();
  });
});
