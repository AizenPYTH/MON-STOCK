import { readCostSettings } from "@/domain/sourcing/radar-settings";
import type { RadarCostSettings } from "@/domain/sourcing/radar";
import { latestRates, type FxRate } from "@/domain/tools/currency";
import type { MobileSupabase } from "~/lib/supabase";

/**
 * Données de « Mes outils » lues sous RLS : paramètres de coûts de l'organisation (mêmes règles
 * que le radar), frais du canal eBay, taux de change BCE importés par le serveur. Les calculs
 * eux-mêmes sont locaux.
 */

export interface EbayChannelFees {
  fee_percent: number | null;
  payment_fee_percent: number | null;
  payment_fee_fixed: number | null;
  default_shipping_cost: number | null;
}

export interface CostDefaults {
  settings: RadarCostSettings;
  /** réglages repris du canal eBay faute de paramètre de l'organisation */
  fromChannel: string[];
  ebayChannel: EbayChannelFees | null;
}

export async function fetchCostDefaults(supabase: MobileSupabase, organizationId: string): Promise<CostDefaults> {
  const [org, channels] = await Promise.all([
    supabase.from("organizations").select("settings").eq("id", organizationId).maybeSingle(),
    supabase.from("sales_channels").select("provider, fee_percent, payment_fee_percent, payment_fee_fixed, default_shipping_cost, is_active").eq("organization_id", organizationId),
  ]);
  if (org.error) throw org.error;
  if (channels.error) throw channels.error;
  const ebay = (channels.data ?? []).find((c) => c.provider === "ebay" && c.is_active) ?? (channels.data ?? []).find((c) => c.provider === "ebay") ?? null;
  const { settings, fromChannel } = readCostSettings(org.data?.settings ?? null, ebay);
  return { settings, fromChannel, ebayChannel: ebay ? { fee_percent: ebay.fee_percent, payment_fee_percent: ebay.payment_fee_percent, payment_fee_fixed: ebay.payment_fee_fixed, default_shipping_cost: ebay.default_shipping_cost } : null };
}

/** Derniers taux BCE connus (base EUR) ; la date de chaque taux est conservée. */
export async function fetchFxRates(supabase: MobileSupabase): Promise<FxRate[]> {
  const { data, error } = await supabase.from("fx_rates").select("base_currency, quote_currency, rate, rate_date, source").eq("base_currency", "EUR").order("rate_date", { ascending: false }).limit(400);
  if (error) throw error;
  return latestRates(data ?? []);
}
