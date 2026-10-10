import { z } from "zod";
import { EMPTY_COST_SETTINGS, type RadarCostSettings } from "./radar";

/**
 * Paramètres de coûts de l'organisation (organizations.settings.radar), partagés par le radar
 * (serveur) et « Mes outils » (application) : même lecture, mêmes bornes, mêmes valeurs reprises
 * du canal eBay.
 */

const nullableNumber = (min: number, max: number) => z.number().finite().min(min).max(max).nullable();

export const radarSettingsSchema = z.object({
  vatRegime: z.enum(["normal", "margin", "franchise"]).nullable(),
  vatRate: nullableNumber(0, 30),
  vatRecoverable: z.boolean().nullable(),
  marketplaceFeePercent: nullableNumber(0, 50),
  paymentFeePercent: nullableNumber(0, 20),
  paymentFeeFixed: nullableNumber(0, 50),
  shippingToCustomer: nullableNumber(0, 500),
  packagingCost: nullableNumber(0, 100),
  returnProvisionPercent: nullableNumber(0, 50),
  importDutyPercent: nullableNumber(0, 100),
});

/** Paramètres enregistrés dans organizations.settings.radar ; commission / paiement / port repris du canal eBay s'ils manquent. */
export function readCostSettings(orgSettings: unknown, channel: { fee_percent: number | null; payment_fee_percent: number | null; payment_fee_fixed: number | null; default_shipping_cost: number | null } | null): { settings: RadarCostSettings; fromChannel: string[] } {
  // Validation champ par champ : une valeur invalide est ignorée sans écarter les autres réglages.
  const raw = ((orgSettings as { radar?: unknown } | null)?.radar ?? {}) as Record<string, unknown>;
  const s: RadarCostSettings = { ...EMPTY_COST_SETTINGS };
  for (const [key, schema] of Object.entries(radarSettingsSchema.shape) as [keyof RadarCostSettings, z.ZodTypeAny][]) {
    if (!(key in raw)) continue;
    const parsed = schema.safeParse(raw[key]);
    if (parsed.success) (s as unknown as Record<string, unknown>)[key] = parsed.data;
  }
  const fromChannel: string[] = [];
  if (channel) {
    if (s.marketplaceFeePercent === null && channel.fee_percent !== null) {
      s.marketplaceFeePercent = channel.fee_percent;
      fromChannel.push("commission marketplace");
    }
    if (s.paymentFeePercent === null && s.paymentFeeFixed === null && (channel.payment_fee_percent !== null || channel.payment_fee_fixed !== null)) {
      s.paymentFeePercent = channel.payment_fee_percent;
      s.paymentFeeFixed = channel.payment_fee_fixed;
      fromChannel.push("frais de paiement");
    }
    if (s.shippingToCustomer === null && channel.default_shipping_cost !== null) {
      s.shippingToCustomer = channel.default_shipping_cost;
      fromChannel.push("expédition au client");
    }
  }
  return { settings: s, fromChannel };
}

