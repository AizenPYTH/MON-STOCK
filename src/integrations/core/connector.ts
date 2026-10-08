import type { ChannelProvider } from "@/db/types";
import type { AccountInfo, InventoryLevel, ListingRef, NormalizedListing, NormalizedOrder, TokenSet, UpdateInventoryResult } from "@/integrations/core/types";

/** Entrée reçue de l'API mais impossible à normaliser : comptée et journalisée, jamais inventée. */
export interface InvalidEntry {
  ref: string | null;
  message: string;
}

export interface OrdersPage {
  orders: NormalizedOrder[];
  invalid: InvalidEntry[];
  /** true si la limite de pages a été atteinte : la suite sera reprise au prochain run. */
  truncated: boolean;
}

export interface ListingsPage {
  listings: NormalizedListing[];
  invalid: InvalidEntry[];
  warnings: string[];
}

/**
 * Fournit un access token valide au connecteur. Implémenté par le service de
 * stockage des tokens (déchiffrement + rafraîchissement automatique). Le
 * connecteur ne stocke jamais de token lui-même.
 */
export interface ConnectorAuth {
  getAccessToken(options?: { forceRefresh?: boolean }): Promise<string>;
}

export interface GetOrdersParams {
  /** Borne basse (incluse) sur la date de dernière modification. */
  since: Date;
  /** Borne haute (incluse). Par défaut : maintenant. */
  until?: Date;
}

export interface RevokeResult {
  revoked: boolean;
  /** Explication honnête si la révocation distante n'est pas possible. */
  note: string;
}

/**
 * Contrat commun à tous les connecteurs marketplace. Les méthodes paginées
 * renvoient des pages (tableaux) via un itérateur asynchrone pour borner la mémoire.
 * Toutes les données renvoyées sont validées par les schémas de core/types.ts.
 */
export interface MarketplaceConnector {
  readonly provider: ChannelProvider;
  readonly label: string;
  /** false = connecteur non disponible (lève NOT_IMPLEMENTED). */
  readonly available: boolean;
  /** true si les variables d'environnement nécessaires sont présentes. */
  isConfigured(): boolean;
  /** Variables d'environnement manquantes (pour l'affichage administrateur). */
  configurationIssues(): string[];
  /** Scopes OAuth demandés, avec leur justification. */
  readonly scopes: ReadonlyArray<{ scope: string; reason: string }>;

  getAuthorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenSet>;
  refreshToken(refreshToken: string): Promise<TokenSet>;
  getAccountInfo(auth: ConnectorAuth): Promise<AccountInfo>;
  getOrders(auth: ConnectorAuth, params: GetOrdersParams): AsyncIterable<OrdersPage>;
  getListings(auth: ConnectorAuth): AsyncIterable<ListingsPage>;
  getInventory(auth: ConnectorAuth): AsyncIterable<InventoryLevel[]>;
  updateListingInventory(auth: ConnectorAuth, ref: ListingRef, quantity: number): Promise<UpdateInventoryResult>;
  revoke(auth: ConnectorAuth): Promise<RevokeResult>;
}
