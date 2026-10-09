import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { clearEbayAppTokenCache, ebayBrowseAdapter, ebayCondition, mapEbayItem } from "@/integrations/sourcing/ebay-browse";
import { checkLibrarySource, checkLibrarySourceDetect, getLibrarySource, SOURCE_LIBRARY } from "@/services/sourcing/source-library";
import { ebayCallbackTarget } from "../../server/edge/ebay-callback";
import { routeOf } from "../../server/edge/api";
import { mockFetch, runCtx, sourceConfig } from "./helpers/sourcing-adapters";

const ENV_KEYS = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_RU_NAME", "EBAY_ENV", "SUPABASE_SERVICE_ROLE_KEY", "TOKEN_ENCRYPTION_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
  process.env.TOKEN_ENCRYPTION_KEY = "x".repeat(44);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  clearEbayAppTokenCache();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function withEbayKeys() {
  process.env.EBAY_CLIENT_ID = "app-id";
  process.env.EBAY_CLIENT_SECRET = "cert-id";
  process.env.EBAY_RU_NAME = "ru-name";
  process.env.EBAY_ENV = "production";
}

const browseBody = JSON.stringify({
  total: 2,
  itemSummaries: [
    {
      itemId: "v1|1234|0",
      title: "Apple iPhone 13 128 Go Noir - Grade B - Débloqué",
      price: { value: "329.00", currency: "EUR" },
      condition: "Très bon état - Reconditionné",
      conditionId: "2020",
      itemWebUrl: "https://www.ebay.fr/itm/1234",
      itemLocation: { country: "FR" },
      seller: { username: "pro-reconditionne", feedbackPercentage: "99.6" },
      shippingOptions: [{ shippingCost: { value: "0.00", currency: "EUR" }, shippingCostType: "FIXED" }],
      buyingOptions: ["FIXED_PRICE"],
    },
    { itemId: "v1|5678|0", title: "Lot 10 iPhone 11 pour pièces", price: { value: "450.00", currency: "EUR" }, conditionId: "7000", itemWebUrl: "https://www.ebay.fr/itm/5678" },
    { itemId: "v1|bad|0", title: "Sans prix" },
  ],
});

describe("adaptateur ebay-browse (API officielle Buy Browse)", () => {
  it("sans clés d'application : erreur explicite, aucune requête", async () => {
    delete process.env.EBAY_CLIENT_ID;
    const { fetchImpl, calls } = mockFetch([]);
    const r = await ebayBrowseAdapter.search(sourceConfig(), parseQuery("iphone"), "iphone", runCtx({ fetchImpl }));
    expect(r.error).toMatch(/non configurées/);
    expect(calls).toHaveLength(0);
  });

  it("jeton application (client credentials) puis recherche EBAY_FR livrable en France ; offres mappées sans invention", async () => {
    withEbayKeys();
    const { fetchImpl, calls } = mockFetch([
      ["/identity/v1/oauth2/token", { body: JSON.stringify({ access_token: "app-token", expires_in: 7200 }) }],
      ["/buy/browse/v1/item_summary/search", { body: browseBody }],
    ]);
    const r = await ebayBrowseAdapter.search(sourceConfig(), parseQuery("iphone 13 128"), "iphone 13 128", runCtx({ fetchImpl }));
    expect(r.error).toBeNull();
    expect(calls[0]!.init?.body).toContain("grant_type=client_credentials");
    const search = new URL(calls[1]!.url);
    expect(search.searchParams.get("q")).toBe("iphone 13 128");
    expect(search.searchParams.get("filter")).toContain("deliveryCountry:FR");
    expect((calls[1]!.init?.headers as Record<string, string>)["X-EBAY-C-MARKETPLACE-ID"]).toBe("EBAY_FR");
    expect(r.offers).toHaveLength(2);
    expect(r.offers[0]).toMatchObject({ externalOfferId: "v1|1234|0", price: 329, currency: "EUR", shippingCost: 0, country: "FR", condition: "refurbished", grade: "B", availableQuantity: null, stockStatus: "unknown", url: "https://www.ebay.fr/itm/1234" });
    expect(r.offers[1]).toMatchObject({ condition: "used", grade: null });
    expect((r.offers[1]!.raw as { is_lot: boolean }).is_lot).toBe(true);
  });

  it("le jeton d'application est réutilisé tant qu'il est valide", async () => {
    withEbayKeys();
    const { fetchImpl, calls } = mockFetch([
      ["/identity/v1/oauth2/token", { body: JSON.stringify({ access_token: "t", expires_in: 7200 }) }],
      ["/buy/browse/", { body: browseBody }],
    ]);
    await ebayBrowseAdapter.search(sourceConfig(), parseQuery("a"), "a", runCtx({ fetchImpl }));
    await ebayBrowseAdapter.search(sourceConfig(), parseQuery("b"), "b", runCtx({ fetchImpl }));
    expect(calls.filter((c) => c.url.includes("oauth2/token"))).toHaveLength(1);
  });

  it("clés refusées par eBay → message explicite", async () => {
    withEbayKeys();
    const { fetchImpl } = mockFetch([["/identity/v1/oauth2/token", { status: 401, body: JSON.stringify({ error: "invalid_client" }) }]]);
    const r = await ebayBrowseAdapter.search(sourceConfig(), parseQuery("a"), "a", runCtx({ fetchImpl }));
    expect(r.error).toMatch(/refuse les clés/);
  });

  it("niveaux reconditionnés eBay jamais convertis en grades A/B/C sans mention explicite", () => {
    expect(ebayCondition({ conditionId: "2010", title: "iPhone 12" })).toEqual({ condition: "refurbished", grade: null });
    expect(ebayCondition({ conditionId: "1000", title: "iPhone 15 neuf" })).toEqual({ condition: "new", grade: null });
    expect(mapEbayItem({ itemId: "x", title: "t", price: { value: "0", currency: "EUR" } }, "u")).toBeNull();
  });
});

describe("bibliothèque de sources : vérification réelle avant toute activation", () => {
  it("les clés sont uniques et chaque source a une page de conditions et une requête de vérification", () => {
    expect(new Set(SOURCE_LIBRARY.map((s) => s.key)).size).toBe(SOURCE_LIBRARY.length);
    for (const s of SOURCE_LIBRARY) {
      expect(s.termsUrl).toMatch(/^https:\/\//);
      expect(s.probeQuery.length).toBeGreaterThan(2);
    }
  });

  it("robots.txt interdit → robots_disallowed, aucune recherche", async () => {
    const s = getLibrarySource("foneday")!;
    const { fetchImpl, calls } = mockFetch([["/robots.txt", { body: "User-agent: *\nDisallow: /search\nDisallow: /products", contentType: "text/plain" }]]);
    const r = await checkLibrarySource(s, { fetchImpl, resolver: runCtx().resolver, sleep: async () => undefined });
    expect(r.status).toBe("robots_disallowed");
    expect(calls.every((c) => c.url.endsWith("/robots.txt"))).toBe(true);
  });

  it("boutique Shopify qui renvoie des produits avec prix → ok avec preuves (exemples titre/prix)", async () => {
    const s = getLibrarySource("foneday")!;
    const suggest = JSON.stringify({ resources: { results: { products: [{ id: 1, handle: "iphone-13-lcd", title: "iPhone 13 LCD", url: "/products/iphone-13-lcd", price: "39.95", available: true, vendor: "Foneday" }] } } });
    const detail = JSON.stringify({ product: { id: 1, title: "iPhone 13 LCD", handle: "iphone-13-lcd", vendor: "Foneday", body_html: "", product_type: "LCD", tags: [], variants: [{ id: 11, title: "Default Title", option1: "Default Title", option2: null, option3: null, price: "39.95", sku: "F-1", available: true, product_id: 1 }] } });
    const { fetchImpl } = mockFetch([
      ["/robots.txt", { body: "User-agent: *\nDisallow: /checkout", contentType: "text/plain" }],
      ["/search/suggest.json", { body: suggest }],
      ["/products/iphone-13-lcd.json", { body: detail }],
    ]);
    const r = await checkLibrarySource(s, { fetchImpl, resolver: runCtx().resolver, sleep: async () => undefined });
    expect(r.status).toBe("ok");
    expect(r.sample[0]).toMatchObject({ title: "iPhone 13 LCD", price: 39.95, currency: "EUR" });
  });

  it("pas une boutique Shopify : essai WooCommerce (détection de plateforme), sinon échec honnête", async () => {
    const s = getLibrarySource("mobileparts-shop")!;
    const { fetchImpl } = mockFetch([["/robots.txt", { body: "User-agent: *\nAllow: /", contentType: "text/plain" }]]);
    const r = await checkLibrarySourceDetect(s, { fetchImpl, resolver: runCtx().resolver, sleep: async () => undefined });
    expect(r.status).not.toBe("ok");
    expect(r.message).toMatch(/woocommerce-store/);
  });

  it("eBay sans clés → not_configured (jamais affiché comme connecté)", async () => {
    delete process.env.EBAY_CLIENT_ID;
    const r = await checkLibrarySource(getLibrarySource("ebay-fr")!);
    expect(r.status).toBe("not_configured");
  });
});

describe("Edge Function api : routage et retour OAuth eBay", () => {
  it("chemin relatif à la fonction", () => {
    expect(routeOf(new URL("https://x.supabase.co/functions/v1/api/sourcing/search?q=a"))).toBe("/sourcing/search");
    expect(routeOf(new URL("http://localhost/api/health/"))).toBe("/health");
    expect(routeOf(new URL("http://localhost/api"))).toBe("/");
  });

  it("retour eBay : seuls code/state au format attendu sont relayés vers l'application", () => {
    const ok = new URL(ebayCallbackTarget(new URL("https://x/api/ebay/callback?code=v%5E1.1%23i%5E1&state=" + "a".repeat(43) + "&expires_in=299")));
    expect(ok.protocol).toBe("monstock:");
    expect(ok.searchParams.get("code")).toBe("v^1.1#i^1");
    expect(ok.searchParams.get("state")).toBe("a".repeat(43));
    expect(ok.searchParams.has("expires_in")).toBe(false);
    const denied = new URL(ebayCallbackTarget(new URL("https://x/api/ebay/callback?error=access_denied&state=" + "b".repeat(43))));
    expect(denied.searchParams.get("error")).toBe("access_denied");
    expect(denied.searchParams.has("code")).toBe(false);
    const weird = new URL(ebayCallbackTarget(new URL("https://x/api/ebay/callback?error=<script>")));
    expect(weird.searchParams.get("error")).toBe("ebay_error");
    const forged = new URL(ebayCallbackTarget(new URL("https://x/api/ebay/callback?code=a&state=<x>")));
    expect(forged.searchParams.get("error")).toBe("incomplete");
  });
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => ({}) }));
