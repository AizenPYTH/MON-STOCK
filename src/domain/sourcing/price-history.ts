/**
 * Historique de prix (supplier_price_history) ramené dans la devise de l'organisation, par offre
 * et par fournisseur. Pur. Aucun relevé n'est converti avec un taux inventé : un relevé dans une
 * autre devise sans prix normalisé est ignoré.
 */
export interface PriceHistoryRow {
  offer_id: string;
  original_price: number;
  original_currency: string;
  normalized_price: number | null;
  normalized_currency: string | null;
  recorded_at: string;
}

export interface HistoryPoint {
  price: number;
  recordedAt: string;
  offerId: string;
}

/** Relevés par offre dans la devise de l'organisation (prix normalisé, ou prix original si même devise), triés par date. */
export function groupPriceHistory(rows: readonly PriceHistoryRow[], orgCurrency: string): Map<string, HistoryPoint[]> {
  const map = new Map<string, HistoryPoint[]>();
  const cur = orgCurrency.toUpperCase();
  for (const r of rows) {
    const price = r.normalized_price !== null && (r.normalized_currency ?? "").toUpperCase() === cur ? Number(r.normalized_price) : r.original_currency.toUpperCase() === cur ? Number(r.original_price) : null;
    if (price === null || !Number.isFinite(price) || price <= 0) continue;
    const list = map.get(r.offer_id) ?? [];
    list.push({ price, recordedAt: r.recorded_at, offerId: r.offer_id });
    map.set(r.offer_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  return map;
}

export interface SupplierHistorySummary {
  supplierId: string;
  supplierName: string;
  offerIds: string[];
  pointCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  lastPrice: number | null;
  lastRecordedAt: string | null;
  firstRecordedAt: string | null;
  /** prix dans l'ordre chronologique (sparkline) */
  points: number[];
}

/** Historique par fournisseur pour un même produit normalisé (offres de plusieurs sources fusionnées par fournisseur). */
export function summarizeSupplierHistories(offers: ReadonlyArray<{ id: string; supplierId: string; supplierName: string }>, byOffer: ReadonlyMap<string, HistoryPoint[]>): SupplierHistorySummary[] {
  const bySupplier = new Map<string, { name: string; offerIds: string[]; points: HistoryPoint[] }>();
  for (const o of offers) {
    const entry = bySupplier.get(o.supplierId) ?? { name: o.supplierName, offerIds: [], points: [] };
    entry.offerIds.push(o.id);
    entry.points.push(...(byOffer.get(o.id) ?? []));
    bySupplier.set(o.supplierId, entry);
  }
  const out: SupplierHistorySummary[] = [];
  for (const [supplierId, e] of bySupplier) {
    const pts = [...e.points].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
    const prices = pts.map((p) => p.price);
    out.push({
      supplierId,
      supplierName: e.name,
      offerIds: e.offerIds,
      pointCount: pts.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      lastPrice: pts.length ? pts[pts.length - 1]!.price : null,
      lastRecordedAt: pts.length ? pts[pts.length - 1]!.recordedAt : null,
      firstRecordedAt: pts.length ? pts[0]!.recordedAt : null,
      points: prices,
    });
  }
  // fournisseurs avec historique d'abord, puis dernier prix croissant
  return out.sort((a, b) => (a.lastPrice === null ? 1 : 0) - (b.lastPrice === null ? 1 : 0) || (a.lastPrice ?? 0) - (b.lastPrice ?? 0) || a.supplierName.localeCompare(b.supplierName, "fr"));
}
