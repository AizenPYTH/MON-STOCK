import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accessRequestEmail, checkDirectoryWebsite, detectPlatform, directoryKeyForSupplierName, directoryStages, integrationOf, primaryStage, SUPPLIER_DIRECTORY, type DirectoryEntry } from "@/services/sourcing/supplier-directory";

/**
 * Annuaire de fournisseurs : intégrité des fiches (aucun prix inventé, liens HTTPS), statuts
 * calculés UNIQUEMENT à partir de preuves, vérification serveur (réponses HTTP simulées).
 */
const noFacts = { importedKeys: new Set<string>(), libraryOk: new Set<string>(), activeKeys: new Set<string>() };
const entry = (key: string) => SUPPLIER_DIRECTORY.find((e) => e.key === key)!;

describe("données de l'annuaire", () => {
  it("fiches uniques, segments connus, liens HTTPS ou absents, aucune donnée chiffrée inventée", () => {
    expect(SUPPLIER_DIRECTORY.length).toBeGreaterThanOrEqual(50);
    const keys = SUPPLIER_DIRECTORY.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of SUPPLIER_DIRECTORY) {
      expect(["A_refurb", "B_parts", "C_liquidation", "D_distributor", "E_specialist"]).toContain(e.segment);
      for (const u of [e.website, e.catalogUrl, e.apiDocsUrl]) if (u) expect(u, e.key).toMatch(/^https:\/\//);
      expect(e.verified ?? "", e.key).not.toBe("");
      expect(e.checkedAt).toMatch(/^2026-10-/);
      // l'annuaire ne contient aucun prix de produit (les prix viennent uniquement des sources connectées)
      expect(JSON.stringify(e), e.key).not.toMatch(/\d+[.,]\d{2}\s?€/);
    }
  });
});

describe("statuts prouvés", () => {
  it("une fiche seulement documentée reste « identifiée »", () => {
    const e = entry("smaaart");
    expect(directoryStages(e, null, noFacts)).toEqual(["identified"]);
    expect(primaryStage(["identified"])).toBe("identified");
  });

  it("site joignable → vérifié ; compte pro requis affiché ; import réel → import testé (prioritaire)", () => {
    const e = entry("foneday");
    const check = { key: e.key, checked_at: "2026-10-10T10:00:00Z", reachable: true, http_status: 200, robots_found: true, robots_disallow_all: false, sitemap_found: true, platform: "magento", message: "ok" };
    expect(directoryStages(e, check, noFacts)).toEqual(["identified", "verified", "account_required"]);
    const stages = directoryStages(e, check, { ...noFacts, importedKeys: new Set(["foneday"]) });
    expect(primaryStage(stages)).toBe("import_tested");
  });

  it("accès public uniquement si la vérification de la bibliothèque a réussi ; connecteur API = « prêt », pas « connecté »", () => {
    expect(integrationOf("brico-phone")).toEqual({ kind: "library", libraryKey: "brico-phone" });
    expect(directoryStages(entry("brico-phone"), null, noFacts)).not.toContain("public_access");
    expect(directoryStages(entry("brico-phone"), null, { ...noFacts, libraryOk: new Set(["brico-phone"]) })).toContain("public_access");
    expect(integrationOf("bigbuy")).toEqual({ kind: "connector", connectorKey: "bigbuy" });
    expect(directoryStages(entry("bigbuy"), null, noFacts)).toContain("connector_ready");
    expect(integrationOf("foneday")).toEqual({ kind: "file_import" });
  });

  it("site en erreur → indisponible", () => {
    const e = entry("utopya");
    const check = { key: e.key, checked_at: "x", reachable: false, http_status: 503, robots_found: null, robots_disallow_all: null, sitemap_found: null, platform: null, message: "HTTP 503" };
    expect(primaryStage(directoryStages(e, check, noFacts))).toBe("account_required");
    expect(directoryStages(e, check, noFacts)).toContain("unavailable");
  });

  it("rapprochement d'un fournisseur de l'organisation par son nom (sans faux positif court)", () => {
    expect(directoryKeyForSupplierName("FONEDAY B.V.")).toBe("foneday");
    expect(directoryKeyForSupplierName("Brico-Phone")).toBe("brico-phone");
    expect(directoryKeyForSupplierName("AB")).toBeNull();
    expect(directoryKeyForSupplierName("Mon fournisseur local")).toBeNull();
  });
});

describe("e-mails de demande d'accès", () => {
  it("FR et EN : compte pro, prix HT, MOQ, stock, livraison, garantie, flux CSV/XML/API", () => {
    const fr = accessRequestEmail(entry("foneday"), "fr", { name: "Boutique Test", country: "FR" });
    expect(fr.subject).toContain("Boutique Test");
    for (const w of ["SIRET", "HT", "minimales", "stock", "livraison", "garantie", "CSV", "API"]) expect(fr.body).toContain(w);
    const en = accessRequestEmail(entry("foneday"), "en", { name: "Boutique Test" });
    for (const w of ["trade", "VAT", "minimum order", "stock", "shipping", "Warranty", "CSV", "API"]) expect(en.body.toLowerCase()).toContain(w.toLowerCase());
  });
});

describe("vérification réelle du site (réponses simulées ici)", () => {
  const saved = { k: process.env.SUPABASE_SERVICE_ROLE_KEY, t: process.env.TOKEN_ENCRYPTION_KEY, u: process.env.NEXT_PUBLIC_SUPABASE_URL, a: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  beforeAll(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
    process.env.TOKEN_ENCRYPTION_KEY = "x".repeat(44);
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon";
  });
  afterAll(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved.k;
    process.env.TOKEN_ENCRYPTION_KEY = saved.t;
    if (saved.u === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (saved.a === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (saved.k === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (saved.t === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  });
  const site = { ...entry("foneday"), website: "https://www.foneday.shop" } as DirectoryEntry;
  const resolver = async () => [{ address: "93.184.216.34" }];

  function fakeFetch(routes: Record<string, { status: number; body: string; headers?: Record<string, string> }>): typeof fetch {
    return (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      const r = Object.entries(routes).find(([k]) => url.startsWith(k))?.[1] ?? { status: 404, body: "" };
      return new Response(r.body, { status: r.status, headers: r.headers ?? { "content-type": "text/html" } });
    }) as typeof fetch;
  }

  it("plateforme détectée, robots lu, sitemap signalé", async () => {
    expect(detectPlatform('<script src="https://cdn.shopify.com/s/files/x.js">')).toBe("shopify");
    expect(detectPlatform('<link href="/wp-content/plugins/woocommerce/a.css">')).toBe("woocommerce");
    expect(detectPlatform("<html>prestashop</html>")).toBe("prestashop");
  });

  it("robots.txt « Disallow: / » : site joignable mais accès automatisé interdit (signalé)", async () => {
    const f = fakeFetch({
      "https://www.foneday.shop/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /\nSitemap: https://www.foneday.shop/sitemap.xml", headers: { "content-type": "text/plain" } },
      "https://www.foneday.shop": { status: 200, body: "<html>Magento static/version123/frontend</html>" },
    });
    const r = await checkDirectoryWebsiteWithResolver(site, f, resolver);
    expect(r).toMatchObject({ reachable: true, http_status: 200, robots_found: true, robots_disallow_all: true, sitemap_found: true, platform: "magento" });
    expect(r.message).toMatch(/interdit l'accès automatisé/);
  });

  it("HTTP 403 : non joignable, message « à consulter manuellement »", async () => {
    const f = fakeFetch({ "https://www.foneday.shop": { status: 403, body: "Forbidden" } });
    const r = await checkDirectoryWebsiteWithResolver(site, f, resolver);
    expect(r.reachable).toBe(false);
    expect(r.message).toMatch(/consulter manuellement/);
  });
});

// La résolution DNS réelle est remplacée par une adresse publique fixe (aucun réseau dans les tests).
async function checkDirectoryWebsiteWithResolver(e: DirectoryEntry, f: typeof fetch, resolver: (host: string) => Promise<Array<{ address: string }>>) {
  return checkDirectoryWebsite(e, f, resolver);
}
