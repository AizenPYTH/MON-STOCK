import { ConnectorError } from "@/integrations/core/errors";
import type { MarketplaceConnector } from "@/integrations/core/connector";

const MESSAGE = "L'intégration Amazon (Selling Partner API) n'est pas encore disponible dans MON STOCK. Aucune donnée Amazon n'est simulée.";

function notImplemented(): never {
  throw new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE, { retryable: false });
}

/** Connecteur Amazon : prévu dans l'architecture, pas encore implémenté. Toute méthode lève NOT_IMPLEMENTED. */
export class AmazonConnector implements MarketplaceConnector {
  readonly provider = "amazon" as const;
  readonly label = "Amazon";
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
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE));
  }
  refreshToken(): Promise<never> {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE));
  }
  getAccountInfo(): Promise<never> {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE));
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
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE));
  }
  revoke(): Promise<never> {
    return Promise.reject(new ConnectorError("NOT_IMPLEMENTED", "amazon", MESSAGE));
  }
}
