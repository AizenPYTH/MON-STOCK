/**
 * (Optionnel) Stratégie d'URLs propre à la source : pagination, catégories…
 * Le crawler générique (services/sourcing/crawler/source-crawler.ts) utilise `config.urls`
 * de la source ; une fonction comme celle-ci peut les générer de façon bornée.
 */
export function templateListingUrls(baseUrl: string, pages = 1): string[] {
  const max = Math.min(Math.max(1, pages), 20);
  return Array.from({ length: max }, (_, i) => `${baseUrl.replace(/\/$/, "")}/catalogue?page=${i + 1}`);
}
