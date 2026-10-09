import type { SourceAdapter } from "@/integrations/sourcing/core";
import { jsonLdPublicAdapter } from "@/integrations/sourcing/jsonld-public";
import { shopifyStorefrontAdapter } from "@/integrations/sourcing/shopify-storefront";
import { wooCommerceStoreAdapter } from "@/integrations/sourcing/woocommerce-store";
import { googleMerchantFeedAdapter } from "@/integrations/sourcing/google-merchant-feed";
import { bigbuyAdapter } from "@/integrations/sourcing/bigbuy";
import { ingramMicroAdapter } from "@/integrations/sourcing/ingram-micro";
import { ebayBrowseAdapter } from "@/integrations/sourcing/ebay-browse";
import type { SourceParser } from "@/services/sourcing/crawler/parsers/types";

/**
 * Registre des adaptateurs de source. Chaque adaptateur vit dans son dossier
 * (src/integrations/sourcing/<key>/) et s'enregistre ici. Un adaptateur absent de ce
 * tableau n'est jamais proposé dans l'interface.
 *
 * Tous les adaptateurs sont vérifiés sur fixtures uniquement (`verification: "fixtures"`) :
 * aucun n'a été exercé en conditions réelles depuis l'environnement de développement.
 */
export const SOURCE_ADAPTERS: readonly SourceAdapter[] = [jsonLdPublicAdapter, shopifyStorefrontAdapter, wooCommerceStoreAdapter, googleMerchantFeedAdapter, bigbuyAdapter, ingramMicroAdapter, ebayBrowseAdapter];

export function listSourceAdapters(): readonly SourceAdapter[] {
  return SOURCE_ADAPTERS;
}

export function getSourceAdapter(key: string | null | undefined): SourceAdapter | null {
  if (!key) return null;
  return SOURCE_ADAPTERS.find((a) => a.key === key) ?? null;
}

/** Adaptateurs utilisables sans compte (pages / JSON / flux publics). */
export function listPublicAdapters(): SourceAdapter[] {
  return SOURCE_ADAPTERS.filter((a) => a.access === "public");
}

/** Adaptateurs nécessitant un compte fournisseur connecté (connecteurs). */
export function listAccountAdapters(): SourceAdapter[] {
  return SOURCE_ADAPTERS.filter((a) => a.access === "account");
}

/** Parsers HTML exposés par les adaptateurs (pour le crawler générique à liste d'URLs). */
export function listAdapterHtmlParsers(): SourceParser[] {
  const out: SourceParser[] = [];
  for (const a of SOURCE_ADAPTERS) {
    if (a.htmlParser && !out.some((p) => p.key === a.htmlParser!.key)) out.push(a.htmlParser);
  }
  return out;
}
