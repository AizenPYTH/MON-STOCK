import type { Database } from "@/db/database.types";
import { CARRIER_LABEL, type CarrierCode, type TrackingEvent, type TrackingStatus } from "@/domain/tools/tracking";

/**
 * Colis suivis (module pur) : lecture des lignes `tracked_parcels` et modifications permises au
 * client (mêmes colonnes que l'application iPhone). Le statut et l'historique ne sont écrits que
 * par le serveur à partir d'une API de suivi.
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

export const PARCEL_COLUMNS =
  "id, tracking_number, carrier_code, carrier_source, label, order_id, destination_country, provider, status, status_detail, carrier_label, estimated_delivery, delivered_at, events, provider_url, last_checked_at, next_check_at, last_error, archived_at, created_at, order:orders(order_number, buyer_username)";

type OrderJoin = { order_number: string | null; buyer_username: string | null };

export interface ParcelRow {
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
  order: OrderJoin | OrderJoin[] | null;
}

const isCarrier = (c: string | null): c is CarrierCode => c !== null && c in CARRIER_LABEL;

export function parcelFromRow(r: ParcelRow): TrackedParcel {
  const order = Array.isArray(r.order) ? (r.order[0] ?? null) : r.order;
  return {
    id: r.id,
    trackingNumber: r.tracking_number,
    carrierCode: isCarrier(r.carrier_code) ? r.carrier_code : null,
    carrierSource: r.carrier_source === "manual" ? "manual" : "auto",
    label: r.label,
    orderId: r.order_id,
    order: order ? { orderNumber: order.order_number, buyer: order.buyer_username } : null,
    destinationCountry: r.destination_country?.trim() || null,
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

export interface ParcelPatch {
  label?: string;
  carrierCode?: CarrierCode | null;
  orderId?: string | null;
  archived?: boolean;
}

/** Modification permise au client (changer de transporteur avance la prochaine vérification à « maintenant »). */
export function parcelUpdateRow(patch: ParcelPatch, now: Date): Database["public"]["Tables"]["tracked_parcels"]["Update"] {
  const row: Database["public"]["Tables"]["tracked_parcels"]["Update"] = {};
  if (patch.label !== undefined) row.label = patch.label.trim().slice(0, 120);
  if (patch.carrierCode !== undefined) {
    row.carrier_code = patch.carrierCode;
    row.carrier_source = "manual";
    row.next_check_at = now.toISOString();
  }
  if (patch.orderId !== undefined) row.order_id = patch.orderId;
  if (patch.archived !== undefined) row.archived_at = patch.archived ? now.toISOString() : null;
  return row;
}

/** Libellé d'une commande proposée pour l'association facultative. */
export function orderLinkLabel(o: { order_number: string | null; external_order_id: string | null; buyer_username: string | null }): string {
  return `${o.order_number ?? o.external_order_id ?? "—"}${o.buyer_username ? ` · ${o.buyer_username}` : ""}`;
}

/** Résumé d'un ajout en série (mêmes mots que l'application). */
export function batchSummary(added: number, duplicates: number, failed: number): string {
  return [
    `${added} colis ajouté${added > 1 ? "s" : ""}`,
    duplicates ? `${duplicates} déjà suivi${duplicates > 1 ? "s" : ""}` : null,
    failed ? `${failed} en échec (gardé${failed > 1 ? "s" : ""} dans la liste)` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
