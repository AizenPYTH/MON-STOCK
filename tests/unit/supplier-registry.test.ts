import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "./helpers/memory-db";
import { accessMethodsOf, integrationStatusOf, NO_FACTS, primaryActionOf, priorityOf, reliabilityOf, type RegistryEntryInput } from "@/domain/sourcing/supplier-registry";

vi.mock("server-only", () => ({}));
const { directoryForOrg, SUPPLIER_DIRECTORY, libraryKeyForDirectory } = await import("@/services/sourcing/supplier-directory");
const { supplierOffers } = await import("@/services/sourcing/pro-accounts");

const entry = (o: Partial<RegistryEntryInput> = {}): RegistryEntryInput => ({ key: "x", segment: "A_refurb", country: "NL", deliveryZones: ["EU"], categories: ["smartphones"], accessModes: [], proAccountRequired: null, apiDocsUrl: null, verificationLevel: "search_snippets", ...o });

describe("registre : méthodes d'accès réelles", () => {
  it("connecteur MON STOCK = API officielle intégrée ; API sans connecteur = développement spécifique", () => {
    expect(accessMethodsOf(entry({ key: "bigbuy", accessModes: ["api", "feed_csv"], proAccountRequired: true }))).toEqual(["official_api", "catalog_feed", "manual_import", "pro_account_first"]);
    expect(accessMethodsOf(entry({ key: "inconnu", accessModes: ["api"] }))).toEqual(["custom_development"]);
  });
  it("liste de stock par e-mail ou export d'espace client = import de fichier", () => {
    expect(accessMethodsOf(entry({ accessModes: ["pro_portal", "manual_download"], proAccountRequired: true }))).toEqual(["portal_export", "manual_import", "pro_account_first"]);
    expect(accessMethodsOf(entry({ accessModes: ["email_pricelist"] }))).toEqual(["manual_import"]);
  });
  it("devis uniquement : non automatisable ; CGU interdisant l'automatisation : écarté", () => {
    expect(accessMethodsOf(entry({ accessModes: ["email_quote"] }))).toEqual(["not_automatable"]);
    expect(accessMethodsOf(entry({ key: "utopya", accessModes: ["pro_portal"] }))).toEqual(["not_automatable"]);
    expect(integrationStatusOf(entry({ key: "utopya" }), ["not_automatable"], NO_FACTS)).toBe("abandoned");
  });
  it("catalogue public intégré si la bibliothèque MON STOCK le propose", () => {
    expect(accessMethodsOf(entry({ accessModes: ["public_catalog"] }), { publicAvailable: true })).toContain("public_integrated");
  });
});

describe("registre : statut d'intégration sur preuve uniquement", () => {
  const m = accessMethodsOf(entry({ key: "bigbuy", accessModes: ["api"], proAccountRequired: true }));
  it("connecté et testé seulement avec une preuve", () => {
    expect(integrationStatusOf(entry({ key: "bigbuy", proAccountRequired: true }), m, NO_FACTS)).toBe("pro_account_required");
    expect(integrationStatusOf(entry({ key: "bigbuy" }), m, { ...NO_FACTS, connectionPending: true })).toBe("in_progress");
    expect(integrationStatusOf(entry({ key: "bigbuy" }), m, { ...NO_FACTS, connectionOk: true })).toBe("connected_tested");
    expect(integrationStatusOf(entry(), ["manual_import"], { ...NO_FACTS, imported: true })).toBe("connected_tested");
  });
  it("API annoncée sans documentation : accès commercial à demander", () => {
    expect(integrationStatusOf(entry({ accessModes: ["api"] }), ["custom_development"], NO_FACTS)).toBe("commercial_access_needed");
  });
  it("action principale cohérente, jamais de fausse connexion", () => {
    expect(primaryActionOf({ status: "pro_account_required", methods: ["official_api", "pro_account_first"], connected: false, hasConnection: false }).kind).toBe("connect_api");
    expect(primaryActionOf({ status: "connected_tested", methods: ["official_api"], connected: true, hasConnection: true }).kind).toBe("sync");
    expect(primaryActionOf({ status: "pro_account_required", methods: ["portal_export", "manual_import", "pro_account_first"], connected: false, hasConnection: false }).kind).toBe("get_pro_access");
    expect(primaryActionOf({ status: "file_import", methods: ["manual_import"], connected: false, hasConnection: false }).kind).toBe("import_catalog");
    expect(primaryActionOf({ status: "not_automatable", methods: ["not_automatable"], connected: false, hasConnection: false }).kind).toBe("open_site");
    expect(primaryActionOf({ status: "abandoned", methods: ["not_automatable"], connected: false, hasConnection: false }).label).toBe("Ouvrir le site fournisseur");
  });
});

describe("registre : priorité et fiabilité", () => {
  it("critères explicites ; un écarté vaut 0", () => {
    const fr = priorityOf(entry({ key: "mobilax", country: "FR", deliveryZones: ["FR"], categories: ["parts", "screens", "batteries"], segment: "B_parts", accessModes: ["pro_portal"], proAccountRequired: true }));
    const far = priorityOf(entry({ country: "US", deliveryZones: ["US"], categories: ["lots"], segment: "C_liquidation", accessModes: ["email_quote"] }));
    expect(fr.score).toBeGreaterThan(far.score);
    expect(fr.reasons).toContain("Fournisseur français");
    expect(priorityOf(entry({ key: "bstock-europe" })).score).toBe(0);
  });
  it("fiabilité : documentation officielle > page officielle > extraits", () => {
    expect(reliabilityOf("official_docs_snippet")).toBe("confirmed");
    expect(reliabilityOf("official_page_snippet")).toBe("announced");
    expect(reliabilityOf("search_snippets")).toBe("inferred");
  });
});

describe("annuaire : 196 fiches cohérentes", () => {
  it("clés uniques, domaines uniques, champs complets", () => {
    expect(SUPPLIER_DIRECTORY.length).toBeGreaterThanOrEqual(190);
    expect(new Set(SUPPLIER_DIRECTORY.map((e) => e.key)).size).toBe(SUPPLIER_DIRECTORY.length);
    for (const e of SUPPLIER_DIRECTORY) {
      expect(e.name.length, e.key).toBeGreaterThan(1);
      expect(["A_refurb", "B_parts", "C_liquidation", "D_distributor", "E_specialist"]).toContain(e.segment);
      expect(Array.isArray(e.accessModes)).toBe(true);
    }
  });
  it("les fournisseurs demandés sont présents", () => {
    const keys = new Set(SUPPLIER_DIRECTORY.map((e) => e.name.toLowerCase()));
    for (const n of ["foxway", "thephonehub", "distrihub", "mobilax", "mps", "mobistock", "tr vertrieb", "4phones", "lcd-phone", "ingram", "bigbuy", "td synnex", "esprinet", "exertis", "komsa"]) {
      expect([...keys].some((k) => k.includes(n)), n).toBe(true);
    }
  });
  it("source publique de la bibliothèque rattachée par le domaine", () => {
    expect(libraryKeyForDirectory({ key: "brico-phone", website: "https://www.brico-phone.com" })).toBe("brico-phone");
    expect(libraryKeyForDirectory({ key: "zzz", website: "https://inconnu.example" })).toBeNull();
  });
});

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const FOX = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";
const BIG = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const SRC = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const SRC_OTHER = "a9a9a9a9-a9a9-4a9a-8a9a-a9a9a9a9a9a9";
const ctxOf = (client: unknown, org = ORG) => ({ supabase: client, user: { id: "u1" }, organization: { id: org, name: "Snowolff", country: "FR", default_currency: "EUR", settings: null }, role: "owner" }) as never;

describe("annuaire par organisation : état réel et isolation", () => {
  const db = () =>
    memoryDb({
      suppliers: [
        { id: FOX, organization_id: ORG, name: "Mon grossiste", website: "https://www.foxway.com", is_archived: false },
        { id: BIG, organization_id: ORG, name: "BigBuy", website: "https://www.bigbuy.eu", is_archived: false },
        { id: "s-other", organization_id: OTHER, name: "Foxway", website: "https://www.foxway.com", is_archived: false },
      ],
      supplier_sources: [
        { id: SRC, organization_id: ORG, supplier_id: FOX, source_type: "CSV", status: "active", config: {}, last_successful_sync_at: "2026-10-15T08:00:00Z", last_error: null },
        { id: SRC_OTHER, organization_id: OTHER, supplier_id: "s-other", source_type: "CSV", status: "active", config: {}, last_successful_sync_at: "2026-10-15T09:00:00Z", last_error: null },
      ],
      supplier_connections: [{ id: "c1", organization_id: ORG, supplier_id: BIG, connector_key: "bigbuy", status: "error", last_sync_at: "2026-10-15T07:00:00Z", last_error: "Clé API refusée (401)." }],
      sourcing_offers: [
        { id: "o1", organization_id: ORG, supplier_id: FOX, source_id: SRC, status: "active", title_original: "iPhone 13 128GB Grade A", original_price: 250, original_currency: "EUR", normalized_price: 250, tax_type: "ht", stock_status: "in_stock", available_quantity: 4, source_url: null, last_seen_at: "2026-10-15T08:00:00Z", source_type: "CSV" },
        { id: "o2", organization_id: OTHER, supplier_id: "s-other", source_id: SRC_OTHER, status: "active", title_original: "Prix privé d'une autre organisation", original_price: 1, original_currency: "EUR", normalized_price: 1, tax_type: "ht", stock_status: "in_stock", available_quantity: 1, source_url: null, last_seen_at: "2026-10-15T09:00:00Z", source_type: "CSV" },
      ],
    });

  it("Foxway connecté par import (rattaché par le site), BigBuy en erreur ; rien de l'autre organisation", async () => {
    const r = await directoryForOrg(ctxOf(db().client));
    const fox = r.entries.find((e) => e.key === "foxway")!;
    expect(fox.org).toMatchObject({ status: "connected", supplierId: FOX, accountOffers: 1, publicOffers: 0, lastSyncAt: "2026-10-15T08:00:00Z" });
    expect(fox.registry.integrationStatus).toBe("connected_tested");
    expect(fox.registry.domain).toBe("foxway.com");
    const big = r.entries.find((e) => e.key === "bigbuy")!;
    expect(big.org).toMatchObject({ status: "error", connectionId: "c1", lastError: "Clé API refusée (401)." });
    expect(big.registry.integrationStatus).toBe("in_progress");
    expect(big.registry.primaryAction.kind).toBe("sync");
    expect(big.connector!.fields.map((f) => f.name)).toEqual(["api_key"]);
    expect(r.entries.find((e) => e.key === "mobilax")!.org.status).toBe("not_connected");
  });

  it("produits d'un fournisseur : uniquement ceux de l'organisation", async () => {
    const d = db();
    const mine = await supplierOffers(ctxOf(d.client), FOX);
    expect(mine.total).toBe(1);
    expect(mine.offers[0]).toMatchObject({ title: "iPhone 13 128GB Grade A", access: "account", taxType: "ht", quantity: 4 });
    const leak = await supplierOffers(ctxOf(d.client), "s-other");
    expect(leak.offers).toEqual([]);
  });
});

describe("registre : cas particuliers documentés", () => {
  it("gsmExchange et Merkandi : consultation uniquement ; eBay : API déjà intégrée", () => {
    expect(accessMethodsOf(entry({ key: "gsmexchange", accessModes: ["pro_portal"], proAccountRequired: true }))).toEqual(["pro_account_first", "not_automatable"]);
    expect(accessMethodsOf(entry({ key: "merkandi", accessModes: ["pro_portal"], proAccountRequired: true }))).not.toContain("manual_import");
    expect(accessMethodsOf(entry({ key: "ebay-browse", accessModes: ["api", "marketplace"] }), { publicAvailable: true })).toEqual(["oauth", "public_integrated"]);
  });
});
