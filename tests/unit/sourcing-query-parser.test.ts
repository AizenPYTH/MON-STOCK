import { describe, expect, it } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";

describe("QueryParser", () => {
  it("détecte un EAN", () => {
    const q = parseQuery("4006381333931");
    expect(q.kind).toBe("ean");
    expect(q.ean).toBe("4006381333931");
  });
  it("détecte un MPN", () => {
    const q = parseQuery("MLY33FN/A");
    expect(q.kind).toBe("mpn");
    expect(q.mpn).toBe("MLY33FN/A");
  });
  it("structure une requête produit", () => {
    const q = parseQuery("iphone 13 128 noir grade a");
    expect(q.kind).toBe("structured");
    expect(q.criteria).toEqual({ brand: "apple", model: "iphone 13", storage: "128GB", color: "black", grade: "A", condition: "unknown" });
    expect(q.tokens).toContain("iphone");
  });
  it("garde le texte libre pour une requête non reconnue", () => {
    const q = parseQuery("coque silicone transparente");
    expect(q.kind).toBe("text");
    expect(q.criteria.model).toBeNull();
    expect(q.tokens).toEqual(["coque", "silicone", "transparente"]);
  });
  it("gère une requête vide", () => {
    expect(parseQuery("").kind).toBe("empty");
    expect(parseQuery(undefined).tokens).toEqual([]);
  });
});
