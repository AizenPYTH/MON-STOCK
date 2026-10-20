import { STOCK_SORTS, stockListParamsSchema, type StockListParams } from "@/features/stock/schemas";

/**
 * Paramètres d'URL de l'écran Stock web (v5). Reprend tels quels les filtres, tris et la
 * pagination existants (stockListParamsSchema) et ajoute uniquement des réglages de présentation :
 * puces de niveau (`niveau`), tri « alertes d'abord » / couverture, densité, fiche ouverte (`sku`).
 */

export const WEB_SORTS = [...STOCK_SORTS, "urgency", "cover"] as const;
export type WebSort = (typeof WEB_SORTS)[number];
export const DEFAULT_WEB_SORT: WebSort = "urgency";

/** Puces de niveau : Rupture, Faible (risque de rupture + stock faible), Sans annonce, Sans coût. */
export const LEVEL_FILTERS = ["rupture", "faible", "sans_annonce", "sans_cout"] as const;
export type LevelFilter = (typeof LEVEL_FILTERS)[number];

export type Density = "confort" | "compacte";

export interface StockWebParams {
  /** filtres existants (recherche, marque, catégorie, statut, fournisseur, canal, marge min., stock, page, archivés) */
  base: StockListParams;
  niveau: LevelFilter | null;
  sort: WebSort;
  density: Density;
  /** code SKU de la fiche ouverte en panneau */
  sku: string | null;
}

/** searchParams Next (valeurs simples ou multiples) → dictionnaire plat (première valeur, vides ignorées). */
export function flattenParams(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) flat[k] = val;
  }
  return flat;
}

function isOneOf<T extends string>(list: readonly T[], v: string | undefined): v is T {
  return v !== undefined && (list as readonly string[]).includes(v);
}

export function parseStockWebParams(flat: Record<string, string>): StockWebParams {
  const { sort, niveau, densite, sku, ...rest } = flat;
  const parsed = stockListParamsSchema.safeParse(rest);
  const base = parsed.success ? parsed.data : stockListParamsSchema.parse({});
  return {
    base,
    niveau: isOneOf(LEVEL_FILTERS, niveau) ? niveau : null,
    sort: isOneOf(WEB_SORTS, sort) ? sort : DEFAULT_WEB_SORT,
    density: densite === "compacte" ? "compacte" : "confort",
    sku: sku && sku.length <= 64 ? sku : null,
  };
}

/**
 * Lien vers /stock en partant des paramètres actuels : `null` retire un paramètre. Tout changement
 * de filtre ou de tri revient à la première page (sauf si `page` est fourni explicitement) ; la
 * fiche ouverte est refermée sauf si `sku` est fourni.
 */
export function stockHref(flat: Record<string, string>, changes: Record<string, string | null>, opts: { keepPage?: boolean; keepSku?: boolean } = {}): string {
  const sp = new URLSearchParams(flat);
  if (!opts.keepPage && !("page" in changes)) sp.delete("page");
  if (!opts.keepSku && !("sku" in changes)) sp.delete("sku");
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") sp.delete(k);
    else sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `/stock?${s}` : "/stock";
}

/** Nombre de filtres secondaires actifs (formulaire « Filtres ») : marque, statut, fournisseur, canal, marge min., stock. */
export function activeSecondaryFilters(base: StockListParams): number {
  return [base.brand, base.status, base.supplier, base.channel, base.min_margin, base.stock].filter((v) => v !== undefined && v !== "").length;
}

export const SORT_LABEL: Record<WebSort, string> = {
  urgency: "Alertes d'abord",
  cover: "Couverture croissante",
  best_sellers: "Les plus vendus d'abord",
  low_stock: "Stock croissant",
  margin: "Marge brute décroissante",
  stock_value: "Valeur de stock décroissante",
  last_sale: "Vendus récemment d'abord",
  oldest_sale: "Sans vente depuis longtemps d'abord",
  name: "A → Z",
};
