import { describe, expect, it } from "vitest";
import { chatItemsFrom, conversationTitleFrom, quotaView } from "@/features/advisor/view.pure";

describe("conseiller : quota réel et conversation", () => {
  it("quota inconnu → « — », jamais une valeur supposée", () => {
    expect(quotaView(null, 30)).toEqual({ text: "—", ratio: null, reached: false });
    expect(quotaView(4, null).text).toBe("—");
    expect(quotaView(12, 30)).toEqual({ text: "12 / 30 questions cette heure", ratio: 0.4, reached: false });
    expect(quotaView(35, 30)).toEqual({ text: "30 / 30 questions cette heure", ratio: 1, reached: true });
  });

  it("titre local identique à celui du serveur", () => {
    expect(conversationTitleFrom("  Que   dois-je\nracheter ?  ")).toBe("Que dois-je racheter ?");
    expect(conversationTitleFrom("x".repeat(100))).toHaveLength(80);
    expect(conversationTitleFrom("   ")).toBe("Nouvelle conversation");
  });

  it("messages enregistrés → éléments de conversation", () => {
    expect(chatItemsFrom([{ id: "m1", role: "user", content: "Bonjour", cards: [], sources: [], interrupted: false }])).toEqual([{ key: "m1", role: "user", content: "Bonjour", cards: [], sources: [], interrupted: false }]);
  });
});
