import "server-only";
import type { Json } from "@/db/database.types";
import type { OrgContext } from "@/features/auth/dal";
import type { TrackingProvidersDTO, TrackingRefreshDTO } from "@/features/mobile-api/contract";
import { chooseProvider, nextCheckAt, trackingAlerts, type CarrierCode, type TrackingSnapshot, type TrackingStatus } from "@/domain/tools/tracking";
import { isConnectorError } from "@/integrations/core/errors";
import { laPosteConfigured, laPosteTrack } from "@/integrations/tracking/laposte";
import { ship24Configured, ship24Track } from "@/integrations/tracking/ship24";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { upsertAlert } from "@/services/sync/alerts";

const log = createLogger("TRACKING");

/**
 * Suivi de colis côté serveur : interroge l'API de suivi adaptée (La Poste « Suivi v2 » pour le
 * groupe La Poste, Ship24 pour les autres), enregistre le statut et l'historique RENVOYÉS par
 * l'API, programme la prochaine actualisation et crée les alertes (livré, problème, retard).
 * Seul le numéro de suivi (et le pays de destination) est transmis aux API.
 */

export function trackingProviders(env: Record<string, string | undefined> = process.env): TrackingProvidersDTO {
  return { laposte: laPosteConfigured(env), ship24: ship24Configured(env) };
}

type ParcelRow = {
  id: string;
  organization_id: string;
  tracking_number: string;
  carrier_code: string | null;
  label: string;
  status: string;
  destination_country: string | null;
  created_at: string;
  check_count: number;
  archived_at: string | null;
};

const PARCEL_COLUMNS = "id, organization_id, tracking_number, carrier_code, label, status, destination_country, created_at, check_count, archived_at";

/** Interroge l'API et met à jour le colis (client administrateur : les colonnes de statut sont réservées au serveur). */
export async function refreshParcel(admin: AdminSupabaseClient, parcel: ParcelRow, now: Date = new Date(), env: Record<string, string | undefined> = process.env, track = { laposte: laPosteTrack, ship24: ship24Track }): Promise<TrackingRefreshDTO> {
  const providers = trackingProviders(env);
  const provider = chooseProvider((parcel.carrier_code as CarrierCode | null) ?? null, providers);
  if (!provider) {
    const message = "Aucune API de suivi configurée sur le serveur (LAPOSTE_OKAPI_KEY ou SHIP24_API_KEY).";
    // Nouvel essai dans 12 h : le suivi démarrera seul dès qu'une clé sera configurée.
    await admin.from("tracked_parcels").update({ last_error: message, next_check_at: new Date(now.getTime() + 12 * 3_600_000).toISOString(), last_checked_at: now.toISOString() }).eq("id", parcel.id);
    return { parcelId: parcel.id, status: parcel.status, provider: null, checked: false, message };
  }
  let snapshot: TrackingSnapshot;
  try {
    snapshot = provider === "laposte" ? await track.laposte(parcel.tracking_number, env) : await track.ship24(parcel.tracking_number, { destinationCountry: parcel.destination_country }, env);
  } catch (e) {
    const message = isConnectorError(e) ? e.message : "Erreur inattendue lors du suivi.";
    log.warn("suivi en échec", { parcelId: parcel.id, provider, error: message });
    // Nouvelle tentative plus tard, sans modifier le statut connu.
    const retry = new Date(now.getTime() + 6 * 3_600_000).toISOString();
    await admin.from("tracked_parcels").update({ last_error: message.slice(0, 500), last_checked_at: now.toISOString(), next_check_at: retry, check_count: parcel.check_count + 1 }).eq("id", parcel.id);
    return { parcelId: parcel.id, status: parcel.status, provider, checked: false, message };
  }
  const previous = parcel.status as TrackingStatus;
  const next = nextCheckAt(snapshot.status, now, { createdAt: parcel.created_at, checkCount: parcel.check_count + 1 });
  const { error } = await admin
    .from("tracked_parcels")
    .update({
      provider,
      status: snapshot.status,
      status_detail: snapshot.statusDetail?.slice(0, 500) ?? null,
      carrier_label: snapshot.carrierLabel?.slice(0, 80) ?? null,
      estimated_delivery: snapshot.estimatedDelivery?.slice(0, 40) ?? null,
      delivered_at: snapshot.deliveredAt?.slice(0, 40) ?? null,
      events: snapshot.events.slice(0, 100) as unknown as Json,
      provider_url: snapshot.providerUrl,
      last_checked_at: now.toISOString(),
      next_check_at: next ? next.toISOString() : null,
      check_count: parcel.check_count + 1,
      last_error: null,
    })
    .eq("id", parcel.id);
  if (error) throw fromPostgrestError(error);
  for (const a of trackingAlerts({ id: parcel.id, label: parcel.label, trackingNumber: parcel.tracking_number }, previous === "unknown" ? null : previous, snapshot, now)) {
    await upsertAlert(admin, { organizationId: parcel.organization_id, type: a.kind, severity: a.severity, title: a.title, message: a.message, dedupeKey: a.dedupeKey, entityType: "tracked_parcel", entityId: parcel.id, actionHref: `/tools/tracking/${parcel.id}` });
  }
  return { parcelId: parcel.id, status: snapshot.status, provider, checked: true, message: null };
}

/** Actualisation demandée par l'utilisateur : le colis doit être lisible sous SA session (RLS). */
export async function refreshParcelForOrg(ctx: OrgContext, parcelId: string, admin: AdminSupabaseClient = createAdminSupabaseClient()): Promise<TrackingRefreshDTO> {
  const { data, error } = await ctx.supabase.from("tracked_parcels").select(PARCEL_COLUMNS).eq("organization_id", ctx.organization.id).eq("id", parcelId).maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data) throw new AppError("NOT_FOUND", "Colis introuvable dans cette organisation.");
  if (data.archived_at) throw new AppError("VALIDATION", "Colis archivé : désarchivez-le pour l'actualiser.");
  return refreshParcel(admin, data as ParcelRow);
}

/** Tâche planifiée : colis dont l'actualisation est échue (lot borné, les plus en retard d'abord). */
export async function runDueTracking(now: Date = new Date(), admin: AdminSupabaseClient = createAdminSupabaseClient(), limit = 30, env: Record<string, string | undefined> = process.env): Promise<{ checked: number; failed: number; skipped: number }> {
  const providers = trackingProviders(env);
  if (!providers.laposte && !providers.ship24) return { checked: 0, failed: 0, skipped: 0 };
  const { data, error } = await admin.from("tracked_parcels").select(PARCEL_COLUMNS).is("archived_at", null).not("next_check_at", "is", null).lte("next_check_at", now.toISOString()).order("next_check_at", { ascending: true }).limit(limit);
  if (error) throw fromPostgrestError(error);
  let checked = 0;
  let failed = 0;
  let skipped = 0;
  for (const p of (data ?? []) as ParcelRow[]) {
    try {
      const r = await refreshParcel(admin, p, now, env);
      if (r.checked) checked++;
      else if (r.provider === null) skipped++;
      else failed++;
    } catch (e) {
      failed++;
      log.warn("actualisation planifiée en échec", { parcelId: p.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { checked, failed, skipped };
}
