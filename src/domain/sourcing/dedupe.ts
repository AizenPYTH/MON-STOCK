/**
 * Déduplication des résultats de recherche : une seule offre par (fournisseur, produit
 * normalisé), en conservant la moins chère sur le prix comparable. Une offre sans clé produit
 * n'est jamais fusionnée ; un prix inconnu perd face à un prix connu ; à prix égal, la plus
 * récente est conservée. Le nombre d'offres fusionnées est restitué pour affichage.
 */
export interface DedupeCandidate {
  id: string;
  supplierId: string;
  /** identifiant du produit normalisé (sourcing_products.id) ou clé normalisée ; null = non fusionnable */
  productKey: string | null;
  comparablePrice: number | null;
  lastSeenAt: string | null;
}

export interface DedupeResult<T> {
  kept: T[];
  /** id conservé → nombre d'offres identiques fusionnées */
  collapsed: Map<string, number>;
}

function better(a: DedupeCandidate, b: DedupeCandidate): boolean {
  if (a.comparablePrice !== null && b.comparablePrice === null) return true;
  if (a.comparablePrice === null && b.comparablePrice !== null) return false;
  if (a.comparablePrice !== null && b.comparablePrice !== null && a.comparablePrice !== b.comparablePrice) return a.comparablePrice < b.comparablePrice;
  const ta = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
  const tb = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
  return ta > tb;
}

export function dedupeKey(c: Pick<DedupeCandidate, "supplierId" | "productKey">): string | null {
  return c.productKey ? `${c.supplierId}|${c.productKey}` : null;
}

export function dedupeOffers<T extends DedupeCandidate>(items: readonly T[]): DedupeResult<T> {
  const best = new Map<string, T>();
  const counts = new Map<string, number>();
  const order: Array<T | string> = [];
  for (const item of items) {
    const key = dedupeKey(item);
    if (!key) {
      order.push(item);
      continue;
    }
    const current = best.get(key);
    if (!current) {
      best.set(key, item);
      order.push(key);
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (better(item, current)) best.set(key, item);
  }
  const kept: T[] = [];
  const collapsed = new Map<string, number>();
  for (const entry of order) {
    if (typeof entry === "string") {
      const item = best.get(entry)!;
      kept.push(item);
      const n = counts.get(entry) ?? 0;
      if (n > 0) collapsed.set(item.id, n);
    } else kept.push(entry);
  }
  return { kept, collapsed };
}
