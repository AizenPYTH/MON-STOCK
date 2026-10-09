import { addVariants, createProduct, FormValidationError, updateProduct, updateSku, type EditableProduct, type EditableSku } from "~/data/products";
import { fakeSupabase } from "./fake-supabase";

const ORG = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";

describe("création de produit (mobile → create_product_with_skus)", () => {
  it("iPhone 13 grade B : un seul appel RPC transactionnel avec produit, variante, SKU, prix et stock initial", async () => {
    const { client, queries } = fakeSupabase({ "rpc:create_product_with_skus": { data: { product_id: PRODUCT, skus: [{ sku_id: "s1", code: "IPHONE13-128-NOIR-B" }] } } });
    const r = await createProduct(client, ORG, "EUR", {
      brand: "Apple",
      model: "iPhone 13",
      category: "Smartphone",
      variants: [{ storage: "128 Go", color: "Noir", grade: "B", condition: "refurbished", code: "IPHONE13-128-NOIR-B", cost_price: "310,50", sale_price: "429", initial_quantity: "3" }],
    });
    expect(r).toEqual({ productId: PRODUCT, skus: [{ skuId: "s1", code: "IPHONE13-128-NOIR-B" }] });
    expect(queries).toHaveLength(1);
    const args = queries[0]!.calls[0]!.args[0] as { p_organization_id: string; p_product: Record<string, unknown>; p_items: Array<{ sku: Record<string, unknown>; variant: Record<string, unknown>; initial_quantity: number }> };
    expect(queries[0]!.target).toBe("rpc:create_product_with_skus");
    expect(args.p_organization_id).toBe(ORG);
    expect(args.p_product).toMatchObject({ name: "Apple iPhone 13", brand: "Apple", model: "iPhone 13", category: "Smartphone" });
    expect(args.p_items[0]).toMatchObject({ initial_quantity: 3, sku: { code: "IPHONE13-128-NOIR-B", cost_price: 310.5, sale_price: 429, currency: "EUR" }, variant: { grade: "B", condition: "refurbished", name: "128 Go / Noir / Grade B" } });
  });

  it("formulaire invalide → aucune requête, erreurs par champ", async () => {
    const { client, queries } = fakeSupabase();
    const e = await createProduct(client, ORG, "EUR", { variants: [{ code: "" }] }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FormValidationError);
    expect((e as FormValidationError).fieldErrors).toMatchObject({ name: expect.any(String), "variants.0.code": expect.any(String) });
    expect(queries).toHaveLength(0);
  });

  it("refus de la base (code déjà pris) → message explicite", async () => {
    const { client } = fakeSupabase({ "rpc:create_product_with_skus": { error: { code: "23505", message: "SKU_CODE_EXISTS" } } });
    await expect(createProduct(client, ORG, "EUR", { name: "X", variants: [{ code: "X-1" }] })).rejects.toThrow(/existe déjà/);
  });

  it("ajout de variantes : p_product_id, pas de p_product", async () => {
    const { client, queries } = fakeSupabase({ "rpc:create_product_with_skus": { data: { product_id: PRODUCT, skus: [{ sku_id: "s2", code: "P-2" }] } } });
    await addVariants(client, ORG, "EUR", PRODUCT, [{ code: "P-2", grade: "C" }]);
    const args = queries[0]!.calls[0]!.args[0] as Record<string, unknown>;
    expect(args.p_product_id).toBe(PRODUCT);
    expect(args.p_product).toBeUndefined();
  });
});

describe("édition (verrous optimistes)", () => {
  const product: EditableProduct = { id: PRODUCT, name: "Apple iPhone 13", brand: "Apple", category: null, description: null, model: "iPhone 13", attributes: { model: "iPhone 13", battery: "90%" }, updated_at: "2026-10-09T10:00:00Z" };

  it("produit : update conditionnée par updated_at ; autres attributs conservés", async () => {
    const { client, queries } = fakeSupabase({ products: { data: [{ id: PRODUCT }] } });
    await updateProduct(client, ORG, product, { name: "Apple iPhone 13", brand: "Apple", model: "iPhone 13 mini", category: "Smartphone", description: "" });
    const calls = queries[0]!.calls;
    expect(calls.find((c) => c.method === "update")!.args[0]).toMatchObject({ category: "Smartphone", attributes: { model: "iPhone 13 mini", battery: "90%" }, model_normalized: "iphone 13 mini", description: null });
    expect(calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([["organization_id", ORG], ["id", PRODUCT], ["updated_at", product.updated_at]]);
  });

  it("produit modifié entre-temps (0 ligne) → conflit explicite", async () => {
    const { client } = fakeSupabase({ products: { data: [] } });
    await expect(updateProduct(client, ORG, product, { name: "X", brand: "", model: "", category: "", description: "" })).rejects.toThrow(/modifié entre-temps/);
  });

  it("variante : update_sku_with_variant avec les deux versions attendues, champs hors formulaire préservés", async () => {
    const sku: EditableSku = {
      id: "s1",
      code: "IP13",
      cost_price: 300,
      sale_price: 400,
      location: null,
      reorder_point: 1,
      barcode: null,
      updated_at: "2026-10-09T10:00:00Z",
      variant: { id: "v1", name: "128 Go / Grade B", condition: "refurbished", grade: "B", ean: null, attributes: { storage: "128 Go", grade: "B" }, updated_at: "2026-10-09T09:00:00Z" },
    };
    const { client, queries } = fakeSupabase();
    await updateSku(client, ORG, sku, { cost_price: "310,00", sale_price: "", storage: "128 Go", color: "Noir", grade: "A", condition: "refurbished", location: "B2", reorder_point: "2", ean: "" });
    const args = queries[0]!.calls[0]!.args[0] as { p_sku: Record<string, unknown>; p_variant: Record<string, unknown>; p_expected_sku_updated_at: string; p_expected_variant_updated_at: string };
    expect(args.p_sku).toMatchObject({ cost_price: 310, sale_price: null, location: "B2", reorder_point: 2 });
    expect(Object.keys(args.p_sku)).not.toContain("safety_stock");
    expect(Object.keys(args.p_sku)).not.toContain("default_supplier_id");
    expect(args.p_variant).toMatchObject({ name: "128 Go / Noir / Grade A", grade: "A", attributes: { storage: "128 Go", color: "Noir", grade: "A" } });
    expect(args.p_expected_sku_updated_at).toBe(sku.updated_at);
    expect(args.p_expected_variant_updated_at).toBe(sku.variant.updated_at);
  });

  it("variante : prix invalide → aucune requête", async () => {
    const { client, queries } = fakeSupabase();
    const sku = { id: "s1", code: "X", cost_price: null, sale_price: null, location: null, reorder_point: 0, barcode: null, updated_at: "t", variant: { id: "v", name: "Standard", condition: "unknown", grade: null, ean: null, attributes: {}, updated_at: "t" } };
    await expect(updateSku(client, ORG, sku, { cost_price: "abc", sale_price: "", storage: "", color: "", grade: "", condition: "unknown", location: "", reorder_point: "0", ean: "" })).rejects.toBeInstanceOf(FormValidationError);
    expect(queries).toHaveLength(0);
  });
});
