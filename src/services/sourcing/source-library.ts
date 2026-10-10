import "server-only";
import type { Json } from "@/db/database.types";
import type { OrgContext } from "@/features/auth/dal";
import { AppError } from "@/lib/errors";
import { serverEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { parseQuery } from "@/domain/sourcing/query-parser";
import type { AdapterRunContext, AdapterSourceConfig } from "@/integrations/sourcing/core";
import { getSourceAdapter } from "@/integrations/sourcing/registry";
import { checkRobotsForUrls } from "@/services/sourcing/crawler/robots";
import { ebayEnv } from "@/lib/env";

const log = createLogger("SOURCE_LIBRARY");

/**
 * =============================================================================
 * BIBLIOTHÈQUE DE SOURCES — fournisseurs spécialisés activables en un geste.
 *
 * Chaque entrée est un CANDIDAT repéré par recherche (pièces détachées, reconditionné, lots,
 * annonces eBay). Rien n'est présenté comme connecté sur la foi de cette liste :
 *   1. `runLibraryChecks()` (serveur, planifié) vérifie RÉELLEMENT chaque candidat : robots.txt
 *      pour les chemins utilisés, puis une recherche publique qui doit renvoyer des produits avec
 *      prix. Le résultat (preuve : statut HTTP, nombre de produits, exemples) est enregistré dans
 *      sourcing_library_checks.
 *   2. Seules les sources dont la dernière vérification est « ok » peuvent être activées, et
 *      l'activation exige l'attestation de l'utilisateur (conditions d'utilisation lues).
 *   3. Une source activée devient une supplier_source normale de l'organisation : la recherche
 *      en direct existante (robots.txt, politesse, budget, provenance) s'applique telle quelle.
 * =============================================================================
 */

export type LibrarySegment = "parts" | "refurbished" | "lots" | "marketplace";
export type LibraryAccess = "public_json" | "public_html" | "official_api";

export interface LibrarySource {
  key: string;
  name: string;
  website: string;
  /** URL de base passée à l'adaptateur (boutique) */
  baseUrl: string;
  adapter: "shopify-storefront" | "woocommerce-store" | "sitemap-jsonld" | "ebay-browse";
  segment: LibrarySegment;
  country: string;
  currency: string;
  /** HT/TTC documenté par la source (inconnu tant que non vérifié) */
  taxType: "ht" | "ttc" | "unknown";
  /** page des conditions à lire avant l'attestation */
  termsUrl: string;
  access: LibraryAccess;
  /** ce qu'on sait de la source, et d'où ça vient */
  notes: string;
  /** requête de vérification (doit renvoyer des produits pertinents) */
  probeQuery: string;
}

const shopifyTerms = (base: string) => `${base}/policies/terms-of-service`;

export const SOURCE_LIBRARY: readonly LibrarySource[] = [
  {
    key: "ebay-fr",
    name: "eBay France — annonces (lots, reconditionnés, pièces)",
    website: "https://www.ebay.fr",
    baseUrl: "https://api.ebay.com",
    adapter: "ebay-browse",
    segment: "marketplace",
    country: "FR",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: "https://developer.ebay.com/join/api-license-agreement",
    access: "official_api",
    notes: "API officielle Buy Browse (clés de l'application eBay du serveur). Offres publiées par des vendeurs pros et particuliers ; quantité non fournie par la recherche.",
    probeQuery: "iphone 13 128",
  },
  {
    key: "foneday",
    name: "Foneday (NL) — pièces détachées, B2B",
    website: "https://www.foneday.shop",
    baseUrl: "https://www.foneday.shop",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://www.foneday.shop"),
    access: "public_json",
    notes: "Grossiste néerlandais de pièces et accessoires pour réparateurs (clientèle principalement professionnelle, selon la recherche web).",
    probeQuery: "iphone 13 screen",
  },
  {
    key: "mobileparts-shop",
    name: "MobileParts.shop (2Service, NL) — pièces",
    website: "https://www.mobileparts.shop",
    baseUrl: "https://www.mobileparts.shop",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://www.mobileparts.shop"),
    access: "public_json",
    notes: "Pièces d'origine, compatibles et de récupération pour réparateurs, reconditionneurs et grossistes (selon la recherche web).",
    probeQuery: "iphone 13 display",
  },
  {
    key: "mobilesentrix-eu",
    name: "MobileSentrix Europe (NL) — pièces",
    website: "https://www.mobilesentrix.eu",
    baseUrl: "https://www.mobilesentrix.eu",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "NL",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://www.mobilesentrix.eu"),
    access: "public_json",
    notes: "Distributeur de pièces (centre logistique aux Pays-Bas) ; plateforme à confirmer par la vérification.",
    probeQuery: "iphone 13 screen",
  },
  {
    key: "replacebase",
    name: "ReplaceBase (UK) — écrans et batteries",
    website: "https://www.replacebase.co.uk",
    baseUrl: "https://www.replacebase.co.uk",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "GB",
    currency: "GBP",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://www.replacebase.co.uk"),
    access: "public_json",
    notes: "Écrans reconditionnés et batteries, expédition depuis le Royaume-Uni (selon la recherche web) ; frais de douane possibles vers la France.",
    probeQuery: "iphone 13 screen",
  },
  {
    key: "rewa-eu",
    name: "REWA Europe — outils, écrans, batteries",
    website: "https://rewa.tech",
    baseUrl: "https://rewa.tech",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "EU",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://rewa.tech"),
    access: "public_json",
    notes: "Outillage et pièces de réparation (pays d'expédition à confirmer).",
    probeQuery: "iphone screen",
  },
  {
    key: "ifixit-eu-pro",
    name: "iFixit Pro Store EU — pièces et outils",
    website: "https://eu-pro-store.ifixit.com",
    baseUrl: "https://eu-pro-store.ifixit.com",
    adapter: "shopify-storefront",
    segment: "parts",
    country: "EU",
    currency: "EUR",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://eu-pro-store.ifixit.com"),
    access: "public_json",
    notes: "Boutique professionnelle iFixit pour l'Europe (plateforme Shopify supposée d'après ses URL, confirmée seulement par la vérification).",
    probeQuery: "iphone 13 battery",
  },
  {
    key: "jobalots",
    name: "Jobalots (UK/EU) — lots de retours",
    website: "https://jobalots.com",
    baseUrl: "https://jobalots.com",
    adapter: "shopify-storefront",
    segment: "lots",
    country: "GB",
    currency: "GBP",
    taxType: "unknown",
    termsUrl: shopifyTerms("https://jobalots.com"),
    access: "public_json",
    notes: "Lots de retours clients et de surplus (électronique, téléphonie) ; prix par lot.",
    probeQuery: "phone",
  },
  {
    key: "brico-phone",
    name: "Brico-phone (FR) — pièces détachées",
    website: "https://www.brico-phone.com",
    baseUrl: "https://www.brico-phone.com",
    adapter: "sitemap-jsonld",
    segment: "parts",
    country: "FR",
    currency: "EUR",
    taxType: "ttc",
    termsUrl: "https://www.brico-phone.com",
    access: "public_html",
    notes: "Pièces détachées (écrans, batteries, connecteurs) vendues en France. Lu via le plan du site publié et les données structurées des fiches (prix TTC affichés au public).",
    probeQuery: "ecran iphone 13",
  },
  {
    key: "utopya",
    name: "Utopya (FR) — distributeur B2B de pièces",
    website: "https://www.utopya.fr",
    baseUrl: "https://www.utopya.fr",
    adapter: "woocommerce-store",
    segment: "parts",
    country: "FR",
    currency: "EUR",
    taxType: "ht",
    termsUrl: "https://www.utopya.fr",
    access: "public_json",
    notes: "Distributeur B2B de pièces et accessoires (Paris). Prix pros potentiellement réservés aux comptes : vérification requise.",
    probeQuery: "iphone 13",
  },
];

export function getLibrarySource(key: string): LibrarySource | null {
  return SOURCE_LIBRARY.find((s) => s.key === key) ?? null;
}

function adapterConfig(s: LibrarySource): AdapterSourceConfig {
  return { baseUrl: s.baseUrl, settings: { adapter: s.adapter, library_key: s.key }, defaultCurrency: s.currency, defaultTaxType: s.taxType, defaultCountry: s.country.length === 2 && s.country !== "EU" ? s.country : null };
}

export interface LibraryCheckResult {
  key: string;
  status: "ok" | "robots_disallowed" | "no_products" | "http_error" | "unreachable" | "not_configured";
  adapter: string;
  robotsAllowed: boolean | null;
  httpStatus: number | null;
  productCount: number;
  sample: Array<{ title: string; price: number | null; currency: string | null; url: string | null }>;
  message: string;
  durationMs: number;
}

/** Vérifie UNE source : robots.txt puis vraie recherche publique (aucune donnée enregistrée côté organisation). */
export async function checkLibrarySource(s: LibrarySource, runtime: Pick<AdapterRunContext, "fetchImpl" | "resolver" | "sleep" | "now"> = {}): Promise<LibraryCheckResult> {
  const t0 = Date.now();
  const adapter = getSourceAdapter(s.adapter);
  const base = { key: s.key, adapter: s.adapter, robotsAllowed: null as boolean | null, httpStatus: null as number | null, productCount: 0, sample: [] as LibraryCheckResult["sample"] };
  if (!adapter) return { ...base, status: "not_configured", message: `Adaptateur ${s.adapter} absent.`, durationMs: Date.now() - t0 };
  if (s.adapter === "ebay-browse" && !ebayEnv()) return { ...base, status: "not_configured", message: "Clés de l'application eBay non configurées sur le serveur.", durationMs: Date.now() - t0 };
  const config = adapterConfig(s);
  const parsed = parseQuery(s.probeQuery);
  const userAgent = serverEnv().SOURCING_USER_AGENT;
  if (adapter.urlsForQuery) {
    const urls = adapter.urlsForQuery(config, parsed, s.probeQuery);
    const robots = await checkRobotsForUrls(s.baseUrl, urls, userAgent, runtime.fetchImpl ?? fetch).catch((e: unknown) => ({ allowed: false, details: e instanceof Error ? e.message : String(e), crawlDelay: null }) as const);
    base.robotsAllowed = robots.allowed;
    if (!robots.allowed) return { ...base, status: "robots_disallowed", message: robots.details, durationMs: Date.now() - t0 };
  }
  const r = await adapter.search(config, parsed, s.probeQuery, { userAgent, timeoutMs: 20_000, minDelayMs: 1_500, ...runtime });
  const last = r.requests[r.requests.length - 1];
  base.httpStatus = last?.status ?? null;
  const priced = r.offers.filter((o) => o.price !== null && o.price > 0);
  base.productCount = priced.length;
  base.sample = priced.slice(0, 3).map((o) => ({ title: o.title.slice(0, 160), price: o.price, currency: o.currency ?? s.currency, url: o.url ?? null }));
  if (r.error) {
    const unreachable = !last || last.status === null;
    return { ...base, status: unreachable ? "unreachable" : "http_error", message: r.error.slice(0, 500), durationMs: Date.now() - t0 };
  }
  if (priced.length === 0) return { ...base, status: "no_products", message: `Aucun produit avec prix pour « ${s.probeQuery} ».`, durationMs: Date.now() - t0 };
  return { ...base, status: "ok", message: `${priced.length} produit(s) avec prix pour « ${s.probeQuery} ».`, durationMs: Date.now() - t0 };
}

/**
 * Vérification avec détection de plateforme : l'adaptateur déclaré d'abord, puis l'autre adaptateur
 * JSON public si la boutique ne répond pas au premier (une boutique Shopify n'expose pas l'API
 * WooCommerce, et inversement). L'adaptateur retenu est celui qui a réellement renvoyé des produits.
 */
export async function checkLibrarySourceDetect(s: LibrarySource, runtime: Parameters<typeof checkLibrarySource>[1] = {}): Promise<LibraryCheckResult> {
  const first = await checkLibrarySource(s, runtime);
  if (first.status === "ok" || first.status === "robots_disallowed" || first.status === "not_configured" || s.access === "official_api") return first;
  const messages = [first.message];
  const order: LibrarySource["adapter"][] = ["shopify-storefront", "woocommerce-store", "sitemap-jsonld"];
  for (const other of order.filter((a) => a !== s.adapter)) {
    const next = await checkLibrarySource({ ...s, adapter: other }, runtime);
    if (next.status === "ok") return next;
    messages.push(`${other} : ${next.message}`);
  }
  return { ...first, message: messages.join(" | ").slice(0, 500) };
}

/** Vérifie toute la bibliothèque (séquentiellement : un hôte à la fois) et enregistre les preuves. */
export async function runLibraryChecks(keys?: string[]): Promise<LibraryCheckResult[]> {
  const admin = createAdminSupabaseClient();
  const out: LibraryCheckResult[] = [];
  for (const s of SOURCE_LIBRARY) {
    if (keys && !keys.includes(s.key)) continue;
    let r: LibraryCheckResult;
    try {
      r = await checkLibrarySourceDetect(s);
    } catch (e) {
      r = { key: s.key, status: "unreachable", adapter: s.adapter, robotsAllowed: null, httpStatus: null, productCount: 0, sample: [], message: e instanceof Error ? e.message.slice(0, 500) : String(e), durationMs: 0 };
    }
    out.push(r);
    const { error } = await admin.from("sourcing_library_checks").upsert({
      key: r.key,
      checked_at: new Date().toISOString(),
      status: r.status,
      adapter: r.adapter,
      robots_allowed: r.robotsAllowed,
      http_status: r.httpStatus,
      product_count: r.productCount,
      sample: r.sample as unknown as Json,
      message: r.message,
      duration_ms: r.durationMs,
    });
    if (error) log.error("enregistrement de la vérification impossible", { key: r.key, error: error.message });
  }
  return out;
}

export interface LibraryEntryDTO {
  key: string;
  name: string;
  website: string;
  segment: LibrarySegment;
  country: string;
  currency: string;
  access: LibraryAccess;
  termsUrl: string;
  notes: string;
  check: { status: LibraryCheckResult["status"]; checkedAt: string; productCount: number | null; message: string | null; sample: Json } | null;
  /** activable : dernière vérification réelle « ok » */
  activatable: boolean;
  /** source déjà activée dans l'organisation */
  sourceId: string | null;
}

export async function sourceLibrary(ctx: OrgContext): Promise<{ entries: LibraryEntryDTO[] }> {
  const [checks, sources] = await Promise.all([
    ctx.supabase.from("sourcing_library_checks").select("*"),
    ctx.supabase.from("supplier_sources").select("id, config").eq("organization_id", ctx.organization.id),
  ]);
  if (checks.error) throw checks.error;
  if (sources.error) throw sources.error;
  const byKey = new Map((checks.data ?? []).map((c) => [c.key, c]));
  const activated = new Map<string, string>();
  for (const src of sources.data ?? []) {
    const k = (src.config as { library_key?: unknown } | null)?.library_key;
    if (typeof k === "string") activated.set(k, src.id);
  }
  return {
    entries: SOURCE_LIBRARY.map((s) => {
      const c = byKey.get(s.key);
      return {
        key: s.key,
        name: s.name,
        website: s.website,
        segment: s.segment,
        country: s.country,
        currency: s.currency,
        access: s.access,
        termsUrl: s.termsUrl,
        notes: s.notes,
        check: c ? { status: c.status as LibraryCheckResult["status"], checkedAt: c.checked_at, productCount: c.product_count, message: c.message, sample: c.sample } : null,
        activatable: c?.status === "ok",
        sourceId: activated.get(s.key) ?? null,
      };
    }),
  };
}

/**
 * Active une source vérifiée pour l'organisation : fournisseur + supplier_source (adaptateur,
 * URL, devise, pays), sous la session de l'utilisateur (RLS). L'attestation (conditions lues)
 * est enregistrée avec la date et l'utilisateur.
 */
export async function activateLibrarySource(ctx: OrgContext, key: string): Promise<{ sourceId: string; supplierId: string; alreadyActive: boolean }> {
  const s = getLibrarySource(key);
  if (!s) throw new AppError("NOT_FOUND", "Source inconnue.");
  const { data: check } = await ctx.supabase.from("sourcing_library_checks").select("status, checked_at, adapter").eq("key", key).maybeSingle();
  if (check?.status !== "ok") throw new AppError("VALIDATION", "Cette source n'a pas passé la vérification en direct (robots.txt + produits avec prix) : elle ne peut pas être activée.");

  const { data: existing } = await ctx.supabase.from("supplier_sources").select("id, supplier_id, config").eq("organization_id", ctx.organization.id);
  const found = (existing ?? []).find((r) => (r.config as { library_key?: unknown } | null)?.library_key === key);
  if (found) return { sourceId: found.id, supplierId: found.supplier_id, alreadyActive: true };

  const country = s.country.length === 2 && s.country !== "EU" ? s.country : null;
  const { data: supplier, error: supErr } = await ctx.supabase
    .from("suppliers")
    .insert({ organization_id: ctx.organization.id, name: s.name.slice(0, 200), website: s.website, country, currency: s.currency, notes: `Ajouté depuis la bibliothèque de sources MON STOCK (${s.key}). ${s.notes}` })
    .select("id")
    .single();
  if (supErr || !supplier) throw supErr ?? new AppError("INTERNAL", "Fournisseur non créé.");
  const attestation = `Conditions d'utilisation (${s.termsUrl}) déclarées lues et accès automatisé attesté par l'utilisateur ${ctx.user.email ?? ctx.user.id} le ${new Date().toISOString()} (application mobile).`;
  const { data: source, error: srcErr } = await ctx.supabase
    .from("supplier_sources")
    .insert({
      organization_id: ctx.organization.id,
      supplier_id: supplier.id,
      name: s.name.slice(0, 200),
      source_type: s.access === "official_api" ? "API" : "PUBLIC_WEB",
      base_url: s.baseUrl,
      country,
      default_currency: s.currency,
      default_tax_type: s.taxType,
      access_conditions: attestation,
      automated_access_confirmed: true,
      robots_checked_at: check.checked_at,
      robots_allowed: s.access === "official_api" ? null : true,
      sync_frequency: "manual",
      status: "active",
      // Adaptateur ayant réellement répondu lors de la vérification (détection de plateforme).
      config: { adapter: check.adapter ?? s.adapter, library_key: s.key } as unknown as NonNullable<Json>,
    })
    .select("id")
    .single();
  if (srcErr || !source) {
    await ctx.supabase.from("suppliers").delete().eq("id", supplier.id).eq("organization_id", ctx.organization.id);
    throw srcErr ?? new AppError("INTERNAL", "Source non créée.");
  }
  log.info("source de bibliothèque activée", { orgId: ctx.organization.id, key });
  return { sourceId: source.id, supplierId: supplier.id, alreadyActive: false };
}
