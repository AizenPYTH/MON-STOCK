import { describe, expect, it } from "vitest";
import type { DirectoryEntryDTO } from "@/features/mobile-api/contract";
import { directoryCountries, directoryStats, filterDirectory, filtersQuery, parseDirectoryFilters, DEFAULT_FILTERS } from "@/features/directory/filters";
import { advantagesAndLimits, countryLabel, displayStatus, mailtoLink, progressSteps, shortName } from "@/features/directory/labels";

function entry(over: Partial<DirectoryEntryDTO> & { key: string; name: string }, org: Partial<DirectoryEntryDTO["org"]> = {}, registry: Partial<DirectoryEntryDTO["registry"]> = {}): DirectoryEntryDTO {
  return {
    registry: {
      accessMethods: ["manual_import"],
      integrationStatus: "file_import",
      priority: { score: 50, tier: "B", reasons: [] },
      reliability: "announced",
      abandonedReason: null,
      primaryAction: { kind: "import_catalog", label: "Importer mon catalogue", outcome: "" },
      domain: null,
      libraryKey: null,
      ...registry,
    },
    org: { status: "not_connected", supplierId: null, connectionId: null, accountOffers: 0, publicOffers: 0, lastSyncAt: null, lastError: null, ...org },
    connector: null,
    segment: "A_refurb",
    country: "FR",
    deliveryZones: [],
    website: null,
    catalogUrl: null,
    apiDocsUrl: null,
    categories: [],
    brands: [],
    productTypes: [],
    sales: null,
    proAccountRequired: null,
    accessConditions: null,
    accessModes: [],
    pricesTax: null,
    currency: null,
    moq: null,
    shipping: null,
    warranty: null,
    partQuality: null,
    whyUseful: null,
    howToGetCatalog: null,
    researchVerified: null,
    verificationLevel: "web",
    sources: [],
    researchedAt: "2026-10-10",
    integration: { kind: "file_import" },
    activeInOrg: false,
    stages: ["identified"],
    primaryStage: "identified",
    tier: "identified",
    nextAction: "",
    check: null,
    email: { fr: { subject: "s", body: "b" }, en: { subject: "s", body: "b" } },
    b2b: null,
    ...over,
  };
}

const A = entry({ key: "a", name: "Alpha Refurb (NL)", country: "NL", brands: ["Apple"], proAccountRequired: true }, { status: "connected", accountOffers: 12, lastSyncAt: "2026-10-19T10:00:00Z" }, { priority: { score: 10, tier: "C", reasons: [] } });
const B = entry({ key: "b", name: "Bêta Pièces", segment: "B_parts", country: "DE", categories: ["écrans"] }, { status: "error", lastError: "HTTP 401" }, { accessMethods: ["official_api"], priority: { score: 90, tier: "A", reasons: ["API officielle"] } });
const C = entry({ key: "c", name: "Gamma Lots", segment: "C_liquidation", country: "FR" }, {}, { accessMethods: ["not_automatable"], integrationStatus: "abandoned", priority: { score: 70, tier: "B", reasons: [] } });
const D = entry({ key: "d", name: "Delta Distribution", segment: "D_distributor", country: null }, {}, { accessMethods: ["catalog_feed", "pro_account_first"], priority: { score: 80, tier: "A", reasons: [] } });
const ALL = [A, B, C, D];

describe("annuaire web : paramètres d'URL", () => {
  it("garde les valeurs connues et retombe sur les valeurs par défaut sinon", () => {
    expect(parseDirectoryFilters({ access: "pro", sort: "name", segment: "B_parts", country: "de", method: "official_api", layout: "table", q: "  écran " })).toEqual({ q: "écran", access: "pro", sort: "name", segment: "B_parts", country: "DE", method: "official_api", layout: "table" });
    expect(parseDirectoryFilters({ access: "x", sort: "y", segment: "Z", country: "france", method: "evil", layout: "z" })).toEqual(DEFAULT_FILTERS);
    expect(parseDirectoryFilters({ access: ["connected", "pro"] }).access).toBe("connected");
  });

  it("n'écrit pas les valeurs par défaut dans l'URL", () => {
    expect(filtersQuery(DEFAULT_FILTERS)).toBe("");
    expect(filtersQuery(DEFAULT_FILTERS, { access: "connected", layout: "table" })).toBe("?access=connected&layout=table");
  });
});

describe("annuaire web : filtrage, tri et compteurs", () => {
  it("compte uniquement sur preuves (connecté, connectable non écarté, pro, erreur)", () => {
    expect(directoryStats(ALL)).toMatchObject({ total: 4, connected: 1, connectable: 2, pro: 1, errors: 1 });
  });

  it("trie par pertinence : connectés d'abord, puis en erreur, puis priorité", () => {
    expect(filterDirectory(ALL, DEFAULT_FILTERS).map((e) => e.key)).toEqual(["a", "b", "d", "c"]);
  });

  it("filtre par accès, catégorie, pays, méthode et recherche sans accents", () => {
    expect(filterDirectory(ALL, { ...DEFAULT_FILTERS, access: "connectable" }).map((e) => e.key)).toEqual(["a", "b", "d"]);
    expect(filterDirectory(ALL, { ...DEFAULT_FILTERS, access: "error" }).map((e) => e.key)).toEqual(["b"]);
    expect(filterDirectory(ALL, { ...DEFAULT_FILTERS, segment: "C_liquidation" }).map((e) => e.key)).toEqual(["c"]);
    expect(filterDirectory(ALL, { ...DEFAULT_FILTERS, country: "FR" }).map((e) => e.key)).toEqual(["c"]);
    expect(filterDirectory(ALL, { ...DEFAULT_FILTERS, method: "catalog_feed" }).map((e) => e.key)).toEqual(["d"]);
    expect(filterDirectory(ALL, { ...DEFAULT_FILTERS, q: "ECRANS" }).map((e) => e.key)).toEqual(["b"]);
    expect(filterDirectory(ALL, { ...DEFAULT_FILTERS, q: "beta" }).map((e) => e.key)).toEqual(["b"]);
    expect(filterDirectory(ALL, { ...DEFAULT_FILTERS, sort: "name" }).map((e) => e.key)).toEqual(["a", "b", "d", "c"]);
    expect(filterDirectory(ALL, { ...DEFAULT_FILTERS, sort: "country" }).map((e) => e.key)).toEqual(["b", "c", "a", "d"]);
  });

  it("liste les pays présents, sans valeur vide", () => {
    expect(directoryCountries(ALL)).toEqual(["DE", "FR", "NL"]);
  });
});

describe("annuaire web : fiche", () => {
  it("frise d'avancement : rien n'est « fait » sans preuve", () => {
    const steps = progressSteps(D);
    expect(steps.map((s) => [s.key, s.state])).toEqual([
      ["identified", "done"],
      ["verified", "todo"],
      ["access", "todo"],
      ["connected", "todo"],
      ["import", "todo"],
    ]);
    const checked = progressSteps({ ...A, stages: ["identified", "verified", "account_required", "import_tested"], check: { checkedAt: "2026-10-18T00:00:00Z", reachable: true, httpStatus: 200, robotsFound: true, robotsDisallowAll: false, sitemapFound: true, platform: "shopify", message: "Site joignable." } });
    expect(checked.map((s) => s.state)).toEqual(["done", "done", "done", "done", "done"]);
    const broken = progressSteps({ ...B, stages: ["identified", "unavailable", "connector_ready"] });
    expect(broken.find((s) => s.key === "verified")?.state).toBe("error");
    expect(broken.find((s) => s.key === "access")?.state).toBe("current");
    expect(broken.find((s) => s.key === "connected")).toMatchObject({ state: "error", detail: "HTTP 401" });
  });

  it("statut affiché : état réel dans l'organisation, sinon statut d'intégration", () => {
    expect(displayStatus(A)).toEqual({ label: "Connecté", variant: "success" });
    expect(displayStatus(C)).toEqual({ label: "Écarté", variant: "danger" });
  });

  it("avantages et limites", () => {
    const r = advantagesAndLimits({ ...B, pricesTax: "HT", moq: "5 pièces", proAccountRequired: true });
    expect(r.advantages).toEqual(["API officielle", "Prix affichés HT"]);
    expect(r.limits).toEqual(["Compte professionnel requis : vos propres identifiants, jamais partagés.", "Minimum de commande : 5 pièces"]);
  });

  it("libellés : pays, nom court, e-mail prêt (aucun destinataire imposé)", () => {
    expect(countryLabel("FR")).toBe("FR");
    expect(countryLabel(null)).toBe("—");
    expect(countryLabel("EU")).toBe("EU");
    expect(shortName("Foneday (NL) — pièces détachées, B2B")).toBe("Foneday");
    expect(shortName("Alpha Refurb (NL)")).toBe("Alpha Refurb");
    expect(mailtoLink({ subject: "Demande & accès", body: "Bonjour,\nMerci" })).toBe("mailto:?subject=Demande%20%26%20acc%C3%A8s&body=Bonjour%2C%0AMerci");
  });
});
