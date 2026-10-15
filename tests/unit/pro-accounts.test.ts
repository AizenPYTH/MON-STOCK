import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "./helpers/memory-db";
import { domainOf, initialsOf, logoUrlFor, offerAccessOf, PRO_ACCOUNTS } from "@/domain/sourcing/pro-accounts";

vi.mock("server-only", () => ({}));
const connectors = vi.hoisted(() => ({
  createSupplierConnection: vi.fn(async () => "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
  testSupplierConnection: vi.fn(async () => ({ ok: true, message: "Connexion vérifiée." })),
  syncSupplierConnection: vi.fn(async () => ({ status: "success", message: "12 offres." })),
}));
vi.mock("@/services/sourcing/supplier-connectors", () => connectors);
const { connectProAccount, directoryKeyForSupplier, proAccountsHub, proStatusOf, syncProAccount } = await import("@/services/sourcing/pro-accounts");
const { SUPPLIER_DIRECTORY } = await import("@/services/sourcing/supplier-directory");
const { simpleSupplierSearch } = await import("@/services/sourcing/simple-search");

const ORG = "11111111-1111-4111-8111-111111111111";
const FOX = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";
const BRICO = "b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0";
const SRC_FILE = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const SRC_PUBLIC = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const ctxOf = (client: unknown) => ({ supabase: client, user: { id: "u1" }, organization: { id: ORG, name: "Snowolff", country: "FR", default_currency: "EUR", settings: null }, role: "owner" }) as never;

describe("comptes pro : règles pures", () => {
  it("prix de votre compte, source publique ou place de marché", () => {
    expect(offerAccessOf("CSV", null)).toBe("account");
    expect(offerAccessOf("SUPPLIER_ACCOUNT", { adapter: "bigbuy" })).toBe("account");
    expect(offerAccessOf("PUBLIC_WEB", { adapter: "shopify-storefront" })).toBe("public");
    expect(offerAccessOf("API", { adapter: "ebay-browse" })).toBe("marketplace");
    expect(offerAccessOf(null, null)).toBe("public");
  });

  it("logo : domaine du site du fournisseur, initiales à défaut", () => {
    expect(domainOf("https://www.foxway.com/en/buy-devices/")).toBe("foxway.com");
    expect(domainOf("callisto.tech")).toBe("callisto.tech");
    expect(domainOf(null)).toBeNull();
    expect(logoUrlFor("foxway.com")).toBe("https://www.google.com/s2/favicons?domain=foxway.com&sz=64");
    expect(logoUrlFor(null)).toBeNull();
    expect(initialsOf("Foxway (Reseller Portal / Wholesale)")).toBe("FO");
    expect(initialsOf("MobileSentrix Europe")).toBe("ME");
  });

  it("chaque compte pro correspond à une fiche réelle de l'annuaire", () => {
    for (const spec of PRO_ACCOUNTS) expect(SUPPLIER_DIRECTORY.some((e) => e.key === spec.key), spec.key).toBe(true);
    // seuls les connecteurs API réellement implémentés sont proposés
    expect(PRO_ACCOUNTS.filter((s) => s.methods.includes("api")).map((s) => s.connectorKey)).toEqual(["ingram-micro", "bigbuy"]);
  });

  it("statut : connecté seulement sur preuve", () => {
    expect(proStatusOf({ connection: null, accountOffers: 0 })).toBe("not_connected");
    expect(proStatusOf({ connection: { status: "pending" }, accountOffers: 0 })).toBe("pending");
    expect(proStatusOf({ connection: { status: "error" }, accountOffers: 0 })).toBe("error");
    expect(proStatusOf({ connection: { status: "connected" }, accountOffers: 0 })).toBe("connected");
    expect(proStatusOf({ connection: null, accountOffers: 3 })).toBe("connected");
  });

  it("fournisseur de l'organisation rattaché à sa fiche par le site, sinon par le nom", () => {
    expect(directoryKeyForSupplier({ name: "Mon grossiste nordique", website: "https://resellers.foxway.com" })).toBe("foxway");
    expect(directoryKeyForSupplier({ name: "Foneday", website: null })).toBe("foneday");
  });
});

describe("« Connectez vos comptes » : statut réel dans l'organisation", () => {
  const db = () =>
    memoryDb({
      suppliers: [
        { id: FOX, organization_id: ORG, name: "Foxway", website: "https://www.foxway.com", is_archived: false },
        { id: BRICO, organization_id: ORG, name: "Brico-phone", website: "https://www.brico-phone.com", is_archived: false },
      ],
      supplier_sources: [
        { id: SRC_FILE, organization_id: ORG, supplier_id: FOX, source_type: "CSV", status: "active", config: {}, last_successful_sync_at: "2026-10-15T08:00:00Z", last_error: null },
        { id: SRC_PUBLIC, organization_id: ORG, supplier_id: BRICO, source_type: "PUBLIC_WEB", status: "active", config: { adapter: "shopify-storefront" }, last_successful_sync_at: "2026-10-14T08:00:00Z", last_error: null },
      ],
      supplier_connections: [],
      sourcing_offers: [
        { id: "o1", organization_id: ORG, source_id: SRC_FILE, status: "active" },
        { id: "o2", organization_id: ORG, source_id: SRC_FILE, status: "active" },
        { id: "o3", organization_id: ORG, source_id: SRC_PUBLIC, status: "active" },
        { id: "o4", organization_id: ORG, source_id: SRC_PUBLIC, status: "expired" },
      ],
    });

  it("Foxway connecté (liste de stock importée) en tête, sources publiques listées avec leur domaine", async () => {
    const r = await proAccountsHub(ctxOf(db().client));
    expect(r.accounts[0]).toMatchObject({ key: "foxway", status: "connected", offers: 2, domain: "foxway.com", supplierId: FOX, connector: null });
    expect(r.accounts.find((a) => a.key === "foneday")).toMatchObject({ status: "not_connected", offers: 0 });
    expect(r.accounts.find((a) => a.key === "bigbuy")!.connector!.fields.map((f) => f.name)).toEqual(["api_key"]);
    expect(r.accounts.find((a) => a.key === "foxway")!.email.fr.subject).toMatch(/Snowolff/);
    expect(r.publicSources).toEqual([{ sourceId: SRC_PUBLIC, supplierName: "Brico-phone", domain: "brico-phone.com", country: null, offers: 1, lastSuccessAt: "2026-10-14T08:00:00Z" }]);
    expect(r.totals).toEqual({ account: 2, public: 1, marketplace: 0 });
  });

  it("connexion API : fournisseur créé si absent, identifiants transmis au service chiffré, test réel", async () => {
    const d = db();
    const r = await connectProAccount(ctxOf(d.client), { key: "bigbuy", credentials: { api_key: "  clé-secrète  " } });
    expect(r).toMatchObject({ ok: true });
    const created = d.tables.suppliers!.find((s) => s.name === "BigBuy")!;
    expect(created).toMatchObject({ organization_id: ORG, website: "https://www.bigbuy.eu/fr/" });
    expect(connectors.createSupplierConnection).toHaveBeenCalledWith({ organizationId: ORG, supplierId: created.id, connectorKey: "bigbuy", credentials: { api_key: "clé-secrète" } });
    expect(connectors.testSupplierConnection).toHaveBeenCalled();
  });

  it("refus : fournisseur sans connecteur API, identifiant manquant, connexion d'une autre organisation", async () => {
    await expect(connectProAccount(ctxOf(db().client), { key: "foxway", credentials: {} })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(connectProAccount(ctxOf(db().client), { key: "bigbuy", credentials: { api_key: " " } })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(syncProAccount(ctxOf(db().client), "99999999-9999-4999-8999-999999999999")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("recherche : chaque offre dit d'où vient son prix, avec le logo du fournisseur", () => {
  it("offre de votre compte (fichier Foxway) et offre publique (Brico-phone)", async () => {
    const d = memoryDb({
      suppliers: [
        { id: FOX, organization_id: ORG, name: "Foxway", website: "https://www.foxway.com", country: "EE" },
        { id: BRICO, organization_id: ORG, name: "Brico-phone", website: "https://www.brico-phone.com", country: "FR" },
      ],
      supplier_sources: [
        { id: SRC_FILE, organization_id: ORG, config: {} },
        { id: SRC_PUBLIC, organization_id: ORG, config: { adapter: "shopify-storefront" } },
      ],
      sourcing_offers: [
        { id: "a", organization_id: ORG, supplier_id: FOX, source_id: SRC_FILE, source_type: "CSV", title_original: "iPhone 13 128GB Grade A", original_price: 250, original_currency: "EUR", normalized_price: 250, tax_type: "ht", available_quantity: 12, stock_status: "in_stock", source_url: null, last_seen_at: "2026-10-15T08:00:00Z", status: "active" },
        { id: "b", organization_id: ORG, supplier_id: BRICO, source_id: SRC_PUBLIC, source_type: "PUBLIC_WEB", title_original: "Ecran iPhone 13 OLED", original_price: 89, original_currency: "EUR", normalized_price: 89, tax_type: "ttc", available_quantity: null, stock_status: "in_stock", source_url: "https://www.brico-phone.com/ecran-iphone-13", last_seen_at: "2026-10-15T08:00:00Z", status: "active" },
      ],
    });
    const r = await simpleSupplierSearch(ctxOf(d.client), "iphone 13", { live: vi.fn().mockResolvedValue({ sources: [] }) });
    expect(r.offers.map((o) => [o.id, o.access, o.domain, o.url])).toEqual([
      ["b", "public", "brico-phone.com", "https://www.brico-phone.com/ecran-iphone-13"],
      ["a", "account", "foxway.com", null],
    ]);
    expect(r.suppliers.find((s) => s.supplierName === "Foxway")).toMatchObject({ access: "account", domain: "foxway.com" });
  });
});
