import "server-only";
import { z } from "zod";
import { ship24MilestoneStatus, sortEvents, type TrackingEvent, type TrackingSnapshot } from "@/domain/tools/tracking";
import { ConnectorError } from "@/integrations/core/errors";
import { fetchWithRetry, readJson } from "@/integrations/core/http";

/**
 * Ship24 — suivi multi-transporteurs avec détection automatique du transporteur.
 * Contrat : spécification OpenAPI officielle (SDK officiel ship24, spec/ship24-tracking-api.yaml) :
 *   POST https://api.ship24.com/public/v1/trackers/track   (crée le suivi si besoin, idempotent)
 *   en-têtes Authorization: Bearer <clé>, Content-Type: application/json; charset=utf-8
 *   corps { trackingNumber, destinationCountryCode? }
 *   réponse { data: { trackings: [{ tracker, shipment: { statusMilestone, statusCode,
 *   delivery: { estimatedDeliveryDate, courierEstimatedDeliveryDate } }, events: [{ status,
 *   occurrenceDatetime, location, courierCode, statusMilestone }] }] } }
 * Secret serveur SHIP24_API_KEY. Seul le numéro (et le pays de destination s'il est connu) est
 * transmis : aucune donnée client.
 */

export const SHIP24_TRACK_URL = "https://api.ship24.com/public/v1/trackers/track";

const eventSchema = z
  .object({
    status: z.string().nullable().optional(),
    occurrenceDatetime: z.string().nullable().optional(),
    datetime: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    courierCode: z.string().nullable().optional(),
    statusMilestone: z.string().nullable().optional(),
    statusCode: z.string().nullable().optional(),
  })
  .passthrough();

const trackingSchema = z
  .object({
    shipment: z
      .object({
        statusMilestone: z.string().nullable().optional(),
        statusCode: z.string().nullable().optional(),
        delivery: z.object({ estimatedDeliveryDate: z.string().nullable().optional(), courierEstimatedDeliveryDate: z.object({ from: z.string().nullable().optional(), to: z.string().nullable().optional() }).nullable().optional() }).passthrough().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    events: z.array(eventSchema).optional(),
    statistics: z.object({ timestamps: z.object({ deliveredDatetime: z.string().nullable().optional() }).passthrough().nullable().optional() }).passthrough().nullable().optional(),
  })
  .passthrough();

const responseSchema = z.object({ data: z.object({ trackings: z.array(trackingSchema) }).passthrough() }).passthrough();

export function ship24Configured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SHIP24_API_KEY && env.SHIP24_API_KEY.trim().length >= 10);
}

export function mapShip24Response(body: unknown): TrackingSnapshot {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) throw new ConnectorError("INVALID_RESPONSE", "ship24", "Réponse Ship24 inattendue.");
  const t = parsed.data.data.trackings[0];
  if (!t) return { status: "not_found", statusDetail: "Aucun résultat Ship24 pour ce numéro.", estimatedDelivery: null, deliveredAt: null, events: [], carrierLabel: null, providerUrl: null };
  const events: TrackingEvent[] = sortEvents(
    (t.events ?? []).map((e) => ({ at: e.occurrenceDatetime ?? e.datetime ?? null, label: (e.status ?? "").trim() || "Événement", location: e.location ?? null, status: e.statusMilestone ? ship24MilestoneStatus(e.statusMilestone) : null, code: e.statusCode ?? null })),
  );
  const milestone = t.shipment?.statusMilestone ?? null;
  const status = events.length === 0 && (!milestone || milestone === "pending") ? "pending" : ship24MilestoneStatus(milestone);
  const est = t.shipment?.delivery?.estimatedDeliveryDate ?? t.shipment?.delivery?.courierEstimatedDeliveryDate?.to ?? null;
  const courier = (t.events ?? []).find((e) => e.courierCode)?.courierCode ?? null;
  return {
    status,
    statusDetail: events[0]?.label ?? null,
    estimatedDelivery: est,
    deliveredAt: t.statistics?.timestamps?.deliveredDatetime ?? (status === "delivered" ? (events[0]?.at ?? null) : null),
    events,
    carrierLabel: courier,
    providerUrl: null,
  };
}

export async function ship24Track(trackingNumber: string, opts: { destinationCountry?: string | null } = {}, env: Record<string, string | undefined> = process.env): Promise<TrackingSnapshot> {
  const key = env.SHIP24_API_KEY?.trim();
  if (!key) throw new ConnectorError("NOT_CONFIGURED", "ship24", "Clé Ship24 absente (secret SHIP24_API_KEY).");
  const body: Record<string, string> = { trackingNumber };
  if (opts.destinationCountry && /^[A-Z]{2}$/.test(opts.destinationCountry)) body.destinationCountryCode = opts.destinationCountry;
  const res = await fetchWithRetry(SHIP24_TRACK_URL, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json; charset=utf-8", Accept: "application/json" }, body: JSON.stringify(body) }, { provider: "ship24", timeoutMs: 60_000, retries: 0, label: "trackers/track" });
  if (res.status === 401 || res.status === 403) throw new ConnectorError("AUTH_EXPIRED", "ship24", "Clé Ship24 refusée ou abonnement inactif (SHIP24_API_KEY).", { httpStatus: res.status });
  const json = await readJson(res, "ship24");
  if (res.status === 400 || res.status === 422) return { status: "not_found", statusDetail: "Numéro refusé par Ship24 (format invalide).", estimatedDelivery: null, deliveredAt: null, events: [], carrierLabel: null, providerUrl: null };
  if (!res.ok) throw new ConnectorError("API_ERROR", "ship24", `Ship24 a répondu HTTP ${res.status}.`, { httpStatus: res.status });
  return mapShip24Response(json);
}
