/**
 * Lectures paginées PostgREST.
 *
 * PostgREST plafonne chaque réponse (`max_rows`, 1 000 par défaut sur Supabase) : un `.limit(2001)`
 * renvoie silencieusement 1 000 lignes au plus, sans erreur. Toute lecture qui doit voir plus de
 * 1 000 lignes doit donc être paginée par `.range()` sur un ordre STABLE (départage par clé unique).
 */

/** Taille de page des lectures paginées : alignée sur le plafond PostgREST de Supabase. */
export const DB_PAGE_SIZE = 1000;

type PageFetcher<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>;

/**
 * Lit au plus `limit` lignes (pages de `pageSize`) et indique si d'autres lignes existaient au-delà.
 * Lit `limit + 1` lignes pour détecter la troncature de façon exacte (pas de faux positif quand il y
 * a exactement `limit` lignes).
 */
export async function fetchRowsUpTo<T>(page: PageFetcher<T>, limit: number, options: { pageSize?: number } = {}): Promise<{ rows: T[]; truncated: boolean }> {
  const size = Math.max(1, options.pageSize ?? DB_PAGE_SIZE);
  const wanted = limit + 1;
  const rows: T[] = [];
  for (let from = 0; from < wanted; from += size) {
    const to = Math.min(from + size, wanted) - 1;
    const { data, error } = await page(from, to);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    // Page incomplète : fin des données.
    if (batch.length < to - from + 1) break;
  }
  const truncated = rows.length > limit;
  return { rows: truncated ? rows.slice(0, limit) : rows, truncated };
}

/**
 * Lit TOUTES les lignes d'une requête paginée par `.range()` (la requête doit avoir un ordre stable),
 * dans la limite de `maxRows` (garde-fou mémoire).
 */
export async function fetchAllRows<T>(page: PageFetcher<T>, options: { pageSize?: number; maxRows?: number } = {}): Promise<T[]> {
  const { rows } = await fetchRowsUpTo(page, options.maxRows ?? 200_000, { pageSize: options.pageSize });
  return rows;
}
