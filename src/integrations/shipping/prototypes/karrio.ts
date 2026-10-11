import "server-only";
import { z } from "zod";
import type { TrackingStatus } from "@/domain/tools/tracking";
import type { ShippingQuoteRequest } from "@/features/mobile-api/contract";
import { ConnectorError } from "@/integrations/core/errors";
import { fetchWithRetry, readJson } from "@/integrations/core/http";
import { decimalText, isPositiveDecimal, type PrototypeQuote, type PrototypeQuoteResult, type RejectedQuote } from "@/integrations/shipping/prototypes/types";

/**
 * PROTOTYPE ISOLÉ — client de l'API REST d'un serveur Karrio AUTO-HÉBERGÉ (karrio.server 2026.1.32,
 * LGPL-3.0 hors dossier ee/). Non branché : voir docs/research/karrio-sendcloud-audit-2026-10.md.
 *
 * Contrat vérifié sur un serveur Karrio lancé localement (OpenAPI /shipping-openapi) :
 *   POST {KARRIO_API_URL}/v1/proxy/rates   en-tête « Authorization: Token <clé> »
 *     corps { shipper, recipient, parcels[{ weight, weight_unit, length, width, height, dimension_unit }], carrier_ids? }
 *     réponse { rates[{ carrier_name, carrier_id, service, total_charge, currency, transit_days,
 *               extra_charges[{ name, amount }], meta{ service_name, rate_provider } }], messages[{ carrier_name, code, message }] }
 *   GET  {KARRIO_API_URL}/v1/proxy/tracking/{carrier_name}/{tracking_number}
 *     réponse { tracking{ status, delivered, estimated_delivery, events[{ timestamp, status, description, location }] }, messages[] }
 *
 * Constat du test local : pour Colissimo, DPD, GLS, Hermes, DHL Parcel DE… Karrio NE DEMANDE PAS le
 * prix au transporteur ; il lit une grille statique embarquée (services.csv) dont les montants sont
 * souvent 0,00 € (GLS DE → « 0.0 EUR » renvoyé comme un tarif). Seuls les connecteurs ci-dessous
 * interrogent réellement une API de tarification. Tout le reste est écarté, jamais affiché comme un prix.
 */

/** Connecteurs dont la tarification appelle l'API du transporteur (code lu : providers/<x>/rate.py). */
export const KARRIO_LIVE_RATING_CARRIERS: ReadonlySet<string> = new Set([
  "chronopost", // QuickCost (contrat Chronopost requis)
  "ups", // UPS Rating API (compte UPS)
  "dhl_express", // DHL Express XML (compte DHL Express)
  "mydhl", // MyDHL API (compte DHL Express)
  "fedex", // FedEx Rate API (compte FedEx)
  "teleship",
  "easyship", // agrégateur (compte Easyship)
  "easypost", // agrégateur (compte EasyPost)
]);

const rateSchema = z
  .object({
    carrier_name: z.string(),
    carrier_id: z.string().nullable().optional(),
    service: z.string().nullable().optional(),
    total_charge: z.union([z.number(), z.string()]).nullable().optional(),
    currency: z.string().nullable().optional(),
    transit_days: z.number().nullable().optional(),
    extra_charges: z.array(z.object({ name: z.string().nullable().optional(), amount: z.union([z.number(), z.string()]).nullable().optional() }).passthrough()).nullable().optional(),
    meta: z.object({ service_name: z.string().nullable().optional() }).passthrough().nullable().optional(),
  })
  .passthrough();

const messageSchema = z.object({ carrier_name: z.string().nullable().optional(), code: z.string().nullable().optional(), message: z.unknown() }).passthrough();
const rateResponseSchema = z.object({ rates: z.array(z.unknown()).nullable().optional(), messages: z.array(z.unknown()).nullable().optional() }).passthrough();

export function karrioConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.KARRIO_API_URL?.startsWith("https://") && env.KARRIO_API_KEY && env.KARRIO_API_KEY.trim().length >= 20);
}

/** Corps de POST /v1/proxy/rates. Les adresses ne portent que pays + code postal (+ ville) : aucune donnée client. */
export function karrioRateRequest(req: ShippingQuoteRequest, carrierIds: string[]): Record<string, unknown> {
  const address = (country: string, postcode: string, city?: string) => ({ country_code: country, postal_code: postcode, ...(city ? { city } : {}) });
  return {
    shipper: address(req.fromCountry, req.fromPostcode, req.fromCity),
    recipient: address(req.toCountry, req.toPostcode, req.toCity),
    parcels: [{ weight: req.weightKg, weight_unit: "KG", length: req.lengthCm, width: req.widthCm, height: req.heightCm, dimension_unit: "CM" }],
    ...(carrierIds.length > 0 ? { carrier_ids: carrierIds } : {}),
  };
}

export function mapKarrioRates(body: unknown, quotedAt: string): PrototypeQuoteResult {
  const parsed = rateResponseSchema.safeParse(body);
  if (!parsed.success) throw new ConnectorError("INVALID_RESPONSE", "karrio", "Réponse Karrio inattendue (objet { rates, messages } attendu).");
  const quotes: PrototypeQuote[] = [];
  const rejected: RejectedQuote[] = [];
  for (const raw of parsed.data.rates ?? []) {
    const r = rateSchema.safeParse(raw);
    if (!r.success) continue;
    const rate = r.data;
    const service = rate.meta?.service_name?.trim() || rate.service || null;
    if (!KARRIO_LIVE_RATING_CARRIERS.has(rate.carrier_name)) {
      rejected.push({ carrier: rate.carrier_name, service, reason: "Grille statique embarquée dans Karrio, pas un tarif du transporteur." });
      continue;
    }
    const total = decimalText(rate.total_charge);
    if (total === null || !isPositiveDecimal(total)) {
      rejected.push({ carrier: rate.carrier_name, service, reason: "Prix absent ou nul renvoyé : non affiché." });
      continue;
    }
    const surcharges = (rate.extra_charges ?? [])
      .map((c) => ({ label: c.name?.trim() || "Supplément", amount: decimalText(c.amount) }))
      .filter((c): c is { label: string; amount: string } => c.amount !== null && isPositiveDecimal(c.amount) && !/^base charge$/i.test(c.label));
    quotes.push({
      key: `karrio:${rate.carrier_id ?? rate.carrier_name}:${rate.service ?? "service"}`,
      via: "karrio",
      carrier: rate.carrier_name,
      service: service ?? "Service",
      price: total,
      vatIncluded: null,
      surcharges,
      currency: (rate.currency ?? "EUR").toUpperCase(),
      transitHours: typeof rate.transit_days === "number" && rate.transit_days > 0 ? rate.transit_days * 24 : null,
      deliveryToPickupPoint: null,
      tracked: null,
      priceBasis: "carrier_api",
      requirements: [],
      quotedAt,
    });
  }
  for (const raw of parsed.data.messages ?? []) {
    const m = messageSchema.safeParse(raw);
    if (!m.success) continue;
    rejected.push({ carrier: m.data.carrier_name ?? "inconnu", service: null, reason: `${m.data.code ?? "ERREUR"} : ${String(m.data.message ?? "").slice(0, 200)}` });
  }
  return { quotes, rejected };
}

/** Statut normalisé Karrio → statut MON STOCK. « delivery_delayed » reste en transit, signalé à part. */
export function karrioTrackingStatus(status: string | null | undefined): { status: TrackingStatus; carrierFlaggedDelay: boolean } {
  switch (status) {
    case "pending":
      return { status: "pending", carrierFlaggedDelay: false };
    case "picked_up":
    case "in_transit":
      return { status: "in_transit", carrierFlaggedDelay: false };
    case "delivery_delayed":
      return { status: "in_transit", carrierFlaggedDelay: true };
    case "out_for_delivery":
      return { status: "out_for_delivery", carrierFlaggedDelay: false };
    case "ready_for_pickup":
      return { status: "available_for_pickup", carrierFlaggedDelay: false };
    case "delivery_failed":
      return { status: "failed_attempt", carrierFlaggedDelay: false };
    case "on_hold":
    case "cancelled":
      return { status: "exception", carrierFlaggedDelay: false };
    case "return_to_sender":
      return { status: "returned", carrierFlaggedDelay: false };
    case "delivered":
      return { status: "delivered", carrierFlaggedDelay: false };
    default:
      return { status: "unknown", carrierFlaggedDelay: false };
  }
}

export async function karrioQuotes(req: ShippingQuoteRequest, carrierIds: string[], env: Record<string, string | undefined> = process.env, now: Date = new Date()): Promise<PrototypeQuoteResult> {
  const base = env.KARRIO_API_URL?.replace(/\/+$/, "");
  const key = env.KARRIO_API_KEY?.trim();
  if (!base || !key) throw new ConnectorError("NOT_CONFIGURED", "karrio", "Serveur Karrio non configuré (KARRIO_API_URL, KARRIO_API_KEY).");
  const res = await fetchWithRetry(
    `${base}/v1/proxy/rates`,
    { method: "POST", headers: { Authorization: `Token ${key}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(karrioRateRequest(req, carrierIds)) },
    { provider: "karrio", timeoutMs: 30_000, retries: 1, label: "proxy/rates" },
  );
  if (res.status === 401 || res.status === 403) throw new ConnectorError("AUTH_EXPIRED", "karrio", "Clé du serveur Karrio refusée.", { httpStatus: res.status });
  const body = await readJson(res, "karrio");
  if (!res.ok && res.status !== 207) throw new ConnectorError("API_ERROR", "karrio", `Karrio a refusé la demande (HTTP ${res.status}).`, { httpStatus: res.status });
  return mapKarrioRates(body, now.toISOString());
}
