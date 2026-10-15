import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { runLiveSearch } from "@/services/sourcing/live-search";
import type { LiveSearchSummary } from "@/services/sourcing/live-search.types";
import type { SimpleDealDTO, SimpleOfferDTO, SimpleRankedOfferDTO, SimpleSearchDTO, SimpleSupplierResultDTO } from "@/features/mobile-api/contract";
import { analyzeDeal, comparableBucket, DEAL_LEVEL_LABEL, productSignature, type DealAnalysis, type DealComparable, type DealOfferInput, type DealOwnProduct, type ProductSignature } from "@/domain/sourcing/deal-analysis";
import { missingSettings, type RadarCostSettings } from "@/domain/sourcing/radar";
import { readCostSettings } from "@/domain/sourcing/radar-settings";
import { domainOf, offerAccessOf } from "@/domain/sourcing/pro-accounts";

export type { SimpleDealDTO, SimpleOfferDTO, SimpleRankedOfferDTO, SimpleSearchDTO, SimpleSupplierResultDTO };

/**
 * Recherche « Fournisseurs » simple : on interroge les fournisseurs en direct, puis on liste
 * les offres trouvées, regroupées par fournisseur, du moins cher au plus cher. Pas de score ni
 * de radar : le titre, le prix, la disponibilité et le lien, tels que relevés chez le fournisseur.
 */
const log = createLogger("SUPPLIER_SEARCH");

/** au-delà, on affiche ce qui est déjà enregistré plutôt que de faire attendre l'utilisateur */
export const SIMPLE_SEARCH_LIVE_BUDGET_MS = 35_000;
export const SIMPLE_SEARCH_PER_SUPPLIER = 30;
const SCAN_LIMIT = 3000;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mots de la recherche (sans accents, minuscules). Les mots vides et la ponctuation sont ignorés. */
export function queryTokens(q: string): string[] {
  const stop = new Set(["de", "du", "la", "le", "les", "des", "un", "une", "pour", "et", "the", "for"]);
  return Array.from(new Set(fold(q).split(/[^a-z0-9+]+/).filter((t) => t.length > 0 && !stop.has(t) && (t.length >= 2 || /\d/.test(t)))));
}

/**
 * Le titre contient-il TOUS les mots ? Un mot doit commencer un mot du titre (« pro » trouve
 * « Pro » et « Promax ») ; un nombre doit être un nombre entier du titre (« 12 » ne trouve pas
 * « 128 Go »).
 */
export function matchesQuery(title: string, tokens: string[]): boolean {
  const t = fold(title);
  return tokens.every((tok) => {
    const esc = tok.replace(/[+]/g, "\\+");
    const re = /^\d+$/.test(tok) ? new RegExp(`(^|[^0-9])${esc}(?![0-9])`) : new RegExp(`(^|[^a-z0-9])${esc}`);
    return re.test(t);
  });
}

interface OfferRow {
  id: string;
  title_original: string;
  original_price: number | string | null;
  original_currency: string | null;
  normalized_price: number | string | null;
  tax_type: string | null;
  available_quantity: number | null;
  stock_status: string | null;
  source_url: string | null;
  last_seen_at: string | null;
  supplier_id: string;
  supplier: { name: string; country: string | null; website?: string | null } | null;
  // champs utiles à l'analyse « bonne affaire » (absents des anciens appels de test)
  normalized_currency?: string | null;
  fx_rate?: number | string | null;
  brand?: string | null;
  model?: string | null;
  storage?: string | null;
  condition?: string | null;
  grade?: string | null;
  shipping_cost?: number | string | null;
  shipping_currency?: string | null;
  moq?: number | null;
  ship_from_country?: string | null;
  sku_id?: string | null;
  source_type?: string | null;
  source?: { config: unknown } | null;
}

const num = (v: number | string | null): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Regroupe par fournisseur ; offres du moins cher au plus cher (prix inconnu en dernier), fournisseurs par meilleur prix. Pur. */
export function groupBySupplier(rows: OfferRow[], perSupplier = SIMPLE_SEARCH_PER_SUPPLIER, deals?: Map<string, SimpleDealDTO>): SimpleSupplierResultDTO[] {
  const groups = new Map<string, { supplierName: string; country: string | null; domain: string | null; access: SimpleOfferDTO["access"]; offers: SimpleOfferDTO[] }>();
  for (const r of rows) {
    const access = offerAccessOf(r.source_type, r.source?.config);
    const g = groups.get(r.supplier_id) ?? { supplierName: r.supplier?.name ?? "Fournisseur", country: r.supplier?.country ?? null, domain: domainOf(r.supplier?.website ?? r.source_url), access, offers: [] };
    // un fournisseur dont au moins une offre vient de votre compte est classé « vos comptes »
    if (access === "account") g.access = "account";
    const stock = r.stock_status === "in_stock" || r.stock_status === "low" || r.stock_status === "out_of_stock" ? r.stock_status : "unknown";
    g.offers.push({
      id: r.id,
      title: r.title_original,
      price: num(r.original_price),
      currency: r.original_currency,
      priceConverted: num(r.normalized_price),
      taxType: r.tax_type === "ht" || r.tax_type === "ttc" ? r.tax_type : "unknown",
      stock,
      quantity: r.available_quantity,
      url: r.source_url,
      seenAt: r.last_seen_at,
      deal: deals?.get(r.id) ?? null,
      access,
    });
    groups.set(r.supplier_id, g);
  }
  const key = (o: SimpleOfferDTO) => (o.stock === "out_of_stock" ? 1e12 : 0) + (o.priceConverted ?? o.price ?? 1e11);
  const out = Array.from(groups.entries()).map(([supplierId, g]) => {
    const sorted = g.offers.sort((a, b) => key(a) - key(b));
    return { supplierId, supplierName: g.supplierName, country: g.country, domain: g.domain, access: g.access, total: sorted.length, offers: sorted.slice(0, perSupplier) };
  });
  return out.sort((a, b) => key(a.offers[0]!) - key(b.offers[0]!) || a.supplierName.localeCompare(b.supplierName));
}

/**
 * Motif ILIKE d'un mot, insensible aux accents : chaque voyelle (et « c », pour « ç ») devient
 * le joker « _ » (« ecran » → « %_cr_n% » trouve « Écran »). Le contrôle exact suit en mémoire.
 */
export function ilikePattern(token: string): string {
  return `%${token.replace(/[^a-z0-9+]/g, "").replace(/[aeiouyc]/g, "_")}%`;
}

export const SIMPLE_SEARCH_MAX_OFFERS = 400;

/** Toutes les offres, du moins cher au plus cher (prix converti dans la devise de l'organisation ; prix inconnu en dernier). Pur. */
export function byPrice(rows: OfferRow[], max = SIMPLE_SEARCH_MAX_OFFERS, deals?: Map<string, SimpleDealDTO>): SimpleRankedOfferDTO[] {
  const all = groupBySupplier(rows, Number.MAX_SAFE_INTEGER, deals).flatMap((g) => g.offers.map((o) => ({ ...o, supplierId: g.supplierId, supplierName: g.supplierName, country: g.country, domain: g.domain })));
  const key = (o: SimpleOfferDTO) => o.priceConverted ?? o.price ?? Number.POSITIVE_INFINITY;
  return all.sort((a, b) => key(a) - key(b) || a.title.localeCompare(b.title)).slice(0, max);
}

// ---------------------------------------------------------------------------------------------
// Analyse « bonne affaire »

/** Source de type place de marché (annonces de revente, pas un fournisseur de gros). */
export function isMarketplaceSource(config: unknown): boolean {
  const c = (config ?? {}) as { adapter?: unknown; kind?: unknown };
  return c.adapter === "ebay-browse" || c.kind === "marketplace";
}

/** Prix dans la devise de l'organisation : prix normalisé si sa devise est celle de l'organisation, sinon inconnu. */
function orgPrice(r: OfferRow, orgCurrency: string): number | null {
  const cur = (r.normalized_currency ?? (r.original_currency?.toUpperCase() === orgCurrency.toUpperCase() ? orgCurrency : null))?.toUpperCase();
  if (cur !== orgCurrency.toUpperCase()) return null;
  return num(r.normalized_price) ?? (r.original_currency?.toUpperCase() === orgCurrency.toUpperCase() ? num(r.original_price) : null);
}

/** Frais de port fournisseur dans la devise de l'organisation (même règle que le radar : jamais additionnés dans une autre devise). */
function orgShipping(r: OfferRow, orgCurrency: string): number | null {
  const ship = num(r.shipping_cost ?? null);
  if (ship === null) return null;
  const cur = (r.shipping_currency ?? r.original_currency ?? "").toUpperCase();
  if (cur === orgCurrency.toUpperCase()) return ship;
  const fx = num(r.fx_rate ?? null);
  if (r.original_currency && cur === r.original_currency.toUpperCase() && fx) return Math.round(ship * fx * 100) / 100;
  return null;
}

export function toDealDTO(d: DealAnalysis): SimpleDealDTO {
  return { ...d, label: DEAL_LEVEL_LABEL[d.level] };
}

/**
 * Analyse de chaque offre contre les offres ÉQUIVALENTES (mêmes marque, modèle, type de produit)
 * de l'organisation. Pur : les lignes et réglages sont fournis par l'appelant.
 */
export function computeDeals(
  targets: OfferRow[],
  pool: OfferRow[],
  input: { orgCurrency: string; settings: RadarCostSettings; own: Map<string, DealOwnProduct>; now: Date },
): Map<string, SimpleDealDTO> {
  const sigs = new Map<string, ProductSignature>();
  const sigOf = (r: OfferRow) => {
    let sg = sigs.get(r.id);
    if (!sg) {
      sg = productSignature({ title: r.title_original, brand: r.brand, model: r.model, storage: r.storage, condition: r.condition, grade: r.grade });
      sigs.set(r.id, sg);
    }
    return sg;
  };
  const buckets = new Map<string, DealComparable[]>();
  const seen = new Set<string>();
  for (const r of [...targets, ...pool]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const sg = sigOf(r);
    const key = comparableBucket(sg);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push({ offerId: r.id, supplierId: r.supplier_id, title: r.title_original, price: orgPrice(r, input.orgCurrency), marketplace: isMarketplaceSource(r.source?.config), stockStatus: r.stock_status, signature: sg });
    buckets.set(key, list);
  }
  const out = new Map<string, SimpleDealDTO>();
  for (const r of targets) {
    const sg = sigOf(r);
    const key = comparableBucket(sg);
    const tax = r.tax_type === "ht" || r.tax_type === "ttc" ? r.tax_type : "unknown";
    const stock = r.stock_status === "in_stock" || r.stock_status === "low" || r.stock_status === "out_of_stock" ? r.stock_status : "unknown";
    const offer: DealOfferInput = {
      offerId: r.id,
      supplierId: r.supplier_id,
      title: r.title_original,
      price: orgPrice(r, input.orgCurrency),
      originalCurrency: r.original_currency,
      orgCurrency: input.orgCurrency,
      taxType: tax,
      shippingCost: orgShipping(r, input.orgCurrency),
      moq: r.moq ?? null,
      supplierCountry: r.ship_from_country ?? r.supplier?.country ?? null,
      stockStatus: stock,
      availableQuantity: r.available_quantity,
      lastSeenAt: r.last_seen_at,
      marketplace: isMarketplaceSource(r.source?.config),
      publicPrice: (r.source_type ?? "PUBLIC_WEB") === "PUBLIC_WEB",
      signature: sg,
    };
    const own = r.sku_id ? (input.own.get(r.sku_id) ?? null) : null;
    out.set(r.id, toDealDTO(analyzeDeal(offer, key ? (buckets.get(key) ?? []) : [], input.settings, own, input.now)));
  }
  return out;
}

const DEAL_POOL_LIMIT = 3000;
const OFFER_COLUMNS =
  "id, title_original, original_price, original_currency, normalized_price, normalized_currency, fx_rate, tax_type, available_quantity, stock_status, source_url, last_seen_at, supplier_id, brand, model, storage, condition, grade, shipping_cost, shipping_currency, moq, ship_from_country, sku_id, source_type, supplier:suppliers(name, country, website), source:supplier_sources(config)";

async function withBudget<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function simpleSupplierSearch(
  ctx: OrgContext,
  q: string,
  deps: { live?: (ctx: OrgContext, q: string) => Promise<LiveSearchSummary>; budgetMs?: number; now?: () => number } = {},
): Promise<SimpleSearchDTO> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  const query = q.trim().slice(0, 120);
  const tokens = queryTokens(query);
  if (tokens.length === 0) throw new AppError("VALIDATION", "Tapez ce que vous cherchez, par exemple « iPhone 13 » ou « batterie trottinette ».");

  // 1. Fournisseurs interrogés en direct (les offres trouvées sont enregistrées en base).
  const live = deps.live ?? ((c: OrgContext, text: string) => runLiveSearch(c, { rawQuery: text, parsed: parseQuery(text) }));
  let summary: LiveSearchSummary | null = null;
  let partial = false;
  try {
    const r = await withBudget(live(ctx, query), deps.budgetMs ?? SIMPLE_SEARCH_LIVE_BUDGET_MS);
    if (r === "timeout") partial = true;
    else summary = r;
  } catch (e) {
    partial = true;
    log.warn("live search failed", { orgId: ctx.organization.id, error: e instanceof Error ? e.message : String(e) });
  }

  // 2. Offres actives enregistrées qui contiennent tous les mots de la recherche : filtre en base
  //    (insensible aux accents grâce aux jokers), puis contrôle exact mot par mot.
  let offersQuery = ctx.supabase
    .from("sourcing_offers")
    .select(OFFER_COLUMNS)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "active");
  for (const tok of tokens) offersQuery = offersQuery.ilike("title_original", ilikePattern(tok));
  const { data, error } = await offersQuery.order("normalized_price", { ascending: true, nullsFirst: false }).limit(SCAN_LIMIT);
  if (error) throw fromPostgrestError(error);
  const rows = ((data ?? []) as unknown as OfferRow[]).filter((r) => r.title_original && matchesQuery(r.title_original, tokens));

  // 3. Analyse « bonne affaire » : best effort, la liste reste affichée si elle échoue.
  let deals: Map<string, SimpleDealDTO> | undefined;
  let missingCostSettings: string[] | undefined;
  try {
    const r = await loadDeals(ctx, rows, new Date(now()));
    deals = r.deals;
    missingCostSettings = r.missing;
  } catch (e) {
    log.warn("deal analysis failed", { orgId: ctx.organization.id, error: e instanceof Error ? e.message : String(e) });
  }
  const suppliers = groupBySupplier(rows, SIMPLE_SEARCH_PER_SUPPLIER, deals);
  const offers = byPrice(rows, SIMPLE_SEARCH_MAX_OFFERS, deals);

  return {
    query,
    currency: ctx.organization.default_currency,
    total: rows.length,
    offers,
    suppliers,
    checked: (summary?.sources ?? []).map((s) => ({ supplierName: s.supplierName, ok: s.status === "ok" || s.status === "cached", found: s.found, message: s.status === "ok" || s.status === "cached" ? null : s.message })),
    partial,
    durationMs: now() - t0,
    ...(missingCostSettings ? { missingCostSettings } : {}),
  };
}

/**
 * Données de l'analyse : offres équivalentes possibles (mêmes modèles, toute l'organisation, y
 * compris les annonces eBay), vos ventes par SKU et vos paramètres de coûts. Sous la session de
 * l'utilisateur (RLS).
 */
async function loadDeals(ctx: OrgContext, rows: OfferRow[], now: Date): Promise<{ deals: Map<string, SimpleDealDTO>; missing: string[] }> {
  const orgId = ctx.organization.id;
  const shown = new Set([...byPrice(rows).map((o) => o.id), ...groupBySupplier(rows).flatMap((g) => g.offers.map((o) => o.id))]);
  const targets = rows.filter((r) => shown.has(r.id));
  const models = Array.from(new Set(targets.map((r) => r.model).filter((m): m is string => Boolean(m)))).slice(0, 40);
  const skuIds = Array.from(new Set(targets.map((r) => r.sku_id).filter((v): v is string => Boolean(v)))).slice(0, 500);
  const [poolRes, channelsRes, stockRes] = await Promise.all([
    models.length ? ctx.supabase.from("sourcing_offers").select(OFFER_COLUMNS).eq("organization_id", orgId).eq("status", "active").in("model", models).limit(DEAL_POOL_LIMIT) : Promise.resolve({ data: [], error: null }),
    ctx.supabase.from("sales_channels").select("provider, fee_percent, payment_fee_percent, payment_fee_fixed, default_shipping_cost, is_active").eq("organization_id", orgId),
    skuIds.length ? ctx.supabase.from("v_stock_overview").select("sku_id, avg_sale_price_30d, sale_price, currency").eq("organization_id", orgId).in("sku_id", skuIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [poolRes, channelsRes, stockRes]) if (r.error) throw fromPostgrestError(r.error);
  const channels = (channelsRes.data ?? []) as { provider: string; fee_percent: number | null; payment_fee_percent: number | null; payment_fee_fixed: number | null; default_shipping_cost: number | null }[];
  const channel = channels.find((c) => c.provider === "ebay") ?? channels.find((c) => c.provider !== "manual") ?? channels[0] ?? null;
  const { settings } = readCostSettings(ctx.organization.settings, channel);
  const orgCurrency = ctx.organization.default_currency;
  const own = new Map<string, DealOwnProduct>();
  for (const s of (stockRes.data ?? []) as { sku_id: string | null; avg_sale_price_30d: number | null; sale_price: number | null; currency: string | null }[]) {
    // ventes dans une autre devise : non utilisées (aucune conversion supposée)
    if (s.sku_id && (!s.currency || s.currency.toUpperCase() === orgCurrency.toUpperCase())) own.set(s.sku_id, { avgSalePrice30d: s.avg_sale_price_30d, salePrice: s.sale_price });
  }
  const deals = computeDeals(targets, (poolRes.data ?? []) as unknown as OfferRow[], { orgCurrency, settings, own, now });
  return { deals, missing: missingSettings(settings) };
}
