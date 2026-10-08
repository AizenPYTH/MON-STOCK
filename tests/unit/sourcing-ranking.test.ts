import { describe, expect, it } from "vitest";
import { computeProcurement, formatMoney, NOT_AWARDED, qualityFactor, RANKING_WEIGHTS, rankOpportunities, type RankableOffer } from "@/domain/sourcing/ranking";

function offer(partial: Partial<RankableOffer> & { id: string }): RankableOffer {
  return {
    unitPrice: 300,
    landedUnitCost: 310,
    shippingPerOrder: null,
    moq: 1,
    minimumOrderValue: null,
    stockKnown: true,
    availableQuantity: 100,
    deliveryDays: 3,
    grade: "A",
    condition: "refurbished",
    supplierReliability: 80,
    freshnessHours: 2,
    dataCompleteness: 1,
    marginPerUnit: 50,
    ...partial,
  };
}

const award = (r: ReturnType<typeof rankOpportunities>, key: string) => [...r.podium, ...r.highlights].find((a) => a.key === key)!;

describe("computeProcurement", () => {
  it("MOQ ≤ N : achat de N unités, coût total = N × coût rendu", () => {
    const p = computeProcurement(offer({ id: "a", moq: 5 }), 10);
    expect(p).toMatchObject({ unitsToBuy: 10, overstockUnits: 0, moqFeasible: true, goodsCost: 3000, totalCost: 3100, stockSufficient: true, expectedProfit: 500, savings: null });
  });
  it("MOQ > N : coût du MOQ et surplus signalé", () => {
    const p = computeProcurement(offer({ id: "a", moq: 50, landedUnitCost: 200, unitPrice: 190 }), 10);
    expect(p.unitsToBuy).toBe(50);
    expect(p.overstockUnits).toBe(40);
    expect(p.moqFeasible).toBe(false);
    expect(p.totalCost).toBe(10000);
    expect(p.overstockCost).toBe(8000);
    expect(p.notes[0]).toBe("MOQ 50 supérieur à la quantité demandée (10) : achat de 50 unités, 40 en surplus");
  });
  it("port par commande ajouté une fois", () => {
    const p = computeProcurement(offer({ id: "a", landedUnitCost: 300, shippingPerOrder: 25 }), 4);
    expect(p.totalCost).toBe(1225);
  });
  it("minimum de commande en valeur : unités supplémentaires imposées", () => {
    const p = computeProcurement(offer({ id: "a", unitPrice: 100, landedUnitCost: 105, minimumOrderValue: 1000 }), 3);
    expect(p.unitsForMinimumOrderValue).toBe(10);
    expect(p.unitsToBuy).toBe(10);
    expect(p.overstockUnits).toBe(7);
    expect(p.notes.some((n) => n.startsWith("Minimum de commande de"))).toBe(true);
  });
  it("économie pour N unités uniquement si coût actuel et coût rendu connus", () => {
    expect(computeProcurement(offer({ id: "a", landedUnitCost: 280 }), 10, 300).savings).toBe(200);
    expect(computeProcurement(offer({ id: "a", landedUnitCost: 320 }), 10, 300).savings).toBe(-200);
    expect(computeProcurement(offer({ id: "a", landedUnitCost: null }), 10, 300).savings).toBeNull();
    expect(computeProcurement(offer({ id: "a" }), 10, null).savings).toBeNull();
    expect(computeProcurement(offer({ id: "a", landedUnitCost: 280, currentUnitCost: 290 }), 10, 300).savings).toBe(100);
  });
  it("inconnus : aucun coût total, MOQ / stock non communiqués", () => {
    const p = computeProcurement(offer({ id: "a", landedUnitCost: null, moq: null, stockKnown: false, availableQuantity: null, marginPerUnit: null }), 10);
    expect(p.totalCost).toBeNull();
    expect(p.moqFeasible).toBeNull();
    expect(p.stockSufficient).toBeNull();
    expect(p.expectedProfit).toBeNull();
    expect(p.notes).toEqual(expect.arrayContaining(["MOQ non communiqué", "Stock non communiqué", "Coût rendu inconnu : coût total non calculable"]));
  });
  it("stock insuffisant : bénéfice limité aux unités disponibles", () => {
    const p = computeProcurement(offer({ id: "a", availableQuantity: 4, marginPerUnit: 10 }), 10);
    expect(p.stockSufficient).toBe(false);
    expect(p.expectedProfit).toBe(40);
  });
  it("quantité demandée bornée à 1 minimum", () => {
    expect(computeProcurement(offer({ id: "a" }), 0).requestedQuantity).toBe(1);
  });
});

describe("qualityFactor", () => {
  it("neuf > A+ > A > B > C ; inconnu = null", () => {
    expect(qualityFactor("new", null)).toBe(1);
    expect(qualityFactor("refurbished", "A+")).toBe(0.97);
    expect(qualityFactor("refurbished", "A")).toBe(0.95);
    expect(qualityFactor("refurbished", "B")).toBe(0.85);
    expect(qualityFactor("used", "C")).toBe(0.75);
    expect(qualityFactor("refurbished", null)).toBeNull();
    expect(qualityFactor("unknown", null)).toBeNull();
  });
});

describe("rankOpportunities — score composite", () => {
  it("composantes transparentes, total = somme, maximum 100", () => {
    const r = rankOpportunities([offer({ id: "a" })], { requestedQuantity: 10 });
    const x = r.ranked[0]!;
    expect(Object.values(RANKING_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const sum = Object.values(x.components).reduce((s, c) => s + c.points, 0);
    expect(x.score).toBeCloseTo(sum, 5);
    expect(x.components.price.points).toBe(30);
    expect(x.components.moq.points).toBe(15);
    expect(x.unknownFactors).toEqual([]);
  });
  it("une donnée inconnue vaut 0 et est listée", () => {
    const r = rankOpportunities([offer({ id: "a", supplierReliability: null, deliveryDays: null, moq: null, grade: null, stockKnown: false, availableQuantity: null, freshnessHours: null })], { requestedQuantity: 1 });
    const x = r.ranked[0]!;
    expect(x.unknownFactors).toEqual(["état / grade", "MOQ", "fiabilité fournisseur", "délai", "stock", "fraîcheur"]);
    expect(x.components.reliability).toMatchObject({ points: 0, known: false });
    expect(x.why).toEqual(expect.arrayContaining(["Fiabilité fournisseur inconnue", "MOQ non communiqué", "Stock non communiqué", "État / grade non communiqué"]));
  });
  it("base de prix : coût rendu seulement s'il est connu pour toutes les offres", () => {
    expect(rankOpportunities([offer({ id: "a" }), offer({ id: "b" })], { requestedQuantity: 1 }).priceBasis).toBe("landed");
    const mixed = rankOpportunities([offer({ id: "a", landedUnitCost: 250, unitPrice: 300 }), offer({ id: "b", landedUnitCost: null, unitPrice: 280 })], { requestedQuantity: 1 });
    expect(mixed.priceBasis).toBe("unit");
    expect(mixed.ranked.find((x) => x.offer.id === "b")!.effectiveUnitCost).toBe(280);
  });
  it("le prix seul ne suffit pas : une offre un peu plus chère mais complète passe devant", () => {
    const cheapUnknown = offer({ id: "cheap", unitPrice: 280, landedUnitCost: 285, supplierReliability: null, moq: null, stockKnown: false, availableQuantity: null, grade: null, deliveryDays: null, marginPerUnit: null });
    const solid = offer({ id: "solid", unitPrice: 300, landedUnitCost: 305, marginPerUnit: null });
    const r = rankOpportunities([cheapUnknown, solid], { requestedQuantity: 5 });
    expect(r.ranked.map((x) => x.offer.id)).toEqual(["solid", "cheap"]);
    expect(award(r, "lowest_price").offerId).toBe("cheap");
  });
  it("tri déterministe : égalité parfaite départagée par identifiant", () => {
    const r = rankOpportunities([offer({ id: "b" }), offer({ id: "a" }), offer({ id: "c" })], { requestedQuantity: 1 });
    expect(r.ranked.map((x) => x.offer.id)).toEqual(["a", "b", "c"]);
    expect(r.ranked.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
  it("égalité de score : bénéfice puis prix départagent", () => {
    const r = rankOpportunities([offer({ id: "a", marginPerUnit: 10 }), offer({ id: "b", marginPerUnit: 20 })], { requestedQuantity: 1 });
    expect(r.ranked[0]!.offer.id).toBe("b");
  });
  it("phrases « pourquoi » en français", () => {
    const r = rankOpportunities([offer({ id: "a", moq: 20, landedUnitCost: 200, unitPrice: 190, marginPerUnit: 40 })], { requestedQuantity: 10, currentUnitCost: 230 });
    const why = r.ranked[0]!.why;
    expect(why[0]).toBe(`Bénéfice estimé de ${formatMoney(400)} pour 10 unité(s) (${formatMoney(40)} par unité)`);
    expect(why[1]).toBe(`Économie de ${formatMoney(300)} pour 10 unité(s) par rapport à votre coût actuel`);
    expect(why).toContain(`MOQ 20 > 10 demandé(s) : achat de 20 unités (10 en surplus, ${formatMoney(2000)} immobilisés)`);
    expect(why).toContain(`Coût total pour 20 unité(s) : ${formatMoney(4000)}`);
    expect(why).toContain("Fournisseur fiable (score 80/100)");
  });
});

describe("rankOpportunities — podium", () => {
  it("🥇 bénéfice le plus élevé, 🥈 qualité/prix, 🥉 fiabilité — lauréats distincts", () => {
    const offers = [
      offer({ id: "profit", unitPrice: 280, landedUnitCost: 290, marginPerUnit: 70, supplierReliability: 60, grade: "B" }),
      offer({ id: "value", unitPrice: 300, landedUnitCost: 305, marginPerUnit: 50, supplierReliability: 70, grade: "A+" }),
      offer({ id: "reliable", unitPrice: 330, landedUnitCost: 340, marginPerUnit: 20, supplierReliability: 95, grade: "A" }),
    ];
    const r = rankOpportunities(offers, { requestedQuantity: 10 });
    expect(r.podium.map((a) => [a.emoji, a.label, a.offerId])).toEqual([
      ["🥇", "Meilleure opportunité", "profit"],
      ["🥈", "Meilleur rapport qualité / prix", "value"],
      ["🥉", "Fournisseur le plus fiable", "reliable"],
    ]);
    expect(r.podium[0]!.basis).toBe("profit");
    expect(r.podium[0]!.reason).toBe(`Bénéfice estimé le plus élevé : ${formatMoney(700)} pour 10 unité(s)`);
    expect(r.ranked.find((x) => x.offer.id === "profit")!.awards).toContain("best_opportunity");
  });
  it("🥇 privilégie un MOQ réalisable", () => {
    const r = rankOpportunities([offer({ id: "bigmoq", moq: 500, marginPerUnit: 80 }), offer({ id: "ok", moq: 5, marginPerUnit: 60 })], { requestedQuantity: 10 });
    expect(award(r, "best_opportunity").offerId).toBe("ok");
  });
  it("🥇 sur MOQ irréalisable seulement s'il n'y a pas d'autre choix, avec mention du surplus", () => {
    const r = rankOpportunities([offer({ id: "bigmoq", moq: 50, marginPerUnit: 80 })], { requestedQuantity: 10 });
    expect(award(r, "best_opportunity").reason).toContain("MOQ 50 : 40 unité(s) en surplus");
  });
  it("🥇 sans marge connue : meilleur score global (base composite)", () => {
    const r = rankOpportunities([offer({ id: "a", marginPerUnit: null }), offer({ id: "b", marginPerUnit: null, unitPrice: 250, landedUnitCost: 255 })], { requestedQuantity: 1 });
    const gold = award(r, "best_opportunity");
    expect(gold.basis).toBe("composite");
    expect(gold.offerId).toBe("b");
    expect(gold.reason).toMatch(/^Meilleur score global \(\d+(\.\d)?\/100\) — marge inconnue/);
  });
  it("jamais de récompense sur une donnée inconnue", () => {
    const blind = offer({ id: "blind", unitPrice: null, landedUnitCost: null, grade: null, condition: "unknown", supplierReliability: null, deliveryDays: null, moq: null, marginPerUnit: null });
    const r = rankOpportunities([blind], { requestedQuantity: 1 });
    for (const a of [...r.podium, ...r.highlights]) {
      expect(a.offerId).toBeNull();
      expect(a.reason.startsWith(NOT_AWARDED)).toBe(true);
    }
    expect(award(r, "most_reliable").reason).toBe(`${NOT_AWARDED} (aucun fournisseur avec un score de fiabilité)`);
  });
  it("podium distinct : une seule offre éligible ne gagne qu'une place du podium", () => {
    const r = rankOpportunities([offer({ id: "only" })], { requestedQuantity: 1 });
    expect(r.podium[0]!.offerId).toBe("only");
    expect(r.podium[1]!.offerId).toBeNull();
    expect(r.podium[1]!.reason).toBe("non attribué : aucune autre offre éligible");
    const shared = rankOpportunities([offer({ id: "only" })], { requestedQuantity: 1, distinctPodium: false });
    expect(shared.podium.map((a) => a.offerId)).toEqual(["only", "only", "only"]);
  });
  it("🥉 ignore les offres sans score fournisseur ; départage par fraîcheur et stock connu", () => {
    const r = rankOpportunities(
      [offer({ id: "x", supplierReliability: null, marginPerUnit: 90 }), offer({ id: "stale", supplierReliability: 85, freshnessHours: 24 * 10, marginPerUnit: 1 }), offer({ id: "fresh", supplierReliability: 85, freshnessHours: 1, marginPerUnit: 2 })],
      { requestedQuantity: 1, distinctPodium: false },
    );
    expect(award(r, "best_opportunity").offerId).toBe("x");
    expect(award(r, "most_reliable").offerId).toBe("fresh");
    expect(award(r, "most_reliable").reason).toBe("Score fournisseur 85/100, vérifié il y a 1 h, stock communiqué");
  });
  it("distinctions secondaires : prix, délai, MOQ (non exclusives)", () => {
    const r = rankOpportunities([offer({ id: "a", deliveryDays: 1, moq: 10 }), offer({ id: "b", unitPrice: 250, landedUnitCost: 260, deliveryDays: 5, moq: 1 }), offer({ id: "c", deliveryDays: null, moq: null })], { requestedQuantity: 10 });
    expect(award(r, "lowest_price").offerId).toBe("b");
    expect(award(r, "fastest_delivery")).toMatchObject({ offerId: "a", reason: "Livraison sous 1 j", emoji: "🚚" });
    expect(award(r, "lowest_moq")).toMatchObject({ offerId: "b", reason: "MOQ de 1 unité(s)" });
  });
  it("aucune offre", () => {
    const r = rankOpportunities([], { requestedQuantity: 3 });
    expect(r.ranked).toEqual([]);
    expect(r.podium.every((a) => a.offerId === null)).toBe(true);
  });
});
