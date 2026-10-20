/**
 * Compatibilité : l'ancien moteur de sourcing (podium, filtres avancés, mode SKU « Trouver moins
 * cher ») vit désormais sous /sourcing/catalog. Les liens existants (`/sourcing?sku=…`,
 * `/sourcing?supplier=…`, filtres) y sont redirigés tels quels ; `/sourcing?q=…` seul reste la
 * nouvelle recherche fournisseurs. Pur.
 */
const LEGACY_KEYS = new Set([
  "sku",
  "category",
  "brand",
  "model",
  "storage",
  "color",
  "condition",
  "grade",
  "qty",
  "max_price",
  "country",
  "max_delivery",
  "max_moq",
  "tax",
  "supplier",
  "source",
  "availability",
  "sort",
  "page",
  "live",
]);

export function legacyCatalogHref(params: Record<string, string | string[] | undefined>): string | null {
  const sp = new URLSearchParams();
  let legacy = false;
  for (const [k, v] of Object.entries(params)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val === undefined || val === "") continue;
    if (LEGACY_KEYS.has(k)) legacy = true;
    sp.set(k, val);
  }
  if (!legacy) return null;
  return `/sourcing/catalog?${sp.toString()}`;
}
