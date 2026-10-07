import { describe, expect, it } from "vitest";
import { buildInsights, buildTodoItems } from "@/features/analytics/priorities.pure";

describe("buildTodoItems (dashboard « À traiter aujourd'hui »)", () => {
  it("n'affiche que les compteurs > 0, du plus grave au moins grave", () => {
    const items = buildTodoItems({ toReplenish: 3, syncErrors: 0, lowStock: 2, unmappedListings: 7, pendingSales: 0, negativeStock: 1 });
    expect(items.map((i) => i.key)).toEqual(["toReplenish", "negativeStock", "lowStock", "unmappedListings"]);
    expect(items[0]?.label).toBe("3 produits à réapprovisionner");
    expect(items[0]?.tone).toBe("danger");
    expect(items[2]?.label).toBe("2 produits en stock faible");
    expect(items[3]?.href).toBe("/settings/integrations/mapping");
  });

  it("accorde le singulier et renvoie une liste vide quand tout est à zéro", () => {
    expect(buildTodoItems({ toReplenish: 0, syncErrors: 0, lowStock: 0, unmappedListings: 0, pendingSales: 0, negativeStock: 0 })).toEqual([]);
    const [one] = buildTodoItems({ toReplenish: 0, syncErrors: 1, lowStock: 0, unmappedListings: 0, pendingSales: 1, negativeStock: 0 });
    expect(one?.label).toBe("1 erreur de synchronisation ou alerte à traiter");
  });
});

describe("buildInsights", () => {
  const base = { outOfStock: [], atRisk: [], lowCount: 0, syncFailed24h: 0, openAlerts: 0, unmappedListings: 0, pendingSales: 0, negativeStock: 0, unknownCostWithSales: 0, deadStock: 0, channelsMissingFees: [] };

  it("retourne une liste vide sans anomalie", () => {
    expect(buildInsights(base)).toEqual([]);
  });

  it("formule la rupture estimée et pointe vers une action concrète", () => {
    const items = buildInsights({
      ...base,
      outOfStock: [{ code: "A-1", name: "Produit A", dailyVelocity: 2.5, daysOfCover: 0 }],
      atRisk: [{ code: "B-2", name: "Produit B", dailyVelocity: 1, daysOfCover: 3.4 }],
      deadStock: 4,
      channelsMissingFees: ["eBay"],
    });
    expect(items.map((i) => i.severity)).toEqual(["critical", "critical", "info", "info"]);
    expect(items[0]?.title).toBe("Rupture : Produit A");
    expect(items[0]?.href).toBe("/sourcing?sku=A-1");
    expect(items[1]?.title).toBe("Rupture estimée dans 3 jours : Produit B");
    expect(items[1]?.href).toBe("/stock/B-2");
    expect(items.find((i) => i.key === "fees")?.title).toContain("eBay");
  });

  it("limite chaque groupe à 5 lignes et ajoute un lien vers le reste", () => {
    const outOfStock = Array.from({ length: 8 }, (_, i) => ({ code: `S${i}`, name: `SKU ${i}`, dailyVelocity: null, daysOfCover: null }));
    const items = buildInsights({ ...base, outOfStock });
    expect(items.filter((i) => i.key.startsWith("oos:") && i.key !== "oos:more")).toHaveLength(5);
    expect(items.find((i) => i.key === "oos:more")?.title).toBe("3 autres produits en rupture");
    expect(items[0]?.detail).toMatch(/pas assez de données/i);
  });

  it("trie les avertissements après les urgences", () => {
    const items = buildInsights({ ...base, unmappedListings: 2, syncFailed24h: 1, unknownCostWithSales: 3 });
    expect(items.map((i) => i.key)).toEqual(["sync", "unmapped", "unknown_cost"]);
  });
});
