import { describe, expect, it } from "vitest";
import { buildAddVariantsRequest, buildCreateProductRequest, formErrors, productDisplayName, productWithVariantsSchema, suggestSkuCode, validateProductForm, variantAutoName } from "@/features/stock/product-form";

describe("formulaire de création de produit (module partagé web + mobile)", () => {
  it("iPhone 13 grade B 128 Go : validation puis charge utile de create_product_with_skus", () => {
    const parsed = productWithVariantsSchema.parse({
      brand: "Apple",
      model: "iPhone 13",
      category: "Smartphone",
      variants: [{ storage: "128 Go", color: "Noir", grade: "B", condition: "refurbished", code: "IPHONE13-128-NOIR-B", cost_price: "310", sale_price: "429,00".replace(",", "."), initial_quantity: "3" }],
    });
    const req = buildCreateProductRequest(parsed, "EUR");
    expect(req.p_product).toEqual({ name: "Apple iPhone 13", brand: "Apple", model: "iPhone 13", category: "Smartphone", description: null });
    expect(req.p_items).toEqual([
      {
        variant: { name: "128 Go / Noir / Grade B", condition: "refurbished", grade: "B", ean: null, mpn: null, attributes: { storage: "128 Go", color: "Noir", grade: "B" } },
        sku: { code: "IPHONE13-128-NOIR-B", barcode: null, cost_price: 310, sale_price: 429, currency: "EUR", location: null, reorder_point: 0, safety_stock: 0, lead_time_days: null, default_supplier_id: null },
        initial_quantity: 3,
      },
    ]);
  });

  it("prix et quantité vides → inconnus (null / 0), jamais inventés", () => {
    const parsed = productWithVariantsSchema.parse({ name: "Lot câbles", variants: [{ code: "LOT-1", cost_price: "", sale_price: "", initial_quantity: "" }] });
    const item = buildCreateProductRequest(parsed, "EUR").p_items[0] as { sku: { cost_price: unknown; sale_price: unknown }; initial_quantity: number };
    expect(item.sku.cost_price).toBeNull();
    expect(item.sku.sale_price).toBeNull();
    expect(item.initial_quantity).toBe(0);
  });

  it("erreurs explicites : nom manquant, code SKU invalide, prix négatif, quantité décimale, codes en double", () => {
    const r = validateProductForm({
      variants: [
        { code: "A B", cost_price: "-1", initial_quantity: "1.5" },
        { code: "dup" },
        { code: "DUP", grade: "D" as never },
      ],
    });
    expect(r.ok).toBe(false);
    const errors = r.ok ? {} : r.errors;
    expect(errors.name).toMatch(/nom du produit/);
    expect(errors["variants.0.code"]).toMatch(/lettres, chiffres/);
    expect(errors["variants.0.cost_price"]).toMatch(/négatif/);
    expect(errors["variants.0.initial_quantity"]).toMatch(/entier/);
    expect(errors["variants.2.grade"]).toBeDefined();
    expect(errors["variants.2.code"]).toMatch(/variante 2/);
  });

  it("au moins une variante", () => {
    const r = productWithVariantsSchema.safeParse({ name: "X", variants: [] });
    expect(formErrors(r.error!.issues).variants).toMatch(/au moins une variante/);
  });

  it("nom affiché et nom de variante", () => {
    expect(productDisplayName({ brand: "Apple", model: "iPhone 13" })).toBe("Apple iPhone 13");
    expect(productDisplayName({ brand: "Samsung", model: "Samsung Galaxy S22" })).toBe("Samsung Galaxy S22");
    expect(productDisplayName({ name: "  Mon produit ", brand: "Apple", model: "X" })).toBe("Mon produit");
    expect(productDisplayName({ brand: "Apple" })).toBe("");
    expect(variantAutoName({})).toBe("Standard");
    expect(variantAutoName({ storage: "256 Go", grade: "A" })).toBe("256 Go / Grade A");
  });

  it("code SKU suggéré conforme au format accepté", () => {
    expect(suggestSkuCode({ model: "iPhone 13" }, { storage: "128 Go", color: "Noir", grade: "B" })).toBe("IPHONE13-128-NOIR-B");
    expect(suggestSkuCode({ model: "Galaxy S22+" }, { storage: "1 To", color: "Vert émeraude" })).toBe("GALAXYS22-1TB-VERTEMERAU");
    expect(suggestSkuCode({}, {})).toBe("SKU");
    const code = suggestSkuCode({ name: "x".repeat(200) }, { color: "y".repeat(200) });
    expect(code.length).toBeLessThanOrEqual(64);
    expect(productWithVariantsSchema.shape.variants.element.shape.code.safeParse(code).success).toBe(true);
  });

  it("ajout de variantes à un produit existant : p_product nul", () => {
    const parsed = productWithVariantsSchema.parse({ name: "P", variants: [{ code: "P-2", grade: "C" }] });
    expect(buildAddVariantsRequest(parsed.variants, "EUR").p_product).toBeNull();
  });
});
