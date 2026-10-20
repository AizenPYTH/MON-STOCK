import { describe, expect, it } from "vitest";
import type { SimpleDealDTO, SimpleRankedOfferDTO, SimpleSearchDTO } from "@/features/mobile-api/contract";
import {
  bestDeals,
  bestOpportunity,
  checkedSummary,
  dealCascade,
  defaultCategory,
  groupByCategory,
  isStale,
  normalizeQuery,
  priceAgeDays,
  priceView,
  rankedOffers,
  rulerCaption,
  rulerMarks,
  signedEstimate,
  simplerQuery,
  splitByAccess,
  stockText,
  visibleOffers,
} from "@/features/sourcing-search/display";
import { legacyCatalogHref } from "@/features/sourcing-search/legacy";

const deal = (over: Partial<SimpleDealDTO> = {}): SimpleDealDTO => ({
  level: "good",
  label: "Intéressant",
  comparable: true,
  supplierPrice: 100,
  marketPrice: 150,
  marketBasis: "marketplace",
  marketCount: 6,
  discountPercent: 20,
  totalCost: 110,
  resalePrice: 160,
  resaleBasis: "marketplace_low",
  margin: 30,
  marginPercent: 18.75,
  provisional: false,
  missingCosts: [],
  uncertainties: [],
  score: 70,
  summary: "Bon prix.",
  ...over,
});

const offer = (id: string, title: string, price: number | null, over: Partial<SimpleRankedOfferDTO> = {}): SimpleRankedOfferDTO => ({
  id,
  title,
  price,
  currency: "EUR",
  priceConverted: price,
  taxType: "ht",
  stock: "in_stock",
  quantity: 5,
  url: "https://example.com/o",
  seenAt: "2026-10-19T10:00:00Z",
  deal: null,
  access: "public",
  supplierId: "s1",
  supplierName: "Fournisseur (ES) — pièces",
  country: "ES",
  ...over,
});

describe("recherche fournisseurs — tri et regroupement", () => {
  it("garde l'ordre du serveur et reconstitue si `offers` est absent", () => {
    const data: Pick<SimpleSearchDTO, "suppliers"> = {
      suppliers: [
        { supplierId: "a", supplierName: "A", country: null, total: 1, offers: [offer("1", "x", 30)] },
        { supplierId: "b", supplierName: "B", country: null, total: 2, offers: [offer("2", "y", 10), offer("3", "z", null)] },
      ],
    };
    expect(rankedOffers(data).map((o) => o.id)).toEqual(["2", "1", "3"]);
    const withOffers = { ...data, offers: [offer("9", "w", 1)] };
    expect(rankedOffers(withOffers).map((o) => o.id)).toEqual(["9"]);
  });

  it("meilleures affaires : niveau, puis score, puis marge ; sans analyse en dernier", () => {
    const list = [offer("none", "a", 1), offer("avg", "b", 2, { deal: deal({ level: "average", score: 90 }) }), offer("vg", "c", 3, { deal: deal({ level: "very_good", score: 50 }) }), offer("g1", "d", 4, { deal: deal({ score: 60 }) }), offer("g2", "e", 5, { deal: deal({ score: 80 }) })];
    expect(bestDeals(list).map((o) => o.id)).toEqual(["vg", "g2", "g1", "avg", "none"]);
    expect(bestOpportunity(list)?.id).toBe("vg");
    expect(bestOpportunity([offer("x", "a", 1, { deal: deal({ level: "average" }) })])).toBeNull();
    expect(bestOpportunity([offer("x", "a", 1, { deal: deal({ margin: null }) })])).toBeNull();
  });

  it("vos comptes d'abord", () => {
    const { account, other } = splitByAccess([offer("1", "a", 1), offer("2", "b", 2, { access: "account" }), offer("3", "c", 3, { access: "marketplace" })]);
    expect(account.map((o) => o.id)).toEqual(["2"]);
    expect(other.map((o) => o.id)).toEqual(["1", "3"]);
  });

  it("catégories détectées (appareils, écrans, batteries…) et catégorie par défaut", () => {
    const list = [offer("d", "Apple iPhone 13 128GB Black grade A", 300), offer("s", "Pantalla iPhone 13 OLED", 60), offer("b", "Batería iPhone 13", 15)];
    const m = groupByCategory(list);
    expect(m.get("devices")?.map((o) => o.id)).toEqual(["d"]);
    expect(m.get("screens")?.map((o) => o.id)).toEqual(["s"]);
    expect(m.get("batteries")?.map((o) => o.id)).toEqual(["b"]);
    expect(defaultCategory("iPhone 13", m)).toBe("devices");
    expect(defaultCategory("écran iPhone 13", m)).toBe("all");
    expect(defaultCategory("iPhone 13", new Map())).toBe("all");
    expect(visibleOffers(list, "screens", "price").map((o) => o.id)).toEqual(["s"]);
    expect(visibleOffers(list, "all", "price").map((o) => o.id)).toEqual(["d", "s", "b"]);
  });
});

describe("recherche fournisseurs — affichage honnête", () => {
  it("prix d'origine, HT/TTC et « ≈ » seulement si converti", () => {
    expect(priceView(offer("1", "a", 10), "EUR")).toMatchObject({ tax: "HT", converted: null });
    const usd = priceView(offer("1", "a", 10, { currency: "USD", priceConverted: 9.2, taxType: "unknown" }), "EUR");
    expect(usd.tax).toBeNull();
    expect(usd.converted).toMatch(/^≈ 9,20/);
    expect(priceView(offer("1", "a", null, { currency: "USD", priceConverted: null }), "EUR")).toMatchObject({ price: "Prix non indiqué", tax: null, converted: null });
  });

  it("stock et âge du prix", () => {
    expect(stockText({ quantity: 12, stock: "in_stock" })).toBe("12 en stock");
    expect(stockText({ quantity: 12, stock: "out_of_stock" })).toBe("En rupture");
    expect(stockText({ quantity: null, stock: "unknown" })).toBe("Stock non indiqué");
    const now = new Date("2026-10-20T12:00:00Z");
    expect(priceAgeDays("2026-10-10T12:00:00Z", now)).toBe(10);
    expect(priceAgeDays(null, now)).toBeNull();
    expect(priceAgeDays("pas une date", now)).toBeNull();
    expect(isStale("2026-10-10T12:00:00Z", now)).toBe(true);
    expect(isStale("2026-10-18T12:00:00Z", now)).toBe(false);
    expect(isStale(null, now)).toBe(false);
  });

  it("montants estimés signés, inconnu = « — »", () => {
    expect(signedEstimate(null, "EUR")).toBe("—");
    expect(signedEstimate(12, "EUR")).toMatch(/^≈ \+12,00/);
    expect(signedEstimate(-3, "EUR")).toMatch(/^≈ −3,00/);
  });

  it("cascade : prix → frais → coût rendu → revente → frais de vente → marge", () => {
    const lines = dealCascade(deal());
    expect(lines.map((l) => [l.label, l.amount, l.kind])).toEqual([
      ["Prix fournisseur", 100, "start"],
      ["Frais d'achat", 10, "add"],
      ["Coût rendu", 110, "subtotal"],
      ["Revente", 160, "start"],
      ["Frais de vente et taxes", 20, "minus"],
      ["Marge estimée", 30, "result"],
    ]);
    // aucun frais supposé quand les montants manquent
    const partial = dealCascade(deal({ totalCost: null, resalePrice: null, margin: null }));
    expect(partial.map((l) => l.label)).toEqual(["Prix fournisseur", "Coût rendu", "Revente", "Marge estimée"]);
    expect(partial.every((l) => l.label === "Prix fournisseur" || l.amount === null)).toBe(true);
  });

  it("règle de marché sur une même échelle", () => {
    expect(rulerMarks(null, 100)).toBeNull();
    expect(rulerMarks(100, null)).toBeNull();
    const m = rulerMarks(100, 200, 230)!;
    expect(m.resale).toBe(87);
    expect(m.market).toBeCloseTo(75.6, 1);
    expect(m.cost).toBeCloseTo(37.8, 1);
    expect(rulerCaption(deal(), "EUR")).toMatch(/^Coût 110,00.*· marché 150,00.*\(6\) · −26,7 %$/);
    expect(rulerCaption(deal({ marketPrice: null }), "EUR")).toBeNull();
  });

  it("rien trouvé : recherche plus simple et fournisseurs sans réponse", () => {
    expect(simplerQuery("écran iPhone 13 pro max")).toBe("écran iPhone");
    expect(simplerQuery("iPhone 13")).toBeNull();
    const { answered, failed } = checkedSummary([
      { supplierName: "A", ok: true, found: 3, message: null },
      { supplierName: "B", ok: false, found: 0, message: "Délai dépassé" },
    ]);
    expect(answered.map((c) => c.supplierName)).toEqual(["A"]);
    expect(failed.map((c) => c.supplierName)).toEqual(["B"]);
  });

  it("normalise la recherche", () => {
    expect(normalizeQuery(["  iPhone   13 ", "x"])).toBe("iPhone 13");
    expect(normalizeQuery(undefined)).toBe("");
    expect(normalizeQuery("a".repeat(200))).toHaveLength(120);
  });
});

describe("compatibilité des anciens liens /sourcing", () => {
  it("redirige le mode SKU et les filtres vers /sourcing/catalog", () => {
    expect(legacyCatalogHref({ sku: "IPH13", qty: "20" })).toBe("/sourcing/catalog?sku=IPH13&qty=20");
    expect(legacyCatalogHref({ supplier: "00000000-0000-0000-0000-000000000000" })).toBe("/sourcing/catalog?supplier=00000000-0000-0000-0000-000000000000");
    expect(legacyCatalogHref({ q: "iPhone", max_price: "200" })).toBe("/sourcing/catalog?q=iPhone&max_price=200");
  });

  it("garde la nouvelle recherche pour ?q= seul", () => {
    expect(legacyCatalogHref({ q: "iPhone 13" })).toBeNull();
    expect(legacyCatalogHref({})).toBeNull();
    expect(legacyCatalogHref({ sku: "" })).toBeNull();
  });
});
