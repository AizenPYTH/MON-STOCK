import { ConnectorError } from "@/integrations/core/errors";
import type { ConnectorAuth, GetOrdersParams, ListingsPage, MarketplaceConnector, OrdersPage, RevokeResult } from "@/integrations/core/connector";
import type { AccountInfo, InventoryLevel, ListingRef, TokenSet, UpdateInventoryResult } from "@/integrations/core/types";
import { createLogger } from "@/lib/logger";
import { ebayEnv, ebayEnvIssues } from "@/lib/env";
import { createEbayConfig, EBAY_PROVIDER, EBAY_SCOPES, ebayScopeList, type EbayConfig } from "@/integrations/ebay/config";
import { buildAuthorizeUrl, exchangeAuthorizationCode, refreshAccessToken } from "@/integrations/ebay/oauth";
import { fetchEbayAccountInfo } from "@/integrations/ebay/identity";
import { iterateEbayOrders } from "@/integrations/ebay/fulfillment";
import { iterateGetMyeBaySelling, GET_MY_EBAY_SELLING_MAX_PAGES, reviseInventoryStatus } from "@/integrations/ebay/trading";

const log = createLogger("EBAY");

/**
 * Connecteur eBay : uniquement des API officielles (OAuth 2.0, Identity, Sell Fulfillment,
 * Trading). Aucune donnée n'est simulée : si l'environnement n'est pas configuré,
 * chaque méthode lève NOT_CONFIGURED.
 */
export class EbayConnector implements MarketplaceConnector {
  readonly provider = EBAY_PROVIDER;
  readonly label = "eBay";
  readonly available = true;
  readonly scopes = EBAY_SCOPES;
  private readonly configOverride: EbayConfig | null;

  constructor(config?: EbayConfig) {
    this.configOverride = config ?? null;
  }

  /** Configuration courante (null si EBAY_* absentes). */
  config(): EbayConfig | null {
    if (this.configOverride) return this.configOverride;
    const env = ebayEnv();
    return env ? createEbayConfig(env) : null;
  }

  isConfigured(): boolean {
    return this.config() !== null;
  }

  configurationIssues(): string[] {
    return this.configOverride ? [] : ebayEnvIssues();
  }

  private requireConfig(): EbayConfig {
    const config = this.config();
    if (!config) {
      throw new ConnectorError("NOT_CONFIGURED", EBAY_PROVIDER, "Intégration eBay non configurée sur ce serveur : renseignez EBAY_CLIENT_ID, EBAY_CLIENT_SECRET et EBAY_RU_NAME (voir docs/ebay-setup.md).", {
        details: { missing: ebayEnvIssues() },
        retryable: false,
      });
    }
    return config;
  }

  getAuthorizeUrl(state: string): string {
    return buildAuthorizeUrl(this.requireConfig(), state, ebayScopeList());
  }

  exchangeCode(code: string): Promise<TokenSet> {
    return exchangeAuthorizationCode(this.requireConfig(), code);
  }

  refreshToken(refreshToken: string): Promise<TokenSet> {
    return refreshAccessToken(this.requireConfig(), refreshToken, ebayScopeList());
  }

  getAccountInfo(auth: ConnectorAuth): Promise<AccountInfo> {
    return fetchEbayAccountInfo(this.requireConfig(), auth);
  }

  async *getOrders(auth: ConnectorAuth, params: GetOrdersParams): AsyncIterable<OrdersPage> {
    const config = this.requireConfig();
    for await (const page of iterateEbayOrders(config, auth, params)) {
      for (const inv of page.invalid) log.warn("commande eBay ignorée (format inattendu)", { orderId: inv.orderId, reason: inv.message });
      if (page.truncated) log.warn("récupération des commandes tronquée (limite de pages atteinte) : la suite sera reprise au prochain run");
      yield { orders: page.orders, invalid: page.invalid.map((i) => ({ ref: i.orderId, message: i.message })), truncated: page.truncated, hasMore: page.hasMore };
    }
  }

  async *getListings(auth: ConnectorAuth): AsyncIterable<ListingsPage> {
    const config = this.requireConfig();
    let pageIndex = 0;
    for await (const page of iterateGetMyeBaySelling(config, auth)) {
      pageIndex++;
      for (const inv of page.invalid) log.warn("annonce eBay ignorée (format inattendu)", { itemId: inv.itemId, reason: inv.message });
      const truncated = pageIndex >= GET_MY_EBAY_SELLING_MAX_PAGES && page.totalPages > pageIndex;
      if (truncated) log.warn("liste d'annonces tronquée (limite de pages atteinte)", { pages: pageIndex, totalPages: page.totalPages });
      yield { listings: page.listings, invalid: page.invalid.map((i) => ({ ref: i.itemId, message: i.message })), warnings: page.warnings, truncated };
    }
  }

  /** Les quantités eBay sont celles des annonces : GetMyeBaySelling est la source de vérité. */
  async *getInventory(auth: ConnectorAuth): AsyncIterable<InventoryLevel[]> {
    for await (const page of this.getListings(auth)) {
      const levels: InventoryLevel[] = [];
      for (const l of page.listings) {
        if (l.variations.length === 0) {
          levels.push({ ref: { externalListingId: l.externalListingId, variationSku: null }, quantityAvailable: l.quantityAvailable });
        } else {
          for (const v of l.variations) levels.push({ ref: { externalListingId: l.externalListingId, variationSku: v.sku }, quantityAvailable: v.quantityAvailable });
        }
      }
      yield levels;
    }
  }

  /**
   * ReviseInventoryStatus. Limitation connue : les annonces créées via l'Inventory API (offres)
   * refusent les révisions Trading ; eBay renvoie alors une erreur explicite qui est remontée telle quelle.
   */
  updateListingInventory(auth: ConnectorAuth, ref: ListingRef, quantity: number): Promise<UpdateInventoryResult> {
    return reviseInventoryStatus(this.requireConfig(), auth, ref, quantity);
  }

  /**
   * eBay ne publie pas d'endpoint de révocation des tokens utilisateur : les tokens sont
   * supprimés de notre base, et le vendeur peut retirer l'autorisation côté eBay
   * (Mon eBay → Compte → Préférences du site → Autorisations tierces).
   */
  async revoke(_auth: ConnectorAuth): Promise<RevokeResult> {
    return {
      revoked: false,
      note: "Les tokens ont été supprimés de MON STOCK. eBay n'offre pas d'API publique de révocation : pour retirer l'autorisation côté eBay, allez dans Mon eBay → Compte → Préférences du site → Autorisations tierces.",
    };
  }
}
