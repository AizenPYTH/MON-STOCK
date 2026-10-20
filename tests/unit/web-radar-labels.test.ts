import { describe, expect, it } from "vitest";
import { ageDaysText, appraisalText, classifyBreakdown, filterItems, parseRadarParams, parseSetting, profitPrefix, radarFigure, radarHref, settingText, signedProfit } from "@/features/radar/labels";
import { parseDraftQuantity, parseSettingsForm } from "@/features/radar/settings-form";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("radar — paramètres d'URL et filtres", () => {
  it("valeurs inconnues → valeurs par défaut", () => {
    expect(parseRadarParams({})).toEqual({ sort: "score", filter: "all" });
    expect(parseRadarParams({ sort: "profit", filter: "saved" })).toEqual({ sort: "profit", filter: "saved" });
    expect(parseRadarParams({ sort: "nimporte", filter: ["estimated", "x"] })).toEqual({ sort: "score", filter: "estimated" });
  });

  it("filtre rentables / estimations / enregistrées", () => {
    const items = [
      { evaluation: { status: "profitable" as const }, savedAt: null },
      { evaluation: { status: "estimated" as const }, savedAt: "2026-10-01" },
      { evaluation: { status: "unprofitable" as const }, savedAt: null },
    ];
    type Item = Parameters<typeof filterItems>[0][number];
    const list = items as unknown as Item[];
    expect(filterItems(list, "all")).toHaveLength(3);
    expect(filterItems(list, "profitable")).toHaveLength(1);
    expect(filterItems(list, "estimated")).toHaveLength(1);
    expect(filterItems(list, "saved")).toHaveLength(1);
  });

  it("bénéfice exact seulement avec coûts complets", () => {
    expect(profitPrefix("profitable")).toBe("");
    expect(profitPrefix("estimated")).toBe("≈ ");
    expect(profitPrefix("unprofitable")).toBe("≈ ");
  });

  it("notes et âge", () => {
    expect(appraisalText({ score: null, label: "good" })).toBe("Données insuffisantes");
    expect(appraisalText({ score: 71.6, label: "good" })).toBe("72 / 100 · Bonne");
    expect(ageDaysText(null)).toBe("date inconnue");
    expect(ageDaysText(0)).toBe("aujourd'hui");
    expect(ageDaysText(4)).toBe("il y a 4 j");
  });
});

describe("radar — cascade du calcul", () => {
  it("classe les lignes du serveur (revenu, coûts, sous-totaux, déductions, résultat)", () => {
    const lines = classifyBreakdown([
      { label: "Prix de vente moyen constaté (30 j)", amount: 240 },
      { label: "CA hors TVA", amount: 200 },
      { label: "Prix d'achat retenu", amount: 120 },
      { label: "Transport fournisseur (÷ 5)", amount: 2 },
      { label: "Douane / import (3 %)", amount: 3.6 },
      { label: "Coût d'achat rendu", amount: 125.6 },
      { label: "TVA sur marge", amount: 4 },
      { label: "Marge brute", amount: 70.4 },
      { label: "Commission marketplace", amount: 30 },
      { label: "Bénéfice estimé (coûts connus seulement)", amount: 40.4 },
    ]);
    expect(lines.map((l) => l.kind)).toEqual(["revenue", "revenue", "cost", "cost", "cost", "subtotal", "deduction", "subtotal", "deduction", "result"]);
  });
});

describe("radar — paramètres de coûts", () => {
  it("champ vide = inconnu (null), virgule acceptée", () => {
    expect(parseSetting("")).toBeNull();
    expect(parseSetting(" 12,9 ")).toBe(12.9);
    expect(parseSetting("-1")).toBe("invalid");
    expect(parseSetting("abc")).toBe("invalid");
    expect(settingText(null)).toBe("");
    expect(settingText(0.35)).toBe("0,35");
  });

  it("formulaire complet → réglages", () => {
    const r = parseSettingsForm(form({ vatRegime: "margin", vatRecoverable: "no", vatRate: "20", marketplaceFeePercent: "12,9", paymentFeeFixed: "0,35", packagingCost: "" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.settings).toEqual({
      vatRegime: "margin",
      vatRecoverable: false,
      vatRate: 20,
      marketplaceFeePercent: 12.9,
      paymentFeePercent: null,
      paymentFeeFixed: 0.35,
      shippingToCustomer: null,
      packagingCost: null,
      returnProvisionPercent: null,
      importDutyPercent: null,
    });
  });

  it("« je ne sais pas » reste inconnu ; erreurs par champ et bornes du serveur", () => {
    const unknown = parseSettingsForm(form({}));
    expect(unknown.ok && unknown.settings.vatRecoverable).toBeNull();
    const bad = parseSettingsForm(form({ vatRate: "45", shippingToCustomer: "beaucoup", vatRegime: "autre" }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(Object.keys(bad.fieldErrors).sort()).toEqual(["shippingToCustomer", "vatRate", "vatRegime"]);
    expect(bad.fieldErrors.vatRate?.[0]).toMatch(/30 au maximum/);
  });

  it("quantité du brouillon : entier ≥ MOQ", () => {
    expect(parseDraftQuantity("10", 5)).toEqual({ ok: true, quantity: 10 });
    expect(parseDraftQuantity("3", 5)).toEqual({ ok: false, error: "Quantité minimale de commande : 5." });
    expect(parseDraftQuantity("2.5", null).ok).toBe(false);
    expect(parseDraftQuantity("", null).ok).toBe(false);
    expect(parseDraftQuantity(null, null).ok).toBe(false);
    expect(parseDraftQuantity("200000", null).ok).toBe(false);
    expect(parseDraftQuantity("1", null)).toEqual({ ok: true, quantity: 1 });
  });
});

describe("radar — présentation v5", () => {
  it("scène : bénéfice positif = rentables + estimations, sur toutes les offres évaluées", () => {
    expect(radarFigure({ profitable: 2, estimated: 5, unprofitable: 1, insufficient: 1 })).toEqual({ positive: 7, evaluated: 9 });
    expect(radarFigure({ profitable: 0, estimated: 0, unprofitable: 0, insufficient: 0 })).toEqual({ positive: 0, evaluated: 0 });
  });

  it("bénéfice signé : exact si coûts complets, « ≈ » sinon, « — » si inconnu", () => {
    const f = (n: number) => `${n.toFixed(2)} €`;
    expect(signedProfit(38.2, "profitable", f)).toBe("+38.20 €");
    expect(signedProfit(38.2, "estimated", f)).toBe("≈ +38.20 €");
    expect(signedProfit(-1.5, "unprofitable", f)).toBe("≈ −1.50 €");
    expect(signedProfit(null, "insufficient_data", f)).toBe("—");
  });

  it("lien conservant tri et filtre", () => {
    expect(radarHref({ sort: "score", filter: "all" })).toBe("/radar");
    expect(radarHref({ sort: "profit", filter: "saved", offer: "abc" })).toBe("/radar?sort=profit&filter=saved&offer=abc");
  });
});
