import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { prioritizeMarketplaces } = await import("@/services/sourcing/live-search");

describe("recherche en direct : eBay interrogé en premier", () => {
  it("les places de marché passent avant les autres sources (limite de 10 par recherche), ordre conservé sinon", () => {
    const list = [{ adapterKey: "shopify-storefront", n: 1 }, { adapterKey: null, n: 2 }, { adapterKey: "ebay-browse", n: 3 }, { adapterKey: "woocommerce-store", n: 4 }];
    expect(prioritizeMarketplaces(list).map((x) => x.n)).toEqual([3, 1, 2, 4]);
  });
});
