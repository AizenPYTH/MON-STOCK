import type { StockOverviewRow } from "@/db/types";
import { enrichStockRow, skuLabel, type MarginContext, type StockRowView } from "@/features/stock/model";
import { computeMargin } from "@/domain/pricing/margin";
import type { MobileSupabase } from "~/lib/supabase";
import { fetchAllStockRows } from "~/data/stock";

/**
 * Catalogue mobile : PRODUIT → variantes (SKU), à partir de v_stock_overview lue sous RLS
 * (bornée à 5 000 SKU, signalé). Les niveaux de stock viennent du domaine partagé (classifyStock).
 */
export type QtyLevel = "out" | "low" | "ok";

export interface ProductGroup {
  productId: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  skus: StockRowView[];
  /** code du premier SKU (affiché en sous-titre) */
  code: string;
  totalAvailable: number;
  level: QtyLevel;
  activeListings: number;
}

export interface Catalog {
  products: ProductGroup[];
  truncated: boolean;
  counts: { all: number; out: number; low: number; unlisted: number };
}

export function levelOf(views: readonly StockRowView[], totalAvailable: number): QtyLevel {
  if (totalAvailable <= 0) return "out";
  if (views.some((v) => v.classification.level !== "normal")) return "low";
  return "ok";
}

const LEVEL_ORDER: Record<QtyLevel, number> = { out: 0, low: 1, ok: 2 };

export function groupByProduct(rows: readonly StockOverviewRow[], marginCtx: MarginContext, now: Date = new Date()): ProductGroup[] {
  const byProduct = new Map<string, StockRowView[]>();
  for (const r of rows) {
    const key = r.product_id ?? r.sku_id ?? "";
    const list = byProduct.get(key) ?? [];
    list.push(enrichStockRow(r, marginCtx, now));
    byProduct.set(key, list);
  }
  const groups: ProductGroup[] = [];
  for (const [productId, views] of byProduct) {
    views.sort((a, b) => (a.row.code ?? "").localeCompare(b.row.code ?? "", "fr"));
    const first = views[0]!.row;
    const totalAvailable = views.reduce((s, v) => s + (v.row.quantity_available ?? 0), 0);
    groups.push({
      productId,
      name: first.product_name ?? skuLabel(first),
      brand: first.brand,
      category: first.category,
      imageUrl: first.image_url,
      skus: views,
      code: first.code ?? "",
      totalAvailable,
      level: levelOf(views, totalAvailable),
      activeListings: views.reduce((s, v) => s + (v.row.active_listings_count ?? 0), 0),
    });
  }
  // Tri par défaut du design : alertes d'abord (rupture, faible), puis alphabétique.
  return groups.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.name.localeCompare(b.name, "fr"));
}

export async function fetchCatalog(supabase: MobileSupabase, organizationId: string, marginCtx: MarginContext): Promise<Catalog> {
  const { rows, truncated } = await fetchAllStockRows(supabase, organizationId);
  const products = groupByProduct(rows, marginCtx);
  return {
    products,
    truncated,
    counts: {
      all: products.length,
      out: products.filter((p) => p.level === "out").length,
      low: products.filter((p) => p.level === "low").length,
      unlisted: products.filter((p) => p.activeListings === 0).length,
    },
  };
}

export type CatalogFilter = "all" | "out" | "low" | "unlisted";

/** Recherche locale (nom, marque, codes SKU, code-barres) + filtre, sans aller-retour serveur. */
export function filterCatalog(products: readonly ProductGroup[], filter: CatalogFilter, query: string): ProductGroup[] {
  const q = query.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[̀-ͯ]/g, "");
  return products.filter((p) => {
    if (filter === "out" && p.level !== "out") return false;
    if (filter === "low" && p.level !== "low") return false;
    if (filter === "unlisted" && p.activeListings !== 0) return false;
    if (!q) return true;
    const hay = [p.name, p.brand ?? "", ...p.skus.flatMap((v) => [v.row.code ?? "", v.row.barcode ?? "", v.row.variant_name ?? ""])]
      .join(" ")
      .toLocaleLowerCase("fr")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return q.split(/\s+/).every((term) => hay.includes(term));
  });
}

export interface ProductSummary {
  price: { min: number | null; max: number | null };
  averageCost: number | null;
  netMarginPercent: number | null;
  currency: string;
}

/** KPI de la fiche produit : prix (plage), coût moyen pondéré par le stock, marge nette (domaine partagé). */
export function summarizeProduct(p: ProductGroup, marginCtx: MarginContext, orgCurrency: string): ProductSummary {
  const prices = p.skus.map((v) => v.row.sale_price).filter((x): x is number => typeof x === "number");
  const costed = p.skus.filter((v) => typeof v.row.cost_price === "number");
  const weight = (v: StockRowView) => Math.max(1, v.row.quantity_on_hand ?? 0);
  const totalWeight = costed.reduce((s, v) => s + weight(v), 0);
  const averageCost = costed.length > 0 ? Math.round((costed.reduce((s, v) => s + (v.row.cost_price as number) * weight(v), 0) / totalWeight) * 100) / 100 : null;
  const avgPrice = prices.length > 0 ? prices.reduce((s, x) => s + x, 0) / prices.length : null;
  const margin = computeMargin({ salePrice: avgPrice, costPrice: averageCost, ...marginCtx });
  return {
    price: { min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null },
    averageCost,
    netMarginPercent: margin.netMarginPercent,
    currency: p.skus[0]?.row.currency ?? orgCurrency,
  };
}

export interface StockSummary {
  /** valeur du stock au coût d'achat (SKU dont le coût est connu) */
  value: number;
  /** SKU en stock dont le coût d'achat est inconnu : la valeur est alors partielle */
  skusWithoutCost: number;
  skus: number;
  units: number;
}

/** Synthèse réelle du stock (valeur au coût connu, références, unités) ; jamais de coût supposé. */
export function stockSummary(catalog: Pick<Catalog, "products">): StockSummary {
  let value = 0;
  let skusWithoutCost = 0;
  let skus = 0;
  let units = 0;
  for (const p of catalog.products)
    for (const v of p.skus) {
      skus += 1;
      const qty = Math.max(0, v.row.quantity_available ?? 0);
      units += qty;
      if (qty === 0) continue;
      if (v.row.stock_value !== null && v.row.stock_value !== undefined) value += v.row.stock_value;
      else if (v.row.cost_price !== null && v.row.cost_price !== undefined) value += v.row.cost_price * qty;
      else skusWithoutCost += 1;
    }
  return { value: Math.round(value * 100) / 100, skusWithoutCost, skus, units };
}

export type BarLevel = "ok" | "low" | "out";

/** Niveau d'un SKU pour le code-barres du stock (même règle que `levelOf`, à l'échelle du SKU). */
export function skuLevel(v: StockRowView): BarLevel {
  if ((v.row.quantity_available ?? 0) <= 0) return "out";
  return v.classification.level !== "normal" ? "low" : "ok";
}

/** Barres du code-barres : une par SKU, largeur = ventes 30 j (réelles), couleur = niveau. */
export function barcodeItems(catalog: Pick<Catalog, "products">): { id: string; weight: number; level: BarLevel }[] {
  return catalog.products.flatMap((p) => p.skus.map((v) => ({ id: v.row.sku_id ?? `${p.productId}-${v.row.code}`, weight: Math.max(0, v.row.units_30d ?? 0), level: skuLevel(v) })));
}

/**
 * Part des ventes 30 j portée par des SKU en rupture (en %, arrondie). `null` si aucune vente sur
 * 30 jours (rien à rapporter, et jamais « 0 % » inventé).
 */
export function outOfStockSalesShare(catalog: Pick<Catalog, "products">): number | null {
  let total = 0;
  let lost = 0;
  for (const p of catalog.products)
    for (const v of p.skus) {
      const u = Math.max(0, v.row.units_30d ?? 0);
      total += u;
      if ((v.row.quantity_available ?? 0) <= 0) lost += u;
    }
  return total > 0 ? Math.round((lost / total) * 100) : null;
}

/** Couverture en jours : quantité disponible ÷ ventes quotidiennes (30 j). `null` sans vente. */
export function coverDays(available: number, units30d: number): number | null {
  if (!(units30d > 0)) return null;
  return Math.round(Math.max(0, available) / (units30d / 30));
}
