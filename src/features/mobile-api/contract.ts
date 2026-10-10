/**
 * Contrat de l'API mobile `/api/mobile/v1` (application Expo `apps/mobile`).
 *
 * Module PUR et PARTAGÉ : des types et des schémas Zod uniquement, aucune dépendance serveur.
 * Le serveur (route handlers) construit ces objets à partir des requêtes existantes ;
 * le mobile les consomme. Un changement de forme casse donc la compilation des DEUX côtés.
 *
 * Règles :
 * - aucune donnée inventée : un champ inconnu vaut `null`, jamais une valeur par défaut trompeuse ;
 * - aucun secret : ni token, ni identifiant de connexion, ni URL signée ;
 * - toutes les lectures passent par le client Supabase de l'utilisateur (RLS).
 */
import { z } from "zod";
import type { Database } from "@/db/database.types";
import type { StockLevel } from "@/domain/inventory/alerts";
import type { OfferConfidence } from "@/domain/sourcing/confidence";
import type { Award, AwardKey, ProcurementPlan } from "@/domain/sourcing/ranking";
import type { BestSavings, OfferSavings } from "@/domain/sourcing/search-pipeline";
import type { FilterReason } from "@/domain/sourcing/offer-filter";

export const MOBILE_API_PREFIX = "/api/mobile/v1";
/** En-tête portant l'organisation active du mobile (vérifiée côté serveur : appartenance obligatoire). */
export const ORGANIZATION_HEADER = "x-organization-id";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export interface ApiErrorBody {
  code: string;
  message: string;
}
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

// ---------------------------------------------------------------------------------------------
// Session / organisations
// ---------------------------------------------------------------------------------------------
export interface MembershipDTO {
  organizationId: string;
  name: string;
  slug: string;
  isDemo: boolean;
  role: OrgRole;
}

export interface MeDTO {
  user: { id: string; email: string | null; emailConfirmed: boolean };
  memberships: MembershipDTO[];
  /** organisation mémorisée côté web (proposée par défaut au premier lancement) */
  defaultOrganizationId: string | null;
}

export interface OrganizationContextDTO {
  organization: { id: string; name: string; currency: string; isDemo: boolean };
  role: OrgRole;
  permissions: { canWrite: boolean; isAdmin: boolean };
}

export const createOrganizationInputSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court (2 caractères minimum).").max(120, "Nom trop long (120 caractères maximum)."),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;

// ---------------------------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------------------------
export interface WindowTotalsDTO {
  revenue: number;
  orders: number;
  units: number;
}

export interface TodoDTO {
  key: string;
  count: number;
  label: string;
  tone: string;
}

export interface OrderRowDTO {
  id: string;
  orderNumber: string | null;
  provider: string;
  channelName: string | null;
  status: string;
  placedAt: string | null;
  total: number | null;
  currency: string | null;
  itemsCount: number;
  units: number;
  unmappedItems: number;
  pendingInventoryItems: number;
}

export interface ChannelStateDTO {
  key: string;
  provider: string;
  name: string;
  state: string;
  label: string;
  detail: string | null;
  lastSuccessfulSyncAt: string | null;
}

export interface DashboardDTO {
  context: OrganizationContextDTO;
  firstName: string;
  /** aucune donnée réelle encore (ni produit, ni vente, ni fournisseur) */
  isEmpty: boolean;
  sales: { today: WindowTotalsDTO; last7d: WindowTotalsDTO; last30d: WindowTotalsDTO; otherCurrencies: Array<{ currency: string; revenue: number; orders: number }> };
  profit: { profit30d: number | null; revenue30d: number; caveat: string | null };
  stock: {
    skus: number;
    unitsOnHand: number;
    stockValueKnown: number;
    skusUnknownCost: number;
    counts: Record<StockLevel, number>;
    negativeStock: number;
    truncated: boolean;
  };
  todo: TodoDTO[];
  counts: { syncFailed24h: number; openAlerts: number; unmappedListings: number; pendingSales: number; ordersTotal: number; suppliersCount: number };
  toReplenish: number;
  recentOrders: OrderRowDTO[];
  channels: ChannelStateDTO[];
  hasConnectedChannel: boolean;
  generatedAt: string;
}

// ---------------------------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------------------------
export const STOCK_LEVELS = ["out_of_stock", "at_risk", "low", "normal"] as const;
export const MOBILE_STOCK_SORTS = ["best_sellers", "low_stock", "margin", "stock_value", "last_sale", "name"] as const;

export const stockListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(STOCK_LEVELS).optional(),
  stock: z.enum(["in_stock", "empty", "negative"]).optional(),
  sort: z.enum(MOBILE_STOCK_SORTS).default("best_sellers"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type StockListQuery = z.infer<typeof stockListQuerySchema>;

export interface StockRowDTO {
  skuId: string;
  code: string;
  productName: string;
  variantName: string | null;
  brand: string | null;
  category: string | null;
  condition: string | null;
  grade: string | null;
  imageUrl: string | null;
  location: string | null;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  level: StockLevel;
  levelReason: string;
  daysOfCover: number | null;
  dailyVelocity: number | null;
  velocityExplanation: string;
  units30d: number;
  salePrice: number | null;
  costPrice: number | null;
  currency: string | null;
  netProfit: number | null;
  netMarginPercent: number | null;
  marginComplete: boolean;
  lastSaleAt: string | null;
}

export interface StockListDTO {
  rows: StockRowDTO[];
  total: number;
  page: number;
  pageSize: number;
  /** statuts calculés sur un ensemble borné : les totaux filtrés par statut sont des minima */
  truncated: boolean;
}

export interface MovementDTO {
  id: string;
  type: string;
  quantity: number;
  quantityAfter: number | null;
  note: string | null;
  channel: string | null;
  referenceType: string | null;
  occurredAt: string;
}

export interface SkuOfferDTO {
  id: string;
  title: string;
  supplierName: string | null;
  price: number | null;
  currency: string | null;
  normalizedPrice: number | null;
  quantityAvailable: number | null;
  moq: number | null;
  lastSeenAt: string | null;
  sourceUrl: string | null;
}

export interface SkuDetailDTO {
  row: StockRowDTO;
  barcode: string | null;
  reorderPoint: number;
  safetyStock: number;
  leadTimeDays: number | null;
  defaultSupplier: { id: string; name: string } | null;
  pendingSalesCount: number;
  onOrder: number;
  movements: MovementDTO[];
  offers: SkuOfferDTO[];
  listings: Array<{ id: string; title: string | null; channelName: string | null; status: string; quantity: number | null; price: number | null; currency: string | null }>;
  /** marge : coûts inconnus listés tels quels (jamais supposés nuls) */
  unknownCosts: string[];
}

export const MOVEMENT_TYPES = ["receipt", "adjustment", "return", "transfer_in", "transfer_out", "correction"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
/** Types dont le sens est imposé (entrée ou sortie) : le sens choisi par l'utilisateur est ignoré. */
export const MOVEMENT_FIXED_DIRECTION: Partial<Record<MovementType, "in" | "out">> = { receipt: "in", return: "in", transfer_in: "in", transfer_out: "out" };

/** Même règles que le formulaire web (src/features/stock/schemas.ts → adjustStockSchema). */
export const stockMovementInputSchema = z.object({
  sku_id: z.string().uuid(),
  type: z.enum(MOVEMENT_TYPES),
  direction: z.enum(["in", "out"]),
  quantity: z.coerce.number().int("Nombre entier attendu.").min(1, "La quantité doit être au moins 1.").max(1_000_000, "Quantité trop élevée (1 000 000 maximum)."),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type StockMovementInput = z.infer<typeof stockMovementInputSchema>;

/** Quantité signée envoyée à apply_inventory_movement (règle identique à l'action web). */
export function signedMovementQuantity(input: Pick<StockMovementInput, "type" | "direction" | "quantity">): number {
  const fixed = MOVEMENT_FIXED_DIRECTION[input.type];
  const inbound = fixed ? fixed === "in" : input.direction === "in";
  return inbound ? input.quantity : -input.quantity;
}

export interface StockMovementResultDTO {
  quantityAfter: number | null;
}

// ---------------------------------------------------------------------------------------------
// Ventes
// ---------------------------------------------------------------------------------------------
export const ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded", "unknown"] as const;
export const salesListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  inventory: z.enum(["pending"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type SalesListQuery = z.infer<typeof salesListQuerySchema>;

export interface SalesListDTO {
  rows: OrderRowDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrderDetailDTO {
  order: OrderRowDTO & { buyer: string | null; shippingCost: number | null; feesTotal: number | null; externalOrderId: string | null };
  items: Array<{
    id: string;
    title: string | null;
    quantity: number;
    unitPrice: number | null;
    currency: string | null;
    inventoryApplied: boolean;
    sku: { id: string; code: string; label: string } | null;
  }>;
  movements: MovementDTO[];
}

// ---------------------------------------------------------------------------------------------
// Fournisseurs et commandes fournisseurs
// ---------------------------------------------------------------------------------------------
export interface SupplierDTO {
  id: string;
  name: string;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  internalScore: number | null;
  averageLeadTimeDays: number | null;
  defaultMoq: number | null;
  offersCount: number;
  sourcesCount: number;
  sourceTypes: string[];
  lastSyncAt: string | null;
}

export const PURCHASE_ORDER_STATUSES = ["draft", "sent", "confirmed", "partially_received", "received", "cancelled"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];
/** Statuts modifiables à la main (la réception passe par l'action dédiée, comme sur le web). */
export const MANUAL_PO_STATUSES = ["draft", "sent", "confirmed", "cancelled"] as const;

export const purchaseOrderListQuerySchema = z.object({
  status: z.enum(["open", ...PURCHASE_ORDER_STATUSES]).optional(),
  supplier_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;

export interface PurchaseOrderRowDTO {
  id: string;
  reference: string | null;
  supplierId: string;
  supplierName: string | null;
  status: PurchaseOrderStatus;
  currency: string;
  total: number | null;
  expectedAt: string | null;
  createdAt: string;
  linesCount: number;
  unitsOrdered: number;
  unitsReceived: number;
}

export interface PurchaseOrderListDTO {
  rows: PurchaseOrderRowDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PurchaseOrderLineDTO {
  id: string;
  skuId: string;
  skuCode: string | null;
  label: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number | null;
  currency: string;
}

export interface PurchaseOrderDetailDTO {
  order: PurchaseOrderRowDTO & { notes: string | null; sentAt: string | null; receivedAt: string | null };
  lines: PurchaseOrderLineDTO[];
  /** transitions manuelles proposées (la base valide de toute façon chaque transition) */
  allowedStatuses: Array<(typeof MANUAL_PO_STATUSES)[number]>;
  canReceive: boolean;
}

export const purchaseOrderStatusInputSchema = z.object({ status: z.enum(MANUAL_PO_STATUSES) });

/** Réception : même schéma de ligne que le web (receiptLineSchema), `expected_received` sert de verrou optimiste. */
export const purchaseOrderReceiveInputSchema = z.object({
  receipts: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        quantity: z.coerce.number().int().min(0).max(100_000),
        expected_received: z.coerce.number().int().min(0).max(1_000_000).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type PurchaseOrderReceiveInput = z.infer<typeof purchaseOrderReceiveInputSchema>;

// ---------------------------------------------------------------------------------------------
// Sourcing
// ---------------------------------------------------------------------------------------------
export const sourcingSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  /** code SKU : « Trouver moins cher » (comparaison avec le fournisseur actuel) */
  sku: z.string().trim().max(120).optional(),
  qty: z.coerce.number().int().min(1).max(100_000).optional(),
  max_price: z.coerce.number().min(0).max(1_000_000).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  /** "0" : lecture des offres déjà enregistrées seulement (pas de requête vers les sources) */
  live: z.enum(["0", "1"]).optional(),
});
export type SourcingSearchQuery = z.infer<typeof sourcingSearchQuerySchema>;

export interface SourcingOfferDTO {
  id: string;
  title: string;
  supplierId: string | null;
  supplierName: string;
  supplierCountry: string | null;
  sourceUrl: string | null;
  price: number | null;
  currency: string | null;
  comparableUnitPrice: number | null;
  comparableNote: string | null;
  landedUnitCost: number | null;
  /** frais de port affichés par la source (null = non communiqués) */
  shippingCost: number | null;
  shippingCurrency: string | null;
  taxType: string | null;
  lastSeenAt: string | null;
  quantityAvailable: number | null;
  stockStatus: string | null;
  moq: number | null;
  deliveryDays: number | null;
  condition: string | null;
  grade: string | null;
  rank: number;
  score: number;
  why: string[];
  unknownFactors: string[];
  awards: AwardKey[];
  confidence: OfferConfidence;
  freshnessLabel: string;
  procurement: ProcurementPlan;
  savings: OfferSavings | null;
  marginNetProfit: number | null;
  marginUnavailableReason: string | null;
  warnings: FilterReason[];
  /** provenance : méthode, adaptateur, date de récupération (null = non enregistrée) */
  provenance: { method: string | null; adapterKey: string | null; retrievedAt: string | null } | null;
  usualPriceNote: string | null;
  duplicatesCollapsed: number;
}

export interface SourcingSearchDTO {
  query: string;
  sku: { id: string; code: string; label: string; costPrice: number | null; currency: string } | null;
  requestedQuantity: number;
  currency: string;
  offers: SourcingOfferDTO[];
  total: number;
  page: number;
  pageSize: number;
  podium: Award[];
  highlights: Award[];
  awardOffers: Record<string, { title: string; supplierName: string; comparableUnitPrice: number | null }>;
  currentUnitCost: number | null;
  bestSavings: BestSavings | null;
  priceBasisNote: string;
  rejected: { count: number; groups: Array<{ code: string; label: string; count: number }> };
  /** sources réellement connectées dans l'organisation (0 = aucune offre en direct possible) */
  connectedSources: number;
  live: { queried: number; found: number; stored: number; durationMs: number; sources: Array<{ name: string; supplierName: string; status: string; message: string | null; found: number }> } | null;
  discovery: { state: string; message: string };
}

export interface SourcingStatusDTO {
  items: Array<{ key: string; label: string; value: number; scope: string; hint: string | null }>;
  offerCountsIncomplete: boolean;
}

// ---------------------------------------------------------------------------------------------
// Intégrations (eBay)
// ---------------------------------------------------------------------------------------------
export interface IntegrationDTO {
  connectionId: string;
  provider: string;
  channelName: string;
  status: string;
  environment: string;
  externalUsername: string | null;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  autoSync: boolean;
  lastRun: { id: string; status: string; startedAt: string; finishedAt: string | null; errorCount: number } | null;
}

export interface IntegrationsDTO {
  ebay: { configured: boolean; environment: string | null };
  connections: IntegrationDTO[];
  unmappedCount: number;
  /** autres canaux : affichés « Disponible prochainement », jamais présentés comme connectés */
  comingSoon: string[];
}

export interface SyncResultDTO {
  runId: string;
  status: string;
  summary: string;
  durationMs: number;
  errorSummary: string | null;
}

// ---------------------------------------------------------------------------------------------
// Intelligence
// ---------------------------------------------------------------------------------------------
export interface RecommendationDTO {
  id: string;
  skuId: string;
  code: string;
  label: string;
  level: StockLevel | null;
  currentStock: number;
  dailyVelocity: number | null;
  daysOfCover: number | null;
  onOrder: number;
  recommendedQuantity: number | null;
  explanation: string;
  warnings: string[];
  supplierName: string | null;
  computedAt: string;
}

export interface AlertDTO {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  createdAt: string;
}

export interface IntelligenceDTO {
  recommendations: RecommendationDTO[];
  alerts: AlertDTO[];
  stockCounts: Record<StockLevel, number>;
  truncated: boolean;
}
