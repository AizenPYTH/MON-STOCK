import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { parseQuery } from "@/domain/sourcing/query-parser";
import { runLiveSearch } from "@/services/sourcing/live-search";
import type { LiveSearchSummary } from "@/services/sourcing/live-search.types";
import type { SimpleOfferDTO, SimpleRankedOfferDTO, SimpleSearchDTO, SimpleSupplierResultDTO } from "@/features/mobile-api/contract";

export type { SimpleOfferDTO, SimpleRankedOfferDTO, SimpleSearchDTO, SimpleSupplierResultDTO };

/**
 * Recherche « Fournisseurs » simple : on interroge les fournisseurs en direct, puis on liste
 * les offres trouvées, regroupées par fournisseur, du moins cher au plus cher. Pas de score ni
 * de radar : le titre, le prix, la disponibilité et le lien, tels que relevés chez le fournisseur.
 */
const log = createLogger("SUPPLIER_SEARCH");

/** au-delà, on affiche ce qui est déjà enregistré plutôt que de faire attendre l'utilisateur */
export const SIMPLE_SEARCH_LIVE_BUDGET_MS = 35_000;
export const SIMPLE_SEARCH_PER_SUPPLIER = 30;
const SCAN_LIMIT = 3000;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mots de la recherche (sans accents, minuscules). Les mots vides et la ponctuation sont ignorés. */
export function queryTokens(q: string): string[] {
  const stop = new Set(["de", "du", "la", "le", "les", "des", "un", "une", "pour", "et", "the", "for"]);
  return Array.from(new Set(fold(q).split(/[^a-z0-9+]+/).filter((t) => t.length > 0 && !stop.has(t) && (t.length >= 2 || /\d/.test(t)))));
}

/**
 * Le titre contient-il TOUS les mots ? Un mot doit commencer un mot du titre (« pro » trouve
 * « Pro » et « Promax ») ; un nombre doit être un nombre entier du titre (« 12 » ne trouve pas
 * « 128 Go »).
 */
export function matchesQuery(title: string, tokens: string[]): boolean {
  const t = fold(title);
  return tokens.every((tok) => {
    const esc = tok.replace(/[+]/g, "\\+");
    const re = /^\d+$/.test(tok) ? new RegExp(`(^|[^0-9])${esc}(?![0-9])`) : new RegExp(`(^|[^a-z0-9])${esc}`);
    return re.test(t);
  });
}

interface OfferRow {
  id: string;
  title_original: string;
  original_price: number | string | null;
  original_currency: string | null;
  normalized_price: number | string | null;
  tax_type: string | null;
  available_quantity: number | null;
  stock_status: string | null;
  source_url: string | null;
  last_seen_at: string | null;
  supplier_id: string;
  supplier: { name: string; country: string | null } | null;
}

const num = (v: number | string | null): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Regroupe par fournisseur ; offres du moins cher au plus cher (prix inconnu en dernier), fournisseurs par meilleur prix. Pur. */
export function groupBySupplier(rows: OfferRow[], perSupplier = SIMPLE_SEARCH_PER_SUPPLIER): SimpleSupplierResultDTO[] {
  const groups = new Map<string, { supplierName: string; country: string | null; offers: SimpleOfferDTO[] }>();
  for (const r of rows) {
    const g = groups.get(r.supplier_id) ?? { supplierName: r.supplier?.name ?? "Fournisseur", country: r.supplier?.country ?? null, offers: [] };
    const stock = r.stock_status === "in_stock" || r.stock_status === "low" || r.stock_status === "out_of_stock" ? r.stock_status : "unknown";
    g.offers.push({
      id: r.id,
      title: r.title_original,
      price: num(r.original_price),
      currency: r.original_currency,
      priceConverted: num(r.normalized_price),
      taxType: r.tax_type === "ht" || r.tax_type === "ttc" ? r.tax_type : "unknown",
      stock,
      quantity: r.available_quantity,
      url: r.source_url,
      seenAt: r.last_seen_at,
    });
    groups.set(r.supplier_id, g);
  }
  const key = (o: SimpleOfferDTO) => (o.stock === "out_of_stock" ? 1e12 : 0) + (o.priceConverted ?? o.price ?? 1e11);
  const out = Array.from(groups.entries()).map(([supplierId, g]) => {
    const sorted = g.offers.sort((a, b) => key(a) - key(b));
    return { supplierId, supplierName: g.supplierName, country: g.country, total: sorted.length, offers: sorted.slice(0, perSupplier) };
  });
  return out.sort((a, b) => key(a.offers[0]!) - key(b.offers[0]!) || a.supplierName.localeCompare(b.supplierName));
}

/**
 * Motif ILIKE d'un mot, insensible aux accents : chaque voyelle (et « c », pour « ç ») devient
 * le joker « _ » (« ecran » → « %_cr_n% » trouve « Écran »). Le contrôle exact suit en mémoire.
 */
export function ilikePattern(token: string): string {
  return `%${token.replace(/[^a-z0-9+]/g, "").replace(/[aeiouyc]/g, "_")}%`;
}

export const SIMPLE_SEARCH_MAX_OFFERS = 400;

/** Toutes les offres, du moins cher au plus cher (prix converti dans la devise de l'organisation ; prix inconnu en dernier). Pur. */
export function byPrice(rows: OfferRow[], max = SIMPLE_SEARCH_MAX_OFFERS): SimpleRankedOfferDTO[] {
  const all = groupBySupplier(rows, Number.MAX_SAFE_INTEGER).flatMap((g) => g.offers.map((o) => ({ ...o, supplierId: g.supplierId, supplierName: g.supplierName, country: g.country })));
  const key = (o: SimpleOfferDTO) => o.priceConverted ?? o.price ?? Number.POSITIVE_INFINITY;
  return all.sort((a, b) => key(a) - key(b) || a.title.localeCompare(b.title)).slice(0, max);
}

async function withBudget<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function simpleSupplierSearch(
  ctx: OrgContext,
  q: string,
  deps: { live?: (ctx: OrgContext, q: string) => Promise<LiveSearchSummary>; budgetMs?: number; now?: () => number } = {},
): Promise<SimpleSearchDTO> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  const query = q.trim().slice(0, 120);
  const tokens = queryTokens(query);
  if (tokens.length === 0) throw new AppError("VALIDATION", "Tapez ce que vous cherchez, par exemple « iPhone 13 » ou « batterie trottinette ».");

  // 1. Fournisseurs interrogés en direct (les offres trouvées sont enregistrées en base).
  const live = deps.live ?? ((c: OrgContext, text: string) => runLiveSearch(c, { rawQuery: text, parsed: parseQuery(text) }));
  let summary: LiveSearchSummary | null = null;
  let partial = false;
  try {
    const r = await withBudget(live(ctx, query), deps.budgetMs ?? SIMPLE_SEARCH_LIVE_BUDGET_MS);
    if (r === "timeout") partial = true;
    else summary = r;
  } catch (e) {
    partial = true;
    log.warn("live search failed", { orgId: ctx.organization.id, error: e instanceof Error ? e.message : String(e) });
  }

  // 2. Offres actives enregistrées qui contiennent tous les mots de la recherche : filtre en base
  //    (insensible aux accents grâce aux jokers), puis contrôle exact mot par mot.
  let offersQuery = ctx.supabase
    .from("sourcing_offers")
    .select("id, title_original, original_price, original_currency, normalized_price, tax_type, available_quantity, stock_status, source_url, last_seen_at, supplier_id, supplier:suppliers(name, country)")
    .eq("organization_id", ctx.organization.id)
    .eq("status", "active");
  for (const tok of tokens) offersQuery = offersQuery.ilike("title_original", ilikePattern(tok));
  const { data, error } = await offersQuery.order("normalized_price", { ascending: true, nullsFirst: false }).limit(SCAN_LIMIT);
  if (error) throw fromPostgrestError(error);
  const rows = ((data ?? []) as unknown as OfferRow[]).filter((r) => r.title_original && matchesQuery(r.title_original, tokens));
  const suppliers = groupBySupplier(rows);
  const offers = byPrice(rows);

  return {
    query,
    currency: ctx.organization.default_currency,
    total: rows.length,
    offers,
    suppliers,
    checked: (summary?.sources ?? []).map((s) => ({ supplierName: s.supplierName, ok: s.status === "ok" || s.status === "cached", found: s.found, message: s.status === "ok" || s.status === "cached" ? null : s.message })),
    partial,
    durationMs: now() - t0,
  };
}
