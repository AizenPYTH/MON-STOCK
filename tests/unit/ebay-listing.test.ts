import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBulkPriceQuantity, buildInventoryItem, buildOffer, checkListingDraft, descriptionHtml, publicationGate, publishListing } from "@/integrations/ebay/listing";

/**
 * Annonces eBay (Sell Inventory API) : contrôle local, contenu exact envoyé, anti-doublon par
 * SKU, erreurs eBay lisibles, verrous de publication. Réponses eBay SIMULÉES : aucune annonce
 * réelle n'est créée ni modifiée par ces tests.
 */
const draft = {
  sku: "IP13-128-NR-A",
  title: "Apple iPhone 13 128 Go Noir - Reconditionné",
  description: "Testé, batterie 89 %.\n\nLivré avec câble <USB-C>.",
  categoryId: "9355",
  condition: "SELLER_REFURBISHED",
  price: 429.9,
  quantity: 3,
  imageUrls: ["https://cdn.example/1.jpg"],
  aspects: { "Modèle": ["iPhone 13"] },
  brand: "Apple",
  ean: "0194252707323",
  policies: { fulfillmentPolicyId: "F1", paymentPolicyId: "P1", returnPolicyId: "R1" },
  merchantLocationKey: "entrepot-1",
};

const auth = { getAccessToken: vi.fn(async () => "token-test") };
type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

function stubEbay(routes: (c: Call) => { status: number; json?: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const c = { url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers as Record<string, string> };
    calls.push(c);
    const r = routes(c);
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("contrôle de l'annonce", () => {
  it("annonce complète : aucune erreur ; contenu conforme à l'Inventory API", () => {
    const c = checkListingDraft(draft);
    expect(c.errors).toEqual([]);
    expect(c.ok).toBe(true);
    expect(buildInventoryItem(c.draft!)).toEqual({
      availability: { shipToLocationAvailability: { quantity: 3 } },
      condition: "SELLER_REFURBISHED",
      product: { title: draft.title, description: "<p>Testé, batterie 89 %.</p><p>Livré avec câble &lt;USB-C&gt;.</p>", aspects: { "Modèle": ["iPhone 13"], Marque: ["Apple"] }, imageUrls: draft.imageUrls, brand: "Apple", ean: ["0194252707323"] },
    });
    expect(buildOffer(c.draft!)).toMatchObject({ sku: draft.sku, marketplaceId: "EBAY_FR", format: "FIXED_PRICE", availableQuantity: 3, categoryId: "9355", merchantLocationKey: "entrepot-1", pricingSummary: { price: { value: "429.90", currency: "EUR" } }, listingPolicies: draft.policies });
  });

  it("refus explicites : titre > 80, sans photo, image HTTP, sans politiques ni emplacement", () => {
    expect(checkListingDraft({ ...draft, title: "x".repeat(81) }).errors.join(" ")).toMatch(/80 caractères/);
    expect(checkListingDraft({ ...draft, imageUrls: [] }).errors.join(" ")).toMatch(/Au moins une photo/);
    expect(checkListingDraft({ ...draft, imageUrls: ["http://x.example/a.jpg"] }).errors.join(" ")).toMatch(/HTTPS/);
    const c = checkListingDraft({ ...draft, policies: undefined, merchantLocationKey: undefined });
    expect(c.ok).toBe(false);
    expect(c.errors).toEqual(["Politiques métier eBay (paiement, retour, expédition) non choisies.", "Emplacement d'inventaire eBay (merchantLocationKey) non choisi."]);
    expect(checkListingDraft({ ...draft, condition: "GRADE_A" }).ok).toBe(false);
    expect(checkListingDraft({ ...draft, condition: "EXCELLENT_REFURBISHED" }).warnings.join(" ")).toMatch(/agrément/);
  });

  it("description : texte échappé (aucune injection HTML)", () => {
    expect(descriptionHtml('<script>alert("x")</script>')).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>");
  });
});

describe("publication (réponses eBay simulées)", () => {
  const base = "https://api.ebay.com";

  it("aucune offre existante : article, création de l'offre, publication — en-têtes fr-FR", async () => {
    const calls = stubEbay((c) => {
      if (c.method === "PUT" && c.url.includes("/inventory_item/")) return { status: 204 };
      if (c.method === "GET" && c.url.includes("/offer?sku=")) return { status: 404, json: { errors: [{ errorId: 25713, message: "This Offer is not available." }] } };
      if (c.method === "POST" && c.url.endsWith("/offer")) return { status: 201, json: { offerId: "OFF-1" } };
      if (c.method === "POST" && c.url.endsWith("/publish")) return { status: 200, json: { listingId: "1234567890" } };
      return { status: 500 };
    });
    const r = await publishListing(auth, base, checkListingDraft(draft).draft!);
    expect(r).toEqual({ sku: draft.sku, offerId: "OFF-1", listingId: "1234567890", createdOffer: true });
    expect(calls.map((c) => `${c.method} ${c.url.replace(base, "")}`)).toEqual([
      "PUT /sell/inventory/v1/inventory_item/IP13-128-NR-A",
      "GET /sell/inventory/v1/offer?sku=IP13-128-NR-A&marketplace_id=EBAY_FR",
      "POST /sell/inventory/v1/offer",
      "POST /sell/inventory/v1/offer/OFF-1/publish",
    ]);
    expect(calls[0]!.headers["Content-Language"]).toBe("fr-FR");
    expect(calls[0]!.headers.Authorization).toBe("Bearer token-test");
  });

  it("anti-doublon : une offre existe déjà pour ce SKU → mise à jour, jamais une seconde offre", async () => {
    const calls = stubEbay((c) => {
      if (c.method === "PUT" && c.url.includes("/inventory_item/")) return { status: 204 };
      if (c.method === "GET") return { status: 200, json: { offers: [{ offerId: "OFF-9", marketplaceId: "EBAY_FR", format: "FIXED_PRICE" }] } };
      if (c.method === "PUT" && c.url.includes("/offer/OFF-9")) return { status: 204 };
      if (c.url.endsWith("/publish")) return { status: 200, json: { listingId: "999" } };
      return { status: 500 };
    });
    const r = await publishListing(auth, base, checkListingDraft(draft).draft!);
    expect(r.createdOffer).toBe(false);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/offer"))).toBe(false);
  });

  it("erreur eBay : message lisible, aucune publication tentée après l'échec, POST jamais rejoué", async () => {
    const calls = stubEbay((c) => {
      if (c.method === "PUT") return { status: 204 };
      if (c.method === "GET") return { status: 404 };
      if (c.method === "POST" && c.url.endsWith("/offer")) return { status: 400, json: { errors: [{ errorId: 25002, message: "A user error has occurred. Policy missing." }] } };
      return { status: 200, json: {} };
    });
    await expect(publishListing(auth, base, checkListingDraft(draft).draft!)).rejects.toThrow(/Création de l'offre refusé par eBay \(HTTP 400\) : A user error has occurred/);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
});

describe("verrous et mises à jour", () => {
  it("publication refusée tant qu'un seul verrou manque", () => {
    expect(publicationGate({ enabledFlag: undefined, isAdmin: true, confirm: true, connected: true }).allowed).toBe(false);
    expect(publicationGate({ enabledFlag: "true", isAdmin: false, confirm: true, connected: true }).reasons).toEqual(["Seul un administrateur peut publier une annonce."]);
    expect(publicationGate({ enabledFlag: "true", isAdmin: true, confirm: false, connected: true }).allowed).toBe(false);
    expect(publicationGate({ enabledFlag: "true", isAdmin: true, confirm: true, connected: true })).toEqual({ allowed: true, reasons: [] });
  });

  it("prix / quantités groupés : 25 SKU maximum, quantités entières positives", () => {
    expect(buildBulkPriceQuantity([{ sku: "A", offerId: "O", quantity: 2.7, price: 10 }])).toEqual({ requests: [{ sku: "A", shipToLocationAvailability: { quantity: 2 }, offers: [{ offerId: "O", availableQuantity: 2, price: { value: "10.00", currency: "EUR" } }] }] });
    expect(() => buildBulkPriceQuantity([])).toThrow();
    expect(() => buildBulkPriceQuantity(Array.from({ length: 26 }, (_, i) => ({ sku: `S${i}`, offerId: "O", quantity: 1 })))).toThrow();
  });
});
