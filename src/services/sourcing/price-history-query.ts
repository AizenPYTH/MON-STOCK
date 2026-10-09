import "server-only";
import type { DbClient } from "@/services/sourcing/offer-query";
import type { PriceHistoryRow } from "@/domain/sourcing/price-history";

/**
 * Lecture des derniers relevés de prix (supplier_price_history) d'un ensemble d'offres.
 *
 * Une requête groupée « .in(offer_id) triée du plus ancien au plus récent + limit » perdait les
 * relevés les PLUS RÉCENTS dès que le volume dépassait la limite — et PostgREST plafonne de
 * toute façon une réponse à 1 000 lignes, quelle que soit la limite demandée. Ici : une requête
 * par offre, du plus récent au plus ancien (index supplier_price_history_offer_idx
 * (offer_id, recorded_at desc)), bornée à `perOffer` relevés (< plafond PostgREST) : chaque offre
 * reçoit ses N derniers relevés de la fenêtre, quel que soit le volume des autres. Les relevés
 * étant enregistrés uniquement à chaque changement de prix, N = 200 couvre la fenêtre de 90 jours
 * dans la pratique. Le tri chronologique est refait en mémoire par groupPriceHistory.
 */
export const PRICE_HISTORY_POINTS_PER_OFFER = 200;
/** Plafond de lignes d'une réponse PostgREST (max-rows) : une requête ne doit jamais l'atteindre. */
export const POSTGREST_MAX_ROWS = 1000;
/** Requêtes simultanées au plus (pages de 20 offres, fiche détaillée : 30 offres sœurs). */
const PRICE_HISTORY_CONCURRENCY = 8;

const PRICE_HISTORY_COLUMNS = "offer_id, original_price, original_currency, normalized_price, normalized_currency, recorded_at";

export interface RecentPriceHistory {
  rows: PriceHistoryRow[];
  /** Offres dont l'historique n'a pas pu être lu (erreur base) : leurs relevés sont absents. */
  failedOfferIds: string[];
  /** Offres ayant au moins `perOffer` relevés dans la fenêtre (seuls les plus récents sont lus). */
  cappedOfferIds: string[];
}

export async function loadRecentPriceHistory(
  supabase: DbClient,
  organizationId: string,
  offerIds: readonly string[],
  since: string,
  options: { perOffer?: number; concurrency?: number } = {},
): Promise<RecentPriceHistory> {
  const perOffer = Math.max(1, Math.min(options.perOffer ?? PRICE_HISTORY_POINTS_PER_OFFER, POSTGREST_MAX_ROWS - 1));
  const concurrency = Math.max(1, options.concurrency ?? PRICE_HISTORY_CONCURRENCY);
  const ids = [...new Set(offerIds)];
  const out: RecentPriceHistory = { rows: [], failedOfferIds: [], cappedOfferIds: [] };
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const offerId = ids[next++]!;
      const { data, error } = await supabase
        .from("supplier_price_history")
        .select(PRICE_HISTORY_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("offer_id", offerId)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(perOffer);
      if (error) {
        out.failedOfferIds.push(offerId);
        continue;
      }
      const rows = (data ?? []) as PriceHistoryRow[];
      if (rows.length >= perOffer) out.cappedOfferIds.push(offerId);
      out.rows.push(...rows);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return out;
}
