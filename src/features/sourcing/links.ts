/** Liens vers le moteur de sourcing (purs). */

/** Quantité passée à « Trouver moins cher » : quantité de réapprovisionnement recommandée si connue et > 0, sinon 1. */
export function findCheaperQuantity(recommendedQuantity: number | null | undefined): number {
  return recommendedQuantity !== null && recommendedQuantity !== undefined && Number.isFinite(recommendedQuantity) && recommendedQuantity >= 1 ? Math.floor(recommendedQuantity) : 1;
}

/** /sourcing?sku=…&qty=… (mode SKU : comparaison avec le coût actuel). */
export function findCheaperHref(skuCode: string, recommendedQuantity?: number | null): string {
  const sp = new URLSearchParams({ sku: skuCode, qty: String(findCheaperQuantity(recommendedQuantity)) });
  return `/sourcing?${sp.toString()}`;
}
