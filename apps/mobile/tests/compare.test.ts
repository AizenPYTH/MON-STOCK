import { compareOffers, createDraftPurchaseOrder, groupKeyOf, type OfferRow } from "~/data/compare";
import { fakeSupabase } from "./fake-supabase";

const ctx = { feePercent: 10, paymentFeePercent: 0, paymentFeeFixed: 0, shippingCost: 0 };
const offer = (o: Partial<OfferRow>): OfferRow => ({
  id: "o",
  title: "iPhone 13",
  supplierId: "sup",
  supplierName: "Fournisseur",
  skuId: "sku",
  normalizedProductId: null,
  grade: "B",
  price: 300,
  currency: "EUR",
  moq: 1,
  deliveryDays: 2,
  availableQuantity: 10,
  shippingCost: null,
  sourceUrl: null,
  lastSeenAt: null,
  ...o,
});

describe("comparaison d'offres réelles", () => {
  it("regroupe par SKU, sinon produit normalisé, sinon offre seule", () => {
    expect(groupKeyOf({ id: "1", skuId: "s", normalizedProductId: "n" })).toBe("sku:s");
    expect(groupKeyOf({ id: "1", skuId: null, normalizedProductId: "n" })).toBe("np:n");
    expect(groupKeyOf({ id: "1", skuId: null, normalizedProductId: null })).toBe("offer:1");
  });

  it("trie par marge estimée décroissante ; port connu → coût rendu", () => {
    const r = compareOffers([offer({ id: "cher", price: 312 }), offer({ id: "moins-cher", price: 285 }), offer({ id: "port", price: 280, moq: 10, shippingCost: 100 })], 489, ctx);
    expect(r.map((o) => o.id)).toEqual(["moins-cher", "port", "cher"]);
    expect(r.find((o) => o.id === "port")!.landedUnitCost).toBe(290);
  });

  it("sans prix de revente connu : marge inconnue (jamais inventée), tri par prix", () => {
    const r = compareOffers([offer({ id: "b", price: 300 }), offer({ id: "a", price: 250 })], null, ctx);
    expect(r.every((o) => o.marginPercent === null)).toBe(true);
    expect(r.map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("brouillon de commande fournisseur", () => {
  const input = { organizationId: "org", userId: "u", currency: "EUR", quantity: 10, offer: { id: "o", supplierId: "sup", skuId: "sku", price: 285 } };

  it("M-16 : en-tête BROUILLON et ligne créés en UNE transaction (RPC sous RLS), aucune écriture directe", async () => {
    const { client, queries } = fakeSupabase({ "rpc:create_draft_purchase_order": { data: "po1" } });
    expect(await createDraftPurchaseOrder(client, input)).toEqual({ purchaseOrderId: "po1" });
    expect(queries.map((q) => q.target)).toEqual(["rpc:create_draft_purchase_order"]);
    expect(queries[0]!.calls[0]!.args[0]).toMatchObject({ p_organization_id: "org", p_supplier_id: "sup", p_currency: "EUR", p_sku_id: "sku", p_offer_id: "o", p_quantity: 10, p_unit_cost: 285 });
  });

  it("refuse une offre non associée à un SKU sans rien écrire", async () => {
    const { client, queries } = fakeSupabase();
    await expect(createDraftPurchaseOrder(client, { ...input, offer: { ...input.offer, skuId: null } })).rejects.toThrow(/Associez d'abord/);
    expect(queries).toHaveLength(0);
  });

  it("refus de la base : message traduit, rien d'autre n'est tenté (la transaction n'a rien laissé)", async () => {
    const { client, queries } = fakeSupabase({ "rpc:create_draft_purchase_order": { error: { code: "42501", message: "permission denied" } } });
    await expect(createDraftPurchaseOrder(client, input)).rejects.toThrow(/droits/);
    expect(queries.map((q) => q.target)).toEqual(["rpc:create_draft_purchase_order"]);
  });
});
