/**
 * Calculs purs de l'écran Stock web : filtres, tris et pagination en mémoire (mêmes règles que
 * listStock côté base), libellés honnêtes des cellules (« ≈ » estimation, « — » inconnu, jamais 0),
 * export CSV. Aucune donnée inventée.
 */
import type { StockLevel } from "@/domain/inventory/alerts";
import type { MarginResult } from "@/domain/pricing/margin";
import { urgencyComparator } from "@/features/analytics/stock.pure";
import type { StockRowView } from "@/features/stock/model";
import type { StockWebParams, WebSort } from "@/features/stock-web/params";

export const WEB_PAGE_SIZE = 50;

const norm = (s: string | null | undefined) => (s ?? "").toLocaleLowerCase("fr");

/** Recherche (nom, SKU, code-barres, marque, variante) : mêmes colonnes que la recherche en base. */
export function matchesSearch(row: StockRowView["row"], q: string): boolean {
  const needle = norm(q.trim());
  if (!needle) return true;
  return [row.product_name, row.code, row.barcode, row.brand, row.variant_name].some((f) => norm(f).includes(needle));
}

/** Niveau « faible » des puces et du code-barres : risque de rupture ou stock faible. */
export function isWeak(level: StockLevel): boolean {
  return level === "at_risk" || level === "low";
}

export function filterViews(views: readonly StockRowView[], p: Pick<StockWebParams, "base" | "niveau">): StockRowView[] {
  const b = p.base;
  return views.filter((v) => {
    const r = v.row;
    const available = r.quantity_available ?? 0;
    if (b.q && !matchesSearch(r, b.q)) return false;
    if (b.brand && r.brand !== b.brand) return false;
    if (b.category && r.category !== b.category) return false;
    if (b.channel && !(r.channel_providers ?? []).includes(b.channel)) return false;
    if (b.supplier && !(r.supplier_ids ?? []).includes(b.supplier)) return false;
    if (b.min_margin !== undefined && Number.isFinite(b.min_margin) && !(r.unit_margin !== null && r.unit_margin >= b.min_margin)) return false;
    if (b.stock === "in_stock" && !(available > 0)) return false;
    if (b.stock === "empty" && !(available <= 0)) return false;
    if (b.stock === "negative" && !(available < 0)) return false;
    if (b.status && v.classification.level !== b.status) return false;
    switch (p.niveau) {
      case "rupture":
        return v.classification.level === "out_of_stock";
      case "faible":
        return isWeak(v.classification.level);
      case "sans_annonce":
        return (r.active_listings_count ?? 0) === 0;
      case "sans_cout":
        return r.cost_price === null;
      default:
        return true;
    }
  });
}

const byName = (a: StockRowView, b: StockRowView) => (a.row.product_name ?? "").localeCompare(b.row.product_name ?? "", "fr") || (a.row.code ?? "").localeCompare(b.row.code ?? "", "fr");
/** Valeurs inconnues toujours en dernier, quel que soit le sens. */
function nullsLast(a: number | null | undefined, b: number | null | undefined, dir: 1 | -1): number {
  const na = a === null || a === undefined || Number.isNaN(a);
  const nb = b === null || b === undefined || Number.isNaN(b);
  if (na && nb) return 0;
  if (na) return 1;
  if (nb) return -1;
  return a === b ? 0 : (a < b ? -1 : 1) * dir;
}
const time = (s: string | null | undefined) => (s ? new Date(s).getTime() : null);

export function sortViews(views: readonly StockRowView[], sort: WebSort): StockRowView[] {
  const out = [...views];
  const cmp: Record<WebSort, (a: StockRowView, b: StockRowView) => number> = {
    urgency: urgencyComparator,
    cover: (a, b) => nullsLast(a.daysOfCover, b.daysOfCover, 1) || byName(a, b),
    best_sellers: (a, b) => nullsLast(a.row.units_30d, b.row.units_30d, -1) || nullsLast(a.row.units_90d, b.row.units_90d, -1) || byName(a, b),
    low_stock: (a, b) => nullsLast(a.row.quantity_available, b.row.quantity_available, 1) || byName(a, b),
    margin: (a, b) => nullsLast(a.row.unit_margin, b.row.unit_margin, -1) || byName(a, b),
    stock_value: (a, b) => nullsLast(a.row.stock_value, b.row.stock_value, -1) || byName(a, b),
    last_sale: (a, b) => nullsLast(time(a.row.last_sale_at), time(b.row.last_sale_at), -1) || byName(a, b),
    // Stock dormant : jamais vendu d'abord, puis la dernière vente la plus ancienne.
    oldest_sale: (a, b) => {
      const ta = time(a.row.last_sale_at);
      const tb = time(b.row.last_sale_at);
      if (ta === null && tb === null) return byName(a, b);
      if (ta === null) return -1;
      if (tb === null) return 1;
      return ta - tb || byName(a, b);
    },
    name: byName,
  };
  return out.sort((a, b) => cmp[sort](a, b) || (a.row.sku_id ?? "").localeCompare(b.row.sku_id ?? ""));
}

export function paginate<T>(items: readonly T[], page: number, pageSize = WEB_PAGE_SIZE): { rows: T[]; page: number; pageCount: number; from: number; to: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const start = (page - 1) * pageSize;
  const rows = items.slice(start, start + pageSize);
  return { rows, page, pageCount, from: rows.length ? start + 1 : 0, to: start + rows.length };
}

// ------------------------------------------------------------------------------------------
// Libellés des cellules
// ------------------------------------------------------------------------------------------

export type Tone = "danger" | "warning" | "success" | "muted" | "default";

/** Niveau : libellé court + teinte du point (rupture rouge, risque/faible ambre, en stock vert). */
export function levelDisplay(level: StockLevel): { label: string; tone: "out" | "low" | "ok"; barcode: "out" | "low" | "ok" } {
  switch (level) {
    case "out_of_stock":
      return { label: "Rupture", tone: "out", barcode: "out" };
    case "at_risk":
      return { label: "Risque", tone: "low", barcode: "low" };
    case "low":
      return { label: "Faible", tone: "low", barcode: "low" };
    default:
      return { label: "En stock", tone: "ok", barcode: "ok" };
  }
}

/** Couverture : « rupture » / « ≈ N j » / « — » (vitesse inconnue ou nulle). */
export function coverDisplay(v: Pick<StockRowView, "daysOfCover" | "classification"> & { row: Pick<StockRowView["row"], "quantity_available"> }): { text: string; tone: Tone; dot: boolean; title: string } {
  if ((v.row.quantity_available ?? 0) <= 0) return { text: "rupture", tone: "danger", dot: true, title: "Aucune unité disponible." };
  const d = v.daysOfCover;
  if (d === null) return { text: "—", tone: "muted", dot: false, title: "Vitesse de vente inconnue (pas assez de ventes)." };
  if (!Number.isFinite(d)) return { text: "—", tone: "muted", dot: false, title: "Aucune vente récente : couverture non calculable." };
  const weak = isWeak(v.classification.level);
  return { text: d < 1 ? "≈ < 1 j" : `≈ ${Math.round(d)} j`, tone: weak ? "warning" : "default", dot: weak, title: `Couverture estimée : ${d.toFixed(1)} jour(s).` };
}

/** Marge nette estimée en % du prix : « ≈ N % » (vert / rouge) ou « — » si coût ou prix inconnu. */
export function marginDisplay(m: Pick<MarginResult, "netMarginPercent" | "caveat" | "complete">): { text: string; tone: Tone; provisional: boolean; title: string | undefined } {
  if (m.netMarginPercent === null) return { text: "—", tone: "muted", provisional: false, title: m.caveat ?? "Marge non calculable." };
  const n = Math.round(m.netMarginPercent);
  return { text: `≈ ${n.toLocaleString("fr-FR")} %`, tone: n < 0 ? "danger" : "success", provisional: !m.complete, title: m.caveat ?? undefined };
}

const PROVIDER_LABEL: Record<string, string> = { ebay: "eBay", amazon: "Amazon", shopify: "Shopify", woocommerce: "WooCommerce", manual: "Manuel" };
export function providerLabel(p: string): string {
  return PROVIDER_LABEL[p] ?? p;
}

/** Canal : canaux des annonces associées ; aucune annonce active → « Sans annonce » atténué. */
export function channelDisplay(row: Pick<StockRowView["row"], "channel_providers" | "active_listings_count">): { text: string; muted: boolean } {
  const providers = (row.channel_providers ?? []).filter((p) => p !== "manual");
  if ((row.active_listings_count ?? 0) === 0) return { text: providers.length ? `${providers.map(providerLabel).join(" + ")} · sans annonce active` : "Sans annonce", muted: true };
  return { text: providers.length ? providers.map(providerLabel).join(" + ") : "Annonce active", muted: false };
}

export type GlyphKey = "phone" | "tablet" | "laptop" | "audio" | "watch" | "screen" | "battery" | "cable" | "case" | "console" | "camera" | "part" | "generic";

/** Pictogramme de catégorie (jamais de fausse photo). */
export function categoryGlyph(category: string | null | undefined, productName?: string | null): GlyphKey {
  const c = norm(category);
  const n = norm(productName);
  const has = (s: string, words: string[]) => words.some((w) => s.includes(w));
  if (has(c, ["écran", "ecran", "display"])) return "screen";
  if (has(c, ["batter"])) return "battery";
  if (has(c, ["protection", "coque", "étui", "verre"])) return "case";
  if (has(c, ["pièce", "piece", "spare"])) return has(n, ["écran", "ecran", "oled", "lcd"]) ? "screen" : has(n, ["batter"]) ? "battery" : "part";
  if (has(c, ["téléphone", "telephone", "smartphone", "mobile"])) return "phone";
  if (has(c, ["tablette", "tablet", "ipad"])) return "tablet";
  if (has(c, ["ordinateur", "laptop", "portable", "macbook"])) return "laptop";
  if (has(c, ["audio", "écouteur", "ecouteur", "casque"])) return "audio";
  if (has(c, ["montre", "watch"])) return "watch";
  if (has(c, ["accessoire", "câble", "cable", "chargeur"])) return "cable";
  if (has(c, ["console", "jeu"])) return "console";
  if (has(c, ["photo", "caméra", "camera"])) return "camera";
  return "generic";
}

// ------------------------------------------------------------------------------------------
// Export CSV
// ------------------------------------------------------------------------------------------

/** Cellule CSV (séparateur « ; ») : guillemets doublés, formules neutralisées (=, +, -, @). */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(v).replace(".", ",") : "") : v;
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const LEVEL_CSV: Record<StockLevel, string> = { out_of_stock: "Rupture", at_risk: "Risque de rupture", low: "Stock faible", normal: "En stock" };

/** Export CSV (UTF-8 avec BOM, « ; ») ; une valeur inconnue reste vide, jamais 0. */
export function stockCsv(views: readonly StockRowView[]): string {
  const head = ["SKU", "Produit", "Variante", "Marque", "Catégorie", "Disponible", "En main", "Réservé", "Ventes 30 j", "Couverture (j)", "Coût", "Prix", "Marge nette estimée (%)", "Niveau", "Annonces actives", "Devise"];
  const lines = views.map((v) => {
    const r = v.row;
    const cover = v.daysOfCover !== null && Number.isFinite(v.daysOfCover) ? Math.round(v.daysOfCover * 10) / 10 : null;
    return [r.code, r.product_name, r.variant_name, r.brand, r.category, r.quantity_available, r.quantity_on_hand, r.quantity_reserved, r.units_30d, cover, r.cost_price, r.sale_price, v.margin.netMarginPercent, LEVEL_CSV[v.classification.level], r.active_listings_count, r.currency]
      .map(csvCell)
      .join(";");
  });
  return `﻿${[head.map(csvCell).join(";"), ...lines].join("\r\n")}\r\n`;
}
