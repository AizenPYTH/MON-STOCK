import "server-only";
import { z } from "zod";
import type { ShippingQuoteRequest } from "@/features/mobile-api/contract";
import { ConnectorError } from "@/integrations/core/errors";
import { fetchWithRetry, readJson } from "@/integrations/core/http";
import { decimalText, isPositiveDecimal, type PrototypeQuote, type PrototypeQuoteResult, type RejectedQuote } from "@/integrations/shipping/prototypes/types";

/**
 * PROTOTYPE ISOLÉ — Sendcloud API v3 « shipping-options » (devis). Non branché : voir
 * docs/research/karrio-sendcloud-audit-2026-10.md.
 *
 * Contrat vérifié par un appel réel en lecture seule (compte Sendcloud MON STOCK, 11/10/2026) :
 *   POST https://panel.sendcloud.sc/api/v3/shipping-options   (Basic <clé publique>:<clé secrète>)
 *     corps { from_address{ country_code, postal_code }, to_address{…}, parcels[{ weight{ value, unit },
 *             dimensions{ length, width, height, unit } }], calculate_quotes: true }
 *     réponse { data[{ code, name, carrier{ code, name }, functionalities{ tracked, last_mile, … },
 *               requirements{ fields, is_service_point_required }, quotes[{ price{ total{ value, currency },
 *               breakdown[{ type, label, price{ value } }] }, lead_time (heures) }], quote_source, quote_error }] }
 * Les montants sont les tarifs Sendcloud du compte (« sendcloud_prices »), facturés à la création
 * de l'étiquette (« charging_type: label_creation ») : un devis ne coûte rien. L'API ne précise pas
 * HT/TTC : `vatIncluded` reste null. Aucune étiquette n'est créée par ce module.
 */

export const SENDCLOUD_SHIPPING_OPTIONS_URL = "https://panel.sendcloud.sc/api/v3/shipping-options";

const money = z.object({ value: z.union([z.string(), z.number()]).nullable().optional(), currency: z.string().nullable().optional() }).passthrough();
const optionSchema = z
  .object({
    code: z.string(),
    name: z.string().nullable().optional(),
    carrier: z.object({ code: z.string().nullable().optional(), name: z.string().nullable().optional() }).passthrough().nullable().optional(),
    functionalities: z.object({ tracked: z.boolean().nullable().optional(), last_mile: z.string().nullable().optional() }).passthrough().nullable().optional(),
    requirements: z.object({ fields: z.array(z.string()).nullable().optional(), is_service_point_required: z.boolean().nullable().optional() }).passthrough().nullable().optional(),
    quotes: z
      .array(
        z
          .object({
            price: z.object({ total: money.nullable().optional(), breakdown: z.array(z.object({ type: z.string().nullable().optional(), label: z.string().nullable().optional(), price: money.nullable().optional() }).passthrough()).nullable().optional() }).passthrough().nullable().optional(),
            lead_time: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
    quote_error: z.unknown().optional(),
  })
  .passthrough();

const PICKUP_LAST_MILE = new Set(["service_point", "locker", "locker_or_service_point"]);
const REQUIREMENT_LABEL: Record<string, string> = { to_email: "E-mail du destinataire requis.", to_telephone: "Téléphone du destinataire requis." };

export function sendcloudConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SENDCLOUD_PUBLIC_KEY?.trim() && env.SENDCLOUD_SECRET_KEY?.trim());
}

/** Corps du devis : pays + code postal uniquement (aucune donnée client). */
export function sendcloudShippingOptionsBody(req: ShippingQuoteRequest): Record<string, unknown> {
  return {
    from_address: { country_code: req.fromCountry, postal_code: req.fromPostcode },
    to_address: { country_code: req.toCountry, postal_code: req.toPostcode },
    parcels: [
      {
        weight: { value: String(req.weightKg), unit: "kg" },
        dimensions: { length: String(req.lengthCm), width: String(req.widthCm), height: String(req.heightCm), unit: "cm" },
      },
    ],
    calculate_quotes: true,
  };
}

export function mapSendcloudOptions(body: unknown, quotedAt: string): PrototypeQuoteResult {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new ConnectorError("INVALID_RESPONSE", "sendcloud", "Réponse Sendcloud inattendue (liste « data » attendue).");
  const quotes: PrototypeQuote[] = [];
  const rejected: RejectedQuote[] = [];
  for (const raw of data) {
    const parsed = optionSchema.safeParse(raw);
    if (!parsed.success) continue;
    const o = parsed.data;
    const carrier = o.carrier?.name?.trim() || o.carrier?.code || "Transporteur non précisé";
    const service = o.name?.trim() || o.code;
    if (o.functionalities?.tracked === false) {
      rejected.push({ carrier, service, reason: "Envoi non suivi : exclu du comparateur." });
      continue;
    }
    const quote = o.quotes?.[0];
    const total = decimalText(quote?.price?.total?.value);
    if (o.quote_error || !quote || total === null || !isPositiveDecimal(total)) {
      rejected.push({ carrier, service, reason: o.quote_error ? `Erreur de devis : ${String(JSON.stringify(o.quote_error)).slice(0, 160)}` : "Prix absent ou nul renvoyé : non affiché." });
      continue;
    }
    const surcharges = (quote.price?.breakdown ?? [])
      .filter((b) => b.type !== "price_without_insurance")
      .map((b) => ({ label: b.label?.trim() || b.type || "Supplément", amount: decimalText(b.price?.value) }))
      .filter((b): b is { label: string; amount: string } => b.amount !== null && isPositiveDecimal(b.amount));
    const requirements = (o.requirements?.fields ?? []).map((f) => REQUIREMENT_LABEL[f] ?? `Champ requis : ${f}.`);
    if (o.requirements?.is_service_point_required) requirements.unshift("Point relais à choisir.");
    const lastMile = o.functionalities?.last_mile ?? null;
    quotes.push({
      key: `sendcloud:${o.code}`,
      via: "sendcloud",
      carrier,
      service,
      price: total,
      vatIncluded: null,
      surcharges,
      currency: (quote.price?.total?.currency ?? "EUR").toUpperCase(),
      transitHours: typeof quote.lead_time === "number" && quote.lead_time > 0 ? quote.lead_time : null,
      deliveryToPickupPoint: lastMile === null ? null : PICKUP_LAST_MILE.has(lastMile),
      tracked: o.functionalities?.tracked ?? null,
      priceBasis: "aggregator_tariff",
      requirements,
      quotedAt,
    });
  }
  return { quotes, rejected };
}

export async function sendcloudQuotes(req: ShippingQuoteRequest, env: Record<string, string | undefined> = process.env, now: Date = new Date()): Promise<PrototypeQuoteResult> {
  const pub = env.SENDCLOUD_PUBLIC_KEY?.trim();
  const secret = env.SENDCLOUD_SECRET_KEY?.trim();
  if (!pub || !secret) throw new ConnectorError("NOT_CONFIGURED", "sendcloud", "Clés Sendcloud absentes (SENDCLOUD_PUBLIC_KEY, SENDCLOUD_SECRET_KEY).");
  const res = await fetchWithRetry(
    SENDCLOUD_SHIPPING_OPTIONS_URL,
    { method: "POST", headers: { Authorization: `Basic ${btoa(`${pub}:${secret}`)}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(sendcloudShippingOptionsBody(req)) },
    { provider: "sendcloud", timeoutMs: 20_000, retries: 1, label: "shipping-options" },
  );
  if (res.status === 401 || res.status === 403) throw new ConnectorError("AUTH_EXPIRED", "sendcloud", "Clés Sendcloud refusées.", { httpStatus: res.status });
  const body = await readJson(res, "sendcloud");
  if (!res.ok) throw new ConnectorError("API_ERROR", "sendcloud", `Sendcloud a refusé la demande de devis (HTTP ${res.status}).`, { httpStatus: res.status });
  return mapSendcloudOptions(body, now.toISOString());
}
