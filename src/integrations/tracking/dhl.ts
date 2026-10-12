import "server-only";
import { z } from "zod";
import { sortEvents, type TrackingEvent, type TrackingSnapshot, type TrackingStatus } from "@/domain/tools/tracking";
import { ConnectorError } from "@/integrations/core/errors";
import { fetchWithRetry, readJson } from "@/integrations/core/http";

/**
 * DHL « Shipment Tracking - Unified » (API officielle, gratuite) : colis DHL (Express, Parcel,
 * eCommerce, Freight…).
 *   GET https://api-eu.dhl.com/track/shipments?trackingNumber={numéro}&language=fr
 *   en-tête DHL-API-Key: <clé>
 *   réponse { shipments: [{ id, status{ statusCode, status, description, timestamp, location },
 *   estimatedTimeOfDelivery, events[{ timestamp, statusCode, status, description, location }] }] }
 * Clé gratuite : developer.dhl.com → application → API « Shipment Tracking - Unified ».
 * Quota de départ : 250 appels par jour, 1 appel toutes les 5 s (augmentable sur demande).
 * Secret serveur DHL_API_KEY. Seul le numéro de suivi est transmis.
 */

export const DHL_TRACK_URL = "https://api-eu.dhl.com/track/shipments";

const place = z
  .object({ address: z.object({ addressLocality: z.string().nullable().optional(), countryCode: z.string().nullable().optional() }).passthrough().nullable().optional() })
  .passthrough()
  .nullable()
  .optional();
const event = z
  .object({ timestamp: z.string().nullable().optional(), statusCode: z.string().nullable().optional(), status: z.string().nullable().optional(), description: z.string().nullable().optional(), location: place })
  .passthrough();
const responseSchema = z
  .object({
    shipments: z
      .array(
        z
          .object({
            id: z.string().optional(),
            service: z.string().nullable().optional(),
            status: event.nullable().optional(),
            estimatedTimeOfDelivery: z.string().nullable().optional(),
            events: z.array(event).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export function dhlConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.DHL_API_KEY && env.DHL_API_KEY.trim().length >= 10);
}

/** Codes normalisés DHL → statut MON STOCK (inconnu → null : jamais deviné). */
export function dhlStatus(statusCode: string | null | undefined, text?: string | null): TrackingStatus | null {
  const c = (statusCode ?? "").toLowerCase();
  const t = (text ?? "").toLowerCase();
  if (c === "delivered") return "delivered";
  if (c === "failure") return "exception";
  if (c === "pre-transit") return "info_received";
  if (c === "transit") {
    if (/out for delivery|en cours de livraison|with delivery courier/.test(t)) return "out_for_delivery";
    if (/service ?point|parcel ?shop|point relais|ready for (collection|pickup)/.test(t)) return "available_for_pickup";
    return "in_transit";
  }
  if (c === "unknown") return "unknown";
  return null;
}

const where = (l: z.infer<typeof place>) => {
  const a = l?.address;
  const s = [a?.addressLocality, a?.countryCode].filter(Boolean).join(", ");
  return s || null;
};

export function mapDhlResponse(body: unknown, httpStatus: number): TrackingSnapshot {
  if (httpStatus === 404) return { status: "not_found", statusDetail: "Numéro inconnu de DHL.", estimatedDelivery: null, deliveredAt: null, events: [], carrierLabel: null, providerUrl: null };
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) throw new ConnectorError("INVALID_RESPONSE", "dhl", "Réponse DHL inattendue.");
  const s = parsed.data.shipments?.[0];
  if (!s) return { status: "not_found", statusDetail: "Numéro inconnu de DHL.", estimatedDelivery: null, deliveredAt: null, events: [], carrierLabel: null, providerUrl: null };
  const events: TrackingEvent[] = sortEvents(
    (s.events ?? []).map((e) => ({ at: e.timestamp ?? null, label: (e.description ?? e.status ?? "").trim() || "Événement", location: where(e.location), status: dhlStatus(e.statusCode, `${e.status ?? ""} ${e.description ?? ""}`), code: e.statusCode ?? null })),
  );
  const current = s.status ? dhlStatus(s.status.statusCode, `${s.status.status ?? ""} ${s.status.description ?? ""}`) : null;
  const status: TrackingStatus = current ?? events.find((e) => e.status !== null)?.status ?? (events.length > 0 ? "unknown" : "pending");
  const delivered = status === "delivered" ? (s.status?.timestamp ?? events.find((e) => e.status === "delivered")?.at ?? null) : null;
  return {
    status,
    statusDetail: (s.status?.description ?? s.status?.status ?? events[0]?.label ?? null) || null,
    estimatedDelivery: s.estimatedTimeOfDelivery ?? null,
    deliveredAt: delivered,
    events,
    carrierLabel: s.service ? `DHL ${s.service.charAt(0).toUpperCase()}${s.service.slice(1)}` : "DHL",
    providerUrl: s.id ? `https://www.dhl.com/fr-fr/home/suivi.html?tracking-id=${encodeURIComponent(s.id)}` : null,
  };
}

export async function dhlTrack(trackingNumber: string, env: Record<string, string | undefined> = process.env): Promise<TrackingSnapshot> {
  const key = env.DHL_API_KEY?.trim();
  if (!key) throw new ConnectorError("NOT_CONFIGURED", "dhl", "Clé DHL absente (secret DHL_API_KEY).");
  const url = `${DHL_TRACK_URL}?trackingNumber=${encodeURIComponent(trackingNumber)}&language=fr`;
  const res = await fetchWithRetry(url, { method: "GET", headers: { "DHL-API-Key": key, Accept: "application/json" } }, { provider: "dhl", timeoutMs: 15_000, retries: 1, label: "track/shipments" });
  if (res.status === 401 || res.status === 403) throw new ConnectorError("AUTH_EXPIRED", "dhl", "Clé DHL refusée ou non abonnée à « Shipment Tracking - Unified » (DHL_API_KEY).", { httpStatus: res.status });
  if (res.status === 429) throw new ConnectorError("RATE_LIMITED", "dhl", "Quota DHL atteint (250 appels par jour au départ) : réessayez plus tard.", { httpStatus: 429 });
  if (res.status === 404) return mapDhlResponse(null, 404);
  const body = await readJson(res, "dhl");
  if (!res.ok) throw new ConnectorError("API_ERROR", "dhl", `DHL a répondu HTTP ${res.status}.`, { httpStatus: res.status });
  return mapDhlResponse(body, res.status);
}
