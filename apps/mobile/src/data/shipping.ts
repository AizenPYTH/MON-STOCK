import type { Json } from "@/db/database.types";
import type { ShippingQuoteRequest, ShippingQuotesDTO, TrackingProvidersDTO } from "@/features/mobile-api/contract";
import { rateCardFromRow, type RateBand, type RateCard } from "@/domain/tools/shipping";
import { callApi } from "~/lib/api";
import type { MobileSupabase } from "~/lib/supabase";

/** Expédition : grilles saisies (sous RLS) et devis des plateformes connectées (serveur). */

export interface ToolsStatus {
  shipping: { id: string; label: string; configured: boolean }[];
  tracking: TrackingProvidersDTO;
}

export function fetchToolsStatus(organizationId: string): Promise<ToolsStatus> {
  return callApi<ToolsStatus>("/tools/status", { organizationId });
}

export function requestShippingQuotes(organizationId: string, req: ShippingQuoteRequest): Promise<ShippingQuotesDTO> {
  return callApi<ShippingQuotesDTO>("/shipping/quotes", { method: "POST", organizationId, body: req });
}

const CARD_COLUMNS = "id, carrier, service, from_countries, to_countries, bands, currency, max_length_cm, max_dimensions_sum_cm, volumetric_divisor, transit_days_min, transit_days_max, tracking, delivery_mode, notes, verified_at";

export async function fetchRateCards(supabase: MobileSupabase, organizationId: string): Promise<RateCard[]> {
  const { data, error } = await supabase.from("shipping_rate_cards").select(CARD_COLUMNS).eq("organization_id", organizationId).order("carrier").order("service").limit(200);
  if (error) throw error;
  return (data ?? []).map(rateCardFromRow);
}

export interface RateCardInput {
  carrier: string;
  service: string;
  fromCountries: string[];
  toCountries: string[];
  bands: RateBand[];
  currency: string;
  maxLengthCm: number | null;
  maxDimensionsSumCm: number | null;
  volumetricDivisor: number | null;
  transitDaysMin: number | null;
  transitDaysMax: number | null;
  tracking: boolean | null;
  deliveryMode: string | null;
  notes: string | null;
  verifiedAt: string | null;
}

function toRow(input: RateCardInput) {
  return {
    carrier: input.carrier.trim(),
    service: input.service.trim(),
    from_countries: input.fromCountries,
    to_countries: input.toCountries,
    bands: input.bands as unknown as Json,
    currency: input.currency,
    max_length_cm: input.maxLengthCm,
    max_dimensions_sum_cm: input.maxDimensionsSumCm,
    volumetric_divisor: input.volumetricDivisor,
    transit_days_min: input.transitDaysMin,
    transit_days_max: input.transitDaysMax,
    tracking: input.tracking,
    delivery_mode: input.deliveryMode?.trim() || null,
    notes: input.notes?.trim() || null,
    verified_at: input.verifiedAt,
  };
}

export async function saveRateCard(supabase: MobileSupabase, organizationId: string, id: string | null, input: RateCardInput): Promise<void> {
  if (id) {
    const { error } = await supabase.from("shipping_rate_cards").update(toRow(input)).eq("organization_id", organizationId).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("shipping_rate_cards").insert({ ...toRow(input), organization_id: organizationId });
  if (error) throw error;
}

export async function deleteRateCard(supabase: MobileSupabase, organizationId: string, id: string): Promise<void> {
  const { error } = await supabase.from("shipping_rate_cards").delete().eq("organization_id", organizationId).eq("id", id);
  if (error) throw error;
}
