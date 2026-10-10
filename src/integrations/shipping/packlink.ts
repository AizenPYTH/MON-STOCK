import "server-only";
import { z } from "zod";
import type { ShippingQuoteDTO, ShippingQuoteRequest } from "@/features/mobile-api/contract";
import { ConnectorError } from "@/integrations/core/errors";
import { fetchWithRetry, readJson } from "@/integrations/core/http";

/**
 * Packlink PRO — devis multi-transporteurs (Colissimo, Chronopost, Mondial Relay, UPS, DHL,
 * DPD… selon l'origine et la destination), aux tarifs du compte Packlink PRO.
 *
 * Contrat d'interface lu dans le code officiel open source de Packlink
 * (github.com/packlink-dev/ecommerce_module_core : Http/Proxy.php, DTO/ShippingServiceSearch.php,
 * DTO/ShippingServiceDetails.php) :
 *   GET https://api.packlink.com/v1/services?from[country]&from[zip]&to[country]&to[zip]&source=PRO
 *       &packages[0][weight]=kg&packages[0][length|width|height]=cm (entiers, arrondis au-dessus)
 *   en-tête « Authorization: <clé API> » (sans préfixe), Accept: application/json
 *   réponse : tableau de services { id, carrier_name, name, currency, price{ total_price,
 *   base_price, tax_price }, transit_time (« 2 DAYS »), transit_hours, dropoff,
 *   delivery_to_parcelshop, category, first_estimated_delivery_date (« AAAA/MM/JJ ») }.
 * Clé : Packlink PRO → Paramètres → « Packlink PRO API key ». Secret serveur PACKLINK_API_KEY.
 */

export const PACKLINK_BASE_URL = "https://api.packlink.com/v1/";

const money = z.union([z.number(), z.string()]).nullable().optional();
const serviceSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    carrier_name: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    currency: z.string().nullable().optional(),
    price: z.object({ total_price: money, base_price: money, tax_price: money }).partial().nullable().optional(),
    transit_time: z.string().nullable().optional(),
    transit_hours: z.union([z.number(), z.string()]).nullable().optional(),
    dropoff: z.boolean().nullable().optional(),
    delivery_to_parcelshop: z.boolean().nullable().optional(),
    category: z.string().nullable().optional(),
    first_estimated_delivery_date: z.string().nullable().optional(),
    customs_required: z.boolean().nullable().optional(),
  })
  .passthrough();

export function packlinkConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.PACKLINK_API_KEY && env.PACKLINK_API_KEY.trim().length >= 10);
}

export function packlinkSearchUrl(req: ShippingQuoteRequest): string {
  const p = new URLSearchParams();
  p.set("from[country]", req.fromCountry);
  p.set("from[zip]", req.fromPostcode);
  p.set("to[country]", req.toCountry);
  p.set("to[zip]", req.toPostcode);
  p.set("source", "PRO");
  p.set("packages[0][height]", String(Math.ceil(req.heightCm)));
  p.set("packages[0][width]", String(Math.ceil(req.widthCm)));
  p.set("packages[0][length]", String(Math.ceil(req.lengthCm)));
  p.set("packages[0][weight]", String(req.weightKg));
  return `${PACKLINK_BASE_URL}services?${p.toString()}`;
}

/** Montant texte exact (« 10.13 ») ; null si absent ou non numérique. */
function decimalText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = typeof v === "number" ? String(v) : String(v).trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? s : null;
}

/** « 2 DAYS » / « 3-5 DAYS » / transit_hours « 48 » → jours (min, max). */
export function parseTransit(transitTime: string | null | undefined, transitHours: unknown): { min: number | null; max: number | null } {
  const t = (transitTime ?? "").toUpperCase();
  const range = /(\d+)\s*-\s*(\d+)\s*DAY/.exec(t);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = /(\d+)\s*DAY/.exec(t);
  if (single) return { min: Number(single[1]), max: Number(single[1]) };
  const hours = Number(transitHours);
  if (Number.isFinite(hours) && hours > 0) {
    const d = Math.ceil(hours / 24);
    return { min: d, max: d };
  }
  return { min: null, max: null };
}

export function mapPacklinkServices(body: unknown, quotedAt: string): ShippingQuoteDTO[] {
  if (!Array.isArray(body)) throw new ConnectorError("INVALID_RESPONSE", "packlink", "Réponse Packlink inattendue (liste de services attendue).");
  const out: ShippingQuoteDTO[] = [];
  for (const raw of body) {
    const parsed = serviceSchema.safeParse(raw);
    if (!parsed.success) continue;
    const s = parsed.data;
    const total = decimalText(s.price?.total_price);
    const base = decimalText(s.price?.base_price);
    if (total === null && base === null) continue; // aucun prix : on n'affiche rien plutôt qu'un prix inventé
    const transit = parseTransit(s.transit_time, s.transit_hours);
    const est = s.first_estimated_delivery_date && /^\d{4}\/\d{2}\/\d{2}$/.test(s.first_estimated_delivery_date) ? s.first_estimated_delivery_date.replace(/\//g, "-") : null;
    const restrictions: string[] = [];
    if (s.customs_required) restrictions.push("Déclaration en douane requise.");
    if (s.dropoff) restrictions.push("Dépôt du colis en point relais ou bureau.");
    out.push({
      key: `packlink:${String(s.id)}`,
      provider: "packlink",
      providerLabel: "Packlink PRO",
      carrier: s.carrier_name?.trim() || "Transporteur non précisé",
      service: s.name?.trim() || s.category || "Service",
      priceInclVat: total,
      priceExclVat: base,
      currency: (s.currency ?? "EUR").toUpperCase(),
      transitDaysMin: transit.min,
      transitDaysMax: transit.max,
      estimatedDelivery: est,
      dropOff: s.dropoff ?? null,
      deliveryToPickupPoint: s.delivery_to_parcelshop ?? null,
      tracking: null,
      restrictions,
      quotedAt,
    });
  }
  return out;
}

export async function packlinkQuotes(req: ShippingQuoteRequest, env: Record<string, string | undefined> = process.env, now: Date = new Date()): Promise<ShippingQuoteDTO[]> {
  const key = env.PACKLINK_API_KEY?.trim();
  if (!key) throw new ConnectorError("NOT_CONFIGURED", "packlink", "Clé Packlink PRO absente (secret PACKLINK_API_KEY).");
  const res = await fetchWithRetry(packlinkSearchUrl(req), { method: "GET", headers: { Authorization: key, Accept: "application/json" } }, { provider: "packlink", timeoutMs: 20_000, retries: 1, label: "services" });
  if (res.status === 401 || res.status === 403) throw new ConnectorError("AUTH_EXPIRED", "packlink", "Clé Packlink PRO refusée : vérifiez le secret PACKLINK_API_KEY.", { httpStatus: res.status });
  const body = await readJson(res, "packlink");
  if (!res.ok) throw new ConnectorError("API_ERROR", "packlink", `Packlink a refusé la demande de devis (HTTP ${res.status}).`, { httpStatus: res.status });
  return mapPacklinkServices(body, now.toISOString());
}
