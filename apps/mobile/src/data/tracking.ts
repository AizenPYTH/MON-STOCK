import type { Database } from "@/db/database.types";
import type { TrackingRefreshDTO } from "@/features/mobile-api/contract";
import { orIlikeAny } from "@/lib/postgrest";
import type { CarrierCode, TrackingEvent, TrackingStatus } from "@/domain/tools/tracking";
import { callApi } from "~/lib/api";
import type { MobileSupabase } from "~/lib/supabase";

/**
 * Colis suivis (lecture / ajout / libellé / archivage sous RLS). Le statut et l'historique sont
 * écrits uniquement par le serveur à partir de la réponse d'une API de suivi.
 */
export interface TrackedParcel {
  id: string;
  trackingNumber: string;
  carrierCode: CarrierCode | null;
  carrierSource: "auto" | "manual";
  label: string;
  orderId: string | null;
  order: { orderNumber: string | null; buyer: string | null } | null;
  destinationCountry: string | null;
  provider: string | null;
  status: TrackingStatus;
  statusDetail: string | null;
  carrierLabel: string | null;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  events: TrackingEvent[];
  providerUrl: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastError: string | null;
  archivedAt: string | null;
  createdAt: string;
}

const COLUMNS =
  "id, tracking_number, carrier_code, carrier_source, label, order_id, destination_country, provider, status, status_detail, carrier_label, estimated_delivery, delivered_at, events, provider_url, last_checked_at, next_check_at, last_error, archived_at, created_at, order:orders(order_number, buyer_username)";

type Row = {
  id: string;
  tracking_number: string;
  carrier_code: string | null;
  carrier_source: string;
  label: string;
  order_id: string | null;
  destination_country: string | null;
  provider: string | null;
  status: string;
  status_detail: string | null;
  carrier_label: string | null;
  estimated_delivery: string | null;
  delivered_at: string | null;
  events: unknown;
  provider_url: string | null;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_error: string | null;
  archived_at: string | null;
  created_at: string;
  order: { order_number: string | null; buyer_username: string | null } | { order_number: string | null; buyer_username: string | null }[] | null;
};

function fromRow(r: Row): TrackedParcel {
  const order = Array.isArray(r.order) ? (r.order[0] ?? null) : r.order;
  return {
    id: r.id,
    trackingNumber: r.tracking_number,
    carrierCode: (r.carrier_code as CarrierCode | null) ?? null,
    carrierSource: r.carrier_source === "manual" ? "manual" : "auto",
    label: r.label,
    orderId: r.order_id,
    order: order ? { orderNumber: order.order_number, buyer: order.buyer_username } : null,
    destinationCountry: r.destination_country?.trim() ?? null,
    provider: r.provider,
    status: r.status as TrackingStatus,
    statusDetail: r.status_detail,
    carrierLabel: r.carrier_label,
    estimatedDelivery: r.estimated_delivery,
    deliveredAt: r.delivered_at,
    events: Array.isArray(r.events) ? (r.events as TrackingEvent[]) : [],
    providerUrl: r.provider_url,
    lastCheckedAt: r.last_checked_at,
    nextCheckAt: r.next_check_at,
    lastError: r.last_error,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
  };
}

export async function fetchParcels(supabase: MobileSupabase, organizationId: string, archived: boolean): Promise<TrackedParcel[]> {
  let q = supabase.from("tracked_parcels").select(COLUMNS).eq("organization_id", organizationId);
  q = archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(fromRow);
}

export async function fetchParcel(supabase: MobileSupabase, organizationId: string, id: string): Promise<TrackedParcel | null> {
  const { data, error } = await supabase.from("tracked_parcels").select(COLUMNS).eq("organization_id", organizationId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as unknown as Row) : null;
}

export interface NewParcel {
  trackingNumber: string;
  carrierCode: CarrierCode | null;
  carrierSource: "auto" | "manual";
  label: string;
  orderId: string | null;
  destinationCountry: string | null;
}

/** Ajout puis première interrogation de l'API (si configurée). */
export async function addParcel(supabase: MobileSupabase, organizationId: string, p: NewParcel): Promise<{ id: string; refresh: TrackingRefreshDTO | null; refreshError: string | null }> {
  const { data, error } = await supabase
    .from("tracked_parcels")
    .insert({ organization_id: organizationId, tracking_number: p.trackingNumber, carrier_code: p.carrierCode, carrier_source: p.carrierSource, label: p.label.trim(), order_id: p.orderId, destination_country: p.destinationCountry })
    .select("id")
    .single();
  if (error) throw error;
  try {
    const refresh = await refreshParcel(organizationId, data.id);
    return { id: data.id, refresh, refreshError: null };
  } catch (e) {
    return { id: data.id, refresh: null, refreshError: e instanceof Error ? e.message : String(e) };
  }
}

export function refreshParcel(organizationId: string, parcelId: string): Promise<TrackingRefreshDTO> {
  return callApi<TrackingRefreshDTO>("/tracking/refresh", { method: "POST", organizationId, body: { parcelId } });
}

export async function updateParcel(supabase: MobileSupabase, organizationId: string, id: string, patch: { label?: string; carrierCode?: CarrierCode | null; orderId?: string | null; archived?: boolean }): Promise<void> {
  const row: Database["public"]["Tables"]["tracked_parcels"]["Update"] = {};
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.carrierCode !== undefined) {
    row.carrier_code = patch.carrierCode;
    row.carrier_source = "manual";
    row.next_check_at = new Date().toISOString();
  }
  if (patch.orderId !== undefined) row.order_id = patch.orderId;
  if (patch.archived !== undefined) row.archived_at = patch.archived ? new Date().toISOString() : null;
  const { error } = await supabase.from("tracked_parcels").update(row).eq("organization_id", organizationId).eq("id", id);
  if (error) throw error;
}

export async function deleteParcel(supabase: MobileSupabase, organizationId: string, id: string): Promise<void> {
  const { error } = await supabase.from("tracked_parcels").delete().eq("organization_id", organizationId).eq("id", id);
  if (error) throw error;
}

/** Commandes récentes pour l'association facultative (numéro et acheteur uniquement). */
export async function fetchRecentOrdersForLink(supabase: MobileSupabase, organizationId: string, q: string): Promise<{ id: string; label: string }[]> {
  let query = supabase.from("orders").select("id, order_number, external_order_id, buyer_username, placed_at").eq("organization_id", organizationId);
  const search = q.trim() ? orIlikeAny(["order_number", "external_order_id", "buyer_username"], q) : null;
  if (search) query = query.or(search);
  const { data, error } = await query.order("placed_at", { ascending: false }).limit(15);
  if (error) throw error;
  return (data ?? []).map((o) => ({ id: o.id, label: `${o.order_number ?? o.external_order_id}${o.buyer_username ? ` · ${o.buyer_username}` : ""}` }));
}
