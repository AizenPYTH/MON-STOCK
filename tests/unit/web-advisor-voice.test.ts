import { describe, expect, it } from "vitest";
import { heardFromResults, isEcho, shouldBargeIn, speakableText } from "@/features/advisor/voice";

describe("texte lu à voix haute", () => {
  it("retire puces, liens et symboles de mise en forme", () => {
    expect(speakableText("– **Score** : 2 498\n- Voir https://ebay.fr/x\n# Titre")).toBe("Score : 2 498\nVoir\nTitre");
  });
});

describe("couper la parole au conseiller (mode conversation)", () => {
  const answer = "Ton compte eBay est en bon état : 99 % d'avis positifs et 8 commandes à expédier aujourd'hui.";

  it("la voix du conseiller captée par le micro est reconnue comme écho", () => {
    expect(isEcho("compte eBay en bon état avis positifs", answer)).toBe(true);
    expect(isEcho("et pour l'iPhone 13 combien il en reste", answer)).toBe(false);
    expect(isEcho("n'importe quoi", null)).toBe(false);
  });

  it("deux mots hors écho, ou un mot d'arrêt, interrompent la voix", () => {
    expect(shouldBargeIn("attends", answer)).toBe(true);
    expect(shouldBargeIn("Stop !", answer)).toBe(true);
    expect(shouldBargeIn("et l'iPhone", answer)).toBe(true);
    expect(shouldBargeIn("euh", answer)).toBe(false);
    expect(shouldBargeIn("commandes à expédier", answer)).toBe(false);
  });

  it("texte retenu : phrases d'écho écartées, phrase terminée quand rien n'est en cours", () => {
    const r = heardFromResults(
      [
        { isFinal: true, text: "ton compte eBay est en bon état" },
        { isFinal: true, text: "et les ventes de la semaine" },
      ],
      answer,
    );
    expect(r).toEqual({ text: "et les ventes de la semaine", settled: true });
    expect(heardFromResults([{ isFinal: false, text: "et les ventes" }], answer)).toEqual({ text: "et les ventes", settled: false });
    expect(heardFromResults([{ isFinal: true, text: "commandes à expédier aujourd'hui" }], answer)).toEqual({ text: "", settled: false });
  });
});
