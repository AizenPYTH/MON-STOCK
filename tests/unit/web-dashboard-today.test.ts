import { describe, expect, it } from "vitest";
import {
  barcodeLevel,
  bestOfferFor,
  buildTasks,
  lostRevenue30d,
  marginTodayPercent,
  outOfStockSalesShare,
  pickPriority,
  radarOpportunities,
  saleStatus,
  saleTimeLabel,
  sceneDateLabel,
  setupSteps,
  stockLevelHref,
  type PriorityCandidate,
  type TaskInput,
} from "@/features/dashboard/today.pure";

const NOW = new Date("2026-10-20T10:00:00Z"); // 12:00 à Paris

describe("marge du jour", () => {
  const order = (over: Partial<{ fee: number | null; cost: number | null; currency: string; placed: string }> = {}) => ({
    currency: over.currency ?? "EUR",
    fee_total: over.fee === undefined ? 10 : over.fee,
    placed_at: over.placed ?? "2026-10-20T08:00:00Z",
    items: [{ quantity: 2, unit_price: 50, sku: { cost_price: over.cost === undefined ? 20 : over.cost, currency: "EUR" } }],
  });
  it("calcule la marge quand tout est connu", () => {
    // CA 100, coût 40, frais 10 → 50 %
    expect(marginTodayPercent([order()], "EUR", NOW)).toBe(50);
  });
  it("renvoie null (jamais 0) si un coût, des frais ou la devise manquent", () => {
    expect(marginTodayPercent([order({ cost: null })], "EUR", NOW)).toBeNull();
    expect(marginTodayPercent([order({ fee: null })], "EUR", NOW)).toBeNull();
    expect(marginTodayPercent([order({ currency: "USD" })], "EUR", NOW)).toBeNull();
    expect(marginTodayPercent([], "EUR", NOW)).toBeNull();
  });
  it("ignore les commandes d'hier (jour civil de Paris)", () => {
    expect(marginTodayPercent([order({ placed: "2026-10-19T21:30:00Z", cost: null }), order()], "EUR", NOW)).toBe(50);
  });
});

describe("libellés", () => {
  it("date de scène et heure des ventes", () => {
    expect(sceneDateLabel(NOW)).toMatch(/^Mar\.? 20 oct\.?$/);
    expect(saleTimeLabel("2026-10-20T07:12:00Z", NOW)).toBe("09:12");
    expect(saleTimeLabel("2026-10-19T20:14:00Z", NOW)).toBe("hier 22:14");
    expect(saleTimeLabel(null, NOW)).toBe("—");
  });
  it("« À expédier » seulement pour une vente marketplace payée", () => {
    expect(saleStatus("paid", "ebay").label).toBe("À expédier");
    expect(saleStatus("paid", "manual").label).toBe("Payée");
    expect(saleStatus("shipped", "ebay").label).toBe("Expédiée");
  });
});

describe("stock", () => {
  it("niveaux du code-barres et liens filtrés", () => {
    expect(barcodeLevel("out_of_stock")).toBe("out");
    expect(barcodeLevel("at_risk")).toBe("low");
    expect(barcodeLevel("normal")).toBe("ok");
    expect(stockLevelHref("low")).toBe("/stock?status=low");
    expect(stockLevelHref("all")).toBe("/stock");
  });
  it("part des ventes en rupture : null sans vente", () => {
    expect(outOfStockSalesShare([{ skuId: "a", units30d: 0, available: 0, level: "out_of_stock" }])).toBeNull();
    expect(
      outOfStockSalesShare([
        { skuId: "a", units30d: 3, available: 0, level: "out_of_stock" },
        { skuId: "b", units30d: 7, available: 4, level: "normal" },
      ]),
    ).toBe(30);
  });
});

describe("priorité", () => {
  const sku = (id: string, over: Partial<PriorityCandidate>): PriorityCandidate => ({ skuId: id, code: id, name: id, category: null, level: "out_of_stock", available: 0, units30d: 5, salePrice: 100, daysOfCover: 0, ...over });
  it("CA perdu inconnu si le prix de vente est inconnu", () => {
    expect(lostRevenue30d({ units30d: 4, salePrice: null })).toBeNull();
    expect(lostRevenue30d({ units30d: 4, salePrice: 25 })).toBe(100);
  });
  it("préfère la rupture la plus coûteuse qui a une offre, sinon la plus coûteuse", () => {
    const list = [sku("a", { units30d: 10 }), sku("b", { units30d: 3 }), sku("c", { units30d: 0 })];
    expect(pickPriority(list, (id) => id === "b")?.skuId).toBe("b");
    expect(pickPriority(list, () => false)?.skuId).toBe("a");
  });
  it("sans rupture vendue : stock faible avec offre ; sinon rien", () => {
    const list = [sku("x", { level: "low", available: 2 }), sku("y", { level: "normal", available: 9 })];
    expect(pickPriority(list, (id) => id === "x")?.skuId).toBe("x");
    expect(pickPriority(list, () => false)).toBeNull();
  });
  it("meilleure offre = prix connu le plus bas du SKU", () => {
    const items = [
      { sku: { id: "a" }, offer: { price: 50 } },
      { sku: { id: "a" }, offer: { price: null } },
      { sku: { id: "a" }, offer: { price: 40 } },
      { sku: { id: "b" }, offer: { price: 10 } },
    ];
    expect(bestOfferFor(items, "a")?.offer.price).toBe(40);
    expect(bestOfferFor(items, "z")).toBeNull();
  });
  it("opportunités : rentables ou estimées à bénéfice positif, 3 au plus", () => {
    const it = (status: string, p: number | null) => ({ evaluation: { status, estimatedProfit: p } });
    const out = radarOpportunities([it("unprofitable", 5), it("estimated", -1), it("profitable", 3), it("estimated", 2), it("insufficient_data", null), it("profitable", 1), it("profitable", 9)]);
    expect(out.map((o) => o.evaluation.estimatedProfit)).toEqual([3, 2, 1]);
  });
});

describe("à traiter", () => {
  const base: TaskInput = { now: NOW, outOfStock: 0, atRisk: 0, low: 0, negativeStock: 0, toShip: 0, pendingSales: 0, unmappedListings: 0, syncFailed24h: 0, openAlerts: 0, toReplenish: null, unknownCostWithSales: 0, jobs: [], accounts: [], channels: [] };
  const job = (id: string, status: string, startedAt: string, supplierId = "s1") => ({ id, supplierId, supplierName: "Brico-Phone", fileName: "f.csv", status, message: "Colonne « prix » introuvable", startedAt, counts: { read: 10, created: 0, updated: 0, invalid: 2, unrecognized: 0 } });
  it("aucune ligne sans fait observé", () => {
    expect(buildTasks(base)).toEqual([]);
  });
  it("classe par gravité et mène à la résolution", () => {
    const tasks = buildTasks({ ...base, outOfStock: 3, toShip: 4, low: 2, accounts: [{ key: "foxway", name: "Foxway", status: "error", lastError: "Identifiants refusés" }], jobs: [job("j1", "failed", "2026-10-20T07:00:00Z")] });
    expect(tasks.map((t) => t.key)).toEqual(["job-j1", "acc-foxway", "out", "ship", "low"]);
    expect(tasks[0]).toMatchObject({ title: "Import échoué · Brico-Phone", href: "/sourcing/imports/j1", cta: "Rapport" });
    expect(tasks.find((t) => t.key === "ship")).toMatchObject({ title: "4 commandes à expédier", href: "/sales?status=paid" });
    expect(tasks.find((t) => t.key === "out")?.href).toBe("/stock?status=out_of_stock");
  });
  it("un échec corrigé par un import plus récent n'est plus à traiter ; les imports anciens sont ignorés", () => {
    expect(buildTasks({ ...base, jobs: [job("old", "failed", "2026-10-19T07:00:00Z"), job("new", "completed", "2026-10-20T07:00:00Z")] })).toEqual([]);
    expect(buildTasks({ ...base, jobs: [job("ancient", "failed", "2026-09-01T07:00:00Z")] })).toEqual([]);
  });
  it("connexion de canal expirée ou en erreur", () => {
    const tasks = buildTasks({ ...base, channels: [{ key: "c1", name: "eBay", state: "expired", detail: "Jeton expiré" }, { key: "c2", name: "Boutique", state: "manual", detail: null }] });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: "Connexion eBay expirée", href: "/settings/integrations" });
  });
});

describe("bien démarrer", () => {
  it("masque les étapes à l'état inconnu", () => {
    const steps = setupSteps({ hasProducts: true, hasChannel: false, hasSupplier: null, hasCosts: false });
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ["product", true],
      ["channel", false],
      ["costs", false],
    ]);
  });
});
