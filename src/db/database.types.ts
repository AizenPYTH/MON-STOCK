// GÉNÉRÉ AUTOMATIQUEMENT par `npm run db:types` (supabase gen types). Ne pas modifier à la main.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "alerts": {
                  Row: {
                    "action_href": string | null,"created_at": string,"dedupe_key": string,"entity_id": string | null,"entity_type": string | null,"id": string,"message": string,"organization_id": string,"resolved_at": string | null,"severity": Database["public"]['Enums']["alert_severity"],"status": Database["public"]['Enums']["alert_status"],"title": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_href"?: string | null,"created_at"?: string,"dedupe_key": string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"message": string,"organization_id": string,"resolved_at"?: string | null,"severity"?: Database["public"]['Enums']["alert_severity"],"status"?: Database["public"]['Enums']["alert_status"],"title": string,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "action_href"?: string | null,"created_at"?: string,"dedupe_key"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"message"?: string,"organization_id"?: string,"resolved_at"?: string | null,"severity"?: Database["public"]['Enums']["alert_severity"],"status"?: Database["public"]['Enums']["alert_status"],"title"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "alerts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"channel_connection_secrets": {
                  Row: {
                    "access_token_enc": string | null,"connection_id": string,"key_version": number,"refresh_token_enc": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_token_enc"?: string | null,"connection_id": string,"key_version"?: number,"refresh_token_enc"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "access_token_enc"?: string | null,"connection_id"?: string,"key_version"?: number,"refresh_token_enc"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "channel_connection_secrets_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: true
      referencedRelation: "channel_connections"
      referencedColumns: ["id"]
    }
                  ]
                },"channel_connections": {
                  Row: {
                    "auto_sync": boolean,"connected_at": string | null,"created_at": string,"disconnected_at": string | null,"environment": string,"external_account_id": string | null,"external_username": string | null,"id": string,"last_error": string | null,"last_orders_cursor": string | null,"last_successful_sync_at": string | null,"last_sync_at": string | null,"metadata": NonNullable<Json>,"organization_id": string,"provider": Database["public"]['Enums']["channel_provider"],"push_inventory": boolean,"refresh_token_expires_at": string | null,"sales_channel_id": string,"scopes": (string)[],"status": Database["public"]['Enums']["connection_status"],"sync_interval_minutes": number,"token_expires_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_sync"?: boolean,"connected_at"?: string | null,"created_at"?: string,"disconnected_at"?: string | null,"environment"?: string,"external_account_id"?: string | null,"external_username"?: string | null,"id"?: string,"last_error"?: string | null,"last_orders_cursor"?: string | null,"last_successful_sync_at"?: string | null,"last_sync_at"?: string | null,"metadata"?: NonNullable<Json>,"organization_id": string,"provider": Database["public"]['Enums']["channel_provider"],"push_inventory"?: boolean,"refresh_token_expires_at"?: string | null,"sales_channel_id": string,"scopes"?: (string)[],"status"?: Database["public"]['Enums']["connection_status"],"sync_interval_minutes"?: number,"token_expires_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "auto_sync"?: boolean,"connected_at"?: string | null,"created_at"?: string,"disconnected_at"?: string | null,"environment"?: string,"external_account_id"?: string | null,"external_username"?: string | null,"id"?: string,"last_error"?: string | null,"last_orders_cursor"?: string | null,"last_successful_sync_at"?: string | null,"last_sync_at"?: string | null,"metadata"?: NonNullable<Json>,"organization_id"?: string,"provider"?: Database["public"]['Enums']["channel_provider"],"push_inventory"?: boolean,"refresh_token_expires_at"?: string | null,"sales_channel_id"?: string,"scopes"?: (string)[],"status"?: Database["public"]['Enums']["connection_status"],"sync_interval_minutes"?: number,"token_expires_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "channel_connections_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_connections_sales_channel_id_fkey"
      columns: ["sales_channel_id"]
isOneToOne: true
      referencedRelation: "sales_channels"
      referencedColumns: ["id"]
    }
                  ]
                },"channel_listings": {
                  Row: {
                    "connection_id": string | null,"created_at": string,"currency": string | null,"ended_at": string | null,"external_listing_id": string,"external_product_id": string | null,"external_sku": string | null,"external_variation_id": string,"first_seen_at": string,"id": string,"image_url": string | null,"last_synced_at": string,"listing_url": string | null,"mapped_at": string | null,"mapped_by": string | null,"mapping_source": string | null,"mapping_status": Database["public"]['Enums']["mapping_status"],"organization_id": string,"price": number | null,"provider": Database["public"]['Enums']["channel_provider"],"quantity_available": number | null,"quantity_listed": number | null,"quantity_sold": number | null,"sales_channel_id": string,"sku_id": string | null,"status": Database["public"]['Enums']["listing_status"],"title": string,"updated_at": string,"variation_attributes": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "connection_id"?: string | null,"created_at"?: string,"currency"?: string | null,"ended_at"?: string | null,"external_listing_id": string,"external_product_id"?: string | null,"external_sku"?: string | null,"external_variation_id"?: string,"first_seen_at"?: string,"id"?: string,"image_url"?: string | null,"last_synced_at"?: string,"listing_url"?: string | null,"mapped_at"?: string | null,"mapped_by"?: string | null,"mapping_source"?: string | null,"mapping_status"?: Database["public"]['Enums']["mapping_status"],"organization_id": string,"price"?: number | null,"provider": Database["public"]['Enums']["channel_provider"],"quantity_available"?: number | null,"quantity_listed"?: number | null,"quantity_sold"?: number | null,"sales_channel_id": string,"sku_id"?: string | null,"status"?: Database["public"]['Enums']["listing_status"],"title"?: string,"updated_at"?: string,"variation_attributes"?: NonNullable<Json>
                  }
                  Update: {
                    "connection_id"?: string | null,"created_at"?: string,"currency"?: string | null,"ended_at"?: string | null,"external_listing_id"?: string,"external_product_id"?: string | null,"external_sku"?: string | null,"external_variation_id"?: string,"first_seen_at"?: string,"id"?: string,"image_url"?: string | null,"last_synced_at"?: string,"listing_url"?: string | null,"mapped_at"?: string | null,"mapped_by"?: string | null,"mapping_source"?: string | null,"mapping_status"?: Database["public"]['Enums']["mapping_status"],"organization_id"?: string,"price"?: number | null,"provider"?: Database["public"]['Enums']["channel_provider"],"quantity_available"?: number | null,"quantity_listed"?: number | null,"quantity_sold"?: number | null,"sales_channel_id"?: string,"sku_id"?: string | null,"status"?: Database["public"]['Enums']["listing_status"],"title"?: string,"updated_at"?: string,"variation_attributes"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "channel_listings_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: false
      referencedRelation: "channel_connections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_listings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_listings_sales_channel_id_fkey"
      columns: ["sales_channel_id"]
isOneToOne: false
      referencedRelation: "sales_channels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_listings_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_listings_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "channel_listings_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    }
                  ]
                },"fx_rates": {
                  Row: {
                    "base_currency": string,"fetched_at": string,"quote_currency": string,"rate": number,"rate_date": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_currency": string,"fetched_at"?: string,"quote_currency": string,"rate": number,"rate_date": string,"source"?: string
                  }
                  Update: {
                    "base_currency"?: string,"fetched_at"?: string,"quote_currency"?: string,"rate"?: number,"rate_date"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"inventory": {
                  Row: {
                    "last_movement_at": string | null,"last_sale_at": string | null,"organization_id": string,"quantity_available": number | null,"quantity_on_hand": number,"quantity_reserved": number,"sku_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "last_movement_at"?: string | null,"last_sale_at"?: string | null,"organization_id": string,"quantity_available"?: never,"quantity_on_hand"?: number,"quantity_reserved"?: number,"sku_id": string,"updated_at"?: string
                  }
                  Update: {
                    "last_movement_at"?: string | null,"last_sale_at"?: string | null,"organization_id"?: string,"quantity_available"?: never,"quantity_on_hand"?: number,"quantity_reserved"?: number,"sku_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: true
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: true
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "inventory_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: true
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    }
                  ]
                },"inventory_movements": {
                  Row: {
                    "channel": string | null,"created_at": string,"created_by": string | null,"id": string,"note": string | null,"occurred_at": string,"organization_id": string,"quantity": number,"quantity_after": number,"reference_id": string | null,"reference_type": string | null,"sku_id": string,"type": Database["public"]['Enums']["movement_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "channel"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"occurred_at"?: string,"organization_id": string,"quantity": number,"quantity_after": number,"reference_id"?: string | null,"reference_type"?: string | null,"sku_id": string,"type": Database["public"]['Enums']["movement_type"]
                  }
                  Update: {
                    "channel"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"occurred_at"?: string,"organization_id"?: string,"quantity"?: number,"quantity_after"?: number,"reference_id"?: string | null,"reference_type"?: string | null,"sku_id"?: string,"type"?: Database["public"]['Enums']["movement_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_movements_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "inventory_movements_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    }
                  ]
                },"mapping_suggestions": {
                  Row: {
                    "confidence": number,"created_at": string,"decided_at": string | null,"decided_by": string | null,"id": string,"listing_id": string,"method": string,"organization_id": string,"reasons": NonNullable<Json>,"sku_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence": number,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"listing_id": string,"method": string,"organization_id": string,"reasons"?: NonNullable<Json>,"sku_id": string,"status"?: string
                  }
                  Update: {
                    "confidence"?: number,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"listing_id"?: string,"method"?: string,"organization_id"?: string,"reasons"?: NonNullable<Json>,"sku_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mapping_suggestions_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "channel_listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mapping_suggestions_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "v_unmapped_listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mapping_suggestions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mapping_suggestions_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mapping_suggestions_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "mapping_suggestions_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    }
                  ]
                },"oauth_states": {
                  Row: {
                    "created_at": string,"created_by": string | null,"expires_at": string,"organization_id": string,"provider": Database["public"]['Enums']["channel_provider"],"redirect_to": string | null,"state": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"organization_id": string,"provider": Database["public"]['Enums']["channel_provider"],"redirect_to"?: string | null,"state": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"organization_id"?: string,"provider"?: Database["public"]['Enums']["channel_provider"],"redirect_to"?: string | null,"state"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "oauth_states_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "channel_listing_id": string | null,"created_at": string,"currency": string | null,"external_line_item_id": string,"external_listing_id": string | null,"external_sku": string | null,"external_variation_id": string,"id": string,"inventory_applied": boolean,"order_id": string,"organization_id": string,"quantity": number,"sku_id": string | null,"title": string,"total": number | null,"unit_price": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel_listing_id"?: string | null,"created_at"?: string,"currency"?: string | null,"external_line_item_id": string,"external_listing_id"?: string | null,"external_sku"?: string | null,"external_variation_id"?: string,"id"?: string,"inventory_applied"?: boolean,"order_id": string,"organization_id": string,"quantity": number,"sku_id"?: string | null,"title"?: string,"total"?: number | null,"unit_price"?: number | null
                  }
                  Update: {
                    "channel_listing_id"?: string | null,"created_at"?: string,"currency"?: string | null,"external_line_item_id"?: string,"external_listing_id"?: string | null,"external_sku"?: string | null,"external_variation_id"?: string,"id"?: string,"inventory_applied"?: boolean,"order_id"?: string,"organization_id"?: string,"quantity"?: number,"sku_id"?: string | null,"title"?: string,"total"?: number | null,"unit_price"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_channel_listing_id_fkey"
      columns: ["channel_listing_id"]
isOneToOne: false
      referencedRelation: "channel_listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_channel_listing_id_fkey"
      columns: ["channel_listing_id"]
isOneToOne: false
      referencedRelation: "v_unmapped_listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "order_items_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "buyer_username": string | null,"cancelled_at": string | null,"connection_id": string | null,"created_at": string,"currency": string,"external_modified_at": string | null,"external_order_id": string,"fee_total": number | null,"fulfillment_status": string | null,"id": string,"inventory_applied": boolean,"inventory_applied_at": string | null,"order_number": string | null,"organization_id": string,"payload_hash": string | null,"payment_status": string | null,"placed_at": string,"provider": Database["public"]['Enums']["channel_provider"],"sales_channel_id": string,"shipping_total": number | null,"status": Database["public"]['Enums']["order_status"],"subtotal": number | null,"tax_total": number | null,"total": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_username"?: string | null,"cancelled_at"?: string | null,"connection_id"?: string | null,"created_at"?: string,"currency"?: string,"external_modified_at"?: string | null,"external_order_id": string,"fee_total"?: number | null,"fulfillment_status"?: string | null,"id"?: string,"inventory_applied"?: boolean,"inventory_applied_at"?: string | null,"order_number"?: string | null,"organization_id": string,"payload_hash"?: string | null,"payment_status"?: string | null,"placed_at": string,"provider": Database["public"]['Enums']["channel_provider"],"sales_channel_id": string,"shipping_total"?: number | null,"status"?: Database["public"]['Enums']["order_status"],"subtotal"?: number | null,"tax_total"?: number | null,"total"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "buyer_username"?: string | null,"cancelled_at"?: string | null,"connection_id"?: string | null,"created_at"?: string,"currency"?: string,"external_modified_at"?: string | null,"external_order_id"?: string,"fee_total"?: number | null,"fulfillment_status"?: string | null,"id"?: string,"inventory_applied"?: boolean,"inventory_applied_at"?: string | null,"order_number"?: string | null,"organization_id"?: string,"payload_hash"?: string | null,"payment_status"?: string | null,"placed_at"?: string,"provider"?: Database["public"]['Enums']["channel_provider"],"sales_channel_id"?: string,"shipping_total"?: number | null,"status"?: Database["public"]['Enums']["order_status"],"subtotal"?: number | null,"tax_total"?: number | null,"total"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: false
      referencedRelation: "channel_connections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_sales_channel_id_fkey"
      columns: ["sales_channel_id"]
isOneToOne: false
      referencedRelation: "sales_channels"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id": string,"role"?: Database["public"]['Enums']["org_role"],"token"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "created_at": string,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organization_id": string,"role"?: Database["public"]['Enums']["org_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_user_profile_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "user_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "country": string | null,"created_at": string,"created_by": string | null,"default_currency": string,"id": string,"is_demo": boolean,"name": string,"settings": NonNullable<Json>,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "country"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_currency"?: string,"id"?: string,"is_demo"?: boolean,"name": string,"settings"?: NonNullable<Json>,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "country"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_currency"?: string,"id"?: string,"is_demo"?: boolean,"name"?: string,"settings"?: NonNullable<Json>,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"price_history": {
                  Row: {
                    "currency": string,"id": string,"kind": Database["public"]['Enums']["price_kind"],"organization_id": string,"price": number,"recorded_at": string,"sku_id": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "currency"?: string,"id"?: string,"kind": Database["public"]['Enums']["price_kind"],"organization_id": string,"price": number,"recorded_at"?: string,"sku_id": string,"source"?: string
                  }
                  Update: {
                    "currency"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["price_kind"],"organization_id"?: string,"price"?: number,"recorded_at"?: string,"sku_id"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_history_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_history_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_history_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "price_history_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    }
                  ]
                },"product_matches": {
                  Row: {
                    "confidence": number,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"id": string,"method": string,"offer_id": string | null,"organization_id": string,"reasons": NonNullable<Json>,"sku_id": string,"sourcing_product_id": string | null,"status": Database["public"]['Enums']["match_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence": number,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"method": string,"offer_id"?: string | null,"organization_id": string,"reasons"?: NonNullable<Json>,"sku_id": string,"sourcing_product_id"?: string | null,"status"?: Database["public"]['Enums']["match_status"]
                  }
                  Update: {
                    "confidence"?: number,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"method"?: string,"offer_id"?: string | null,"organization_id"?: string,"reasons"?: NonNullable<Json>,"sku_id"?: string,"sourcing_product_id"?: string | null,"status"?: Database["public"]['Enums']["match_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_matches_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "sourcing_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_matches_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "supplier_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_matches_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_matches_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_matches_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "product_matches_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "product_matches_sourcing_product_id_fkey"
      columns: ["sourcing_product_id"]
isOneToOne: false
      referencedRelation: "sourcing_products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "attributes": NonNullable<Json>,"condition": Database["public"]['Enums']["product_condition"],"created_at": string,"ean": string | null,"grade": string | null,"id": string,"mpn": string | null,"name": string,"organization_id": string,"product_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attributes"?: NonNullable<Json>,"condition"?: Database["public"]['Enums']["product_condition"],"created_at"?: string,"ean"?: string | null,"grade"?: string | null,"id"?: string,"mpn"?: string | null,"name": string,"organization_id": string,"product_id": string,"updated_at"?: string
                  }
                  Update: {
                    "attributes"?: NonNullable<Json>,"condition"?: Database["public"]['Enums']["product_condition"],"created_at"?: string,"ean"?: string | null,"grade"?: string | null,"id"?: string,"mpn"?: string | null,"name"?: string,"organization_id"?: string,"product_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_variants_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_variants_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["product_id"]
    }
                  ]
                },"products": {
                  Row: {
                    "attributes": NonNullable<Json>,"brand": string | null,"brand_normalized": string | null,"category": string | null,"created_at": string,"description": string | null,"id": string,"image_url": string | null,"is_archived": boolean,"model_normalized": string | null,"name": string,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attributes"?: NonNullable<Json>,"brand"?: string | null,"brand_normalized"?: string | null,"category"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"image_url"?: string | null,"is_archived"?: boolean,"model_normalized"?: string | null,"name": string,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "attributes"?: NonNullable<Json>,"brand"?: string | null,"brand_normalized"?: string | null,"category"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"image_url"?: string | null,"is_archived"?: boolean,"model_normalized"?: string | null,"name"?: string,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_order_items": {
                  Row: {
                    "created_at": string,"currency": string | null,"id": string,"offer_id": string | null,"organization_id": string,"purchase_order_id": string,"quantity_ordered": number,"quantity_received": number,"sku_id": string,"unit_cost": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string | null,"id"?: string,"offer_id"?: string | null,"organization_id": string,"purchase_order_id": string,"quantity_ordered": number,"quantity_received"?: number,"sku_id": string,"unit_cost"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string | null,"id"?: string,"offer_id"?: string | null,"organization_id"?: string,"purchase_order_id"?: string,"quantity_ordered"?: number,"quantity_received"?: number,"sku_id"?: string,"unit_cost"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_order_items_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "sourcing_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_order_items_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "supplier_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_order_items_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_order_items_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_order_items_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "purchase_order_items_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    }
                  ]
                },"purchase_orders": {
                  Row: {
                    "created_at": string,"created_by": string | null,"currency": string,"expected_at": string | null,"id": string,"notes": string | null,"organization_id": string,"received_at": string | null,"reference": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["purchase_order_status"],"supplier_id": string,"total": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"currency"?: string,"expected_at"?: string | null,"id"?: string,"notes"?: string | null,"organization_id": string,"received_at"?: string | null,"reference"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["purchase_order_status"],"supplier_id": string,"total"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"currency"?: string,"expected_at"?: string | null,"id"?: string,"notes"?: string | null,"organization_id"?: string,"received_at"?: string | null,"reference"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["purchase_order_status"],"supplier_id"?: string,"total"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_orders_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"replenishment_recommendations": {
                  Row: {
                    "computed_at": string,"created_at": string,"current_stock": number,"daily_velocity": number | null,"days_of_cover": number | null,"explanation": string,"id": string,"inputs": NonNullable<Json>,"lead_time_days": number | null,"offer_id": string | null,"organization_id": string,"purchase_order_id": string | null,"recommended_quantity": number | null,"safety_stock": number,"sku_id": string,"status": Database["public"]['Enums']["recommendation_status"],"supplier_id": string | null,"target_quantity": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "computed_at"?: string,"created_at"?: string,"current_stock": number,"daily_velocity"?: number | null,"days_of_cover"?: number | null,"explanation": string,"id"?: string,"inputs"?: NonNullable<Json>,"lead_time_days"?: number | null,"offer_id"?: string | null,"organization_id": string,"purchase_order_id"?: string | null,"recommended_quantity"?: number | null,"safety_stock"?: number,"sku_id": string,"status"?: Database["public"]['Enums']["recommendation_status"],"supplier_id"?: string | null,"target_quantity"?: number | null
                  }
                  Update: {
                    "computed_at"?: string,"created_at"?: string,"current_stock"?: number,"daily_velocity"?: number | null,"days_of_cover"?: number | null,"explanation"?: string,"id"?: string,"inputs"?: NonNullable<Json>,"lead_time_days"?: number | null,"offer_id"?: string | null,"organization_id"?: string,"purchase_order_id"?: string | null,"recommended_quantity"?: number | null,"safety_stock"?: number,"sku_id"?: string,"status"?: Database["public"]['Enums']["recommendation_status"],"supplier_id"?: string | null,"target_quantity"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "replenishment_recommendations_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "sourcing_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "replenishment_recommendations_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "supplier_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "replenishment_recommendations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "replenishment_recommendations_purchase_order_id_fkey"
      columns: ["purchase_order_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "replenishment_recommendations_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "replenishment_recommendations_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "replenishment_recommendations_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "replenishment_recommendations_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"sales_channels": {
                  Row: {
                    "created_at": string,"currency": string,"default_shipping_cost": number | null,"fee_percent": number | null,"id": string,"is_active": boolean,"name": string,"organization_id": string,"payment_fee_fixed": number | null,"payment_fee_percent": number | null,"provider": Database["public"]['Enums']["channel_provider"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"default_shipping_cost"?: number | null,"fee_percent"?: number | null,"id"?: string,"is_active"?: boolean,"name": string,"organization_id": string,"payment_fee_fixed"?: number | null,"payment_fee_percent"?: number | null,"provider": Database["public"]['Enums']["channel_provider"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"default_shipping_cost"?: number | null,"fee_percent"?: number | null,"id"?: string,"is_active"?: boolean,"name"?: string,"organization_id"?: string,"payment_fee_fixed"?: number | null,"payment_fee_percent"?: number | null,"provider"?: Database["public"]['Enums']["channel_provider"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_channels_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"skus": {
                  Row: {
                    "barcode": string | null,"code": string,"cost_price": number | null,"created_at": string,"currency": string,"default_supplier_id": string | null,"id": string,"is_active": boolean,"lead_time_days": number | null,"location": string | null,"organization_id": string,"product_id": string,"reorder_point": number,"safety_stock": number,"sale_price": number | null,"updated_at": string,"variant_id": string,"weight_grams": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "barcode"?: string | null,"code": string,"cost_price"?: number | null,"created_at"?: string,"currency"?: string,"default_supplier_id"?: string | null,"id"?: string,"is_active"?: boolean,"lead_time_days"?: number | null,"location"?: string | null,"organization_id": string,"product_id": string,"reorder_point"?: number,"safety_stock"?: number,"sale_price"?: number | null,"updated_at"?: string,"variant_id": string,"weight_grams"?: number | null
                  }
                  Update: {
                    "barcode"?: string | null,"code"?: string,"cost_price"?: number | null,"created_at"?: string,"currency"?: string,"default_supplier_id"?: string | null,"id"?: string,"is_active"?: boolean,"lead_time_days"?: number | null,"location"?: string | null,"organization_id"?: string,"product_id"?: string,"reorder_point"?: number,"safety_stock"?: number,"sale_price"?: number | null,"updated_at"?: string,"variant_id"?: string,"weight_grams"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "skus_default_supplier_fk"
      columns: ["default_supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "skus_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "skus_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "skus_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["product_id"]
    },{
      foreignKeyName: "skus_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "skus_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["variant_id"]
    }
                  ]
                },"sourcing_alert_events": {
                  Row: {
                    "alert_id": string,"id": string,"kind": string,"message": string,"offer_id": string,"organization_id": string,"seen_at": string | null,"triggered_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alert_id": string,"id"?: string,"kind": string,"message": string,"offer_id": string,"organization_id": string,"seen_at"?: string | null,"triggered_at"?: string
                  }
                  Update: {
                    "alert_id"?: string,"id"?: string,"kind"?: string,"message"?: string,"offer_id"?: string,"organization_id"?: string,"seen_at"?: string | null,"triggered_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sourcing_alert_events_alert_id_fkey"
      columns: ["alert_id"]
isOneToOne: false
      referencedRelation: "sourcing_alerts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_alert_events_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "sourcing_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_alert_events_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "supplier_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_alert_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"sourcing_alerts": {
                  Row: {
                    "created_at": string,"criteria": NonNullable<Json>,"id": string,"is_active": boolean,"last_checked_at": string | null,"last_triggered_at": string | null,"name": string,"organization_id": string,"parsed": NonNullable<Json>,"query_text": string,"sku_id": string | null,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"criteria"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"last_checked_at"?: string | null,"last_triggered_at"?: string | null,"name": string,"organization_id": string,"parsed"?: NonNullable<Json>,"query_text": string,"sku_id"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"criteria"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"last_checked_at"?: string | null,"last_triggered_at"?: string | null,"name"?: string,"organization_id"?: string,"parsed"?: NonNullable<Json>,"query_text"?: string,"sku_id"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sourcing_alerts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_alerts_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_alerts_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "sourcing_alerts_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    }
                  ]
                },"sourcing_offers": {
                  Row: {
                    "anomalies": (string)[],"available_quantity": number | null,"brand": string | null,"color": string | null,"condition": Database["public"]['Enums']["product_condition"],"confidence": NonNullable<Json>,"country": string | null,"created_at": string,"delivery_max_days": number | null,"delivery_min_days": number | null,"ean": string | null,"expired_at": string | null,"external_offer_id": string,"external_product_id": string | null,"feed_id": string | null,"first_seen_at": string,"fx_rate": number | null,"fx_rate_date": string | null,"grade": string | null,"id": string,"last_price_at": string,"last_seen_at": string,"last_stock_at": string | null,"minimum_order_value": number | null,"model": string | null,"moq": number | null,"mpn": string | null,"normalized_currency": string | null,"normalized_price": number | null,"normalized_product_id": string | null,"organization_id": string,"original_currency": string,"original_price": number,"raw": Json | null,"shipping_cost": number | null,"shipping_currency": string | null,"sku_id": string | null,"source_id": string,"source_type": Database["public"]['Enums']["source_type"],"source_url": string | null,"status": Database["public"]['Enums']["offer_status"],"stock_status": Database["public"]['Enums']["stock_status"],"storage": string | null,"supplier_id": string,"tax_type": Database["public"]['Enums']["tax_type"],"title_original": string,"updated_at": string,"vat_rate": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anomalies"?: (string)[],"available_quantity"?: number | null,"brand"?: string | null,"color"?: string | null,"condition"?: Database["public"]['Enums']["product_condition"],"confidence"?: NonNullable<Json>,"country"?: string | null,"created_at"?: string,"delivery_max_days"?: number | null,"delivery_min_days"?: number | null,"ean"?: string | null,"expired_at"?: string | null,"external_offer_id": string,"external_product_id"?: string | null,"feed_id"?: string | null,"first_seen_at"?: string,"fx_rate"?: number | null,"fx_rate_date"?: string | null,"grade"?: string | null,"id"?: string,"last_price_at"?: string,"last_seen_at"?: string,"last_stock_at"?: string | null,"minimum_order_value"?: number | null,"model"?: string | null,"moq"?: number | null,"mpn"?: string | null,"normalized_currency"?: string | null,"normalized_price"?: number | null,"normalized_product_id"?: string | null,"organization_id": string,"original_currency": string,"original_price": number,"raw"?: Json | null,"shipping_cost"?: number | null,"shipping_currency"?: string | null,"sku_id"?: string | null,"source_id": string,"source_type": Database["public"]['Enums']["source_type"],"source_url"?: string | null,"status"?: Database["public"]['Enums']["offer_status"],"stock_status"?: Database["public"]['Enums']["stock_status"],"storage"?: string | null,"supplier_id": string,"tax_type"?: Database["public"]['Enums']["tax_type"],"title_original": string,"updated_at"?: string,"vat_rate"?: number | null
                  }
                  Update: {
                    "anomalies"?: (string)[],"available_quantity"?: number | null,"brand"?: string | null,"color"?: string | null,"condition"?: Database["public"]['Enums']["product_condition"],"confidence"?: NonNullable<Json>,"country"?: string | null,"created_at"?: string,"delivery_max_days"?: number | null,"delivery_min_days"?: number | null,"ean"?: string | null,"expired_at"?: string | null,"external_offer_id"?: string,"external_product_id"?: string | null,"feed_id"?: string | null,"first_seen_at"?: string,"fx_rate"?: number | null,"fx_rate_date"?: string | null,"grade"?: string | null,"id"?: string,"last_price_at"?: string,"last_seen_at"?: string,"last_stock_at"?: string | null,"minimum_order_value"?: number | null,"model"?: string | null,"moq"?: number | null,"mpn"?: string | null,"normalized_currency"?: string | null,"normalized_price"?: number | null,"normalized_product_id"?: string | null,"organization_id"?: string,"original_currency"?: string,"original_price"?: number,"raw"?: Json | null,"shipping_cost"?: number | null,"shipping_currency"?: string | null,"sku_id"?: string | null,"source_id"?: string,"source_type"?: Database["public"]['Enums']["source_type"],"source_url"?: string | null,"status"?: Database["public"]['Enums']["offer_status"],"stock_status"?: Database["public"]['Enums']["stock_status"],"storage"?: string | null,"supplier_id"?: string,"tax_type"?: Database["public"]['Enums']["tax_type"],"title_original"?: string,"updated_at"?: string,"vat_rate"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sourcing_offers_feed_id_fkey"
      columns: ["feed_id"]
isOneToOne: false
      referencedRelation: "supplier_feeds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_offers_normalized_product_id_fkey"
      columns: ["normalized_product_id"]
isOneToOne: false
      referencedRelation: "sourcing_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_offers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_offers_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_offers_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "sourcing_offers_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "sourcing_offers_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "supplier_sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_offers_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"sourcing_products": {
                  Row: {
                    "attributes": NonNullable<Json>,"brand": string | null,"color": string | null,"condition": Database["public"]['Enums']["product_condition"],"created_at": string,"ean": string | null,"grade": string | null,"gtin": string | null,"id": string,"model": string | null,"mpn": string | null,"normalized_key": string,"organization_id": string,"sku_id": string | null,"storage": string | null,"title_display": string,"upc": string | null,"updated_at": string,"variant": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attributes"?: NonNullable<Json>,"brand"?: string | null,"color"?: string | null,"condition"?: Database["public"]['Enums']["product_condition"],"created_at"?: string,"ean"?: string | null,"grade"?: string | null,"gtin"?: string | null,"id"?: string,"model"?: string | null,"mpn"?: string | null,"normalized_key": string,"organization_id": string,"sku_id"?: string | null,"storage"?: string | null,"title_display": string,"upc"?: string | null,"updated_at"?: string,"variant"?: string | null
                  }
                  Update: {
                    "attributes"?: NonNullable<Json>,"brand"?: string | null,"color"?: string | null,"condition"?: Database["public"]['Enums']["product_condition"],"created_at"?: string,"ean"?: string | null,"grade"?: string | null,"gtin"?: string | null,"id"?: string,"model"?: string | null,"mpn"?: string | null,"normalized_key"?: string,"organization_id"?: string,"sku_id"?: string | null,"storage"?: string | null,"title_display"?: string,"upc"?: string | null,"updated_at"?: string,"variant"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sourcing_products_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_products_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_products_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "sourcing_products_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    }
                  ]
                },"sourcing_searches": {
                  Row: {
                    "created_at": string,"filters": NonNullable<Json>,"id": string,"organization_id": string,"parsed": NonNullable<Json>,"query_text": string,"result_count": number,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"organization_id": string,"parsed"?: NonNullable<Json>,"query_text": string,"result_count"?: number,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"organization_id"?: string,"parsed"?: NonNullable<Json>,"query_text"?: string,"result_count"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sourcing_searches_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_connection_secrets": {
                  Row: {
                    "connection_id": string,"credentials_enc": string | null,"key_version": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "connection_id": string,"credentials_enc"?: string | null,"key_version"?: number,"updated_at"?: string
                  }
                  Update: {
                    "connection_id"?: string,"credentials_enc"?: string | null,"key_version"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_connection_secrets_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: true
      referencedRelation: "supplier_connections"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_connections": {
                  Row: {
                    "config": NonNullable<Json>,"connected_at": string | null,"connector_key": string,"created_at": string,"external_account_id": string | null,"id": string,"last_error": string | null,"last_sync_at": string | null,"organization_id": string,"source_id": string | null,"status": Database["public"]['Enums']["connection_status"],"supplier_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"connected_at"?: string | null,"connector_key": string,"created_at"?: string,"external_account_id"?: string | null,"id"?: string,"last_error"?: string | null,"last_sync_at"?: string | null,"organization_id": string,"source_id"?: string | null,"status"?: Database["public"]['Enums']["connection_status"],"supplier_id": string,"updated_at"?: string
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"connected_at"?: string | null,"connector_key"?: string,"created_at"?: string,"external_account_id"?: string | null,"id"?: string,"last_error"?: string | null,"last_sync_at"?: string | null,"organization_id"?: string,"source_id"?: string | null,"status"?: Database["public"]['Enums']["connection_status"],"supplier_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_connections_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_connections_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "supplier_sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_connections_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_feeds": {
                  Row: {
                    "created_at": string,"field_mapping": NonNullable<Json>,"format": Database["public"]['Enums']["feed_format"],"id": string,"last_error": string | null,"last_record_count": number | null,"last_successful_sync_at": string | null,"last_sync_at": string | null,"options": NonNullable<Json>,"organization_id": string,"source_id": string,"status": Database["public"]['Enums']["source_status"],"supplier_id": string,"sync_frequency": Database["public"]['Enums']["sync_frequency"],"type": string,"updated_at": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"field_mapping"?: NonNullable<Json>,"format": Database["public"]['Enums']["feed_format"],"id"?: string,"last_error"?: string | null,"last_record_count"?: number | null,"last_successful_sync_at"?: string | null,"last_sync_at"?: string | null,"options"?: NonNullable<Json>,"organization_id": string,"source_id": string,"status"?: Database["public"]['Enums']["source_status"],"supplier_id": string,"sync_frequency"?: Database["public"]['Enums']["sync_frequency"],"type"?: string,"updated_at"?: string,"url"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"field_mapping"?: NonNullable<Json>,"format"?: Database["public"]['Enums']["feed_format"],"id"?: string,"last_error"?: string | null,"last_record_count"?: number | null,"last_successful_sync_at"?: string | null,"last_sync_at"?: string | null,"options"?: NonNullable<Json>,"organization_id"?: string,"source_id"?: string,"status"?: Database["public"]['Enums']["source_status"],"supplier_id"?: string,"sync_frequency"?: Database["public"]['Enums']["sync_frequency"],"type"?: string,"updated_at"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_feeds_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_feeds_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "supplier_sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_feeds_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_price_history": {
                  Row: {
                    "id": string,"normalized_currency": string | null,"normalized_price": number | null,"offer_id": string,"organization_id": string,"original_currency": string,"original_price": number,"recorded_at": string,"tax_type": Database["public"]['Enums']["tax_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"normalized_currency"?: string | null,"normalized_price"?: number | null,"offer_id": string,"organization_id": string,"original_currency": string,"original_price": number,"recorded_at"?: string,"tax_type": Database["public"]['Enums']["tax_type"]
                  }
                  Update: {
                    "id"?: string,"normalized_currency"?: string | null,"normalized_price"?: number | null,"offer_id"?: string,"organization_id"?: string,"original_currency"?: string,"original_price"?: number,"recorded_at"?: string,"tax_type"?: Database["public"]['Enums']["tax_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_price_history_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "sourcing_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_price_history_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "supplier_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_price_history_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_sources": {
                  Row: {
                    "access_conditions": string | null,"automated_access_confirmed": boolean,"base_url": string | null,"config": NonNullable<Json>,"country": string | null,"crawl_delay_seconds": number | null,"created_at": string,"default_currency": string | null,"default_tax_type": Database["public"]['Enums']["tax_type"],"id": string,"last_error": string | null,"last_successful_sync_at": string | null,"last_sync_at": string | null,"name": string,"organization_id": string,"robots_allowed": boolean | null,"robots_checked_at": string | null,"source_type": Database["public"]['Enums']["source_type"],"status": Database["public"]['Enums']["source_status"],"supplier_id": string,"sync_frequency": Database["public"]['Enums']["sync_frequency"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_conditions"?: string | null,"automated_access_confirmed"?: boolean,"base_url"?: string | null,"config"?: NonNullable<Json>,"country"?: string | null,"crawl_delay_seconds"?: number | null,"created_at"?: string,"default_currency"?: string | null,"default_tax_type"?: Database["public"]['Enums']["tax_type"],"id"?: string,"last_error"?: string | null,"last_successful_sync_at"?: string | null,"last_sync_at"?: string | null,"name": string,"organization_id": string,"robots_allowed"?: boolean | null,"robots_checked_at"?: string | null,"source_type": Database["public"]['Enums']["source_type"],"status"?: Database["public"]['Enums']["source_status"],"supplier_id": string,"sync_frequency"?: Database["public"]['Enums']["sync_frequency"],"updated_at"?: string
                  }
                  Update: {
                    "access_conditions"?: string | null,"automated_access_confirmed"?: boolean,"base_url"?: string | null,"config"?: NonNullable<Json>,"country"?: string | null,"crawl_delay_seconds"?: number | null,"created_at"?: string,"default_currency"?: string | null,"default_tax_type"?: Database["public"]['Enums']["tax_type"],"id"?: string,"last_error"?: string | null,"last_successful_sync_at"?: string | null,"last_sync_at"?: string | null,"name"?: string,"organization_id"?: string,"robots_allowed"?: boolean | null,"robots_checked_at"?: string | null,"source_type"?: Database["public"]['Enums']["source_type"],"status"?: Database["public"]['Enums']["source_status"],"supplier_id"?: string,"sync_frequency"?: Database["public"]['Enums']["sync_frequency"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_sources_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_sources_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_stock_history": {
                  Row: {
                    "available_quantity": number | null,"id": string,"offer_id": string,"organization_id": string,"recorded_at": string,"stock_status": Database["public"]['Enums']["stock_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "available_quantity"?: number | null,"id"?: string,"offer_id": string,"organization_id": string,"recorded_at"?: string,"stock_status": Database["public"]['Enums']["stock_status"]
                  }
                  Update: {
                    "available_quantity"?: number | null,"id"?: string,"offer_id"?: string,"organization_id"?: string,"recorded_at"?: string,"stock_status"?: Database["public"]['Enums']["stock_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_stock_history_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "sourcing_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_stock_history_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "supplier_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_stock_history_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "average_lead_time_days": number | null,"company": string | null,"contact_name": string | null,"country": string | null,"created_at": string,"currency": string,"default_moq": number | null,"email": string | null,"id": string,"internal_score": number | null,"is_archived": boolean,"minimum_order_value": number | null,"name": string,"notes": string | null,"organization_id": string,"payment_terms": string | null,"phone": string | null,"score_breakdown": Json | null,"score_computed_at": string | null,"updated_at": string,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "average_lead_time_days"?: number | null,"company"?: string | null,"contact_name"?: string | null,"country"?: string | null,"created_at"?: string,"currency"?: string,"default_moq"?: number | null,"email"?: string | null,"id"?: string,"internal_score"?: number | null,"is_archived"?: boolean,"minimum_order_value"?: number | null,"name": string,"notes"?: string | null,"organization_id": string,"payment_terms"?: string | null,"phone"?: string | null,"score_breakdown"?: Json | null,"score_computed_at"?: string | null,"updated_at"?: string,"website"?: string | null
                  }
                  Update: {
                    "average_lead_time_days"?: number | null,"company"?: string | null,"contact_name"?: string | null,"country"?: string | null,"created_at"?: string,"currency"?: string,"default_moq"?: number | null,"email"?: string | null,"id"?: string,"internal_score"?: number | null,"is_archived"?: boolean,"minimum_order_value"?: number | null,"name"?: string,"notes"?: string | null,"organization_id"?: string,"payment_terms"?: string | null,"phone"?: string | null,"score_breakdown"?: Json | null,"score_computed_at"?: string | null,"updated_at"?: string,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"sync_errors": {
                  Row: {
                    "code": string,"created_at": string,"details": NonNullable<Json>,"entity_ref": string | null,"entity_type": string | null,"id": string,"message": string,"organization_id": string,"sync_run_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"details"?: NonNullable<Json>,"entity_ref"?: string | null,"entity_type"?: string | null,"id"?: string,"message": string,"organization_id": string,"sync_run_id": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"entity_ref"?: string | null,"entity_type"?: string | null,"id"?: string,"message"?: string,"organization_id"?: string,"sync_run_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_errors_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sync_errors_sync_run_id_fkey"
      columns: ["sync_run_id"]
isOneToOne: false
      referencedRelation: "sync_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"sync_runs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"duration_ms": number | null,"error_count": number,"error_summary": string | null,"finished_at": string | null,"id": string,"organization_id": string,"provider": string,"records_processed": number,"source_kind": string,"source_ref": string | null,"started_at": string,"stats": NonNullable<Json>,"status": Database["public"]['Enums']["sync_status"],"trigger": Database["public"]['Enums']["sync_trigger"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"duration_ms"?: number | null,"error_count"?: number,"error_summary"?: string | null,"finished_at"?: string | null,"id"?: string,"organization_id": string,"provider": string,"records_processed"?: number,"source_kind": string,"source_ref"?: string | null,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["sync_status"],"trigger": Database["public"]['Enums']["sync_trigger"]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"duration_ms"?: number | null,"error_count"?: number,"error_summary"?: string | null,"finished_at"?: string | null,"id"?: string,"organization_id"?: string,"provider"?: string,"records_processed"?: number,"source_kind"?: string,"source_ref"?: string | null,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["sync_status"],"trigger"?: Database["public"]['Enums']["sync_trigger"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_runs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"user_profiles": {
                  Row: {
                    "created_at": string,"current_organization_id": string | null,"email": string,"full_name": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_organization_id"?: string | null,"email": string,"full_name"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"current_organization_id"?: string | null,"email"?: string,"full_name"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_profiles_current_org_fk"
      columns: ["current_organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_events": {
                  Row: {
                    "connection_id": string | null,"error": string | null,"event_id": string,"event_type": string,"id": string,"organization_id": string | null,"payload": Json | null,"payload_hash": string,"processed_at": string | null,"provider": string,"received_at": string,"signature_valid": boolean | null,"status": Database["public"]['Enums']["webhook_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "connection_id"?: string | null,"error"?: string | null,"event_id": string,"event_type": string,"id"?: string,"organization_id"?: string | null,"payload"?: Json | null,"payload_hash": string,"processed_at"?: string | null,"provider": string,"received_at"?: string,"signature_valid"?: boolean | null,"status"?: Database["public"]['Enums']["webhook_status"]
                  }
                  Update: {
                    "connection_id"?: string | null,"error"?: string | null,"event_id"?: string,"event_type"?: string,"id"?: string,"organization_id"?: string | null,"payload"?: Json | null,"payload_hash"?: string,"processed_at"?: string | null,"provider"?: string,"received_at"?: string,"signature_valid"?: boolean | null,"status"?: Database["public"]['Enums']["webhook_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "webhook_events_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: false
      referencedRelation: "channel_connections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "webhook_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "supplier_offers": {
                  Row: {
                    "available_quantity": number | null,"country": string | null,"delivery_max_days": number | null,"delivery_min_days": number | null,"id": string | null,"last_price_at": string | null,"last_seen_at": string | null,"last_stock_at": string | null,"minimum_order_value": number | null,"moq": number | null,"normalized_currency": string | null,"normalized_price": number | null,"organization_id": string | null,"original_currency": string | null,"original_price": number | null,"shipping_cost": number | null,"sku_id": string | null,"source_id": string | null,"source_type": Database["public"]['Enums']["source_type"] | null,"source_url": string | null,"status": Database["public"]['Enums']["offer_status"] | null,"stock_status": Database["public"]['Enums']["stock_status"] | null,"supplier_id": string | null,"tax_type": Database["public"]['Enums']["tax_type"] | null,"title_original": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "available_quantity"?: number | null,"country"?: string | null,"delivery_max_days"?: number | null,"delivery_min_days"?: number | null,"id"?: string | null,"last_price_at"?: string | null,"last_seen_at"?: string | null,"last_stock_at"?: string | null,"minimum_order_value"?: number | null,"moq"?: number | null,"normalized_currency"?: string | null,"normalized_price"?: number | null,"organization_id"?: string | null,"original_currency"?: string | null,"original_price"?: number | null,"shipping_cost"?: number | null,"sku_id"?: string | null,"source_id"?: string | null,"source_type"?: Database["public"]['Enums']["source_type"] | null,"source_url"?: string | null,"status"?: Database["public"]['Enums']["offer_status"] | null,"stock_status"?: Database["public"]['Enums']["stock_status"] | null,"supplier_id"?: string | null,"tax_type"?: Database["public"]['Enums']["tax_type"] | null,"title_original"?: string | null
                         }
                        Update: {
                           "available_quantity"?: number | null,"country"?: string | null,"delivery_max_days"?: number | null,"delivery_min_days"?: number | null,"id"?: string | null,"last_price_at"?: string | null,"last_seen_at"?: string | null,"last_stock_at"?: string | null,"minimum_order_value"?: number | null,"moq"?: number | null,"normalized_currency"?: string | null,"normalized_price"?: number | null,"organization_id"?: string | null,"original_currency"?: string | null,"original_price"?: number | null,"shipping_cost"?: number | null,"sku_id"?: string | null,"source_id"?: string | null,"source_type"?: Database["public"]['Enums']["source_type"] | null,"source_url"?: string | null,"status"?: Database["public"]['Enums']["offer_status"] | null,"stock_status"?: Database["public"]['Enums']["stock_status"] | null,"supplier_id"?: string | null,"tax_type"?: Database["public"]['Enums']["tax_type"] | null,"title_original"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "sourcing_offers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_offers_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_offers_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "sourcing_offers_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "sourcing_offers_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "supplier_sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sourcing_offers_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"v_daily_sales": {
                  Row: {
                    "currency": string | null,"day": string | null,"orders_count": number | null,"organization_id": string | null,"revenue": number | null,"units": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "orders_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"v_sku_sales_stats": {
                  Row: {
                    "avg_sale_price_30d": number | null,"first_sale_at": string | null,"foreign_currency_units_30d": number | null,"last_sale_at": string | null,"organization_id": string | null,"revenue_30d": number | null,"sku_id": string | null,"units_30d": number | null,"units_7d": number | null,"units_90d": number | null,"units_prev_30d": number | null,"units_prev_7d": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "skus_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"v_stock_overview": {
                  Row: {
                    "active_listings_count": number | null,"avg_sale_price_30d": number | null,"barcode": string | null,"best_supplier_price": number | null,"brand": string | null,"category": string | null,"channel_providers": (string)[] | null,"code": string | null,"condition": Database["public"]['Enums']["product_condition"] | null,"cost_price": number | null,"currency": string | null,"default_supplier_id": string | null,"first_sale_at": string | null,"foreign_currency_units_30d": number | null,"grade": string | null,"image_url": string | null,"is_active": boolean | null,"last_movement_at": string | null,"last_sale_at": string | null,"lead_time_days": number | null,"location": string | null,"organization_id": string | null,"product_archived": boolean | null,"product_id": string | null,"product_name": string | null,"quantity_available": number | null,"quantity_on_hand": number | null,"quantity_reserved": number | null,"reorder_point": number | null,"revenue_30d": number | null,"safety_stock": number | null,"sale_price": number | null,"sku_id": string | null,"stock_value": number | null,"supplier_ids": (string)[] | null,"supplier_offers_count": number | null,"unit_margin": number | null,"units_30d": number | null,"units_7d": number | null,"units_90d": number | null,"units_prev_30d": number | null,"units_prev_7d": number | null,"variant_id": string | null,"variant_name": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "skus_default_supplier_fk"
      columns: ["default_supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "skus_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"v_unmapped_listings": {
                  Row: {
                    "channel_name": string | null,"connection_id": string | null,"created_at": string | null,"currency": string | null,"ended_at": string | null,"external_listing_id": string | null,"external_product_id": string | null,"external_sku": string | null,"external_variation_id": string | null,"first_seen_at": string | null,"id": string | null,"image_url": string | null,"last_synced_at": string | null,"listing_url": string | null,"mapped_at": string | null,"mapped_by": string | null,"mapping_source": string | null,"mapping_status": Database["public"]['Enums']["mapping_status"] | null,"organization_id": string | null,"pending_suggestions": number | null,"price": number | null,"provider": Database["public"]['Enums']["channel_provider"] | null,"quantity_available": number | null,"quantity_listed": number | null,"quantity_sold": number | null,"sales_channel_id": string | null,"sku_id": string | null,"status": Database["public"]['Enums']["listing_status"] | null,"title": string | null,"updated_at": string | null,"variation_attributes": Json | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "channel_listings_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: false
      referencedRelation: "channel_connections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_listings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_listings_sales_channel_id_fkey"
      columns: ["sales_channel_id"]
isOneToOne: false
      referencedRelation: "sales_channels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_listings_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channel_listings_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_sku_sales_stats"
      referencedColumns: ["sku_id"]
    },{
      foreignKeyName: "channel_listings_sku_id_fkey"
      columns: ["sku_id"]
isOneToOne: false
      referencedRelation: "v_stock_overview"
      referencedColumns: ["sku_id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"adjust_reserved_quantity":
{ Args: { "p_delta": number,"p_organization_id": string,"p_sku_id": string }; Returns: {
              "last_movement_at": string | null,
"last_sale_at": string | null,
"organization_id": string,
"quantity_available": number | null,
"quantity_on_hand": number,
"quantity_reserved": number,
"sku_id": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "inventory"
        isOneToOne: true
        isSetofReturn: false
      } },
"apply_inventory_movement":
{ Args: { "p_channel"?: string,"p_note"?: string,"p_occurred_at"?: string,"p_organization_id": string,"p_quantity": number,"p_reference_id"?: string,"p_reference_type"?: string,"p_sku_id": string,"p_type": Database["public"]['Enums']["movement_type"] }; Returns: {
              "channel": string | null,
"created_at": string,
"created_by": string | null,
"id": string,
"note": string | null,
"occurred_at": string,
"organization_id": string,
"quantity": number,
"quantity_after": number,
"reference_id": string | null,
"reference_type": string | null,
"sku_id": string,
"type": Database["public"]['Enums']["movement_type"]
            }
                          SetofOptions: {
        from: "*"
        to: "inventory_movements"
        isOneToOne: true
        isSetofReturn: false
      } },
"apply_pending_sales_for_sku":
{ Args: { "p_sku_id": string }; Returns: number
                           },
"can_write_org":
{ Args: { "p_org_id": string }; Returns: boolean
                           },
"create_organization_with_owner":
{ Args: { "p_is_demo"?: boolean,"p_name": string,"p_slug": string }; Returns: string
                           },
"create_product_with_skus":
{ Args: { "p_items": Json,"p_organization_id": string,"p_product"?: Json,"p_product_id"?: string }; Returns: Json
                           },
"create_sku":
{ Args: { "p_initial_quantity"?: number,"p_organization_id": string,"p_product"?: Json,"p_product_id"?: string,"p_sku": Json,"p_variant": Json }; Returns: Json
                           },
"dearmor":
{ Args: { "": string }; Returns: string
                           },
"gen_random_uuid":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"gen_salt":
{ Args: { "": string }; Returns: string
                           },
"ingest_external_order":
{ Args: { "p_connection_id": string,"p_items": Json,"p_order": Json,"p_organization_id": string,"p_provider": Database["public"]['Enums']["channel_provider"],"p_sales_channel_id": string }; Returns: Json
                           },
"install_same_org_guards":
{ Args: { "p_table": unknown }; Returns: undefined
                           },
"is_client_role":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_org_admin":
{ Args: { "p_org_id": string }; Returns: boolean
                           },
"is_org_member":
{ Args: { "p_org_id": string }; Returns: boolean
                           },
"is_service_role":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"map_listing_to_sku":
{ Args: { "p_listing_id": string,"p_sku_id": string,"p_source"?: string }; Returns: {
              "connection_id": string | null,
"created_at": string,
"currency": string | null,
"ended_at": string | null,
"external_listing_id": string,
"external_product_id": string | null,
"external_sku": string | null,
"external_variation_id": string,
"first_seen_at": string,
"id": string,
"image_url": string | null,
"last_synced_at": string,
"listing_url": string | null,
"mapped_at": string | null,
"mapped_by": string | null,
"mapping_source": string | null,
"mapping_status": Database["public"]['Enums']["mapping_status"],
"organization_id": string,
"price": number | null,
"provider": Database["public"]['Enums']["channel_provider"],
"quantity_available": number | null,
"quantity_listed": number | null,
"quantity_sold": number | null,
"sales_channel_id": string,
"sku_id": string | null,
"status": Database["public"]['Enums']["listing_status"],
"title": string,
"updated_at": string,
"variation_attributes": NonNullable<Json>
            }
                          SetofOptions: {
        from: "*"
        to: "channel_listings"
        isOneToOne: true
        isSetofReturn: false
      } },
"normalize_text":
{ Args: { "p": string }; Returns: string
                           },
"org_role_of":
{ Args: { "p_org_id": string }; Returns: Database["public"]['Enums']["org_role"]
                           },
"pgp_armor_headers":
{ Args: { "": string }; Returns: Record<string, unknown>[]
                           },
"purchase_order_computed_total":
{ Args: { "p_currency": string,"p_purchase_order_id": string }; Returns: number
                           },
"receive_purchase_order_items":
{ Args: { "p_purchase_order_id": string,"p_receipts": Json }; Returns: {
              "created_at": string,
"created_by": string | null,
"currency": string,
"expected_at": string | null,
"id": string,
"notes": string | null,
"organization_id": string,
"received_at": string | null,
"reference": string | null,
"sent_at": string | null,
"status": Database["public"]['Enums']["purchase_order_status"],
"supplier_id": string,
"total": number | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "purchase_orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"resolve_sku_for_line":
{ Args: { "p_external_listing_id": string,"p_external_sku": string,"p_external_variation_id": string,"p_organization_id": string,"p_sales_channel_id": string }; Returns: {
              "channel_listing_id": string,"sku_id": string
            }[]
                           },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           },
"sku_has_history":
{ Args: { "p_sku_id": string }; Returns: boolean
                           },
"sku_rotation":
{ Args: { "p_days"?: number,"p_organization_id": string,"p_sku_ids"?: (string)[] }; Returns: {
              "avg_on_hand": number,"sku_id": string,"units_sold": number,"window_days": number,"window_start": string
            }[]
                           },
"store_refreshed_access_token":
{ Args: { "p_access_token_enc": string,"p_connection_id": string,"p_expires_at": string,"p_refresh_token_enc_used": string }; Returns: string
                           },
"unaccent":
{ Args: { "": string }; Returns: string
                           },
"update_sku_with_variant":
{ Args: { "p_expected_sku_updated_at"?: string,"p_expected_variant_updated_at"?: string,"p_organization_id": string,"p_sku": Json,"p_sku_id": string,"p_variant"?: Json }; Returns: Json
                           },
"url_encode_path_segment":
{ Args: { "p_value": string }; Returns: string
                           }
          }
          Enums: {
            "alert_severity": "info"|"warning"|"critical","alert_status": "open"|"acknowledged"|"resolved","channel_provider": "ebay"|"amazon"|"shopify"|"woocommerce"|"manual","connection_status": "pending"|"connected"|"expired"|"error"|"disconnected","feed_format": "csv"|"xml"|"json","listing_status": "active"|"ended"|"unsold"|"unknown","mapping_status": "unmapped"|"suggested"|"mapped"|"ignored","match_status": "suggested"|"confirmed"|"rejected","movement_type": "initial"|"receipt"|"sale"|"return"|"cancellation"|"adjustment"|"transfer_in"|"transfer_out"|"correction","offer_status": "active"|"expired"|"suspicious"|"rejected","order_status": "pending"|"paid"|"shipped"|"delivered"|"cancelled"|"refunded"|"unknown","org_role": "owner"|"admin"|"member"|"viewer","price_kind": "cost"|"sale","product_condition": "new"|"refurbished"|"used"|"unknown","purchase_order_status": "draft"|"sent"|"confirmed"|"partially_received"|"received"|"cancelled","recommendation_status": "open"|"ordered"|"dismissed","source_status": "not_connected"|"active"|"paused"|"error","source_type": "PUBLIC_WEB"|"API"|"CSV"|"XML"|"JSON"|"SUPPLIER_ACCOUNT"|"MANUAL"|"PARTNER_FEED","stock_status": "in_stock"|"low"|"out_of_stock"|"unknown","sync_frequency": "manual"|"hourly"|"every_6_hours"|"daily","sync_status": "running"|"success"|"partial"|"failed","sync_trigger": "manual"|"scheduled"|"webhook"|"initial","tax_type": "ht"|"ttc"|"unknown","webhook_status": "received"|"processed"|"ignored"|"failed"|"duplicate"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "alert_severity": ["info", "warning", "critical"],"alert_status": ["open", "acknowledged", "resolved"],"channel_provider": ["ebay", "amazon", "shopify", "woocommerce", "manual"],"connection_status": ["pending", "connected", "expired", "error", "disconnected"],"feed_format": ["csv", "xml", "json"],"listing_status": ["active", "ended", "unsold", "unknown"],"mapping_status": ["unmapped", "suggested", "mapped", "ignored"],"match_status": ["suggested", "confirmed", "rejected"],"movement_type": ["initial", "receipt", "sale", "return", "cancellation", "adjustment", "transfer_in", "transfer_out", "correction"],"offer_status": ["active", "expired", "suspicious", "rejected"],"order_status": ["pending", "paid", "shipped", "delivered", "cancelled", "refunded", "unknown"],"org_role": ["owner", "admin", "member", "viewer"],"price_kind": ["cost", "sale"],"product_condition": ["new", "refurbished", "used", "unknown"],"purchase_order_status": ["draft", "sent", "confirmed", "partially_received", "received", "cancelled"],"recommendation_status": ["open", "ordered", "dismissed"],"source_status": ["not_connected", "active", "paused", "error"],"source_type": ["PUBLIC_WEB", "API", "CSV", "XML", "JSON", "SUPPLIER_ACCOUNT", "MANUAL", "PARTNER_FEED"],"stock_status": ["in_stock", "low", "out_of_stock", "unknown"],"sync_frequency": ["manual", "hourly", "every_6_hours", "daily"],"sync_status": ["running", "success", "partial", "failed"],"sync_trigger": ["manual", "scheduled", "webhook", "initial"],"tax_type": ["ht", "ttc", "unknown"],"webhook_status": ["received", "processed", "ignored", "failed", "duplicate"]
          }
        }
} as const
