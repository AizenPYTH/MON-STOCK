import { describe, expect, it } from "vitest";
import { findCheaperHref, findCheaperQuantity } from "@/features/sourcing/links";

describe("« Trouver moins cher » depuis la fiche SKU", () => {
  it("quantité = réapprovisionnement recommandé, sinon 1", () => {
    expect(findCheaperQuantity(20)).toBe(20);
    expect(findCheaperQuantity(0)).toBe(1);
    expect(findCheaperQuantity(null)).toBe(1);
    expect(findCheaperQuantity(undefined)).toBe(1);
    expect(findCheaperQuantity(7.6)).toBe(7);
  });
  it("lien encodé vers le mode SKU", () => {
    expect(findCheaperHref("IPH13-128 A/B", 20)).toBe("/sourcing?sku=IPH13-128+A%2FB&qty=20");
    expect(findCheaperHref("X", null)).toBe("/sourcing?sku=X&qty=1");
  });
});
