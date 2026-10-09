import type { Database, Tables, TablesInsert, Enums } from "@/db/database.types";

export type { TablesInsert };

export type Organization = Tables<"organizations">;
export type UserProfile = Tables<"user_profiles">;
export type Product = Tables<"products">;
export type ProductVariant = Tables<"product_variants">;
export type InventoryMovement = Tables<"inventory_movements">;
export type SalesChannel = Tables<"sales_channels">;
export type ChannelConnection = Tables<"channel_connections">;
export type ChannelListing = Tables<"channel_listings">;
export type Order = Tables<"orders">;
export type OrderItem = Tables<"order_items">;
export type SyncRun = Tables<"sync_runs">;
export type SyncError = Tables<"sync_errors">;
export type Supplier = Tables<"suppliers">;
export type SupplierSource = Tables<"supplier_sources">;
export type SupplierFeed = Tables<"supplier_feeds">;
export type PurchaseOrder = Tables<"purchase_orders">;
export type Alert = Tables<"alerts">;

export type StockOverviewRow = Database["public"]["Views"]["v_stock_overview"]["Row"];
export type DailySalesRow = Database["public"]["Views"]["v_daily_sales"]["Row"];
export type UnmappedListingRow = Database["public"]["Views"]["v_unmapped_listings"]["Row"];

export type OrgRole = Enums<"org_role">;
export type ChannelProvider = Enums<"channel_provider">;
export type SourceType = Enums<"source_type">;
export type TaxType = Enums<"tax_type">;
export type StockStatus = Enums<"stock_status">;
export type SyncStatus = Enums<"sync_status">;
export type SyncTrigger = Enums<"sync_trigger">;
