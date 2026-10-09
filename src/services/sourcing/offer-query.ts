import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { ParsedQuery } from "@/domain/sourcing/query-parser";
import type { RankingMode } from "@/domain/sourcing/scoring";

/**
 * Construction partagée des requêtes d'offres (recherche utilisateur et évaluation des alertes).
 * Stratégie : identifiant exact (EAN / MPN) → attributs normalisés → texte (ilike, index pg_trgm).
 */
export type DbClient = SupabaseClient<Database>;

export interface OfferFilters {
  category?: string;
  brand?: string;
  model?: string;
  storage?: string;
  color?: string;
  condition?: "new" | "refurbished" | "used";
  grade?: string;
  grades?: string[];
  quantity?: number;
  minQuantity?: number;
  maxPrice?: number;
  countries?: string[];
  maxDeliveryDays?: number;
  maxMoq?: number;
  taxType?: "ht" | "ttc";
  supplierId?: string;
  sourceType?: Database["public"]["Enums"]["source_type"];
  availability?: "in_stock" | "any";
  sort?: RankingMode;
  page?: number;
}

export const OFFER_SELECT = "*, supplier:suppliers(id, name, country, internal_score, average_lead_time_days, currency), source:supplier_sources(id, name, source_type, status, last_successful_sync_at, automated_access_confirmed, config)";
export const OFFER_FETCH_LIMIT = 500;

export type OfferQueryStage = "identifier" | "structured" | "text" | "filters_only" | "none";

// Échappement LIKE : module unique src/lib/postgrest.ts (réexporté pour les appelants existants).
import { escapeLike } from "@/lib/postgrest";
export { escapeLike };

export function baseOfferQuery(client: DbClient, organizationId: string, filters: OfferFilters, skuIdsForCategory: string[] | null) {
  let q = client.from("sourcing_offers").select(OFFER_SELECT).eq("organization_id", organizationId).eq("status", "active");
  if (filters.brand) q = q.ilike("brand", escapeLike(filters.brand));
  if (filters.model) q = q.ilike("model", `%${escapeLike(filters.model)}%`);
  if (filters.storage) q = q.ilike("storage", escapeLike(filters.storage));
  if (filters.color) q = q.ilike("color", escapeLike(filters.color));
  if (filters.condition) q = q.eq("condition", filters.condition);
  if (filters.grade) q = q.ilike("grade", escapeLike(filters.grade));
  if (filters.grades && filters.grades.length > 0) q = q.in("grade", filters.grades.map((g) => g.toUpperCase()));
  if (filters.maxPrice !== undefined) q = q.lte("normalized_price", filters.maxPrice);
  if (filters.countries && filters.countries.length > 0) q = q.in("country", filters.countries.map((c) => c.toUpperCase()));
  if (filters.maxDeliveryDays !== undefined) q = q.lte("delivery_max_days", filters.maxDeliveryDays);
  if (filters.maxMoq !== undefined) q = q.or(`moq.lte.${filters.maxMoq},moq.is.null`);
  if (filters.minQuantity !== undefined) q = q.gte("available_quantity", filters.minQuantity);
  if (filters.taxType) q = q.eq("tax_type", filters.taxType);
  if (filters.supplierId) q = q.eq("supplier_id", filters.supplierId);
  if (filters.sourceType) q = q.eq("source_type", filters.sourceType);
  if (filters.availability === "in_stock") q = q.in("stock_status", ["in_stock", "low"]);
  if (skuIdsForCategory) q = skuIdsForCategory.length > 0 ? q.in("sku_id", skuIdsForCategory.slice(0, 1000)) : q.eq("id", "00000000-0000-0000-0000-000000000000");
  return q;
}

export type OfferWithRelations = NonNullable<Awaited<ReturnType<ReturnType<typeof baseOfferQuery>["limit"]>>["data"]>[number];

/**
 * Exécute la recherche par étapes et retourne jusqu'à OFFER_FETCH_LIMIT offres.
 * Une requête vide avec des filtres renvoie les offres filtrées ; vide sans filtre → rien.
 */
export async function findOffers(client: DbClient, organizationId: string, parsed: ParsedQuery, filters: OfferFilters, options: { skuIdsForCategory?: string[] | null; includeSkuId?: string | null } = {}): Promise<{ offers: OfferWithRelations[]; stage: OfferQueryStage }> {
  const skuIds = options.skuIdsForCategory ?? null;
  const build = () => baseOfferQuery(client, organizationId, filters, skuIds);
  const run = async (q: ReturnType<typeof build>) => {
    const { data, error } = await q.order("normalized_price", { ascending: true, nullsFirst: false }).limit(OFFER_FETCH_LIMIT);
    if (error) throw error;
    return data ?? [];
  };

  let offers: OfferWithRelations[] = [];
  let stage: OfferQueryStage = "none";

  if (parsed.ean) {
    offers = await run(build().eq("ean", parsed.ean));
    stage = "identifier";
  }
  if (offers.length === 0 && parsed.mpn && parsed.kind === "mpn") {
    offers = await run(build().ilike("mpn", escapeLike(parsed.mpn)));
    stage = "identifier";
  }
  if (offers.length === 0 && parsed.criteria.model && parsed.criteria.brand) {
    let q = build().eq("brand", parsed.criteria.brand).eq("model", parsed.criteria.model);
    if (parsed.criteria.storage && !filters.storage) q = q.eq("storage", parsed.criteria.storage);
    if (parsed.criteria.color && !filters.color) q = q.eq("color", parsed.criteria.color);
    if (parsed.criteria.grade && !filters.grade) q = q.eq("grade", parsed.criteria.grade);
    if (parsed.criteria.condition !== "unknown" && !filters.condition) q = q.eq("condition", parsed.criteria.condition);
    offers = await run(q);
    stage = "structured";
  }
  if (offers.length === 0 && parsed.tokens.length > 0) {
    let q = build();
    for (const t of parsed.tokens.slice(0, 8)) q = q.ilike("title_original", `%${escapeLike(t)}%`);
    offers = await run(q);
    stage = "text";
  }
  const hasFilters = Object.entries(filters).some(([k, v]) => !["sort", "page"].includes(k) && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0));
  if (offers.length === 0 && parsed.kind === "empty" && hasFilters) {
    offers = await run(build());
    stage = "filters_only";
  }

  if (options.includeSkuId) {
    const linked = await run(build().eq("sku_id", options.includeSkuId));
    const ids = new Set(offers.map((o) => o.id));
    for (const o of linked) if (!ids.has(o.id)) offers.push(o);
    if (stage === "none" && linked.length > 0) stage = "identifier";
  }
  return { offers, stage };
}
