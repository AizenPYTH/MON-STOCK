import { describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { criteriaFromParsedQuery } from "@/domain/sourcing/offer-filter";
import { bestSavings, filterWithConfirmedLinks, rawOfferToPipelineOffer, runOfferPipeline, savingsOf, summarizeRejections, type PipelineOffer } from "@/domain/sourcing/search-pipeline";
import { isOutOfStock, rankOpportunities } from "@/domain/sourcing/ranking";
import { dedupeOffers } from "@/domain/sourcing/dedupe";

const NOW = new Date("2026-10-08T10:00:00.000Z");

function offer(o: Partial<PipelineOffer> & { id: string }): PipelineOffer {
  return {
    title: "Apple iPhone 13 128GB Noir Grade A",
    brand: "apple",
    model: "iphone 13",
    modelInferred: false,
    storage: "128GB",
    color: "black",
    grade: "A",
    condition: "refurbished",
    price: 300,
    status: "active",
    anomalies: [],
    lastSeenAt: "2026-10-08T09:00:00.000Z",
    supplierVerified: true,
    unitPrice: 300,
    landedUnitCost: null,
    moq: 1,
    minimumOrderValue: null,
    stockKnown: true,
    availableQuantity: 50,
    deliveryDays: 3,
    supplierReliability: null,
    freshnessHours: 1,
    dataCompleteness: 0.8,
    marginPerUnit: null,
    ...o,
  };
}

const criteria = criteriaFromParsedQuery(parseQuery("iPhone 13 128 Go Grade A"));

describe("pipeline de résultats : filtre → déduplication → classement", () => {
  it("écarte les mauvaises offres avec raison, groupe les raisons et classe les conservées", () => {
    const offers = [
      offer({ id: "ok-cheap", price: 280, unitPrice: 280 }),
      offer({ id: "ok", price: 300, unitPrice: 300 }),
      offer({ id: "pro", model: "iphone 13 pro", title: "iPhone 13 Pro 128GB" }),
      offer({ id: "coque", title: "Coque iPhone 13", model: "iphone 13" }),
      offer({ id: "256", storage: "256GB", title: "iPhone 13 256GB" }),
    ];
    const r = runOfferPipeline(criteria, offers, { now: NOW, requestedQuantity: 20, currentUnitCost: 315, currency: "EUR" });
    expect(r.filter.kept.map((k) => k.offer.id).sort()).toEqual(["ok", "ok-cheap"]);
    expect(r.rejection.count).toBe(3);
    expect(r.rejection.groups.map((g) => g.code).sort()).toEqual(["accessory", "model_mismatch", "storage_mismatch"]);
    expect(r.ranking.ranked[0]!.offer.id).toBe("ok-cheap");
    // économie sur le prix unitaire (coût rendu inconnu) : (315 − 280) × 20
    expect(r.bestSavings).toEqual({ offerId: "ok-cheap", amount: 700, perUnit: 35, quantity: 20, basis: "unit" });
    expect(r.warnings.get("ok")).toEqual([]);
  });

  it("aucune économie sans coût actuel, ni si toutes les offres sont plus chères", () => {
    const offers = [offer({ id: "a", unitPrice: 300, price: 300 })];
    expect(runOfferPipeline(criteria, offers, { now: NOW, requestedQuantity: 5 }).bestSavings).toBeNull();
    expect(runOfferPipeline(criteria, offers, { now: NOW, requestedQuantity: 5, currentUnitCost: 290 }).bestSavings).toBeNull();
  });

  it("savingsOf : coût rendu prioritaire (port inclus), sinon prix unitaire signalé", () => {
    const ranked = rankOpportunities([offer({ id: "l", unitPrice: 280, landedUnitCost: 285 })], { requestedQuantity: 10, currentUnitCost: 300 }).ranked[0]!;
    expect(savingsOf(ranked, 300)).toEqual({ amount: 150, perUnit: 15, quantity: 10, basis: "landed" });
    const unit = rankOpportunities([offer({ id: "u", unitPrice: 280, landedUnitCost: null })], { requestedQuantity: 10 }).ranked[0]!;
    expect(savingsOf(unit, 300)).toEqual({ amount: 200, perUnit: 20, quantity: 10, basis: "unit" });
    expect(savingsOf(unit, null)).toBeNull();
    const noPrice = rankOpportunities([offer({ id: "n", unitPrice: null, price: null })], { requestedQuantity: 10 }).ranked[0]!;
    expect(savingsOf(noPrice, 300)).toBeNull();
    expect(bestSavings([unit, noPrice], 250)).toBeNull();
  });

  it("une association SKU confirmée lève une différence d'identité, jamais un accessoire", () => {
    const linked = offer({ id: "linked", model: "iphone 13 mini", linkedToTarget: true });
    const linkedAccessory = offer({ id: "acc", title: "Coque iPhone 13", linkedToTarget: true });
    const r = filterWithConfirmedLinks(criteria, [linked, linkedAccessory], { now: NOW });
    expect(r.kept.map((k) => k.offer.id)).toEqual(["linked"]);
    expect(r.kept[0]!.warnings[0]!.code).toBe("confirmed_link");
    expect(r.rejected.map((x) => x.offer.id)).toEqual(["acc"]);
    expect(r.rejectionCounts).toEqual({ accessory: 1 });
  });

  it("summarizeRejections : une offre compte une fois par raison, tri par nombre décroissant", () => {
    const s = summarizeRejections([
      { reasons: [{ code: "model_mismatch", message: "a" }, { code: "storage_mismatch", message: "b" }] },
      { reasons: [{ code: "model_mismatch", message: "c" }, { code: "model_mismatch", message: "d" }] },
    ]);
    expect(s).toEqual({ count: 2, groups: [{ code: "model_mismatch", label: "Modèle différent", count: 2 }, { code: "storage_mismatch", label: "Stockage différent", count: 1 }] });
  });

  it("dédoublonnage fourni par l'appelant appliqué avant le classement", () => {
    const r = runOfferPipeline(criteria, [offer({ id: "a" }), offer({ id: "b" })], { now: NOW, requestedQuantity: 1, dedupe: (kept) => kept.slice(0, 1) });
    expect(r.unique.map((o) => o.id)).toEqual(["a"]);
    expect(r.ranking.ranked).toHaveLength(1);
  });

  it("dédoublonnage restituant les fusions (dedupeOffers) : compteurs identiques à un second passage, sans le refaire", () => {
    type O = PipelineOffer & { supplierId: string; productKey: string | null; comparablePrice: number | null; lastSeenAt: string | null };
    const mk = (id: string, supplierId: string, productKey: string | null, price: number): O => ({ ...offer({ id, unitPrice: price, price }), supplierId, productKey, comparablePrice: price, lastSeenAt: "2026-10-08T09:00:00.000Z" });
    const offers = [mk("a", "s1", "p1", 300), mk("b", "s1", "p1", 280), mk("c", "s1", "p1", 310), mk("d", "s2", "p1", 290), mk("e", "s2", null, 295)];
    let calls = 0;
    const r = runOfferPipeline<O>(criteria, offers, {
      now: NOW,
      requestedQuantity: 1,
      dedupe: (kept) => {
        calls++;
        return dedupeOffers(kept);
      },
    });
    const reference = dedupeOffers(r.filter.kept.map((k) => k.offer));
    expect(calls).toBe(1);
    expect(r.unique.map((o) => o.id)).toEqual(reference.kept.map((o) => o.id));
    expect([...r.collapsed.entries()]).toEqual([...reference.collapsed.entries()]);
    expect(r.collapsed.get("b")).toBe(2);
    // Déduplication sans compteurs : carte vide (pas d'invention).
    expect(runOfferPipeline(criteria, offers, { now: NOW, requestedQuantity: 1, dedupe: (kept) => kept }).collapsed.size).toBe(0);
  });
});

describe("classement : rupture de stock", () => {
  it("une offre en rupture connue est classée après les offres disponibles et n'a pas le podium", () => {
    const out = offer({ id: "out", unitPrice: 200, price: 200, availableQuantity: 0 });
    const ok = offer({ id: "ok", unitPrice: 300, price: 300 });
    const r = rankOpportunities([out, ok], { requestedQuantity: 1 });
    expect(r.ranked.map((x) => x.offer.id)).toEqual(["ok", "out"]);
    expect(r.podium[0]!.offerId).toBe("ok");
    expect(r.ranked[1]!.why[0]).toMatch(/Rupture de stock/);
    expect(r.highlights.find((h) => h.key === "lowest_price")!.offerId).toBe("out"); // distinction factuelle conservée
    expect(isOutOfStock({ outOfStock: true, stockKnown: false, availableQuantity: null })).toBe(true);
    expect(isOutOfStock({ stockKnown: false, availableQuantity: null })).toBe(false);
  });
});

describe("rawOfferToPipelineOffer (offres non enregistrées)", () => {
  it("normalise, valide, n'invente aucune conversion de devise", () => {
    const eur = rawOfferToPipelineOffer({ externalOfferId: "1", title: "Apple iPhone 13 128GB Noir Grade A", price: 300, currency: "eur", moq: 5, availableQuantity: 10, shippingCost: 10, deliveryMaxDays: 4 }, "x:1", { now: NOW, currency: "EUR", supplierVerified: true });
    expect(eur).toMatchObject({ id: "x:1", brand: "apple", model: "iphone 13", storage: "128GB", grade: "A", condition: "refurbished", unitPrice: 300, moq: 5, availableQuantity: 10, stockKnown: true, deliveryDays: 4, landedUnitCost: 302, freshnessHours: 0, outOfStock: false });
    const usd = rawOfferToPipelineOffer({ externalOfferId: "2", title: "iPhone 13 128GB", price: 300, currency: "USD" }, "x:2", { now: NOW, currency: "EUR", supplierVerified: false });
    expect(usd.unitPrice).toBeNull();
    expect(usd.price).toBeNull();
    expect(usd.stockKnown).toBe(false);
    const zero = rawOfferToPipelineOffer({ externalOfferId: "3", title: "iPhone 13", price: 0, currency: "EUR" }, "x:3", { now: NOW, currency: "EUR", supplierVerified: true });
    expect(zero.status).toBe("suspicious");
    expect(zero.anomalies.map((a) => a.code)).toContain("price_zero");
  });
});
