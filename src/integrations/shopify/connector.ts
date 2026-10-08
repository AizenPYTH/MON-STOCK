import { ConnectorError } from "@/integrations/core/errors";
import type { MarketplaceConnector } from "@/integrations/core/connector";

const MESSAGE = "L'intégration Shopify (Admin API) n'est pas encore disponible dans MON STOCK. Aucune donnée Shopify n'est simulée.";

function notImplemented(): never {
  throw new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE, { retryable: false });
}

/** Connecteur Shopify : prévu dans l'architecture, pas encore implémenté. Toute méthode lève NOT_IMPLEMENTED. */
export class ShopifyConnector implements MarketplaceConnector {
  readonly provider = "shopify" as const;
  readonly label = "Shopify";
  readonly available = false;
  readonly scopes = [] as const;
  isConfigured(): boolean {
    return false;
  }
  configurationIssues(): string[] {
    return [MESSAGE];
  }
  getAuthorizeUrl(): string {
    return notImplemented();
  }
  exchangeCode(): Promise<never> {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE));
  }
  refreshToken(): Promise<never> {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE));
  }
  getAccountInfo(): Promise<never> {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE));
  }
  async *getOrders(): AsyncIterable<never> {
    notImplemented();
  }
  async *getListings(): AsyncIterable<never> {
    notImplemented();
  }
  async *getInventory(): AsyncIterable<never[]> {
    notImplemented();
  }
  updateListingInventory(): Promise<never> {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE));
  }
  revoke(): Promise<never> {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "shopify", MESSAGE));
  }
}
