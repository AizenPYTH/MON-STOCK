import type { RadarCostSettings } from "@/domain/sourcing/radar";
import type { TrackingProvidersDTO } from "@/features/mobile-api/contract";

/** Types partagés entre les pages serveur et les composants client des outils. */

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

/** État des connecteurs renvoyé par le serveur MON STOCK (`/tools/status`). */
export interface ToolsStatus {
  shipping: { id: string; label: string; configured: boolean }[];
  tracking: TrackingProvidersDTO;
}
