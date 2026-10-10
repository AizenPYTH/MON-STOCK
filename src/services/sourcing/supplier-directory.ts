import "server-only";
import raw from "@/services/sourcing/data/supplier-directory.json";
import type { OrgContext } from "@/features/auth/dal";
import type { DirectoryEntryDTO, DirectoryStage } from "@/features/mobile-api/contract";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { fetchText } from "@/services/sourcing/http";
import { fetchRobots, evaluateRobots } from "@/services/sourcing/crawler/robots";
import { getLibrarySource } from "@/services/sourcing/source-library";

/**
 * ANNUAIRE DE FOURNISSEURS QUALIFIÉS — base de travail du sourcing professionnel.
 *
 * Données : recherche du 10 octobre 2026 (docs/research/suppliers-2026-10.md), copiée dans
 * `data/supplier-directory.json`. Chaque fiche dit ce que vend le fournisseur, comment obtenir
 * ses prix (API, flux, portail pro, fichier) et ce qui a été réellement vérifié. Rien n'y est
 * présenté comme connecté : le statut est CALCULÉ à partir de preuves :
 *
 *   identified        fiche présente dans l'annuaire (recherche documentaire)
 *   verified          site officiel joignable lors de la dernière vérification serveur
 *   public_access     catalogue public lisible automatiquement (vérification de la bibliothèque OK)
 *   account_required  prix / catalogue réservés aux comptes professionnels
 *   connector_ready   connecteur MON STOCK existant (API officielle) : identifiants du compte requis
 *   import_tested     un import réel de son catalogue a réussi dans VOTRE organisation
 *   unavailable       site injoignable / erreur lors de la dernière vérification
 */

export type DirectorySegment = "A_refurb" | "B_parts" | "C_liquidation" | "D_distributor" | "E_specialist";

export interface DirectoryEntry {
  key: string;
  name: string;
  segment: DirectorySegment;
  country: string | null;
  deliveryZones: string[];
  website: string | null;
  catalogUrl: string | null;
  categories: string[];
  brands: string[];
  productTypes: string[];
  sales: string | null;
  proAccountRequired: boolean | null;
  accessConditions: string | null;
  accessModes: string[];
  apiDocsUrl: string | null;
  pricesTax: string | null;
  currency: string | null;
  moq: string | null;
  shipping: string | null;
  warranty: string | null;
  partQuality: string | null;
  whyUseful: string | null;
  howToGetCatalog: string | null;
  verified: string | null;
  verificationLevel: string;
  knownInApp: boolean;
  sourcesChecked: string[];
  checkedAt: string;
}

export const SUPPLIER_DIRECTORY: readonly DirectoryEntry[] = raw as DirectoryEntry[];

export const DIRECTORY_RESEARCH_DATE = "2026-10-10";

/** Intégration disponible dans MON STOCK pour une fiche (au-delà de l'import de fichier, toujours possible). */
export type DirectoryIntegration = { kind: "library"; libraryKey: string } | { kind: "connector"; connectorKey: "bigbuy" | "ingram-micro" } | { kind: "file_import" };

const LIBRARY_BY_DIRECTORY_KEY: Record<string, string> = { "ebay-browse": "ebay-fr", "brico-phone": "brico-phone" };
const CONNECTOR_BY_DIRECTORY_KEY: Record<string, "bigbuy" | "ingram-micro"> = { bigbuy: "bigbuy", "ingram-micro-fr": "ingram-micro" };

export function integrationOf(key: string): DirectoryIntegration {
  const lib = LIBRARY_BY_DIRECTORY_KEY[key];
  if (lib && getLibrarySource(lib)) return { kind: "library", libraryKey: lib };
  const connector = CONNECTOR_BY_DIRECTORY_KEY[key];
  if (connector) return { kind: "connector", connectorKey: connector };
  return { kind: "file_import" };
}

export interface DirectoryCheckRow {
  key: string;
  checked_at: string;
  reachable: boolean;
  http_status: number | null;
  robots_found: boolean | null;
  robots_disallow_all: boolean | null;
  sitemap_found: boolean | null;
  platform: string | null;
  message: string | null;
}

export interface DirectoryOrgFacts {
  /** fiches dont un import de catalogue a réussi dans l'organisation */
  importedKeys: ReadonlySet<string>;
  /** bibliothèque : dernière vérification « ok » */
  libraryOk: ReadonlySet<string>;
  /** fiches liées à une source activée dans l'organisation */
  activeKeys: ReadonlySet<string>;
}

/** Étapes atteintes, PROUVÉES uniquement (jamais supposées). */
export function directoryStages(entry: DirectoryEntry, check: DirectoryCheckRow | null, facts: DirectoryOrgFacts): DirectoryStage[] {
  const stages: DirectoryStage[] = ["identified"];
  if (check?.reachable) stages.push("verified");
  if (check && !check.reachable) stages.push("unavailable");
  const integration = integrationOf(entry.key);
  if (integration.kind === "library" && facts.libraryOk.has(integration.libraryKey)) stages.push("public_access");
  if (entry.proAccountRequired === true) stages.push("account_required");
  if (integration.kind === "connector") stages.push("connector_ready");
  if (facts.importedKeys.has(entry.key)) stages.push("import_tested");
  return stages;
}

const STAGE_RANK: DirectoryStage[] = ["import_tested", "public_access", "connector_ready", "account_required", "verified", "unavailable", "identified"];

export function primaryStage(stages: readonly DirectoryStage[]): DirectoryStage {
  return STAGE_RANK.find((s) => stages.includes(s)) ?? "identified";
}

/** Normalisation de nom pour rapprocher un fournisseur de l'organisation d'une fiche. */
export function nameKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(sas|sarl|sa|bv|gmbh|ltd|srl|s\.?a\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function directoryKeyForSupplierName(name: string): string | null {
  const k = nameKey(name);
  if (k.length < 3) return null;
  const hit = SUPPLIER_DIRECTORY.find((e) => {
    const ek = nameKey(e.name);
    return ek === k || (ek.length >= 5 && (k.startsWith(ek) || ek.startsWith(k)));
  });
  return hit?.key ?? null;
}

// ---------------------------------------------------------------------------
// E-mail de demande d'accès (FR / EN) — rien n'est envoyé automatiquement
// ---------------------------------------------------------------------------

export function accessRequestEmail(entry: Pick<DirectoryEntry, "name" | "categories">, lang: "fr" | "en", org: { name: string; country?: string | null }): { subject: string; body: string } {
  const cats = entry.categories.join(", ") || (lang === "fr" ? "vos produits" : "your products");
  if (lang === "fr") {
    return {
      subject: `Demande d'ouverture de compte professionnel et d'accès catalogue — ${org.name}`,
      body: [
        "Bonjour,",
        "",
        `Je représente ${org.name}, revendeur professionnel de produits électroniques${org.country ? ` (${org.country})` : ""}. Nous souhaitons travailler avec ${entry.name} pour : ${cats}.`,
        "",
        "Pourriez-vous nous indiquer :",
        "1. Les conditions d'ouverture d'un compte professionnel (documents requis : Kbis / SIRET, numéro de TVA intracommunautaire).",
        "2. Votre grille tarifaire revendeur (prix HT), les remises par volume et les quantités minimales de commande.",
        "3. La disponibilité du stock et les délais / frais de livraison vers la France.",
        "4. Les conditions de garantie, de retour et, pour les appareils reconditionnés, la définition de vos grades.",
        "5. S'il existe un fichier catalogue ou un flux automatisé (CSV, Excel, XML, JSON ou API) comprenant références, EAN, prix, stock et MOQ, ainsi que sa fréquence de mise à jour et ses conditions d'utilisation.",
        "",
        "Nous intégrons les tarifs de nos fournisseurs dans notre logiciel de gestion de stock ; un fichier ou un flux régulier nous permettrait de vous consulter en priorité.",
        "",
        "Merci par avance,",
        "",
        `${org.name}`,
      ].join("\n"),
    };
  }
  return {
    subject: `Trade account and catalogue access request — ${org.name}`,
    body: [
      "Hello,",
      "",
      `I am writing on behalf of ${org.name}, a professional electronics reseller${org.country ? ` based in ${org.country}` : ""}. We would like to source from ${entry.name}: ${cats}.`,
      "",
      "Could you please share:",
      "1. How to open a trade / B2B account (required documents, VAT number).",
      "2. Your reseller price list (prices excluding VAT), volume discounts and minimum order quantities.",
      "3. Stock availability, lead times and shipping costs to France.",
      "4. Warranty and return terms and, for refurbished devices, your grading definitions.",
      "5. Whether a catalogue file or automated feed is available (CSV, Excel, XML, JSON or API) with SKUs, EAN, prices, stock and MOQ, its update frequency and terms of use.",
      "",
      "We load our suppliers' price lists into our inventory software; a regular file or feed would let us check your offers first.",
      "",
      "Kind regards,",
      "",
      `${org.name}`,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Vérification réelle des sites (serveur, CRON_SECRET) — une requête par hôte, robots respecté
// ---------------------------------------------------------------------------

export function detectPlatform(html: string, headers: { get(name: string): string | null } | null = null): DirectoryCheckRow["platform"] {
  const h = html.slice(0, 300_000);
  if (/cdn\.shopify\.com|Shopify\.theme|x-shopify/i.test(h) || headers?.get("x-shopid")) return "shopify";
  if (/wp-content\/plugins\/woocommerce|woocommerce-/i.test(h)) return "woocommerce";
  if (/Magento|mage\/cookies|static\/version\d+\/frontend/i.test(h)) return "magento";
  if (/prestashop|var prestashop\b/i.test(h)) return "prestashop";
  if (/shopware/i.test(h)) return "shopware";
  return h.length > 0 ? "other" : null;
}

export async function checkDirectoryWebsite(entry: DirectoryEntry, fetchImpl?: typeof fetch, resolver?: (host: string) => Promise<Array<{ address: string }>>): Promise<Omit<DirectoryCheckRow, "checked_at"> & { url: string | null; final_url: string | null; duration_ms: number }> {
  const started = Date.now();
  const base = { key: entry.key, url: entry.website, final_url: null as string | null, robots_found: null as boolean | null, robots_disallow_all: null as boolean | null, sitemap_found: null as boolean | null, platform: null as DirectoryCheckRow["platform"] };
  if (!entry.website) return { ...base, reachable: false, http_status: null, message: "Aucun site officiel identifié par la recherche.", duration_ms: 0 };
  const userAgent = serverEnv().SOURCING_USER_AGENT;
  try {
    const robots = await fetchRobots(entry.website, userAgent, fetchImpl, 8_000);
    const robotsFound = robots.status === "ok";
    const disallowAll = robotsFound ? !evaluateRobots(robots.rules, userAgent, "/").allowed : null;
    const home = await fetchText(entry.website, { userAgent, timeoutMs: 10_000, maxBytes: 1_500_000, accept: "text/html,*/*;q=0.5", fetchImpl, resolver });
    const reachable = home.status >= 200 && home.status < 400;
    const platform = reachable ? detectPlatform(home.text) : null;
    return {
      ...base,
      final_url: home.finalUrl,
      reachable,
      http_status: home.status,
      robots_found: robotsFound,
      robots_disallow_all: disallowAll,
      sitemap_found: robotsFound ? robots.rules.sitemaps.length > 0 : null,
      platform,
      message: reachable
        ? `Site joignable${platform && platform !== "other" ? ` (plateforme ${platform})` : ""}${disallowAll ? " ; robots.txt interdit l'accès automatisé" : ""}.`
        : `Le site a répondu HTTP ${home.status}${home.status === 403 || home.status === 429 ? " (protection anti-robot : à consulter manuellement)" : ""}.`,
      duration_ms: Date.now() - started,
    };
  } catch (e) {
    return { ...base, reachable: false, http_status: null, message: `Injoignable : ${e instanceof Error ? e.message.slice(0, 160) : "erreur réseau"}`, duration_ms: Date.now() - started };
  }
}

/** Vérifie toutes les fiches (3 à la fois) et enregistre le résultat. */
export async function runDirectoryChecks(options: { keys?: string[]; fetchImpl?: typeof fetch } = {}): Promise<{ checked: number; reachable: number; unreachable: number; results: { key: string; reachable: boolean; http: number | null; platform: string | null; message: string | null }[] }> {
  const admin = createAdminSupabaseClient();
  const entries = SUPPLIER_DIRECTORY.filter((e) => !options.keys || options.keys.includes(e.key));
  const results: { key: string; reachable: boolean; http: number | null; platform: string | null; message: string | null }[] = [];
  for (let i = 0; i < entries.length; i += 3) {
    const batch = await Promise.all(entries.slice(i, i + 3).map((e) => checkDirectoryWebsite(e, options.fetchImpl)));
    const { error } = await admin.from("supplier_directory_checks").upsert(batch.map((b) => ({ ...b, checked_at: new Date().toISOString() })));
    if (error) throw new Error(`Enregistrement des vérifications impossible : ${error.message}`);
    results.push(...batch.map((b) => ({ key: b.key, reachable: b.reachable, http: b.http_status, platform: b.platform, message: b.message })));
  }
  return { checked: results.length, reachable: results.filter((r) => r.reachable).length, unreachable: results.filter((r) => !r.reachable).length, results };
}

// ---------------------------------------------------------------------------
// Annuaire pour une organisation (statuts calculés avec ses propres preuves)
// ---------------------------------------------------------------------------

export async function directoryForOrg(ctx: OrgContext): Promise<{ entries: DirectoryEntryDTO[]; researchDate: string; lastCheckAt: string | null }> {
  const orgId = ctx.organization.id;
  const [checksRes, libRes, suppliersRes, runsRes, sourcesRes] = await Promise.all([
    ctx.supabase.from("supplier_directory_checks").select("key, checked_at, reachable, http_status, robots_found, robots_disallow_all, sitemap_found, platform, message"),
    ctx.supabase.from("sourcing_library_checks").select("key, status"),
    ctx.supabase.from("suppliers").select("id, name").eq("organization_id", orgId).limit(1000),
    ctx.supabase.from("sync_runs").select("source_ref, status").eq("organization_id", orgId).eq("source_kind", "supplier_feed").in("status", ["success", "partial"]).order("started_at", { ascending: false }).limit(500),
    ctx.supabase.from("supplier_sources").select("supplier_id, status, config").eq("organization_id", orgId).limit(1000),
  ]);
  const checks = new Map((checksRes.data ?? []).map((c) => [c.key, c as DirectoryCheckRow]));
  const libraryOk = new Set((libRes.data ?? []).filter((c) => c.status === "ok").map((c) => c.key));

  // fournisseur de l'organisation → fiche (même nom)
  const supplierKey = new Map<string, string>();
  for (const s of suppliersRes.data ?? []) {
    const k = directoryKeyForSupplierName(s.name);
    if (k) supplierKey.set(s.id, k);
  }
  const importedKeys = new Set<string>();
  if ((runsRes.data ?? []).length) {
    const feedIds = [...new Set((runsRes.data ?? []).map((r) => r.source_ref).filter((x): x is string => Boolean(x)))];
    const { data: feeds } = feedIds.length ? await ctx.supabase.from("supplier_feeds").select("id, supplier_id").eq("organization_id", orgId).in("id", feedIds.slice(0, 300)) : { data: [] };
    for (const f of feeds ?? []) {
      const k = supplierKey.get(f.supplier_id);
      if (k) importedKeys.add(k);
    }
  }
  const activeKeys = new Set<string>();
  for (const s of sourcesRes.data ?? []) {
    const libKey = (s.config as { library_key?: string } | null)?.library_key;
    if (s.status === "active" && libKey) {
      const dir = Object.entries(LIBRARY_BY_DIRECTORY_KEY).find(([, v]) => v === libKey)?.[0];
      if (dir) activeKeys.add(dir);
    }
  }
  const facts: DirectoryOrgFacts = { importedKeys, libraryOk, activeKeys };
  const lastCheckAt = [...checks.values()].map((c) => c.checked_at).sort().at(-1) ?? null;

  const entries: DirectoryEntryDTO[] = SUPPLIER_DIRECTORY.map((e) => {
    const check = checks.get(e.key) ?? null;
    const stages = directoryStages(e, check, facts);
    return {
      key: e.key,
      name: e.name,
      segment: e.segment,
      country: e.country,
      deliveryZones: e.deliveryZones,
      website: e.website,
      catalogUrl: e.catalogUrl,
      apiDocsUrl: e.apiDocsUrl,
      categories: e.categories,
      brands: e.brands,
      productTypes: e.productTypes,
      sales: e.sales,
      proAccountRequired: e.proAccountRequired,
      accessConditions: e.accessConditions,
      accessModes: e.accessModes,
      pricesTax: e.pricesTax,
      currency: e.currency,
      moq: e.moq,
      shipping: e.shipping,
      warranty: e.warranty,
      partQuality: e.partQuality,
      whyUseful: e.whyUseful,
      howToGetCatalog: e.howToGetCatalog,
      researchVerified: e.verified,
      verificationLevel: e.verificationLevel,
      sources: e.sourcesChecked,
      researchedAt: e.checkedAt,
      integration: integrationOf(e.key),
      activeInOrg: activeKeys.has(e.key),
      stages,
      primaryStage: primaryStage(stages),
      check: check
        ? { checkedAt: check.checked_at, reachable: check.reachable, httpStatus: check.http_status, robotsFound: check.robots_found, robotsDisallowAll: check.robots_disallow_all, sitemapFound: check.sitemap_found, platform: check.platform, message: check.message }
        : null,
      email: { fr: accessRequestEmail(e, "fr", { name: ctx.organization.name, country: ctx.organization.country }), en: accessRequestEmail(e, "en", { name: ctx.organization.name, country: ctx.organization.country }) },
    };
  });
  return { entries, researchDate: DIRECTORY_RESEARCH_DATE, lastCheckAt };
}
