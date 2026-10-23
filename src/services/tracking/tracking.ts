import "server-only";
import type { Json } from "@/db/database.types";
import type { OrgContext } from "@/features/auth/dal";
import type { TrackingProvidersDTO, TrackingRefreshDTO } from "@/features/mobile-api/contract";
import { chooseProvider, nextCheckAt, trackingAlerts, type CarrierCode, type TrackingProviderId, type TrackingSnapshot, type TrackingStatus } from "@/domain/tools/tracking";
import { isConnectorError } from "@/integrations/core/errors";
import { laPosteConfigured, laPosteTrack } from "@/integrations/tracking/laposte";
import { ship24Configured, ship24Track } from "@/integrations/tracking/ship24";
import { dhlConfigured, dhlTrack } from "@/integrations/tracking/dhl";
import { AppError, fromPostgrestError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveAlerts, upsertAlert } from "@/services/sync/alerts";

const log = createLogger("TRACKING");

/**
 * Suivi de colis côté serveur : interroge l'API de suivi adaptée (La Poste « Suivi v2 » pour le
 * groupe La Poste, DHL pour DHL, Ship24 pour les autres), enregistre le statut et l'historique RENVOYÉS par
 * l'API, programme la prochaine actualisation et crée les alertes (livré, problème, retard).
 * Seul le numéro de suivi (et le pays de destination) est transmis aux API.
 */

export function trackingProviders(env: Record<string, string | undefined> = process.env): TrackingProvidersDTO {
  return { laposte: laPosteConfigured(env), ship24: ship24Configured(env), dhl: dhlConfigured(env) };
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

/**
 * I-17 — disjoncteur des fournisseurs de suivi. Une clé REFUSÉE (HTTP 401/403 → AUTH_EXPIRED) n'est
 * pas une panne passagère : réinterroger chaque colis avec la même clé est inutile. Au premier refus :
 *  - le fournisseur est coupé pour la suite du passage (aucun autre appel avec cette clé) ;
 *  - UNE alerte par organisation concernée (clé de déduplication unique, table `alerts`) et une
 *    ligne d'erreur dans les journaux pour l'administrateur de la plateforme ;
 *  - bascule immédiate vers Ship24 / DHL s'ils sont configurés, sinon colis replanifié après le délai
 *    du disjoncteur sans nouvel appel.
 * L'alerte ouverte sert d'état PERSISTANT (partagé par toutes les instances) : tant qu'elle a été
 * mise à jour il y a moins de PROVIDER_BREAKER_COOLDOWN_MS, La Poste n'est plus appelée ; ensuite un
 * essai est refait (demi-ouverture) ; un succès résout l'alerte de l'organisation.
 */
export const PROVIDER_BREAKER_COOLDOWN_MS = 6 * 3_600_000;
export const LAPOSTE_AUTH_ALERT_KEY = "tracking_provider_auth:laposte";
const LAPOSTE_SUSPENDED_MESSAGE = "Suivi La Poste suspendu : la clé La Poste du serveur est refusée (alerte envoyée à l'administrateur). Nouvel essai automatique plus tard.";

export interface TrackingBreaker {
  isOpen(provider: TrackingProviderId): boolean;
  trip(provider: TrackingProviderId, organizationId: string, message: string): Promise<void>;
  recordSuccess(provider: TrackingProviderId, organizationId: string): Promise<void>;
}

/** Disjoncteur d'un passage. `open` : fournisseurs déjà coupés ; `alertedOrgs` : organisations ayant une alerte ouverte. */
export function createTrackingBreaker(admin: AdminSupabaseClient, initial: { open?: Iterable<TrackingProviderId>; alertedOrgs?: Iterable<string> } = {}): TrackingBreaker {
  const open = new Set<TrackingProviderId>(initial.open ?? []);
  const alerted = new Set<string>(initial.alertedOrgs ?? []);
  let platformLogged = false;
  return {
    isOpen: (provider) => open.has(provider),
    async trip(provider, organizationId, message) {
      if (provider !== "laposte") return;
      open.add(provider);
      if (!platformLogged) {
        platformLogged = true;
        log.error("clé La Poste refusée : suivi La Poste suspendu (disjoncteur ouvert)", { provider, cooldownMs: PROVIDER_BREAKER_COOLDOWN_MS, error: message });
      }
      alerted.add(organizationId);
      await upsertAlert(admin, {
        organizationId,
        type: "tracking_provider_auth",
        severity: "warning",
        title: "Suivi La Poste suspendu",
        message: "La clé La Poste du serveur MON STOCK est refusée par l'API « Suivi v2 ». Les colis La Poste / Colissimo / Chronopost passent par Ship24 ou DHL s'ils sont configurés ; sinon leur suivi reprendra quand la clé sera corrigée.",
        dedupeKey: LAPOSTE_AUTH_ALERT_KEY,
        entityType: null,
        entityId: null,
        actionHref: "/tools/tracking",
      });
    },
    async recordSuccess(provider, organizationId) {
      if (provider !== "laposte" || !alerted.has(organizationId)) return;
      alerted.delete(organizationId);
      await resolveAlerts(admin, organizationId, [LAPOSTE_AUTH_ALERT_KEY]);
    },
  };
}

/** État persistant du disjoncteur (alertes ouvertes) ; en cas d'erreur de lecture, disjoncteur fermé. */
export async function loadTrackingBreaker(admin: AdminSupabaseClient, now: Date = new Date()): Promise<TrackingBreaker> {
  try {
    const { data, error } = await admin.from("alerts").select("organization_id, updated_at").eq("dedupe_key", LAPOSTE_AUTH_ALERT_KEY).neq("status", "resolved").limit(1000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { organization_id: string; updated_at: string }[];
    const recent = rows.some((r) => now.getTime() - new Date(r.updated_at).getTime() < PROVIDER_BREAKER_COOLDOWN_MS);
    return createTrackingBreaker(admin, { open: recent ? ["laposte"] : [], alertedOrgs: rows.map((r) => r.organization_id) });
  } catch (e) {
    log.warn("état du disjoncteur de suivi illisible : disjoncteur fermé", { error: e instanceof Error ? e.message : String(e) });
    return createTrackingBreaker(admin);
  }
}

type TrackFns = { laposte: typeof laPosteTrack; ship24: typeof ship24Track; dhl: typeof dhlTrack };

/** Interroge l'API et met à jour le colis (client administrateur : les colonnes de statut sont réservées au serveur). */
export async function refreshParcel(
  admin: AdminSupabaseClient,
  parcel: ParcelRow,
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env,
  track: TrackFns = { laposte: laPosteTrack, ship24: ship24Track, dhl: dhlTrack },
  breaker: TrackingBreaker = createTrackingBreaker(admin),
  deadline: number | null = null,
): Promise<TrackingRefreshDTO> {
  const providers = trackingProviders(env);
  const carrier = (parcel.carrier_code as CarrierCode | null) ?? null;
  const usable = { ...providers, laposte: providers.laposte && !breaker.isOpen("laposte") };
  let provider = chooseProvider(carrier, usable);
  if (!provider) {
    const suspended = providers.laposte && breaker.isOpen("laposte") && chooseProvider(carrier, providers) === "laposte";
    const message = suspended ? LAPOSTE_SUSPENDED_MESSAGE : "Aucune API de suivi configurée sur le serveur (LAPOSTE_OKAPI_KEY, DHL_API_KEY ou SHIP24_API_KEY).";
    // Nouvel essai plus tard : le suivi reprendra seul (clé configurée, ou disjoncteur refermé).
    const retryMs = suspended ? PROVIDER_BREAKER_COOLDOWN_MS : 12 * 3_600_000;
    await admin.from("tracked_parcels").update({ last_error: message, next_check_at: new Date(now.getTime() + retryMs).toISOString(), last_checked_at: now.toISOString() }).eq("id", parcel.id);
    return { parcelId: parcel.id, status: parcel.status, provider: null, checked: false, message };
  }
  const call = (p: TrackingProviderId): Promise<TrackingSnapshot> =>
    p === "laposte" ? track.laposte(parcel.tracking_number, env) : p === "dhl" ? track.dhl(parcel.tracking_number, env) : track.ship24(parcel.tracking_number, { destinationCountry: parcel.destination_country, deadline }, env);
  let snapshot: TrackingSnapshot;
  try {
    try {
      snapshot = await call(provider);
    } catch (e) {
      if (provider !== "laposte" || !isConnectorError(e) || e.code !== "AUTH_EXPIRED") throw e;
      // Clé La Poste refusée : disjoncteur + alerte, puis bascule si un autre fournisseur est configuré.
      await breaker.trip("laposte", parcel.organization_id, e.message);
      const fallback = chooseProvider(carrier, { ...providers, laposte: false });
      if (!fallback) throw e;
      provider = fallback;
      snapshot = await call(fallback);
    }
  } catch (e) {
    const message = isConnectorError(e) ? e.message : "Erreur inattendue lors du suivi.";
    log.warn("suivi en échec", { parcelId: parcel.id, provider, error: message });
    // Nouvelle tentative plus tard, sans modifier le statut connu.
    const retry = new Date(now.getTime() + 6 * 3_600_000).toISOString();
    await admin.from("tracked_parcels").update({ last_error: message.slice(0, 500), last_checked_at: now.toISOString(), next_check_at: retry, check_count: parcel.check_count + 1 }).eq("id", parcel.id);
    return { parcelId: parcel.id, status: parcel.status, provider, checked: false, message };
  }
  if (provider === "laposte") await breaker.recordSuccess("laposte", parcel.organization_id);
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
  const now = new Date();
  return refreshParcel(admin, data as ParcelRow, now, process.env, undefined, await loadTrackingBreaker(admin, now));
}

/** Fournisseurs utilisables (clé configurée ET non coupée par le disjoncteur) : « configuré » n'est plus affiché pour une clé refusée. */
export async function usableTrackingProviders(admin: AdminSupabaseClient = createAdminSupabaseClient(), env: Record<string, string | undefined> = process.env, now: Date = new Date()): Promise<TrackingProvidersDTO> {
  const configured = trackingProviders(env);
  if (!configured.laposte) return configured;
  const breaker = await loadTrackingBreaker(admin, now);
  return { ...configured, laposte: !breaker.isOpen("laposte") };
}

/**
 * Budget de temps du suivi planifié (I-17) : l'Edge Function est coupée à ~150 s d'horloge. Aucun
 * colis n'est commencé s'il reste moins de TRACKING_MIN_PARCEL_START_MS ; les suivants restent dus
 * et seront traités au passage suivant (2 par heure).
 */
export const TRACKING_CRON_BUDGET_MS = 90_000;
export const TRACKING_MIN_PARCEL_START_MS = 20_000;

export interface DueTrackingResult {
  checked: number;
  failed: number;
  skipped: number;
  /** colis non commencés faute de temps (restent dus) */
  deferred: number;
  /** fournisseurs coupés par le disjoncteur pendant ce passage */
  suspended: TrackingProviderId[];
}

/** Tâche planifiée : colis dont l'actualisation est échue (lot borné, les plus en retard d'abord). */
export async function runDueTracking(
  now: Date = new Date(),
  admin: AdminSupabaseClient = createAdminSupabaseClient(),
  limit = 30,
  env: Record<string, string | undefined> = process.env,
  options: { budgetMs?: number; clock?: () => number; track?: TrackFns; breaker?: TrackingBreaker } = {},
): Promise<DueTrackingResult> {
  const providers = trackingProviders(env);
  if (!providers.laposte && !providers.ship24 && !providers.dhl) return { checked: 0, failed: 0, skipped: 0, deferred: 0, suspended: [] };
  const clock = options.clock ?? Date.now;
  const deadline = clock() + (options.budgetMs ?? TRACKING_CRON_BUDGET_MS);
  const { data, error } = await admin.from("tracked_parcels").select(PARCEL_COLUMNS).is("archived_at", null).not("next_check_at", "is", null).lte("next_check_at", now.toISOString()).order("next_check_at", { ascending: true }).limit(limit);
  if (error) throw fromPostgrestError(error);
  const breaker = options.breaker ?? (await loadTrackingBreaker(admin, now));
  let checked = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;
  for (const p of (data ?? []) as ParcelRow[]) {
    if (deadline - clock() < TRACKING_MIN_PARCEL_START_MS) {
      deferred++;
      continue;
    }
    try {
      const r = await refreshParcel(admin, p, now, env, options.track, breaker, deadline);
      if (r.checked) checked++;
      else if (r.provider === null) skipped++;
      else failed++;
    } catch (e) {
      failed++;
      log.warn("actualisation planifiée en échec", { parcelId: p.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (deferred > 0) log.info("suivi planifié : budget de temps atteint, colis reportés au passage suivant", { deferred });
  return { checked, failed, skipped, deferred, suspended: breaker.isOpen("laposte") ? ["laposte"] : [] };
}
