import type { ChannelProvider } from "@/db/types";
import { ConnectorError } from "@/integrations/core/errors";
import type { MarketplaceConnector } from "@/integrations/core/connector";
import { EbayConnector } from "@/integrations/ebay/connector";
import { AmazonConnector } from "@/integrations/amazon/connector";
import { ShopifyConnector } from "@/integrations/shopify/connector";

export interface ConnectorCatalogEntry {
  provider: ChannelProvider;
  label: string;
  /** false → l'interface affiche « Disponible prochainement » et aucune action n'est proposée. */
  available: boolean;
  description: string;
}

/** Catalogue affiché dans Paramètres → Intégrations. Jamais de connecteur « simulé ». */
export const CONNECTOR_CATALOG: ReadonlyArray<ConnectorCatalogEntry> = [
  { provider: "ebay", label: "eBay", available: true, description: "Annonces, commandes et quantités via les API officielles eBay (OAuth 2.0)." },
  { provider: "amazon", label: "Amazon", available: false, description: "Selling Partner API : prévu dans l'architecture, pas encore implémenté." },
  { provider: "shopify", label: "Shopify", available: false, description: "Admin API : prévu dans l'architecture, pas encore implémenté." },
  { provider: "woocommerce", label: "WooCommerce", available: false, description: "REST API WooCommerce : prévu dans l'architecture, pas encore implémenté." },
];

let ebay: EbayConnector | null = null;
let amazon: AmazonConnector | null = null;
let shopify: ShopifyConnector | null = null;

export function getConnector(provider: ChannelProvider): MarketplaceConnector {
  switch (provider) {
    case "ebay":
      return (ebay ??= new EbayConnector());
    case "amazon":
      return (amazon ??= new AmazonConnector());
    case "shopify":
      return (shopify ??= new ShopifyConnector());
    case "woocommerce":
      throw new ConnectorError("NOT_IMPLEMENTED", "woocommerce", "L'intégration WooCommerce n'est pas encore disponible dans MON STOCK. Aucune donnée n'est simulée.", { retryable: false });
    case "manual":
      throw new ConnectorError("NOT_IMPLEMENTED", "manual", "Le canal « Ventes manuelles » n'a pas de connecteur : les ventes y sont saisies à la main.", { retryable: false });
  }
}

export function getEbayConnector(): EbayConnector {
  return getConnector("ebay") as EbayConnector;
}

export function listConnectorCatalog(): ConnectorCatalogEntry[] {
  return [...CONNECTOR_CATALOG];
}
