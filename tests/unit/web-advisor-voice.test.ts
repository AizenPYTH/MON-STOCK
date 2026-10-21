import { describe, expect, it } from "vitest";
import { speakableText } from "@/features/advisor/voice";

describe("texte lu à voix haute", () => {
  it("retire puces, liens et symboles de mise en forme", () => {
    expect(speakableText("– **Score** : 2 498\n- Voir https://ebay.fr/x\n# Titre")).toBe("Score : 2 498\nVoir\nTitre");
  });
});
