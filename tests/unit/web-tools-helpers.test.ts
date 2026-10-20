import { describe, expect, it } from "vitest";
import { dec, formatDec, formatPercent } from "@/domain/tools/decimal";
import { quickCurrency, quickMargin, quickVat } from "@/domain/tools/quick-calc";
import { toolTiles } from "@/domain/tools/catalog";
import { carrierText, frDate, frDateTime, frDay, isDuplicateError, pctText, priceTaxText, quotedAtText, toFrInput, trackingSourceText, trackingText, transitText } from "@/features/tools/format";
import { evaluateQuick, focusField, quickCopyText, type CalcField } from "@/features/tools/quick-view";
import { readToolView } from "@/features/tools/view";

describe("web outils : formats d'affichage", () => {
  it("dates françaises sans valeur inventée", () => {
    expect(frDate("2026-10-12")).toBe("12/10/2026");
    expect(frDate(null)).toBeNull();
    expect(frDay("2026-10-12")).toBe("12/10");
    expect(frDateTime("2026-10-12T14:05:00Z")).toBe("12/10/2026 14:05");
    expect(frDateTime("2026-10-12")).toBe("12/10/2026");
    expect(frDateTime("demain")).toBe("demain");
  });

  it("nombres et pourcentages", () => {
    expect(toFrInput(12.9)).toBe("12,9");
    expect(toFrInput(null)).toBe("");
    expect(pctText(12.5)).toBe("12,5 %");
    expect(pctText(null)).toBe("—");
  });

  it("options d'expédition : délai, nature du prix, suivi, date", () => {
    expect(transitText({ transitDaysMin: null, transitDaysMax: null })).toBe("Délai non communiqué");
    expect(transitText({ transitDaysMin: 2, transitDaysMax: 2 })).toBe("2 j");
    expect(transitText({ transitDaysMin: 2, transitDaysMax: null })).toBe("2 j");
    expect(transitText({ transitDaysMin: null, transitDaysMax: 4 })).toBe("?–4 j");
    expect(transitText({ transitDaysMin: 2, transitDaysMax: 4 })).toBe("2–4 j");
    expect(priceTaxText({ origin: "manual", priceTax: "unknown" })).toBe("estimation (votre grille)");
    expect(priceTaxText({ origin: "api", priceTax: "incl" })).toBe("TTC");
    expect(priceTaxText({ origin: "api", priceTax: "excl" })).toBe("HT");
    expect(priceTaxText({ origin: "api", priceTax: "unknown" })).toBe("HT/TTC inconnu");
    expect(trackingText(null)).toBe("Suivi : non précisé");
    expect(quotedAtText({ origin: "api", quotedAt: "2026-10-12T09:30:00.000Z" })).toBe("Devis du 12/10/2026 09:30 UTC");
    expect(quotedAtText({ origin: "manual", quotedAt: "2026-10-01" })).toBe("Grille vérifiée le 01/10/2026");
    expect(quotedAtText({ origin: "manual", quotedAt: null })).toBe("Grille : date de vérification non renseignée");
  });

  it("transporteur et source du suivi", () => {
    expect(carrierText({ carrierCode: null, carrierLabel: null })).toBe("Transporteur non déterminé");
    expect(carrierText({ carrierCode: "colissimo", carrierLabel: null })).toBe("Colissimo");
    expect(carrierText({ carrierCode: "colissimo", carrierLabel: "Colissimo Expert" })).toBe("Colissimo Expert");
    expect(trackingSourceText("laposte")).toBe("API La Poste Suivi");
    expect(trackingSourceText(null)).toBeNull();
  });

  it("détecte un doublon Postgres", () => {
    expect(isDuplicateError({ code: "23505", message: "x" })).toBe(true);
    expect(isDuplicateError({ code: "42501", message: "duplicate key value" })).toBe(true);
    expect(isDuplicateError({ code: "42501", message: "permission denied" })).toBe(false);
  });

  it("vue d'un calculateur : simple par défaut", () => {
    expect(readToolView({})).toBe("simple");
    expect(readToolView({ vue: "detail" })).toBe("detail");
    expect(readToolView({ vue: ["detail", "x"] })).toBe("detail");
    expect(readToolView({ vue: "autre" })).toBe("simple");
  });

  it("le catalogue web propose les 8 tuiles de l'application", () => {
    expect(toolTiles().map((t) => t.route)).toEqual(["/tools/vat", "/tools/margin", "/tools/selling-price", "/tools/ebay-fees", "/tools/discount", "/tools/currency", "/tools/shipping", "/tools/tracking"]);
  });
});

describe("web outils : calculatrice version simple", () => {
  const vatFields: CalcField[] = [
    { key: "ht", label: "HT", unit: "€" },
    { key: "tva", label: "TVA 20 %", unit: "€" },
    { key: "ttc", label: "TTC", unit: "€" },
  ];
  const vat = (v: Record<string, ReturnType<typeof dec> | null>, active: string) => quickVat(active as "ht" | "tva" | "ttc", v[active] ?? null, dec(20));

  it("bidirectionnel : seule la case active est lue, les autres suivent", () => {
    const view = evaluateQuick(vatFields, { active: "ht", entries: { ht: "100", ttc: "999" } }, true, vat);
    expect(formatDec(view.valueOf("tva")!)).toBe("20,00");
    expect(formatDec(view.valueOf("ttc")!)).toBe("120,00");
    expect(view.anyResult).toBe(true);
  });

  it("toucher une autre case y reprend la valeur calculée comme saisie", () => {
    const state = { active: "ht", entries: { ht: "100" } };
    const view = evaluateQuick(vatFields, state, true, vat);
    const next = focusField(state, "ttc", true, view);
    expect(next).toEqual({ active: "ttc", entries: { ttc: "120" } });
    const back = evaluateQuick(vatFields, next, true, vat);
    expect(formatDec(back.valueOf("ht")!)).toBe("100,00");
    expect(focusField(state, "ht", true, view)).toBe(state);
  });

  it("saisie vide : aucun résultat, copie désactivée", () => {
    const view = evaluateQuick(vatFields, { active: "ht", entries: {} }, true, vat);
    expect(view.valueOf("ttc")).toBeNull();
    expect(view.anyResult).toBe(false);
  });

  it("marge : frais vides comptés 0 et texte copié avec la mention estimation", () => {
    const fields: CalcField[] = [
      { key: "achat", label: "Achat", unit: "€" },
      { key: "vente", label: "Vente", unit: "€" },
      { key: "frais", label: "Frais", unit: "€" },
      { key: "res", label: "Bénéfice", unit: "€", result: true },
    ];
    const view = evaluateQuick(fields, { active: "achat", entries: { achat: "60", vente: "100" } }, false, (v) => quickMargin(v.achat ?? null, v.vente ?? null, v.frais ?? null));
    expect(formatDec(view.valueOf("res")!)).toBe("40,00");
    const sub = `marge ${formatPercent(dec(40), 1)}`;
    expect(view.out.sub).toBe(sub);
    expect(quickCopyText("Marge", fields, view)).toBe(`Marge\nAchat : ${formatDec(dec(60))} €\nVente : ${formatDec(dec(100))} €\nFrais : — €\nBénéfice : ${formatDec(dec(40))} € (${sub})\n(estimation)`);
  });

  it("devises : sans taux, la conversion reste inconnue (jamais 0)", () => {
    const fields: CalcField[] = [
      { key: "dev", label: "USD", unit: "$" },
      { key: "eur", label: "EUR", unit: "€" },
    ];
    const view = evaluateQuick(fields, { active: "dev", entries: { dev: "10" } }, true, (v, a) => quickCurrency(a as "dev" | "eur", v[a] ?? null, null));
    expect(view.valueOf("eur")).toBeNull();
    expect(formatDec(view.valueOf("dev")!)).toBe("10,00");
  });
});
