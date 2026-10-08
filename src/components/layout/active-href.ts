/**
 * Entrée de navigation active pour la route courante, y compris les routes imbriquées
 * (`/suppliers/[id]/offers` → `/suppliers`, `/sourcing/offers/[id]` → `/sourcing`,
 * `/settings/sync/[runId]` → `/settings/sync`). Lorsque plusieurs entrées correspondent
 * (`/stock` et `/stock/alerts`), la plus spécifique l'emporte.
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  let best: string | null = null;
  for (const href of hrefs) {
    if (path === href || path.startsWith(href + "/")) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best;
}
