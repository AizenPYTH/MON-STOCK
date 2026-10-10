import type { MatchSuggestionDTO, RadarCostSettings, RadarDTO, RadarItemDTO, RadarSort } from "@/features/mobile-api/contract";
import { PRICE_ORIGIN_LABEL } from "@/domain/sourcing/radar";
import type { MobileSupabase } from "~/lib/supabase";
import { callApi } from "~/lib/api";
import { UserFacingError, userMessage } from "~/lib/errors";

/**
 * Radar d'opportunités (calcul côté serveur sur les données réelles de l'organisation) et
 * offres enregistrées (écriture directe sous RLS : rédacteur, même organisation, prix figé).
 */
export type { RadarDTO, RadarItemDTO, RadarSort, RadarCostSettings, MatchSuggestionDTO };
export { PRICE_ORIGIN_LABEL };

export const STATUS_LABEL: Record<RadarItemDTO["evaluation"]["status"], string> = {
  profitable: "Rentable (coûts complets)",
  estimated: "Estimation partielle",
  unprofitable: "Non rentable",
  insufficient_data: "Données insuffisantes",
};

export const STATUS_TONE: Record<RadarItemDTO["evaluation"]["status"], "success" | "accent" | "danger" | "neutral"> = {
  profitable: "success",
  estimated: "accent",
  unprofitable: "danger",
  insufficient_data: "neutral",
};

export const FRESHNESS_LABEL: Record<RadarItemDTO["evaluation"]["freshness"], string> = {
  fresh: "Prix récent",
  recent: "Prix de moins de 7 jours",
  stale: "Prix ancien",
  unknown: "Date du prix inconnue",
};

export const SORT_OPTIONS: { value: RadarSort; label: string }[] = [
  { value: "score", label: "Pertinence" },
  { value: "profit", label: "Bénéfice" },
  { value: "margin", label: "Marge" },
  { value: "availability", label: "Dispo" },
  { value: "freshness", label: "Fraîcheur" },
];

export function fetchRadar(organizationId: string, sort: RadarSort): Promise<RadarDTO> {
  return callApi<RadarDTO>("/radar", { organizationId, query: { sort } });
}

export function saveRadarSettings(organizationId: string, settings: RadarCostSettings): Promise<RadarCostSettings> {
  return callApi<RadarCostSettings>("/radar/settings", { method: "POST", organizationId, body: settings });
}

export function fetchMatchSuggestions(organizationId: string): Promise<MatchSuggestionDTO[]> {
  return callApi<MatchSuggestionDTO[]>("/sourcing/matches", { organizationId });
}

export function decideMatch(organizationId: string, matchId: string, decision: "confirm" | "reject"): Promise<{ status: string }> {
  return callApi("/sourcing/matches/decide", { method: "POST", organizationId, body: { matchId, decision } });
}

export async function saveOffer(supabase: MobileSupabase, organizationId: string, offer: { offerId: string; price: number | null; currency: string | null }, note?: string): Promise<void> {
  const { error } = await supabase.from("sourcing_saved_offers").insert({ organization_id: organizationId, offer_id: offer.offerId, price_at_save: offer.price, currency_at_save: offer.currency?.toUpperCase() ?? null, note: note?.trim() || null });
  if (error && error.code !== "23505") throw new UserFacingError(userMessage(error));
}

export async function unsaveOffer(supabase: MobileSupabase, organizationId: string, offerId: string): Promise<void> {
  const { error } = await supabase.from("sourcing_saved_offers").delete().eq("organization_id", organizationId).eq("offer_id", offerId);
  if (error) throw new UserFacingError(userMessage(error));
}

/** Texte de paramètre numérique → nombre (« 12,9 » accepté) ; vide → null (inconnu, jamais 0). */
export function parseSetting(text: string): number | null | "invalid" {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}
