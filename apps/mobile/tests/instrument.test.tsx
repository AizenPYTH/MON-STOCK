import { render, screen } from "@testing-library/react-native";

/**
 * Composants « Instrument » (v5) et règles d'affichage des chiffres : uniquement des données
 * fournies, « — » pour l'inconnu, jamais de coût supposé.
 */
jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({}) }));

describe("chiffres de scène", () => {
  it("sépare le préfixe estimé, le nombre et l'unité", () => {
    const { splitFigure } = jest.requireActual("~/components/ui/instrument");
    expect(splitFigure("≈ 9 152 €")).toEqual({ approx: true, number: "9 152", unit: "€" });
    expect(splitFigure("28 %")).toEqual({ approx: false, number: "28", unit: "%" });
    expect(splitFigure("1 284")).toEqual({ approx: false, number: "1 284", unit: "" });
    expect(splitFigure("—")).toEqual({ approx: false, number: "—", unit: "" });
  });
});

describe("code-barres du stock", () => {
  it("trie par ventes, garde une barre fine aux références sans vente, regroupe au-delà de 60", () => {
    const { barcodeBars } = jest.requireActual("~/components/ui/instrument");
    const bars = barcodeBars([
      { id: "a", weight: 0, level: "ok" },
      { id: "b", weight: 7, level: "out" },
      { id: "c", weight: 3, level: "low" },
    ]);
    expect(bars.map((b: { id: string }) => b.id)).toEqual(["b", "c", "a"]);
    expect(bars[2].weight).toBe(0.4);
    const many = Array.from({ length: 70 }, (_, i) => ({ id: `s${i}`, weight: 70 - i, level: i === 69 ? "out" : "ok" }));
    const grouped = barcodeBars(many);
    expect(grouped).toHaveLength(60);
    // la plus petite était en rupture : la barre « autres » le signale
    expect(grouped[59]).toMatchObject({ id: "others", level: "out" });
  });

  it("part des ventes en rupture : null sans vente (jamais « 0 % » inventé)", () => {
    const { outOfStockSalesShare, coverDays } = jest.requireActual("~/data/catalog");
    const v = (qty: number, units: number) => ({ row: { quantity_available: qty, units_30d: units } });
    expect(outOfStockSalesShare({ products: [{ skus: [v(0, 0), v(3, 0)] }] })).toBeNull();
    expect(outOfStockSalesShare({ products: [{ skus: [v(0, 7), v(3, 21)] }] })).toBe(25);
    expect(coverDays(8, 0)).toBeNull();
    expect(coverDays(8, 24)).toBe(10);
    expect(coverDays(-2, 30)).toBe(0);
  });
});

describe("règle de marché", () => {
  it("coût à −40 % → 0, au marché → 2/3, au-delà de +20 % → borné à 1 ; marché inconnu → neutre", () => {
    const { rulerPosition } = jest.requireActual("~/components/ui/instrument");
    expect(rulerPosition(60, 100)).toBeCloseTo(0);
    expect(rulerPosition(100, 100)).toBeCloseTo(2 / 3);
    expect(rulerPosition(200, 100)).toBe(1);
    expect(rulerPosition(50, 0)).toBeCloseTo(0.6667);
  });

  it("sans comparaison : légende « pas assez d'offres », pas de position inventée", () => {
    const { MarketRuler } = jest.requireActual("~/components/ui/instrument");
    render(<MarketRuler cost={250} market={null} emptyCaption="Pas assez d'offres équivalentes (0 trouvée)" />);
    expect(screen.getByText("Pas assez d'offres équivalentes (0 trouvée)")).toBeTruthy();
  });
});

describe("cascade de marge", () => {
  it("radar : base, déductions, sous-totaux et bénéfice dans l'ordre du calcul serveur", () => {
    const { waterfallFromBreakdown } = jest.requireActual("~/app/(app)/radar/[offerId]");
    const lines = waterfallFromBreakdown([
      { label: "Prix de vente moyen constaté (30 j)", amount: 435.53 },
      { label: "Prix d'achat retenu", amount: 279 },
      { label: "Coût d'achat rendu", amount: 280.8 },
      { label: "Marge brute", amount: 154.73 },
      { label: "Commission marketplace", amount: null },
      { label: "Bénéfice estimé (coûts connus seulement)", amount: 96.05 },
    ]);
    expect(lines.map((l: { kind: string }) => l.kind)).toEqual(["base", "minus", "subtotal", "subtotal", "minus", "result"]);
    expect(lines[4].amount).toBeNull();
  });

  it("recherche : frais déduits seulement s'ils existent ; aucune cascade sans revente ou sans marge", () => {
    const { waterfallLines } = jest.requireActual("~/components/offer-analysis");
    const deal = { level: "good", label: "Intéressant", comparable: true, supplierPrice: 279, marketPrice: 427, marketBasis: "marketplace", marketCount: 4, discountPercent: 34, totalCost: 280.8, resalePrice: 435.53, resaleBasis: "own_sales", margin: 96.05, marginPercent: 22, provisional: true, missingCosts: ["TVA"], uncertainties: [], score: 74, summary: "" };
    const lines = waterfallLines(deal);
    expect(lines.map((l: { label: string }) => l.label)).toEqual(["Revente", "Achat", "Frais d'achat", "Frais de vente et taxes", "Marge estimée"]);
    expect(lines[2].amount).toBe(1.8);
    expect(lines[3].amount).toBe(58.68);
    expect(waterfallLines({ ...deal, resalePrice: null })).toEqual([]);
    expect(waterfallLines({ ...deal, margin: null })).toEqual([]);
  });
});
