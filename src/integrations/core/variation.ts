/**
 * Clé de variation partagée entre les annonces (listings) et les lignes de commande.
 * eBay n'expose pas d'identifiant de variation dans GetMyeBaySelling : une variation
 * est identifiée par son SKU, à défaut par ses caractéristiques (Color=Red|Size=M).
 * Les commandes (Fulfillment API) fournissent le SKU de la variation et ses
 * « variationAspects » : la même clé est donc calculable des deux côtés.
 */
export function aspectsKey(aspects: Record<string, string> | Array<{ name: string; value: string }>): string {
  const pairs = Array.isArray(aspects) ? aspects.map((a) => [a.name, a.value] as const) : Object.entries(aspects);
  return pairs
    .map(([n, v]) => [n.trim(), v.trim()] as const)
    .filter(([n, v]) => n.length > 0 && v.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([n, v]) => `${n}=${v}`)
    .join("|");
}

export function variationKey(input: { sku: string | null | undefined; aspects?: Record<string, string> | Array<{ name: string; value: string }> | null; fallbackId?: string | null }): string {
  const sku = input.sku?.trim();
  if (sku) return sku;
  if (input.aspects) {
    const key = aspectsKey(input.aspects);
    if (key) return key;
  }
  return input.fallbackId?.trim() ?? "";
}
