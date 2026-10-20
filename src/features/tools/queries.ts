import "server-only";
import type { OrgContext } from "@/features/auth/dal";
import { readCostSettings } from "@/domain/sourcing/radar-settings";
import { latestRates, type FxRate } from "@/domain/tools/currency";
import { rateCardFromRow, type RateCard } from "@/domain/tools/shipping";
import { callEdgeApi } from "@/lib/edge-api";
import { fromPostgrestError, toUserMessage } from "@/lib/errors";
import type { CostDefaults, ToolsStatus } from "@/features/tools/types";
import { PARCEL_COLUMNS, parcelFromRow, type ParcelRow, type TrackedParcel } from "@/features/tools/parcels";

/**
 * Données des outils lues sous RLS avec la session de l'utilisateur (mêmes requêtes que
 * l'application iPhone) ; l'état des connecteurs vient du serveur (Edge `/tools/status`).
 */

/** Paramètres de coûts de l'organisation (ceux du radar) et frais du canal eBay ; null si illisibles. */
export async function fetchCostDefaults(ctx: OrgContext): Promise<CostDefaults | null> {
  const [org, channels] = await Promise.all([
    ctx.supabase.from("organizations").select("settings").eq("id", ctx.organization.id).maybeSingle(),
    ctx.supabase.from("sales_channels").select("provider, fee_percent, payment_fee_percent, payment_fee_fixed, default_shipping_cost, is_active").eq("organization_id", ctx.organization.id),
  ]);
  if (org.error || channels.error) return null;
  const list = channels.data ?? [];
  const ebay = list.find((c) => c.provider === "ebay" && c.is_active) ?? list.find((c) => c.provider === "ebay") ?? null;
  const { settings, fromChannel } = readCostSettings(org.data?.settings ?? null, ebay);
  return {
    settings,
    fromChannel,
    ebayChannel: ebay ? { fee_percent: ebay.fee_percent, payment_fee_percent: ebay.payment_fee_percent, payment_fee_fixed: ebay.payment_fee_fixed, default_shipping_cost: ebay.default_shipping_cost } : null,
  };
}

/** Derniers taux BCE connus (base EUR), date conservée par devise. */
export async function fetchFxRates(ctx: OrgContext): Promise<{ rates: FxRate[] } | { error: string }> {
  const { data, error } = await ctx.supabase.from("fx_rates").select("base_currency, quote_currency, rate, rate_date, source").eq("base_currency", "EUR").order("rate_date", { ascending: false }).limit(400);
  if (error) return { error: toUserMessage(fromPostgrestError(error)) };
  return { rates: latestRates(data ?? []) };
}

export async function fetchRateCards(ctx: OrgContext): Promise<RateCard[]> {
  const { data, error } = await ctx.supabase
    .from("shipping_rate_cards")
    .select("id, carrier, service, from_countries, to_countries, bands, currency, max_length_cm, max_dimensions_sum_cm, volumetric_divisor, transit_days_min, transit_days_max, tracking, delivery_mode, notes, verified_at")
    .eq("organization_id", ctx.organization.id)
    .order("carrier")
    .order("service")
    .limit(200);
  if (error) throw fromPostgrestError(error);
  return (data ?? []).map(rateCardFromRow);
}

/** État des connecteurs (transporteurs, API de suivi) ; erreur lisible si le serveur ne répond pas. */
export async function fetchToolsStatus(ctx: OrgContext): Promise<{ status: ToolsStatus } | { error: string }> {
  try {
    return { status: await callEdgeApi<ToolsStatus>(ctx, "/tools/status", { timeoutMs: 15_000 }) };
  } catch (e) {
    return { error: toUserMessage(e) };
  }
}

export async function fetchParcels(ctx: OrgContext, archived: boolean): Promise<TrackedParcel[]> {
  let q = ctx.supabase.from("tracked_parcels").select(PARCEL_COLUMNS).eq("organization_id", ctx.organization.id);
  q = archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) throw fromPostgrestError(error);
  return ((data ?? []) as unknown as ParcelRow[]).map(parcelFromRow);
}

export async function fetchParcel(ctx: OrgContext, id: string): Promise<TrackedParcel | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await ctx.supabase.from("tracked_parcels").select(PARCEL_COLUMNS).eq("organization_id", ctx.organization.id).eq("id", id).maybeSingle();
  if (error) throw fromPostgrestError(error);
  return data ? parcelFromRow(data as unknown as ParcelRow) : null;
}
