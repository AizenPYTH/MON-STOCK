import "server-only";
import raw from "@/services/sourcing/data/supplier-directory.json";
import type { OrgContext } from "@/features/auth/dal";
import type { DirectoryEntryDTO, DirectoryStage } from "@/features/mobile-api/contract";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { fetchText } from "@/services/sourcing/http";
import { fetchRobots, evaluateRobots } from "@/services/sourcing/crawler/robots";
import { AUTOMATION_LABEL, B2B_METHOD_LABEL, B2B_PROFILES } from "@/services/sourcing/data/b2b-profiles";
import { getLibrarySource, SOURCE_LIBRARY } from "@/services/sourcing/source-library";
import { domainOf, offerAccessOf } from "@/domain/sourcing/pro-accounts";
import { ABANDONED, accessMethodsOf, integrationStatusOf, primaryActionOf, priorityOf, reliabilityOf, type RegistryOrgFacts } from "@/domain/sourcing/supplier-registry";
import { getConnectorDescriptor } from "@/integrations/suppliers/core";

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

const LIBRARY_BY_DIRECTORY_KEY: Record<string, string> = {
  "ebay-browse": "ebay-fr",
  "brico-phone": "brico-phone",
  "refreshed-apples": "refreshed-apples",
  "fixje-zakelijk": "fixje",
  "servisnidily-cz": "servisni-dily",
  pieces2mobile: "pieces2mobile",
  "mobile-depot-europe": "mobiledepot-eu",
  mobistock: "mobistock-nl",
  "pc-portatil": "pc-portatil-es",
  telehurt: "telehurt-pl",
  "hurtowniagsm-pl": "hurtowniagsm-pl",
  "repair-outlet": "repair-outlet-uk",
  fonefunshop: "fonefunshop-uk",
  "ms-gsm": "ms-gsm",
  teknikdelar: "teknikdelar-se",
};
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

/**
 * Niveau d'accès réel d'un fournisseur, du plus avancé au moins avancé :
 *   connected  : source active ou import réussi dans l'organisation ;
 *   importable : le fournisseur fournit un fichier, un flux ou une API que MON STOCK sait importer ;
 *   accessible : catalogue public vérifié (bibliothèque) ou site joignable à catalogue public ;
 *   verified   : site officiel joignable depuis le serveur ;
 *   identified : fiche issue de la recherche, rien de vérifié.
 * Un fournisseur découvert n'est jamais présenté comme connecté.
 */
export type DirectoryTier = "connected" | "importable" | "accessible" | "verified" | "identified";

export const DIRECTORY_TIERS: DirectoryTier[] = ["connected", "importable", "accessible", "verified", "identified"];

const IMPORTABLE_MODES = new Set(["feed", "feed_csv", "feed_xml", "feed_json", "edi", "api", "manual_download", "email_pricelist"]);

export function directoryTier(entry: Pick<DirectoryEntry, "key" | "accessModes">, stages: readonly DirectoryStage[], activeInOrg: boolean): DirectoryTier {
  if (activeInOrg || stages.includes("import_tested")) return "connected";
  if (stages.includes("connector_ready") || entry.accessModes.some((m) => IMPORTABLE_MODES.has(m))) return "importable";
  if (stages.includes("public_access") || (stages.includes("verified") && entry.accessModes.includes("public_catalog"))) return "accessible";
  if (stages.includes("verified")) return "verified";
  return "identified";
}

/** Prochaine action concrète pour activer la source (jamais « c'est fait » sans preuve). */
export function nextAction(entry: Pick<DirectoryEntry, "key" | "accessModes" | "proAccountRequired">, tier: DirectoryTier, stages: readonly DirectoryStage[]): string {
  const integration = integrationOf(entry.key);
  if (tier === "connected") return "Source active : réimportez le catalogue à chaque nouvelle liste de prix (ou laissez le flux se mettre à jour).";
  if (stages.includes("unavailable")) return "Site injoignable depuis le serveur au dernier contrôle : vérifiez-le manuellement avant de demander un accès.";
  if (integration.kind === "library") return "Activez la source dans Sourcing → Sources fournisseurs (après lecture des CGU).";
  if (integration.kind === "connector") return "Ouvrez un compte revendeur, puis enregistrez vos identifiants d'API côté serveur pour activer le connecteur.";
  const modes = new Set(entry.accessModes);
  const account = entry.proAccountRequired ? "Créez un compte professionnel, puis " : "";
  if ([...modes].some((m) => m.startsWith("feed") || m === "edi") || modes.has("api")) return `${account}demandez l'URL du flux ou l'accès API (e-mail de demande prêt) ; en attendant, importez un export du catalogue.`;
  if (modes.has("manual_download")) return `${account}téléchargez la liste de prix (CSV / XLSX) depuis l'espace revendeur et importez-la (Sourcing → Importer).`;
  if (modes.has("email_pricelist")) return "Envoyez l'e-mail de demande de liste de prix, puis importez le fichier reçu (Sourcing → Importer).";
  if (modes.has("public_catalog")) return "Catalogue consultable en ligne : demandez un export (e-mail prêt) pour l'importer ; ne recopiez pas les prix à la main.";
  if (modes.has("pro_portal")) return `${account || "Créez un compte professionnel, puis "}demandez un export du catalogue pour l'importer.`;
  return "Contactez le fournisseur (e-mail de demande prêt) pour obtenir son catalogue et ses conditions.";
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

export function accessRequestEmail(entry: Pick<DirectoryEntry, "name" | "categories"> & { key?: string }, lang: "fr" | "en", org: { name: string; country?: string | null }): { subject: string; body: string } {
  const cats = entry.categories.join(", ") || (lang === "fr" ? "vos produits" : "your products");
  // Questions propres au fournisseur (fiche d'intégration), en français uniquement : jamais traduites automatiquement.
  const specific = lang === "fr" && entry.key ? (B2B_PROFILES[entry.key]?.questions ?? []) : [];
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
        ...specific.map((q, i) => `${i + 6}. ${q}`),
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
    const robots = await fetchRobots(entry.website, userAgent, fetchImpl, 8_000, resolver);
    const robotsFound = robots.status === "ok";
    const disallowAll = robotsFound ? !evaluateRobots(robots.rules, userAgent, "/").allowed : null;
    const home = await fetchText(entry.website, { userAgent, timeoutMs: 12_000, maxBytes: 6_000_000, accept: "text/html,*/*;q=0.5", fetchImpl, resolver });
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

export const DIRECTORY_CHECK_BATCH = 16;

/** Vérifie les fiches demandées (ou un lot des plus anciennes), 3 à la fois, et enregistre le résultat. */
export async function runDirectoryChecks(options: { keys?: string[]; fetchImpl?: typeof fetch } = {}): Promise<{ checked: number; reachable: number; unreachable: number; results: { key: string; reachable: boolean; http: number | null; platform: string | null; message: string | null }[] }> {
  const admin = createAdminSupabaseClient();
  let entries = SUPPLIER_DIRECTORY.filter((e) => !options.keys || options.keys.includes(e.key));
  if (!options.keys) {
    // Tâche planifiée : 16 fiches par passage, les moins récemment vérifiées d'abord (durée bornée).
    const { data: checked } = await admin.from("supplier_directory_checks").select("key, checked_at");
    const last = new Map((checked ?? []).map((c) => [c.key, c.checked_at]));
    entries = [...entries].sort((a, b) => (last.get(a.key) ?? "").localeCompare(last.get(b.key) ?? "")).slice(0, DIRECTORY_CHECK_BATCH);
  }
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

/** Fiche de l'annuaire rattachée à un fournisseur de l'organisation : même domaine de site, sinon même nom. */
export function directoryKeyForSupplier(s: { name: string; website: string | null }): string | null {
  const domain = domainOf(s.website);
  if (domain) {
    const hit = SUPPLIER_DIRECTORY.find((e) => {
      const d = domainOf(e.website);
      return d !== null && (d === domain || d.endsWith(`.${domain}`) || domain.endsWith(`.${d}`));
    });
    if (hit) return hit.key;
  }
  return directoryKeyForSupplierName(s.name);
}

/** Source publique de la bibliothèque MON STOCK correspondant à une fiche (même domaine ou correspondance connue). */
export function libraryKeyForDirectory(entry: Pick<DirectoryEntry, "key" | "website">): string | null {
  const known = LIBRARY_BY_DIRECTORY_KEY[entry.key];
  if (known && getLibrarySource(known)) return known;
  const d = domainOf(entry.website);
  if (!d) return null;
  const hit = SOURCE_LIBRARY.find((l) => !l.blocked && domainOf(l.website) === d);
  return hit?.key ?? null;
}

interface OrgSupplierFacts {
  supplierId: string | null;
  connection: { id: string; status: string; last_sync_at: string | null; last_error: string | null } | null;
  accountOffers: number;
  publicOffers: number;
  publicActive: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export async function directoryForOrg(ctx: OrgContext): Promise<{ entries: DirectoryEntryDTO[]; researchDate: string; lastCheckAt: string | null }> {
  const orgId = ctx.organization.id;
  const [checksRes, libRes, suppliersRes, runsRes, sourcesRes, connectionsRes, offersRes] = await Promise.all([
    ctx.supabase.from("supplier_directory_checks").select("key, checked_at, reachable, http_status, robots_found, robots_disallow_all, sitemap_found, platform, message"),
    ctx.supabase.from("sourcing_library_checks").select("key, status"),
    ctx.supabase.from("suppliers").select("id, name, website").eq("organization_id", orgId).eq("is_archived", false).limit(1000),
    ctx.supabase.from("sync_runs").select("source_ref, status").eq("organization_id", orgId).eq("source_kind", "supplier_feed").in("status", ["success", "partial"]).order("started_at", { ascending: false }).limit(500),
    ctx.supabase.from("supplier_sources").select("id, supplier_id, source_type, status, config, last_successful_sync_at, last_error").eq("organization_id", orgId).limit(1000),
    ctx.supabase.from("supplier_connections").select("id, supplier_id, connector_key, status, last_sync_at, last_error").eq("organization_id", orgId).neq("status", "disconnected").limit(200),
    // comptage des offres actives par source (colonne minimale)
    ctx.supabase.from("sourcing_offers").select("source_id").eq("organization_id", orgId).eq("status", "active").limit(50000),
  ]);
  const checks = new Map((checksRes.data ?? []).map((c) => [c.key, c as DirectoryCheckRow]));
  const libraryOk = new Set((libRes.data ?? []).filter((c) => c.status === "ok").map((c) => c.key));

  // fournisseur de l'organisation → fiche (même site, sinon même nom)
  const supplierKey = new Map<string, string>();
  const supplierByKey = new Map<string, string>();
  for (const s of (suppliersRes.data ?? []) as { id: string; name: string; website: string | null }[]) {
    const k = directoryKeyForSupplier(s);
    if (k) {
      supplierKey.set(s.id, k);
      if (!supplierByKey.has(k)) supplierByKey.set(k, s.id);
    }
  }
  const offersBySource = new Map<string, number>();
  for (const o of (offersRes.data ?? []) as { source_id: string }[]) offersBySource.set(o.source_id, (offersBySource.get(o.source_id) ?? 0) + 1);
  const orgFacts = new Map<string, OrgSupplierFacts>();
  const factsFor = (key: string): OrgSupplierFacts => {
    let f = orgFacts.get(key);
    if (!f) {
      f = { supplierId: supplierByKey.get(key) ?? null, connection: null, accountOffers: 0, publicOffers: 0, publicActive: false, lastSyncAt: null, lastError: null };
      orgFacts.set(key, f);
    }
    return f;
  };
  const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
  for (const src of (sourcesRes.data ?? []) as { id: string; supplier_id: string; source_type: string; status: string; config: unknown; last_successful_sync_at: string | null; last_error: string | null }[]) {
    const key = supplierKey.get(src.supplier_id);
    if (!key) continue;
    const f = factsFor(key);
    const n = offersBySource.get(src.id) ?? 0;
    if (offerAccessOf(src.source_type, src.config) === "account") f.accountOffers += n;
    else {
      f.publicOffers += n;
      if (src.status === "active") f.publicActive = true;
    }
    f.lastSyncAt = later(f.lastSyncAt, src.last_successful_sync_at);
    f.lastError = f.lastError ?? src.last_error;
  }
  for (const c of (connectionsRes.data ?? []) as { id: string; supplier_id: string; connector_key: string; status: string; last_sync_at: string | null; last_error: string | null }[]) {
    const key = supplierKey.get(c.supplier_id) ?? Object.entries(CONNECTOR_BY_DIRECTORY_KEY).find(([, v]) => v === c.connector_key)?.[0];
    if (!key) continue;
    const f = factsFor(key);
    f.connection = c;
    f.supplierId = f.supplierId ?? c.supplier_id;
    f.lastSyncAt = later(f.lastSyncAt, c.last_sync_at);
    f.lastError = c.last_error ?? f.lastError;
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
    const of = orgFacts.get(e.key) ?? null;
    const activeInOrg = facts.activeKeys.has(e.key) || Boolean(of && (of.publicActive || of.accountOffers > 0 || of.connection?.status === "connected"));
    const tier = directoryTier(e, stages, activeInOrg);
    const libraryKey = libraryKeyForDirectory(e);
    const registryFacts: RegistryOrgFacts = {
      connectionOk: of?.connection?.status === "connected",
      connectionPending: of?.connection ? of.connection.status !== "connected" : false,
      imported: facts.importedKeys.has(e.key) || (of?.accountOffers ?? 0) > 0,
      publicActive: facts.activeKeys.has(e.key) || Boolean(of?.publicActive),
      publicAvailable: libraryKey !== null,
    };
    const methods = accessMethodsOf(e, registryFacts);
    const integrationStatus = integrationStatusOf(e, methods, registryFacts);
    const orgStatus: "connected" | "pending" | "error" | "not_connected" =
      registryFacts.connectionOk || registryFacts.imported || registryFacts.publicActive ? "connected" : of?.connection?.status === "error" || of?.connection?.status === "expired" ? "error" : of?.connection ? "pending" : "not_connected";
    const connectorKey = CONNECTOR_BY_DIRECTORY_KEY[e.key];
    const descriptor = connectorKey ? getConnectorDescriptor(connectorKey) : null;
    return {
      registry: {
        accessMethods: methods,
        integrationStatus,
        priority: priorityOf(e),
        reliability: reliabilityOf(e.verificationLevel),
        abandonedReason: ABANDONED[e.key] ?? null,
        primaryAction: primaryActionOf({ status: integrationStatus, methods, connected: orgStatus === "connected", hasConnection: Boolean(of?.connection) }),
        domain: domainOf(e.website),
        libraryKey,
      },
      org: {
        status: orgStatus,
        supplierId: of?.supplierId ?? null,
        connectionId: of?.connection?.id ?? null,
        accountOffers: of?.accountOffers ?? 0,
        publicOffers: of?.publicOffers ?? 0,
        lastSyncAt: of?.lastSyncAt ?? null,
        lastError: of?.lastError ?? null,
      },
      connector: descriptor ? { key: descriptor.key, label: descriptor.label, fields: descriptor.credentialFields.map((f) => ({ name: f.name, label: f.label, secret: f.secret, placeholder: f.placeholder ?? null })) } : null,
      tier,
      nextAction: nextAction(e, tier, stages),
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
      b2b: B2B_PROFILES[e.key] ? { ...B2B_PROFILES[e.key]!, methodLabel: B2B_METHOD_LABEL[B2B_PROFILES[e.key]!.method], automationLabel: AUTOMATION_LABEL[B2B_PROFILES[e.key]!.automation] } : null,
      email: { fr: accessRequestEmail(e, "fr", { name: ctx.organization.name, country: ctx.organization.country }), en: accessRequestEmail(e, "en", { name: ctx.organization.name, country: ctx.organization.country }) },
    };
  });
  return { entries, researchDate: DIRECTORY_RESEARCH_DATE, lastCheckAt };
}
