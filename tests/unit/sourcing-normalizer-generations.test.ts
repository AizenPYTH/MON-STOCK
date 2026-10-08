import { describe, expect, it } from "vitest";
import { normalizeProduct } from "@/domain/sourcing/normalizer";
import { parseQuery } from "@/domain/sourcing/query-parser";

const m = (t: string) => normalizeProduct(t);

describe("normaliseur : années et générations (régression « ipad air 20 »)", () => {
  it("iPad Air 2022 : l'année n'est jamais tronquée en taille", () => {
    const n = m("iPad Air 2022");
    expect(n.model).toBe("ipad air 2022");
    expect(n.modelDisplay).toBe("iPad Air 2022");
    expect(n.remainingText).toBe("");
    expect(m("iPad mini 2021").model).toBe("ipad mini 2021");
  });

  it("iPad : génération (« 9e gén. », « 9th generation », numéro seul) ≠ taille", () => {
    for (const t of ["iPad 9e gén. 64 Go", "iPad (9th generation) 64GB", "iPad 9ème génération 64 Go"]) {
      const n = m(t);
      expect(n.model, t).toBe("ipad 9");
      expect(n.modelDisplay, t).toBe("iPad 9");
      expect(n.storage, t).toBe("64GB");
      expect(n.remainingText, t).toBe("");
    }
    expect(m("iPad Air 5 2022 64 Go").model).toBe("ipad air 5 2022");
    expect(m("iPad mini 6 2021").model).toBe("ipad mini 6 2021");
    expect(m("iPad 10 64GB wifi").model).toBe("ipad 10");
  });

  it("iPad : tailles décimales et 11 / 12,9 / 13 pouces conservées", () => {
    expect(m("iPad 10.2 2021").model).toBe("ipad 10.2 2021");
    expect(m("iPad Pro 11 2022 128 Go").model).toBe("ipad pro 11 2022");
    expect(m('iPad Pro 12,9" 2021').model).toBe("ipad pro 12.9 2021");
    expect(m("iPad Pro 12.9 2022 256GB WiFi Space Gray").model).toBe("ipad pro 12.9 2022");
    // « 128 » n'est pas pris pour une taille ni « 64 » pour une génération
    expect(m("iPad Pro 128GB").model).toBe("ipad pro");
    expect(m("iPad 64GB").model).toBe("ipad");
  });

  it("iPhone SE : année ou génération → année canonique", () => {
    expect(m("iPhone SE 2022 64 Go").model).toBe("iphone se 2022");
    expect(m("iPhone SE (2022)").model).toBe("iphone se 2022");
    expect(m("iPhone SE 3e génération 128 Go").model).toBe("iphone se 2022");
    expect(m("iPhone SE 2nd gen").model).toBe("iphone se 2020");
  });

  it("MacBook : la puce Apple Silicon fait partie du modèle, l'année seulement sans puce", () => {
    const air = m("MacBook Air M2 2022 256 Go");
    expect(air.model).toBe("macbook air m2");
    expect(air.storage).toBe("256GB");
    expect(air.remainingText).toBe("");
    expect(m("MacBook Air 13 M1 2020").model).toBe("macbook air 13 m1");
    expect(m("MacBook Pro 14 M3 Pro 2023 512 Go").model).toBe("macbook pro 14 m3 pro");
    expect(m("MacBook Pro 2019").model).toBe("macbook pro 2019");
    expect(m("Apple MacBook Air 13 M2 8GB 256GB Midnight").model).toBe("macbook air 13 m2");
    expect(m("MacBook Air M1").model).not.toBe(m("MacBook Air M2").model);
  });

  it("Galaxy : « + » n'est plus perdu (S22+ ≠ S22, Tab S8+ ≠ Tab S8)", () => {
    expect(m("Samsung Galaxy S22+ 128 Go").model).toBe("galaxy s22 plus");
    expect(m("Samsung Galaxy S22 128 Go").model).toBe("galaxy s22");
    expect(m("Galaxy Tab S8+ 256 Go").model).toBe("galaxy tab s8 plus");
    expect(m("Galaxy Tab S8 128 Go").model).toBe("galaxy tab s8");
    expect(m("Galaxy Tab S8 Ultra").model).toBe("galaxy tab s8 ultra");
    expect(m("Galaxy S21 FE 5G 128 Go").model).toBe("galaxy s21 fe");
  });

  it("les 5 requêtes de référence sont analysées sans perte", () => {
    expect(parseQuery("iPhone 13 Pro 256 Go Grade A").criteria).toMatchObject({ brand: "apple", model: "iphone 13 pro", storage: "256GB", grade: "A" });
    expect(parseQuery("Samsung Galaxy S23 256 Go Grade A").criteria).toMatchObject({ brand: "samsung", model: "galaxy s23", storage: "256GB", grade: "A" });
  });
});
