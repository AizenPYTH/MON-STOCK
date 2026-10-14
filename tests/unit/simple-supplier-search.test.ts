import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "./helpers/memory-db";

vi.mock("server-only", () => ({}));
const { groupBySupplier, matchesQuery, queryTokens, simpleSupplierSearch } = await import("@/services/sourcing/simple-search");

const ORG = "11111111-1111-4111-8111-111111111111";
const RA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// titres réels relevés en production le 13/10/2026
const offer = (id: string, supplier: string, title: string, price: number, over: Record<string, unknown> = {}) => ({
  id,
  organization_id: ORG,
  supplier_id: supplier,
  title_original: title,
  original_price: price,
  original_currency: "EUR",
  normalized_price: price,
  tax_type: "unknown",
  available_quantity: null,
  stock_status: "in_stock",
  source_url: `https://example.test/${id}`,
  last_seen_at: "2026-10-13T16:10:00Z",
  status: "active",
  ...over,
});

describe("correspondance du titre", () => {
  it("mots sans accents ni majuscules ; nombres entiers (12 ≠ 128 Go) ; tous les mots requis", () => {
    expect(queryTokens("Écran  iPhone 12 de")).toEqual(["ecran", "iphone", "12"]);
    expect(matchesQuery("Ecran iPhone 12 - Origine Apple", queryTokens("écran iphone 12"))).toBe(true);
    expect(matchesQuery("iPhone 11 Used - 128 GB / Mixed", queryTokens("iphone 12"))).toBe(false);
    expect(matchesQuery("iPhone 15 Pro Used - 512 GB / Mixed / A+/A", queryTokens("iphone 15 pro"))).toBe(true);
    expect(matchesQuery("iPhone 15 Used - 128 GB", queryTokens("iphone 15 pro"))).toBe(false);
    expect(matchesQuery("Batterie trottinette Xiaomi M365", queryTokens("batterie trottinette"))).toBe(true);
  });

  it("regroupement : un bloc par fournisseur, du moins cher au plus cher, rupture en dernier", () => {
    const groups = groupBySupplier([
      { ...offer("1", RA, "iPhone 15 Pro Used - 256 GB", 699), supplier: { name: "Refreshed Apples", country: "NL" } },
      { ...offer("2", RA, "iPhone 15 Pro Used - 128 GB", 550), supplier: { name: "Refreshed Apples", country: "NL" } },
      { ...offer("3", BP, "Ecran iPhone 15 Pro - Origine Apple", 369.9, { stock_status: "out_of_stock" }), supplier: { name: "Brico-phone", country: "FR" } },
      { ...offer("4", BP, "Verre trempé iPhone 15 Pro", 7.9), supplier: { name: "Brico-phone", country: "FR" } },
    ] as never);
    expect(groups.map((g) => g.supplierName)).toEqual(["Brico-phone", "Refreshed Apples"]);
    expect(groups[0]!.offers.map((o) => o.title)).toEqual(["Verre trempé iPhone 15 Pro", "Ecran iPhone 15 Pro - Origine Apple"]);
    expect(groups[1]!.offers.map((o) => o.price)).toEqual([550, 699]);
  });
});

describe("recherche Fournisseurs", () => {
  const db = () =>
    memoryDb({
      suppliers: [
        { id: RA, organization_id: ORG, name: "Refreshed Apples", country: "NL" },
        { id: BP, organization_id: ORG, name: "Brico-phone", country: "FR" },
      ],
      sourcing_offers: [
        offer("1", RA, "iPhone 15 Pro Used - 128 GB / Mixed / A/B Grade", 550),
        offer("2", RA, "iPhone 13 Used - 128 GB", 290),
        offer("3", BP, "Batterie iPhone 15 Pro - Pulled Origine Apple", 49.9),
        offer("4", BP, "Ecran iPhone 15 Pro (expirée)", 10, { status: "expired" }),
        offer("5", BP, "Batterie iPhone 15 Pro autre organisation", 1, { organization_id: "99999999-9999-4999-8999-999999999999" }),
      ],
    });
  const ctx = (client: unknown) => ({ supabase: client, user: { id: "u1" }, organization: { id: ORG, default_currency: "EUR" }, role: "owner" }) as never;

  it("interroge les fournisseurs puis liste les offres actives de l'organisation, par fournisseur", async () => {
    const d = db();
    const live = vi.fn().mockResolvedValue({ sources: [{ supplierName: "Refreshed Apples", status: "ok", found: 6, message: null }, { supplierName: "Brico-phone", status: "timeout", found: 0, message: "Délai dépassé" }] });
    const r = await simpleSupplierSearch(ctx(d.client), "iPhone 15 Pro", { live });
    expect(live).toHaveBeenCalledWith(expect.anything(), "iPhone 15 Pro");
    expect(r.total).toBe(2);
    expect(r.suppliers.map((s) => [s.supplierName, s.offers.map((o) => o.price)])).toEqual([
      ["Brico-phone", [49.9]],
      ["Refreshed Apples", [550]],
    ]);
    expect(r.checked).toEqual([
      { supplierName: "Refreshed Apples", ok: true, found: 6, message: null },
      { supplierName: "Brico-phone", ok: false, found: 0, message: "Délai dépassé" },
    ]);
    expect(r.partial).toBe(false);
  });

  it("recherche en direct trop lente ou en panne : on montre quand même ce qui est déjà connu", async () => {
    const slow = vi.fn(() => new Promise<never>(() => {}));
    const r = await simpleSupplierSearch(ctx(db().client), "iphone 13", { live: slow, budgetMs: 5 });
    expect(r).toMatchObject({ partial: true, total: 1 });
    expect(r.suppliers[0]!.offers[0]).toMatchObject({ title: "iPhone 13 Used - 128 GB", price: 290, currency: "EUR" });
    const broken = vi.fn().mockRejectedValue(new Error("HTTP 503"));
    expect(await simpleSupplierSearch(ctx(db().client), "iphone 13", { live: broken })).toMatchObject({ partial: true, total: 1 });
  });

  it("recherche vide refusée avec un exemple", async () => {
    await expect(simpleSupplierSearch(ctx(db().client), "  ", { live: vi.fn() })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("analyse « bonne affaire » dans la recherche", () => {
  const EB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const SRC_EBAY = "5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e";
  const SRC_WEB = "6f6f6f6f-6f6f-4f6f-8f6f-6f6f6f6f6f6f";
  const dev = { brand: "apple", model: "iphone 13", storage: "128gb", condition: "refurbished", grade: "a" };
  const db = (orgSettings: unknown = null) => ({
    db: memoryDb({
      suppliers: [
        { id: RA, organization_id: ORG, name: "Refreshed Apples", country: "NL" },
        { id: EB, organization_id: ORG, name: "eBay", country: null },
      ],
      supplier_sources: [
        { id: SRC_EBAY, organization_id: ORG, config: { adapter: "ebay-browse" } },
        { id: SRC_WEB, organization_id: ORG, config: { adapter: "shopify-storefront" } },
      ],
      sourcing_offers: [
        offer("s1", RA, "iPhone 13 128GB Grade A reconditionné", 250, { ...dev, source_id: SRC_WEB, tax_type: "ttc", shipping_cost: 0, moq: 1 }),
        offer("e1", EB, "Apple iPhone 13 128 Go Bleu - Grade A reconditionné", 400, { ...dev, source_id: SRC_EBAY }),
        offer("e2", EB, "iPhone 13 128GB Minuit reconditionné grade A", 420, { ...dev, source_id: SRC_EBAY }),
        offer("e3", EB, "iPhone 13 128 Go grade A reconditionné", 440, { ...dev, source_id: SRC_EBAY }),
        // même modèle, autre capacité : jamais comparé
        offer("x1", RA, "iPhone 13 256GB Grade A reconditionné", 100, { ...dev, storage: "256gb", source_id: SRC_WEB }),
      ],
      sales_channels: [{ id: "c1", organization_id: ORG, provider: "ebay", fee_percent: 10, payment_fee_percent: 0, payment_fee_fixed: 0, default_shipping_cost: 5 }],
    }),
    ctx: { user: { id: "u1" }, organization: { id: ORG, default_currency: "EUR", settings: orgSettings }, role: "owner" },
  });

  it("chaque offre porte son analyse : marché eBay équivalent, coût total, revente, marge, niveau", async () => {
    const { db: d, ctx } = db({ radar: { vatRegime: "margin", vatRate: 20, vatRecoverable: false, packagingCost: 1, returnProvisionPercent: 0, importDutyPercent: 0 } });
    const r = await simpleSupplierSearch({ ...ctx, supabase: d.client } as never, "iphone 13", { live: vi.fn().mockResolvedValue({ sources: [] }) });
    const s1 = r.offers.find((o) => o.id === "s1")!;
    expect(s1.deal).toMatchObject({ comparable: true, marketBasis: "marketplace", marketCount: 3, marketPrice: 420, resalePrice: 410, totalCost: 250, provisional: false });
    // 410 − 250 = 160 ; TVA sur marge 26,67 ; frais 41 + 5 + 1 = 47 → 86,33
    expect(s1.deal!.margin).toBe(86.33);
    expect(s1.deal!.level).toBe("very_good");
    expect(s1.deal!.label).toBe("Très intéressant");
    // la 256 Go n'a aucun équivalent
    expect(r.offers.find((o) => o.id === "x1")!.deal!.level).toBe("insufficient_data");
    expect(r.missingCostSettings).toEqual([]);
  });

  it("sans paramètres de coûts : marge provisoire et paramètres manquants listés", async () => {
    const { db: d, ctx } = db();
    const r = await simpleSupplierSearch({ ...ctx, supabase: d.client } as never, "iphone 13", { live: vi.fn().mockResolvedValue({ sources: [] }) });
    const s1 = r.offers.find((o) => o.id === "s1")!;
    expect(s1.deal!.provisional).toBe(true);
    expect(s1.deal!.level).not.toBe("very_good");
    expect(r.missingCostSettings).toContain("régime de TVA");
  });
});
