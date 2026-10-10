import "server-only";
import { z } from "zod";
import { laPosteEventStatus, sortEvents, type TrackingEvent, type TrackingSnapshot, type TrackingStatus } from "@/domain/tools/tracking";
import { ConnectorError } from "@/integrations/core/errors";
import { fetchWithRetry, readJson } from "@/integrations/core/http";

/**
 * La Poste « Suivi v2 » (API officielle Okapi) : La Poste, Colissimo et Chronopost.
 *   GET https://api.laposte.fr/suivi/v2/idships/{numéro}?lang=fr_FR
 *   en-têtes X-Okapi-Key: <clé d'application>, Accept: application/json
 *   réponse { returnCode, shipment: { idShip, product, isFinal, event[{ code, label, date,
 *   order }], timeline[], estimDate, deliveryDate, url, contextData } }
 * Clé gratuite : developer.laposte.fr → application → abonnement « Suivi v2 ».
 * Secret serveur LAPOSTE_OKAPI_KEY. Seul le numéro de suivi est transmis.
 */

export const LAPOSTE_SUIVI_URL = "https://api.laposte.fr/suivi/v2/idships/";

const responseSchema = z
  .object({
    returnCode: z.number().optional(),
    returnMessage: z.string().optional(),
    shipment: z
      .object({
        idShip: z.string().optional(),
        product: z.string().nullable().optional(),
        isFinal: z.boolean().optional(),
        estimDate: z.string().nullable().optional(),
        deliveryDate: z.string().nullable().optional(),
        url: z.string().nullable().optional(),
        event: z.array(z.object({ code: z.string().nullable().optional(), label: z.string().nullable().optional(), date: z.string().nullable().optional(), order: z.number().nullable().optional() }).passthrough()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function laPosteConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.LAPOSTE_OKAPI_KEY && env.LAPOSTE_OKAPI_KEY.trim().length >= 10);
}

const PRODUCT_LABEL: Record<string, string> = { colissimo: "Colissimo", chronopost: "Chronopost", courrier: "La Poste", lettre: "La Poste" };

export function mapLaPosteResponse(body: unknown, httpStatus: number): TrackingSnapshot {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) throw new ConnectorError("INVALID_RESPONSE", "laposte", "Réponse La Poste inattendue.");
  const r = parsed.data;
  const code = r.returnCode ?? httpStatus;
  if (code === 404 || httpStatus === 404) return { status: "not_found", statusDetail: r.returnMessage ?? "Numéro inconnu de La Poste.", estimatedDelivery: null, deliveredAt: null, events: [], carrierLabel: null, providerUrl: null };
  if (!r.shipment) throw new ConnectorError("INVALID_RESPONSE", "laposte", `Réponse La Poste sans suivi (code ${code}).`);
  const s = r.shipment;
  const events: TrackingEvent[] = sortEvents(
    (s.event ?? []).map((e) => ({ at: e.date ?? null, label: (e.label ?? "").trim() || (e.code ?? "Événement"), location: null, status: laPosteEventStatus(e.code), code: e.code ?? null })),
  );
  // Statut = celui de l'événement le plus récent dont le code est connu ; sinon « inconnu ».
  const latestKnown = events.find((e) => e.status !== null);
  const status: TrackingStatus = latestKnown?.status ?? (events.length > 0 ? "unknown" : "pending");
  const delivered = events.find((e) => e.status === "delivered");
  return {
    status,
    statusDetail: events[0]?.label ?? null,
    estimatedDelivery: s.estimDate ?? null,
    deliveredAt: s.deliveryDate ?? delivered?.at ?? null,
    events,
    carrierLabel: s.product ? (PRODUCT_LABEL[s.product.toLowerCase()] ?? s.product) : "La Poste",
    providerUrl: s.url && /^https:\/\//.test(s.url) ? s.url : null,
  };
}

export async function laPosteTrack(trackingNumber: string, env: Record<string, string | undefined> = process.env): Promise<TrackingSnapshot> {
  const key = env.LAPOSTE_OKAPI_KEY?.trim();
  if (!key) throw new ConnectorError("NOT_CONFIGURED", "laposte", "Clé La Poste absente (secret LAPOSTE_OKAPI_KEY).");
  const res = await fetchWithRetry(`${LAPOSTE_SUIVI_URL}${encodeURIComponent(trackingNumber)}?lang=fr_FR`, { method: "GET", headers: { "X-Okapi-Key": key, Accept: "application/json" } }, { provider: "laposte", timeoutMs: 15_000, retries: 1, label: "suivi/v2" });
  if (res.status === 401 || res.status === 403) throw new ConnectorError("AUTH_EXPIRED", "laposte", "Clé La Poste refusée ou non abonnée à « Suivi v2 » (LAPOSTE_OKAPI_KEY).", { httpStatus: res.status });
  const body = await readJson(res, "laposte");
  if (res.status === 400) return { status: "not_found", statusDetail: "Numéro refusé par La Poste (format invalide).", estimatedDelivery: null, deliveredAt: null, events: [], carrierLabel: null, providerUrl: null };
  if (!res.ok && res.status !== 404) throw new ConnectorError("API_ERROR", "laposte", `La Poste a répondu HTTP ${res.status}.`, { httpStatus: res.status });
  return mapLaPosteResponse(body, res.status);
}
