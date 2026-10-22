import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import type { StockOverviewRow } from "@/db/types";
import { enrichStockRow, type StockRowView } from "@/features/stock/model";
import { getMarginContext, listStock } from "@/features/stock/queries";
import { getStockAnalytics, loadStockViews, STOCK_VIEWS_MAX } from "@/features/analytics/stock-analytics";
import { fetchRowsUpTo } from "@/lib/supabase/paginate";
import type { StockAnalytics } from "@/features/analytics/stock.pure";
import { pickCheapestOffer } from "@/features/analytics/replenishment.pure";
import { filterViews, paginate, sortViews, WEB_PAGE_SIZE } from "@/features/stock-web/list.pure";
import type { StockWebParams } from "@/features/stock-web/params";

/** Meilleure offre fournisseur rapprochée d'un SKU (offre active liée au SKU, la moins chère). */
export interface BestOfferChip {
  price: number;
  currency: string;
  supplier: string | null;
  taxType: string;
  lastSeenAt: string;
}

export interface StockWebList {
  rows: StockRowView[];
  total: number;
  page: number;
  pageSize: number;
  /** analyse bornée (au-delà de la limite de chargement, les compteurs sont des minima) */
  truncated: boolean;
  facets: { brands: string[]; categories: string[]; suppliers: Array<{ id: string; name: string }> };
  bestOffers: Record<string, BestOfferChip>;
  /** lecture des offres de la page incomplète (borne atteinte) : une « meilleure offre » peut manquer */
  bestOffersPartial: boolean;
  analytics: StockAnalytics;
  /** codes de la liste filtrée (fiche suivante / précédente) */
  orderedCodes: string[];
}

/**
 * Liste de l'écran Stock : stock actif filtré / trié / paginé en mémoire sur le même chargement que
 * la scène (loadStockViews, mémoïsé par requête) ; stock archivé : requête existante listStock.
 */
export async function loadStockWebList(ctx: OrgContext, p: StockWebParams): Promise<StockWebList> {
  const orgId = ctx.organization.id;
  const [analytics, suppliersRes] = await Promise.all([getStockAnalytics(ctx), ctx.supabase.from("suppliers").select("id, name").eq("organization_id", orgId).eq("is_archived", false).order("name").limit(500)]);
  const suppliers = suppliersRes.data ?? [];

  let rows: StockRowView[];
  let total: number;
  let truncated: boolean;
  let orderedCodes: string[];
  let facets: StockWebList["facets"];
  if (p.base.archived) {
    const baseSort = p.sort === "urgency" || p.sort === "cover" ? "name" : p.sort;
    const r = await listStock(ctx, { ...p.base, sort: baseSort });
    rows = r.rows;
    total = r.total;
    truncated = r.truncated;
    facets = r.facets;
    orderedCodes = rows.map((v) => v.row.code ?? "");
  } else {
    const bundle = await loadStockViews(ctx);
    const filtered = sortViews(filterViews(bundle.views, p), p.sort);
    rows = paginate(filtered, p.base.page, WEB_PAGE_SIZE).rows;
    total = filtered.length;
    truncated = bundle.truncated;
    orderedCodes = filtered.map((v) => v.row.code ?? "");
    const uniq = (xs: Array<string | null>) => Array.from(new Set(xs.filter((x): x is string => Boolean(x)))).sort((a, b) => a.localeCompare(b, "fr"));
    facets = { brands: uniq(bundle.views.map((v) => v.row.brand)), categories: uniq(bundle.views.map((v) => v.row.category)), suppliers };
  }

  const best = await bestOffersFor(ctx, rows);
  return { rows, total, page: p.base.page, pageSize: WEB_PAGE_SIZE, truncated, facets, bestOffers: best.offers, bestOffersPartial: best.partial, analytics, orderedCodes };
}

/** Borne de lecture des offres des SKU d'une page (lues par pages de 1 000, triées par prix : W-03). */
export const PAGE_OFFERS_MAX = 5_000;

/**
 * Offres actives rapprochées des SKU de la page, la moins chère par SKU. Lecture paginée et triée par
 * prix croissant : si la borne est atteinte, les offres manquantes sont les plus chères (une meilleure
 * offre déjà trouvée reste juste) mais un SKU peut n'avoir aucune offre lue → `partial`.
 */
async function bestOffersFor(ctx: OrgContext, rows: StockRowView[]): Promise<{ offers: Record<string, BestOfferChip>; partial: boolean }> {
  const ids = rows.map((v) => v.row.sku_id).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return { offers: {}, partial: false };
  let loaded: { rows: Array<{ sku_id: string | null; normalized_price: number | null; normalized_currency: string | null; tax_type: BestOfferChip["taxType"]; last_seen_at: string; supplier: unknown }>; truncated: boolean };
  try {
    loaded = await fetchRowsUpTo(
      (from, to) =>
        ctx.supabase
          .from("sourcing_offers")
          .select("sku_id, normalized_price, normalized_currency, tax_type, last_seen_at, supplier:suppliers(name)")
          .eq("organization_id", ctx.organization.id)
          .eq("status", "active")
          .in("sku_id", ids)
          .order("normalized_price", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      PAGE_OFFERS_MAX,
    );
  } catch {
    // Puce « meilleure offre » secondaire : son absence ne bloque pas l'écran, mais elle est signalée.
    return { offers: {}, partial: true };
  }
  const bySku = new Map<string, typeof loaded.rows>();
  for (const o of loaded.rows) {
    if (!o.sku_id) continue;
    const list = bySku.get(o.sku_id) ?? [];
    list.push(o);
    bySku.set(o.sku_id, list);
  }
  const out: Record<string, BestOfferChip> = {};
  for (const [skuId, offers] of bySku) {
    const best = pickCheapestOffer(offers);
    if (!best || best.normalized_price === null) continue;
    const supplier = (best.supplier as { name: string } | null)?.name ?? null;
    out[skuId] = { price: best.normalized_price, currency: best.normalized_currency ?? "EUR", supplier, taxType: best.tax_type, lastSeenAt: best.last_seen_at };
  }
  return { offers: out, partial: loaded.truncated };
}

/**
 * Lignes à exporter en CSV : sélection explicite (`codes`), sinon la liste filtrée et triée entière
 * (stock actif : même chargement que l'écran ; archivés : lecture bornée de la vue).
 */
export async function loadStockExport(ctx: OrgContext, p: StockWebParams, codes: string[] | null): Promise<{ views: StockRowView[]; truncated: boolean }> {
  let views: StockRowView[];
  let truncated: boolean;
  if (p.base.archived) {
    const marginCtx = await getMarginContext(ctx);
    const loaded = await fetchRowsUpTo<StockOverviewRow>(
      (from, to) => ctx.supabase.from("v_stock_overview").select("*").eq("organization_id", ctx.organization.id).eq("is_active", false).order("sku_id", { ascending: true }).range(from, to),
      STOCK_VIEWS_MAX,
    );
    const now = new Date();
    views = loaded.rows.map((r) => enrichStockRow(r, marginCtx, now));
    truncated = loaded.truncated;
  } else {
    const bundle = await loadStockViews(ctx);
    views = bundle.views;
    truncated = bundle.truncated;
  }
  if (codes) {
    const wanted = new Set(codes.map((c) => c.toLowerCase()));
    return { views: sortViews(views.filter((v) => wanted.has((v.row.code ?? "").toLowerCase())), p.sort), truncated: false };
  }
  return { views: sortViews(filterViews(views, p), p.sort), truncated };
}
